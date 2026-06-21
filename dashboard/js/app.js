/**
 * ShopController Dashboard - Main Application v3
 * 
 * Toggle logic (corrected):
 *   Cart toggle ON    = cart buttons HIDDEN on site
 *   Checkout toggle ON = checkout BLOCKED on site
 *   Section toggle ON  = that section HIDDEN on site
 *   Page toggle ON     = that page PASSWORD PROTECTED
 */
(function() {
  'use strict';

  const API_BASE = window.location.origin;
  let authToken = localStorage.getItem('sc_token');
  let currentUser = JSON.parse(localStorage.getItem('sc_user') || 'null');
  let currentProjectId = null;
  let currentProject = null;
  let deleteProjectId = null;
  let protectedPages = [];   // Manual pages
  let detectedSections = []; // Auto-detected from site
  let detectedPages = [];    // Auto-detected from site
  let allProjects = [];      // Cache of all projects

  // DOM refs
  const loginPage = document.getElementById('loginPage');
  const dashboardPage = document.getElementById('dashboardPage');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  const projectsPage = document.getElementById('projectsPage');
  const settingsPage = document.getElementById('settingsPage');
  const embedPage = document.getElementById('embedPage');
  const usersPage = document.getElementById('usersPage');
  const profilePage = document.getElementById('profilePage');
  const settingsNavLink = document.getElementById('settingsNavLink');
  const embedNavLink = document.getElementById('embedNavLink');
  const usersNavLink = document.getElementById('usersNavLink');
  const profileNavLink = document.getElementById('profileNavLink');
  const projectsGrid = document.getElementById('projectsGrid');
  const addProjectBtn = document.getElementById('addProjectBtn');
  const addProjectModal = document.getElementById('addProjectModal');
  const addProjectForm = document.getElementById('addProjectForm');
  const deleteModal = document.getElementById('deleteModal');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const backToProjects = document.getElementById('backToProjects');
  const backToProjectsFromEmbed = document.getElementById('backToProjectsFromEmbed');
  const usersList = document.getElementById('usersList');
  const addUserBtn = document.getElementById('addUserBtn');
  const addUserModal = document.getElementById('addUserModal');
  const addUserForm = document.getElementById('addUserForm');
  const changePasswordForm = document.getElementById('changePasswordForm');

  // ============ INIT ============
  function init() {
    if (authToken && currentUser) showDashboard();
    else showLogin();
    bindEvents();
  }

  // ============ AUTH ============
  function showLogin() {
    loginPage.style.display = 'flex';
    dashboardPage.style.display = 'none';
  }

  function showDashboard() {
    loginPage.style.display = 'none';
    dashboardPage.style.display = 'flex';
    updateUserInfo();
    loadProjects();
    
    // Show/hide user management link based on role or admin ID
    const isSuper = currentUser && (currentUser.role === 'super_admin' || currentUser.id === 'admin-001' || currentUser.email === 'bayazid416@gmail.com');
    if (isSuper) {
      usersNavLink.style.display = 'flex';
    } else {
      usersNavLink.style.display = 'none';
    }
  }

  function updateUserInfo() {
    if (currentUser) {
      document.getElementById('userName').textContent = currentUser.name;
      document.getElementById('userEmail').textContent = currentUser.email;
      document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    }
  }

  async function login(email, password) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      authToken = data.token;
      currentUser = data.user;
      localStorage.setItem('sc_token', authToken);
      localStorage.setItem('sc_user', JSON.stringify(currentUser));
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.style.display = 'block';
    }
  }

  function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('sc_token');
    localStorage.removeItem('sc_user');
    showLogin();
  }

  function apiHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
  }

  // ============ PROJECTS ============
  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/stats`, { headers: apiHeaders() });
      if (!res.ok) throw new Error('Failed to load stats');
      const data = await res.json();
      document.getElementById('statTotalProjects').textContent = data.totalProjects;
      document.getElementById('statActiveProjects').textContent = data.activeProjects;
      document.getElementById('statTotalUsers').textContent = data.totalUsers;
    } catch (err) {
      console.error('Failed to load stats:', err.message);
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, { headers: apiHeaders() });
      if (res.status === 401) { logout(); return; }
      allProjects = await res.json();
      loadStats();
      
      // Keep search value if already typing, otherwise clear
      const searchVal = document.getElementById('projectSearchInput').value.trim();
      if (searchVal) {
        handleProjectSearch();
      } else {
        renderProjects(allProjects);
      }
    } catch (err) {
      showToast('Failed to load projects', 'error');
    }
  }

  function handleProjectSearch() {
    const query = document.getElementById('projectSearchInput').value.trim().toLowerCase();
    if (!query) {
      renderProjects(allProjects);
      return;
    }
    const filtered = allProjects.filter(p => 
      p.name.toLowerCase().includes(query) || 
      (p.url && p.url.toLowerCase().includes(query))
    );
    renderProjects(filtered);
  }

  function renderProjects(projects) {
    projectsGrid.querySelectorAll('.project-card').forEach(c => c.remove());

    projects.forEach(project => {
      const card = document.createElement('div');
      card.className = 'project-card';
      const active = countActiveFeatures(project.settings);
      card.innerHTML = `
        <div class="card-header">
          <div class="card-icon">🏪</div>
          <div class="card-actions">
            <button class="embed-btn" title="Embed Code" data-id="${project.id}">📋</button>
            <button class="delete-btn" title="Delete" data-id="${project.id}">🗑️</button>
          </div>
        </div>
        <h3>${esc(project.name)}</h3>
        <div class="url">${project.url ? esc(project.url) : 'No URL set'}</div>
        <div class="stats">
          <div class="stat"><span class="dot ${active > 0 ? 'active' : 'inactive'}"></span> ${active} active</div>
          <div class="stat">ID: ${project.id}</div>
        </div>`;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-actions')) return;
        openProject(project.id);
      });
      projectsGrid.insertBefore(card, addProjectBtn);
    });

    projectsGrid.querySelectorAll('.embed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openEmbedPage(btn.dataset.id); });
    });
    projectsGrid.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteProjectId = btn.dataset.id; deleteModal.classList.add('active'); });
    });
  }

  function countActiveFeatures(s) {
    let c = 0;
    if (s.cartButton && s.cartButton.disabled) c++;
    if (s.checkout && s.checkout.disabled) c++;
    if (s.announcement && s.announcement.enabled) c++;
    if (s.customCSS && s.customCSS.enabled) c++;
    if (s.popup && s.popup.enabled) c++;
    if (s.passwordProtection && s.passwordProtection.enabled) c++;
    if (s.homeBlocks && s.homeBlocks.hiddenSectionIds) c += s.homeBlocks.hiddenSectionIds.length;
    return c;
  }

  async function createProject(name, url) {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ name, url })
      });
      if (!res.ok) throw new Error('Failed to create project');
      showToast('Project created!', 'success');
      loadProjects();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteProject(id) {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE', headers: apiHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Project deleted', 'success');
      loadProjects();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ============ SETTINGS ============
  async function openProject(projectId) {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}`, { headers: apiHeaders() });
      if (!res.ok) throw new Error('Project not found');
      currentProject = await res.json();
      currentProjectId = projectId;
      populateSettings(currentProject.settings);
      projectsPage.style.display = 'none';
      settingsPage.style.display = 'block';
      embedPage.style.display = 'none';
      settingsNavLink.style.display = 'flex';
      embedNavLink.style.display = 'flex';
      document.getElementById('settingsProjectName').textContent = currentProject.name + ' Settings';
      document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
      settingsNavLink.classList.add('active');
    } catch (err) { showToast(err.message, 'error'); }
  }

  function populateSettings(s) {
    // Cart - disabled = toggle ON
    const cartDisabled = document.getElementById('cartDisabled');
    cartDisabled.checked = s.cartButton.disabled;
    updateCartStatus();

    // Checkout - disabled = toggle ON
    const checkoutDisabled = document.getElementById('checkoutDisabled');
    checkoutDisabled.checked = s.checkout.disabled;
    document.getElementById('checkoutMessage').value = s.checkout.blockedMessage || '';
    updateCheckoutStatus();

    // Home Blocks - auto-detected sections
    detectedSections = s.homeBlocks.detectedSections || [];
    const hiddenIds = s.homeBlocks.hiddenSectionIds || [];
    // Sync hidden state
    detectedSections.forEach(sec => {
      sec.hidden = hiddenIds.includes(sec.id);
    });
    renderDetectedSections();

    // Announcement
    document.getElementById('announcementEnabled').checked = s.announcement.enabled;
    document.getElementById('announcementText').value = s.announcement.text || '';
    document.getElementById('announcementBg').value = s.announcement.bgColor || '#000000';
    document.getElementById('announcementBgText').value = s.announcement.bgColor || '#000000';
    document.getElementById('announcementColor').value = s.announcement.textColor || '#ffffff';
    document.getElementById('announcementColorText').value = s.announcement.textColor || '#ffffff';
    document.getElementById('announcementDismissible').checked = s.announcement.dismissible;

    // CSS
    document.getElementById('cssEnabled').checked = s.customCSS.enabled;
    document.getElementById('cssCode').value = s.customCSS.code || '';

    // Popup
    document.getElementById('popupEnabled').checked = s.popup.enabled;
    document.getElementById('popupTitle').value = s.popup.title || '';
    document.getElementById('popupMessage').value = s.popup.message || '';
    document.getElementById('popupButtonText').value = s.popup.buttonText || '';
    document.getElementById('popupButtonUrl').value = s.popup.buttonUrl || '/';
    document.getElementById('popupDelay').value = s.popup.delay || 3;
    document.getElementById('popupBg').value = s.popup.bgColor || '#ffffff';
    document.getElementById('popupBgText').value = s.popup.bgColor || '#ffffff';
    document.getElementById('popupColor').value = s.popup.textColor || '#333333';
    document.getElementById('popupColorText').value = s.popup.textColor || '#333333';

    // Password
    document.getElementById('passwordEnabled').checked = s.passwordProtection.enabled;
    document.getElementById('passwordValue').value = s.passwordProtection.password || '';
    document.getElementById('passwordMessage').value = s.passwordProtection.message || '';
    document.getElementById('passwordAllPages').checked = s.passwordProtection.protectAllPages || false;
    protectedPages = s.passwordProtection.protectedPages || [];
    detectedPages = s.passwordProtection.detectedPages || [];
    renderProtectedPagesTags();
    renderDetectedPages();
    updateSpecificPagesVisibility();
  }

  // ============ STATUS INDICATORS ============
  function updateCartStatus() {
    const el = document.getElementById('cartStatusText');
    const on = document.getElementById('cartDisabled').checked;
    el.textContent = on ? 'Status: Cart buttons are HIDDEN' : 'Status: Cart buttons are VISIBLE';
    el.style.color = on ? 'var(--danger)' : 'var(--success)';
    el.parentElement.style.background = on ? 'var(--danger-light)' : 'var(--success-light)';
  }

  function updateCheckoutStatus() {
    const el = document.getElementById('checkoutStatusText');
    const on = document.getElementById('checkoutDisabled').checked;
    el.textContent = on ? 'Status: Checkout is BLOCKED' : 'Status: Checkout is ENABLED';
    el.style.color = on ? 'var(--danger)' : 'var(--success)';
    el.parentElement.style.background = on ? 'var(--danger-light)' : 'var(--success-light)';
  }

  // ============ AUTO-DETECTED SECTIONS RENDERING ============
  function renderDetectedSections() {
    const container = document.getElementById('detectedSectionsList');
    const noMsg = document.getElementById('noSectionsMsg');
    container.innerHTML = '';

    if (detectedSections.length === 0) {
      noMsg.style.display = 'block';
      return;
    }
    noMsg.style.display = 'none';

    detectedSections.forEach((sec, index) => {
      const item = document.createElement('div');
      item.className = 'block-item';
      item.innerHTML = `
        <span class="block-name">
          <span class="block-icon">📦</span>
          <span title="${esc(sec.id)}">${esc(sec.name)}</span>
        </span>
        <label class="toggle">
          <input type="checkbox" class="section-toggle" data-index="${index}" ${sec.hidden ? 'checked' : ''}>
          <span class="slider"></span>
        </label>`;
      container.appendChild(item);
    });

    // Bind toggles
    container.querySelectorAll('.section-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const idx = parseInt(toggle.dataset.index);
        detectedSections[idx].hidden = toggle.checked;
      });
    });
  }

  // ============ AUTO-DETECTED PAGES RENDERING ============
  function renderDetectedPages() {
    const container = document.getElementById('detectedPagesList');
    const noMsg = document.getElementById('noPagesMsg');
    container.innerHTML = '';

    if (detectedPages.length === 0) {
      noMsg.style.display = 'block';
      return;
    }
    noMsg.style.display = 'none';

    detectedPages.forEach((page, index) => {
      const item = document.createElement('div');
      item.className = 'block-item';
      item.innerHTML = `
        <span class="block-name">
          <span class="block-icon">📄</span>
          <span>${esc(page.title)}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${esc(page.path)}</span>
        </span>
        <label class="toggle">
          <input type="checkbox" class="page-toggle" data-index="${index}" ${page.protected ? 'checked' : ''}>
          <span class="slider"></span>
        </label>`;
      container.appendChild(item);
    });

    container.querySelectorAll('.page-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const idx = parseInt(toggle.dataset.index);
        detectedPages[idx].protected = toggle.checked;
      });
    });
  }

  // ============ GATHER SETTINGS (corrected) ============
  function gatherSettings() {
    // Build hiddenSectionIds from detected sections
    const hiddenSectionIds = detectedSections
      .filter(s => s.hidden)
      .map(s => s.id);

    return {
      cartButton: {
        disabled: document.getElementById('cartDisabled').checked
      },
      checkout: {
        disabled: document.getElementById('checkoutDisabled').checked,
        blockedMessage: document.getElementById('checkoutMessage').value
      },
      homeBlocks: {
        detectedSections: detectedSections,
        hiddenSectionIds: hiddenSectionIds
      },
      announcement: {
        enabled: document.getElementById('announcementEnabled').checked,
        text: document.getElementById('announcementText').value,
        bgColor: document.getElementById('announcementBg').value,
        textColor: document.getElementById('announcementColor').value,
        dismissible: document.getElementById('announcementDismissible').checked
      },
      customCSS: {
        enabled: document.getElementById('cssEnabled').checked,
        code: document.getElementById('cssCode').value
      },
      popup: {
        enabled: document.getElementById('popupEnabled').checked,
        title: document.getElementById('popupTitle').value,
        message: document.getElementById('popupMessage').value,
        buttonText: document.getElementById('popupButtonText').value,
        buttonUrl: document.getElementById('popupButtonUrl').value,
        delay: parseInt(document.getElementById('popupDelay').value) || 3,
        bgColor: document.getElementById('popupBg').value,
        textColor: document.getElementById('popupColor').value,
        overlayColor: 'rgba(0,0,0,0.5)'
      },
      passwordProtection: {
        enabled: document.getElementById('passwordEnabled').checked,
        password: document.getElementById('passwordValue').value,
        protectAllPages: document.getElementById('passwordAllPages').checked,
        detectedPages: detectedPages,
        protectedPages: protectedPages,
        message: document.getElementById('passwordMessage').value
      }
    };
  }

  async function saveSettings() {
    if (!currentProjectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${currentProjectId}/settings`, {
        method: 'PUT', headers: apiHeaders(),
        body: JSON.stringify(gatherSettings())
      });
      if (!res.ok) throw new Error('Failed to save');
      currentProject = await res.json();
      showToast('Settings saved!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ============ REFRESH (re-fetch project to get latest scan data) ============
  async function refreshProjectData() {
    if (!currentProjectId) return;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${currentProjectId}`, { headers: apiHeaders() });
      if (!res.ok) throw new Error('Failed to refresh');
      currentProject = await res.json();
      const s = currentProject.settings;

      // Update detected sections
      detectedSections = s.homeBlocks.detectedSections || [];
      const hiddenIds = s.homeBlocks.hiddenSectionIds || [];
      detectedSections.forEach(sec => { sec.hidden = hiddenIds.includes(sec.id); });
      renderDetectedSections();

      // Update detected pages
      detectedPages = s.passwordProtection.detectedPages || [];
      renderDetectedPages();

      showToast('Refreshed! Found ' + detectedSections.length + ' sections and ' + detectedPages.length + ' pages.', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ============ EMBED PAGE ============
  function openEmbedPage(projectId) {
    currentProjectId = projectId;
    projectsPage.style.display = 'none';
    settingsPage.style.display = 'none';
    embedPage.style.display = 'block';
    embedNavLink.style.display = 'flex';
    settingsNavLink.style.display = 'flex';
    const code = `<script src="${API_BASE}/embed/controller.js" data-project-id="${projectId}" data-api="${API_BASE}"><\/script>`;
    document.getElementById('embedCodeText').textContent = code;
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    embedNavLink.classList.add('active');
  }

  function goBackToProjects() {
    projectsPage.style.display = 'block';
    settingsPage.style.display = 'none';
    embedPage.style.display = 'none';
    usersPage.style.display = 'none';
    profilePage.style.display = 'none';
    settingsNavLink.style.display = 'none';
    embedNavLink.style.display = 'none';
    currentProjectId = null;
    currentProject = null;
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-page="projects"]').classList.add('active');
    loadProjects();
  }

  // ============ USER MANAGEMENT ============
  async function loadUsers() {
    try {
      const res = await fetch(`${API_BASE}/api/users`, { headers: apiHeaders() });
      if (!res.ok) throw new Error('Failed to load users');
      const users = await res.json();
      renderUsers(users);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderUsers(users) {
    usersList.innerHTML = '';
    users.forEach(user => {
      const item = document.createElement('div');
      item.className = 'block-item';
      const isSelf = user.id === currentUser.id;
      const isSuperAdmin = user.role === 'super_admin';
      
      item.innerHTML = `
        <span class="block-name">
          <span class="block-icon">👤</span>
          <span>${esc(user.name)}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(${esc(user.email)})</span>
          <span class="badge ${isSuperAdmin ? 'badge-success' : 'badge-warning'}" style="margin-left: 10px; font-size:10px; padding: 2px 8px;">
            ${isSuperAdmin ? 'Super Admin' : 'User'}
          </span>
        </span>
        ${isSelf ? '<span style="font-size: 12px; color: var(--text-muted);">You</span>' : `
          <button class="btn btn-sm btn-danger delete-user-btn" data-id="${user.id}" style="padding: 6px 12px; width: auto;">Delete</button>
        `}
      `;
      usersList.appendChild(item);
    });

    usersList.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this user?')) {
          deleteUser(id);
        }
      });
    });
  }

  async function createNewUser(name, email, password, role) {
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ name, email, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('User created successfully!', 'success');
      loadUsers();
      addUserModal.classList.remove('active');
      addUserForm.reset();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteUser(id) {
    try {
      const res = await fetch(`${API_BASE}/api/users/${id}`, {
        method: 'DELETE',
        headers: apiHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('User deleted successfully!', 'success');
      loadUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============ PROFILE PAGE ============
  function openProfilePage() {
    document.getElementById('profileName').value = currentUser.name;
    document.getElementById('profileEmail').value = currentUser.email;
    document.getElementById('profileRole').value = currentUser.role === 'super_admin' ? 'Super Admin' : 'Standard User';
    changePasswordForm.reset();

    // Close any setting subpages
    projectsPage.style.display = 'none';
    settingsPage.style.display = 'none';
    embedPage.style.display = 'none';
    usersPage.style.display = 'none';
    profilePage.style.display = 'block';
    settingsNavLink.style.display = 'none';
    embedNavLink.style.display = 'none';
    currentProjectId = null;
    currentProject = null;

    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    profileNavLink.classList.add('active');
  }

  async function changePassword(currentPassword, newPassword) {
    try {
      const res = await fetch(`${API_BASE}/api/profile/password`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast('Password updated successfully!', 'success');
      changePasswordForm.reset();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ============ MANUAL PROTECTED PAGES TAGS ============
  function renderProtectedPagesTags() {
    const container = document.getElementById('protectedPagesInput');
    const input = document.getElementById('pageTagInput');
    container.querySelectorAll('.tag').forEach(t => t.remove());
    protectedPages.forEach((page, index) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `${esc(page)} <button class="remove-tag" data-index="${index}">&times;</button>`;
      container.insertBefore(tag, input);
    });
    container.querySelectorAll('.remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        protectedPages.splice(parseInt(btn.dataset.index), 1);
        renderProtectedPagesTags();
      });
    });
  }

  function updateSpecificPagesVisibility() {
    const allPages = document.getElementById('passwordAllPages').checked;
    const section = document.getElementById('specificPagesSection');
    if (section) section.style.display = allPages ? 'none' : 'block';
  }

  // ============ EVENTS ============
  function bindEvents() {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      login(document.getElementById('loginEmail').value, document.getElementById('loginPassword').value);
    });

    logoutBtn.addEventListener('click', logout);

    addProjectBtn.addEventListener('click', () => addProjectModal.classList.add('active'));

    addProjectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createProject(document.getElementById('projectName').value, document.getElementById('projectUrl').value);
      addProjectModal.classList.remove('active');
      addProjectForm.reset();
    });

    confirmDeleteBtn.addEventListener('click', () => {
      if (deleteProjectId) { deleteProject(deleteProjectId); deleteProjectId = null; deleteModal.classList.remove('active'); }
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => document.getElementById(btn.dataset.close).classList.remove('active'));
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
    });

    // Tabs
    document.querySelectorAll('.settings-tabs button').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tabs button').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
        document.querySelector(`.settings-section[data-section="${tab.dataset.tab}"]`).classList.add('active');
      });
    });

    saveSettingsBtn.addEventListener('click', saveSettings);
    backToProjects.addEventListener('click', goBackToProjects);
    backToProjectsFromEmbed.addEventListener('click', goBackToProjects);

    // Sidebar nav
    document.querySelectorAll('.sidebar nav a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        if (page === 'projects') goBackToProjects();
        else if (page === 'settings' && currentProjectId) { 
          projectsPage.style.display = 'none'; 
          settingsPage.style.display = 'block'; 
          embedPage.style.display = 'none'; 
          usersPage.style.display = 'none'; 
          profilePage.style.display = 'none'; 
        }
        else if (page === 'embed' && currentProjectId) openEmbedPage(currentProjectId);
        else if (page === 'users') {
          const isSuper = currentUser && (currentUser.role === 'super_admin' || currentUser.id === 'admin-001' || currentUser.email === 'bayazid416@gmail.com');
          if (!isSuper) {
            showToast('Access denied. Only super admin can manage users.', 'error');
            goBackToProjects();
            return;
          }
          projectsPage.style.display = 'none';
          settingsPage.style.display = 'none';
          embedPage.style.display = 'none';
          profilePage.style.display = 'none';
          usersPage.style.display = 'block';
          loadUsers();
        }
        else if (page === 'profile') {
          openProfilePage();
        }
      });
    });

    // Add User trigger
    addUserBtn.addEventListener('click', () => {
      addUserModal.classList.add('active');
    });

    addUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('newUserName').value;
      const email = document.getElementById('newUserEmail').value;
      const password = document.getElementById('newUserPassword').value;
      const role = document.getElementById('newUserRole').value;
      createNewUser(name, email, password, role);
    });

    // Change Password trigger
    changePasswordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const curPass = document.getElementById('currentPassword').value;
      const newPass = document.getElementById('newPassword').value;
      const confirmNewPass = document.getElementById('confirmNewPassword').value;

      if (newPass !== confirmNewPass) {
        showToast('New passwords do not match!', 'error');
        return;
      }

      if (newPass.length < 6) {
        showToast('New password must be at least 6 characters long!', 'error');
        return;
      }

      changePassword(curPass, newPass);
    });

    // Copy embed
    document.getElementById('copyEmbedBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('embedCodeText').textContent).then(() => {
        showToast('Copied!', 'success');
        const btn = document.getElementById('copyEmbedBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      });
    });

    // Color syncs
    syncColorInputs('announcementBg', 'announcementBgText');
    syncColorInputs('announcementColor', 'announcementColorText');
    syncColorInputs('popupBg', 'popupBgText');
    syncColorInputs('popupColor', 'popupColorText');

    // Cart/Checkout status update on toggle
    document.getElementById('cartDisabled').addEventListener('change', updateCartStatus);
    document.getElementById('checkoutDisabled').addEventListener('change', updateCheckoutStatus);

    // Password all pages toggle
    document.getElementById('passwordAllPages').addEventListener('change', updateSpecificPagesVisibility);

    // Manual page tags
    document.getElementById('pageTagInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && !protectedPages.includes(val)) { protectedPages.push(val); renderProtectedPagesTags(); }
        e.target.value = '';
      }
    });

    // Project Search Input event
    document.getElementById('projectSearchInput').addEventListener('input', handleProjectSearch);

    // Refresh buttons
    document.getElementById('refreshSectionsBtn').addEventListener('click', refreshProjectData);
    document.getElementById('refreshPagesBtn').addEventListener('click', refreshProjectData);
  }

  function syncColorInputs(colorId, textId) {
    const color = document.getElementById(colorId);
    const text = document.getElementById(textId);
    color.addEventListener('input', () => { text.value = color.value; });
    text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(text.value)) color.value = text.value; });
  }

  // ============ UTILS ============
  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'all 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  init();
})();
