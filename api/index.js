const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@vercel/kv');

const app = express();
const PORT = 3500;

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

const DEFAULT_DB = {
  users: [
    {
      id: "admin-001",
      email: "bayazid416@gmail.com",
      password: "admin123",
      name: "Admin",
      role: "super_admin"
    }
  ],
  projects: []
};

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
const DB_PATH = isProduction
  ? path.join('/tmp', 'db.json')
  : path.join(__dirname, '..', 'server', 'data', 'db.json');

// Ensure db.json is initialized in /tmp in serverless environment
if (isProduction && !fs.existsSync(DB_PATH)) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to initialize DB in /tmp:', err.message);
  }
}

// Initialize Vercel KV or Upstash client dynamically
let kvClient = null;
if (isProduction) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      kvClient = createClient({ url, token });
      console.log('KV/Upstash Database Client initialized successfully.');
    } catch (err) {
      console.error('Failed to initialize KV Client:', err.message);
    }
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
app.use('/embed', express.static(path.join(__dirname, '..', 'embed')));

// ============ HELPERS ============
async function readDB() {
  if (isProduction && kvClient) {
    try {
      const data = await kvClient.get('shopify_controller_db');
      if (data) {
        global.inMemoryDB = data; // Keep in-memory sync
        return data;
      }
    } catch (err) {
      console.error('Vercel KV Read error:', err.message);
    }
  }

  if (global.inMemoryDB) {
    return global.inMemoryDB;
  }
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Read DB error:', err.message);
  }
  return DEFAULT_DB;
}

async function writeDB(data) {
  global.inMemoryDB = data; // Always keep in-memory sync
  
  if (isProduction && kvClient) {
    try {
      await kvClient.set('shopify_controller_db', data);
      return;
    } catch (err) {
      console.error('Vercel KV Write error:', err.message);
    }
  }

  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Write DB error:', err.message);
  }
}

function getDefaultSettings() {
  return {
    cartButton: { disabled: false },
    checkout: { disabled: false, blockedMessage: 'Checkout is currently unavailable.' },
    homeBlocks: {
      detectedSections: [],
      hiddenSectionIds: []
    },
    announcement: {
      enabled: false,
      text: 'Welcome to our store!',
      bgColor: '#000000',
      textColor: '#ffffff',
      dismissible: true
    },
    customCSS: { enabled: false, code: '' },
    popup: {
      enabled: false,
      title: 'Special Offer!',
      message: 'Get 20% off your first order!',
      buttonText: 'Shop Now',
      buttonUrl: '/',
      delay: 3,
      bgColor: '#ffffff',
      textColor: '#333333',
      overlayColor: 'rgba(0,0,0,0.5)'
    },
    passwordProtection: {
      enabled: false,
      password: '',
      protectAllPages: false,
      detectedPages: [],
      protectedPages: [],
      message: 'This page is password protected.'
    }
  };
}

// ============ AUTH ROUTES ============
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const db = await readDB();
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role || 'user' } });
});

// Simple auth middleware
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const userId = decoded.split(':')[0];
    const db = await readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = userId;
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============ PROJECT ROUTES ============
app.get('/api/projects', authMiddleware, async (req, res) => {
  const db = await readDB();
  const userProjects = db.projects.filter(p => p.userId === req.userId);
  res.json(userProjects);
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const { name, url } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  const db = await readDB();
  const projectId = generateId();
  const project = {
    id: projectId,
    userId: req.userId,
    name,
    url: url || '',
    createdAt: new Date().toISOString(),
    settings: getDefaultSettings()
  };
  db.projects.push(project);
  await writeDB(db);
  res.status(201).json(project);
});

app.get('/api/projects/:id', authMiddleware, async (req, res) => {
  const db = await readDB();
  const project = db.projects.find(p => p.id === req.params.id && p.userId === req.userId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.put('/api/projects/:id/settings', authMiddleware, async (req, res) => {
  const db = await readDB();
  const projectIndex = db.projects.findIndex(p => p.id === req.params.id && p.userId === req.userId);
  if (projectIndex === -1) return res.status(404).json({ error: 'Project not found' });

  db.projects[projectIndex].settings = {
    ...db.projects[projectIndex].settings,
    ...req.body
  };
  await writeDB(db);
  res.json(db.projects[projectIndex]);
});

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
  const db = await readDB();
  const projectIndex = db.projects.findIndex(p => p.id === req.params.id && p.userId === req.userId);
  if (projectIndex === -1) return res.status(404).json({ error: 'Project not found' });

  db.projects.splice(projectIndex, 1);
  await writeDB(db);
  res.json({ message: 'Project deleted' });
});

// ============ SCAN ENDPOINT (embed script reports site data) ============
app.post('/api/embed/:projectId/scan', async (req, res) => {
  const db = await readDB();
  const projectIndex = db.projects.findIndex(p => p.id === req.params.projectId);
  if (projectIndex === -1) return res.status(404).json({ error: 'Project not found' });

  const { sections, pages } = req.body;
  const project = db.projects[projectIndex];

  if (sections && Array.isArray(sections) && sections.length > 0) {
    const existingHidden = project.settings.homeBlocks.hiddenSectionIds || [];
    const existingSections = project.settings.homeBlocks.detectedSections || [];

    const existingMap = {};
    existingSections.forEach(s => { existingMap[s.id] = s; });

    sections.forEach(s => {
      if (!existingMap[s.id]) {
        existingSections.push({
          id: s.id,
          name: s.name || s.id,
          tagName: s.tagName || 'section',
          hidden: existingHidden.includes(s.id) || false
        });
      } else {
        if (s.name && s.name !== s.id) existingMap[s.id].name = s.name;
        if (s.tagName) existingMap[s.id].tagName = s.tagName;
      }
    });

    project.settings.homeBlocks.detectedSections = existingSections;
  }

  if (pages && Array.isArray(pages) && pages.length > 0) {
    const existingProtected = project.settings.passwordProtection.protectedPages || [];
    const existingPages = project.settings.passwordProtection.detectedPages || [];

    const existingMap = {};
    existingPages.forEach(p => { existingMap[p.path] = p; });

    pages.forEach(p => {
      if (!existingMap[p.path]) {
        existingPages.push({
          path: p.path,
          title: p.title || p.path,
          protected: existingProtected.includes(p.path) || false
        });
      } else {
        if (p.title && p.title !== p.path) existingMap[p.path].title = p.title;
      }
    });

    project.settings.passwordProtection.detectedPages = existingPages;
  }

  await writeDB(db);
  res.json({ success: true });
});

// ============ USER & PROFILE MANAGEMENT ROUTES ============

// Get all users (Super Admin only)
app.get('/api/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super admin can access user management' });
  }
  const db = await readDB();
  const safeUsers = db.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'user' }));
  res.json(safeUsers);
});

// Create new user (Super Admin only)
app.post('/api/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super admin can create users' });
  }
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  const db = await readDB();
  if (db.users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }
  const newUser = {
    id: generateId(),
    name,
    email,
    password,
    role: role || 'user'
  };
  db.users.push(newUser);
  await writeDB(db);
  res.status(201).json({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role });
});

// Delete user (Super Admin only)
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super admin can delete users' });
  }
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'You cannot delete yourself' });
  }
  const db = await readDB();
  const userIndex = db.users.findIndex(u => u.id === req.params.id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  db.users.splice(userIndex, 1);
  await writeDB(db);
  res.json({ message: 'User deleted successfully' });
});

// Change own password (All authenticated users)
app.put('/api/profile/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  const db = await readDB();
  const userIndex = db.users.findIndex(u => u.id === req.userId);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
  
  if (db.users[userIndex].password !== currentPassword) {
    return res.status(400).json({ error: 'Incorrect current password' });
  }
  
  db.users[userIndex].password = newPassword;
  await writeDB(db);
  res.json({ message: 'Password updated successfully' });
});

// ============ PUBLIC EMBED API ============
app.get('/api/embed/:projectId', async (req, res) => {
  const db = await readDB();
  const project = db.projects.find(p => p.id === req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  res.json({
    projectId: project.id,
    settings: project.settings
  });
});

// ============ ROOT ============
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  Shopify Controller Server running!`);
    console.log(`  Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`  API: http://localhost:${PORT}/api\n`);
  });
}

module.exports = app;
