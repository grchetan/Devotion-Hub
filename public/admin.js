const TOKEN_KEY = 'radhaAdminToken';

const loginSection = document.getElementById('loginSection');
const panel = document.getElementById('panel');
const loginMessage = document.getElementById('loginMessage');
const statsGrid = document.getElementById('statsGrid');
const usersTableBody = document.getElementById('usersTableBody');
const activityList = document.getElementById('activityList');
const leaderboardList = document.getElementById('leaderboardList');

function token() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(value) {
  localStorage.setItem(TOKEN_KEY, value);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

async function requestJSON(url, options = {}) {
  const t = token();
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    },
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function openPanel() {
  loginSection.classList.add('hidden');
  panel.classList.remove('hidden');
}

function openLogin() {
  panel.classList.add('hidden');
  loginSection.classList.remove('hidden');
}

async function login() {
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;

  try {
    const data = await requestJSON('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    setToken(data.token);
    loginMessage.textContent = '';
    openPanel();
    await loadDashboard();
  } catch (_error) {
    loginMessage.textContent = 'Invalid username or password.';
  }
}

function renderStats(stats) {
  const cards = [
    ['Total Users', stats.totalUsers],
    ['Active Users Today', stats.activeUsers],
    ['Total Radha Count', stats.totalRadhaCount],
    ['Banned Users', stats.bannedUsers],
    ['Total Submissions', stats.totalSubmissions],
  ];

  statsGrid.innerHTML = cards
    .map(([label, value]) => `<article class="stat"><strong>${value}</strong><div>${label}</div></article>`)
    .join('');
}

function renderUsers(users) {
  usersTableBody.innerHTML = users
    .map((user) => {
      const banned = user.banStatus?.isBanned && user.banStatus?.bannedUntil && new Date(user.banStatus.bannedUntil) > new Date();
      return `
        <tr>
          <td>${user.username}</td>
          <td>${user.radhaCount}</td>
          <td>${user.warnings}</td>
          <td>${banned ? 'Banned' : 'Active'}</td>
          <td>${formatDate(user.lastActivity)}</td>
          <td class="actions">
            <button onclick="adminAction('ban', '${user.sessionId}')">Ban</button>
            <button onclick="adminAction('unban', '${user.sessionId}')">Unban</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderActivities(items) {
  activityList.innerHTML = items
    .map((item) => `<li><strong>${item.username}</strong>: ${item.action}<br/><small>${formatDate(item.createdAt)}</small></li>`)
    .join('');
}

function renderLeaderboard(items) {
  leaderboardList.innerHTML = items
    .map((row) => `<li>#${row.rank} ${row.username} — ${row.radhaCount}</li>`)
    .join('');
}

async function loadDashboard() {
  try {
    const dashboard = await requestJSON('/api/admin/dashboard');
    const usersResponse = await requestJSON('/api/admin/users');

    renderStats(dashboard.stats);
    renderActivities(dashboard.activities);
    renderLeaderboard(dashboard.leaderboard);
    renderUsers(usersResponse.users);
  } catch (_error) {
    clearToken();
    openLogin();
  }
}

async function adminAction(action, sessionId) {
  await requestJSON(`/api/admin/${action}`, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
  await loadDashboard();
}

window.adminAction = adminAction;

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  openLogin();
});
document.getElementById('resetLeaderboardBtn').addEventListener('click', async () => {
  await requestJSON('/api/admin/reset-leaderboard', { method: 'POST', body: '{}' });
  await loadDashboard();
});

if (token()) {
  openPanel();
  loadDashboard();
}
