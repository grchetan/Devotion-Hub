const tokenKey = 'radhaAdminToken';

const loginBox = document.getElementById('loginBox');
const panel = document.getElementById('panel');
const loginMsg = document.getElementById('loginMsg');
const statsGrid = document.getElementById('statsGrid');
const activityFeed = document.getElementById('activityFeed');
const usersBody = document.getElementById('usersBody');
const abuseList = document.getElementById('abuseList');
const leaderboardList = document.getElementById('leaderboardList');

function getToken() {
  return localStorage.getItem(tokenKey) || '';
}

function setToken(token) {
  localStorage.setItem(tokenKey, token);
}

function clearToken() {
  localStorage.removeItem(tokenKey);
}

async function api(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showPanel() {
  loginBox.classList.add('hidden');
  panel.classList.remove('hidden');
}

function showLogin() {
  panel.classList.add('hidden');
  loginBox.classList.remove('hidden');
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

async function login() {
  try {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const data = await api('/api/admin/login', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    loginMsg.textContent = '';
    showPanel();
    refreshAll();
  } catch (_error) {
    loginMsg.textContent = 'Invalid username or password.';
  }
}

async function loadDashboard() {
  const data = await api('/api/admin/dashboard');
  const cards = [
    ['Total Users', data.totalUsers],
    ['Active Users Today', data.activeToday],
    ['Total Radha Count', data.totalRadha],
    ['Banned Users', data.bannedUsers],
    ['Total Submissions', data.totalSubmissions],
  ];
  statsGrid.innerHTML = cards.map(([name, value]) => `<div class="stat-card"><strong>${value}</strong><div>${name}</div></div>`).join('');
}

async function loadActivity() {
  const data = await api('/api/admin/activity?limit=25');
  activityFeed.innerHTML = data.activity
    .map((a) => `<li><strong>${a.username}</strong> ${a.action} <br/><small>${fmtDate(a.timestamp)}</small></li>`)
    .join('');
}

async function loadUsers() {
  const data = await api('/api/admin/users');
  usersBody.innerHTML = data.users
    .map((u) => {
      const status = u.ban_status?.isBanned && u.ban_status?.banUntil && new Date(u.ban_status.banUntil) > new Date() ? 'Banned' : 'Active';
      return `
        <tr>
          <td>${u.username}</td>
          <td>${u.radha_count || 0}</td>
          <td>${u.warnings || 0}</td>
          <td>${status}</td>
          <td>${fmtDate(u.last_activity)}</td>
          <td class="actions">
            <button onclick="adminAction('ban','${u.sessionId}')">Ban</button>
            <button onclick="adminAction('unban','${u.sessionId}')">Unban</button>
            <button onclick="adminAction('reset-user','${u.sessionId}')">Reset</button>
            <button onclick="adminDelete('${u.sessionId}')">Delete</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function loadAbuse() {
  const data = await api('/api/admin/abuse-monitor');
  const flagged = data.flaggedUsers.map((u) => `<li>${u.username} • warnings: ${u.warnings} • abusive attempts: ${u.abusive_attempts} • ${u.isBanned ? 'Banned' : 'Active'}</li>`);
  const suspicious = data.suspiciousActivity.map((s) => `<li>${s.username} • ${s.action} • ${fmtDate(s.timestamp)}</li>`);
  abuseList.innerHTML = [...flagged, ...suspicious].join('') || '<li>No abuse signals found.</li>';
}

async function loadLeaderboard() {
  const data = await api('/api/admin/leaderboard');
  leaderboardList.innerHTML = data.leaderboard.slice(0, 20).map((x) => `<li>#${x.rank} ${x.username} — ${x.radha_count}</li>`).join('');
}

async function adminAction(action, sessionId) {
  await api(`/api/admin/${action}`, { method: 'POST', body: JSON.stringify({ sessionId }) });
  refreshAll();
}

async function adminDelete(sessionId) {
  await api('/api/admin/delete-user', { method: 'DELETE', body: JSON.stringify({ sessionId }) });
  refreshAll();
}

async function resetLeaderboard() {
  await api('/api/admin/reset-leaderboard', { method: 'POST', body: '{}' });
  refreshAll();
}

window.adminAction = adminAction;
window.adminDelete = adminDelete;

async function refreshAll() {
  try {
    await Promise.all([loadDashboard(), loadActivity(), loadUsers(), loadAbuse(), loadLeaderboard()]);
  } catch (_error) {
    clearToken();
    showLogin();
  }
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', () => {
  clearToken();
  showLogin();
});
document.getElementById('refreshLeaderboardBtn').addEventListener('click', loadLeaderboard);
document.getElementById('resetLeaderboardBtn').addEventListener('click', resetLeaderboard);

if (getToken()) {
  showPanel();
  refreshAll();
}
