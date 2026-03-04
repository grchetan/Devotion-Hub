const TOKEN_KEY = 'radhaAdminToken';

const loginSection = document.getElementById('loginSection');
const panel = document.getElementById('panel');
const loginMessage = document.getElementById('loginMessage');
const statsGrid = document.getElementById('statsGrid');
const usersTableBody = document.getElementById('usersTableBody');
const activityList = document.getElementById('activityList');
const abuseList = document.getElementById('abuseList');
const leaderboardList = document.getElementById('leaderboardList');
const searchUserInput = document.getElementById('searchUserInput');
const filterBannedInput = document.getElementById('filterBannedInput');
const barChart = document.getElementById('barChart');
const lineChart = document.getElementById('lineChart');

let cachedUsers = [];

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

function isUserBanned(user) {
  return Boolean(user.banStatus?.isBanned && user.banStatus?.bannedUntil && new Date(user.banStatus.bannedUntil) > new Date());
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
    ['Active Users', stats.activeUsers],
    ['Total Radha Count', stats.totalRadhaCount],
    ['Banned Users', stats.bannedUsers],
    ['Total Submissions', stats.totalSubmissions],
  ];

  statsGrid.innerHTML = cards
    .map(([label, value]) => `<article class="stat"><strong>${value}</strong><br/><small>${label}</small></article>`)
    .join('');
}

function renderUsers(users) {
  const search = searchUserInput.value.trim().toLowerCase();
  const onlyBanned = filterBannedInput.checked;

  const filtered = users.filter((user) => {
    const matchSearch = user.username.toLowerCase().includes(search);
    const banned = isUserBanned(user);
    return matchSearch && (!onlyBanned || banned);
  });

  usersTableBody.innerHTML = filtered
    .map((user) => {
      const banned = isUserBanned(user);
      return `
        <tr>
          <td>${user.username}</td>
          <td>${user.radhaCount}</td>
          <td>${user.warnings}</td>
          <td><span class="badge ${banned ? 'banned' : 'ok'}">${banned ? 'Banned' : 'Active'}</span></td>
          <td>${formatDate(user.lastActivity)}</td>
          <td class="actions">
            <button class="danger" onclick="adminAction('ban', '${user.sessionId}')">Ban</button>
            <button class="success" onclick="adminAction('unban', '${user.sessionId}')">Unban</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderActivities(items) {
  activityList.innerHTML = items
    .map((item) => `<li><strong>${item.username}</strong> — ${item.action}<br/><small>${formatDate(item.createdAt)}</small></li>`)
    .join('');

  abuseList.innerHTML = items
    .filter((item) => item.action.toLowerCase().includes('abusive') || item.action.toLowerCase().includes('banned'))
    .map((item) => `<li><strong>${item.username}</strong> — ${item.action}<br/><small>${formatDate(item.createdAt)}</small></li>`)
    .join('') || '<li>No abuse alerts currently.</li>';
}

function renderLeaderboard(items) {
  leaderboardList.innerHTML = items
    .map((row) => `<li>#${row.rank} ${row.username} — ${row.radhaCount}</li>`)
    .join('');
}

function drawBarChart(users) {
  const ctx = barChart.getContext('2d');
  const w = barChart.width;
  const h = barChart.height;
  ctx.clearRect(0, 0, w, h);

  const top = users.slice(0, 6);
  const max = Math.max(1, ...top.map((u) => u.radhaCount));
  const barW = w / (top.length * 1.5 || 1);

  top.forEach((u, i) => {
    const x = 30 + i * (barW + 25);
    const barH = ((h - 50) * u.radhaCount) / max;
    const y = h - barH - 25;

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = '#334155';
    ctx.font = '12px Poppins';
    ctx.fillText(`${u.radhaCount}`, x, y - 5);
    ctx.fillText(u.username.slice(0, 8), x, h - 8);
  });
}

function drawLineChart(users) {
  const ctx = lineChart.getContext('2d');
  const w = lineChart.width;
  const h = lineChart.height;
  ctx.clearRect(0, 0, w, h);

  const sorted = [...users].sort((a, b) => a.radhaCount - b.radhaCount).slice(-8);
  const max = Math.max(1, ...sorted.map((u) => u.radhaCount));

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();

  sorted.forEach((u, i) => {
    const x = 30 + (i * (w - 60)) / Math.max(1, sorted.length - 1);
    const y = h - 25 - ((h - 60) * u.radhaCount) / max;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.stroke();
}

async function loadDashboard() {
  try {
    const dashboard = await requestJSON('/api/admin/dashboard');
    const usersResponse = await requestJSON('/api/admin/users');

    cachedUsers = usersResponse.users;
    renderStats(dashboard.stats);
    renderActivities(dashboard.activities);
    renderLeaderboard(dashboard.leaderboard);
    renderUsers(cachedUsers);
    drawBarChart(cachedUsers);
    drawLineChart(cachedUsers);
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

searchUserInput?.addEventListener('input', () => renderUsers(cachedUsers));
filterBannedInput?.addEventListener('change', () => renderUsers(cachedUsers));

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
