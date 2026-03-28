// ─── Elements ─────────────────────────────────────────────────────────────────
const usernameInput = document.getElementById('usernameInput');
const startBtn = document.getElementById('startBtn');
const typingSection = document.getElementById('typingSection');
const wordInput = document.getElementById('wordInput');
const submitBtn = document.getElementById('submitBtn');
const countText = document.getElementById('countText');
const warningText = document.getElementById('warningText');
const messageText = document.getElementById('messageText');
const leaderboardBody = document.getElementById('leaderboardBody');
const topThree = document.getElementById('topThree');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
const loginLink = document.getElementById('loginLink');
const userChip = document.getElementById('userChip');
const navUsername = document.getElementById('navUsername');
const logoutBtn = document.getElementById('logoutBtn');

// ─── New Elements ─────────────────────────────────────────────────────────────
const streakText = document.getElementById('streakText');
const longestStreakText = document.getElementById('longestStreakText');
const darkToggleBtn = document.getElementById('darkToggleBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const shareBtn = document.getElementById('shareBtn');
const dailyGoalInput = document.getElementById('dailyGoalInput');
const setGoalBtn = document.getElementById('setGoalBtn');
const dailyCountText = document.getElementById('dailyCountText');
const dailyGoalText = document.getElementById('dailyGoalText');
const dailyBar = document.getElementById('dailyBar');
const achievementsGrid = document.getElementById('achievementsGrid');
const achPopup = document.getElementById('achPopup');
const achPopupBody = document.getElementById('achPopupBody');
const achPopupClose = document.getElementById('achPopupClose');

// ─── State ────────────────────────────────────────────────────────────────────
const sessionId = localStorage.getItem('radhaSessionId') || crypto.randomUUID();
localStorage.setItem('radhaSessionId', sessionId);

let currentUsername = '';
let started = false;
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let userAchievements = [];
let dailyGoal = 50;
let dailyCount = 0;

// ─── Dark Mode ────────────────────────────────────────────────────────────────
function applyTheme() {
  const dark = localStorage.getItem('theme') === 'dark';
  document.body.classList.toggle('dark', dark);
  if (darkToggleBtn) darkToggleBtn.textContent = dark ? '☀️' : '🌙';
}

darkToggleBtn?.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  applyTheme();
});

applyTheme();

// ─── Sound ────────────────────────────────────────────────────────────────────
function updateSoundBtn() {
  if (soundToggleBtn) soundToggleBtn.textContent = soundEnabled ? '🔊' : '🔇';
}

soundToggleBtn?.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('soundEnabled', soundEnabled);
  updateSoundBtn();
});

updateSoundBtn();

function playChantSound() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(528, ctx.currentTime); // healing frequency ✨
    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setMessage(text, type = '') {
  messageText.textContent = text;
  messageText.className = `message ${type}`.trim();
}

function updateAuthUI() {
  const token = localStorage.getItem('devotionAuthToken');
  const userRaw = localStorage.getItem('devotionAuthUser');
  if (!token || !userRaw) {
    loginLink?.classList.remove('hidden');
    userChip?.classList.add('hidden');
    return;
  }
  try {
    const user = JSON.parse(userRaw);
    if (navUsername) navUsername.textContent = user.username;
    usernameInput.value = user.username;
    loginLink?.classList.add('hidden');
    userChip?.classList.remove('hidden');
  } catch (_) {
    localStorage.removeItem('devotionAuthToken');
    localStorage.removeItem('devotionAuthUser');
    loginLink?.classList.remove('hidden');
    userChip?.classList.add('hidden');
  }
}

function updateProgress(count) {
  const progress = Math.min(100, (count % 50) * 2);
  progressBar.style.width = `${progress}%`;
  progressLabel.textContent = `${progress}%`;
}

function updateDailyProgress(current, goal) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  if (dailyCountText) dailyCountText.textContent = current;
  if (dailyGoalText) dailyGoalText.textContent = goal;
  if (dailyBar) dailyBar.style.width = `${pct}%`;
  if (dailyGoalInput) dailyGoalInput.value = goal;
}

function updateStreakUI(current, longest) {
  if (streakText) streakText.textContent = current;
  if (longestStreakText) longestStreakText.textContent = longest;
}

function animateCounter(el, from, to) {
  const start = performance.now();
  const duration = 360;
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    el.textContent = Math.floor(from + (to - from) * p);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Achievement Popup ────────────────────────────────────────────────────────
function showAchievementPopup(achievements) {
  if (!achievements.length || !achPopup) return;
  achPopupBody.innerHTML = achievements
    .map(
      (a) =>
        `<div class="ach-item"><span class="ach-icon">${a.label.split(' ').pop()}</span><div><strong>${a.label}</strong><p>${a.desc}</p></div></div>`,
    )
    .join('');
  achPopup.classList.remove('hidden');
  achPopup.classList.add('pop-in');
  setTimeout(() => {
    if (achPopup && !achPopup.classList.contains('hidden'))
      achPopup.classList.add('hidden');
  }, 5000);
}

achPopupClose?.addEventListener('click', () =>
  achPopup?.classList.add('hidden'),
);

// ─── Achievements Grid ────────────────────────────────────────────────────────
const ALL_ACHIEVEMENTS = [
  {
    id: 'first_chant',
    label: 'First Chant 🙏',
    desc: 'Type Radha for the first time',
  },
  { id: 'devotee_50', label: 'Devotee 🌸', desc: '50 chants' },
  { id: 'bhakt_100', label: 'Bhakt ✨', desc: '100 chants' },
  { id: 'mahabhakt_500', label: 'Mahabhakt 🔱', desc: '500 chants' },
  { id: 'legend_1000', label: 'Legend 👑', desc: '1000 chants' },
  { id: 'streak_3', label: 'Streak Starter 🔥', desc: '3-day streak' },
  { id: 'streak_7', label: 'Week Warrior ⚡', desc: '7-day streak' },
  { id: 'streak_30', label: 'Monthly Devotee 🌙', desc: '30-day streak' },
];

function renderAchievements(unlocked) {
  if (!achievementsGrid) return;
  achievementsGrid.innerHTML = ALL_ACHIEVEMENTS.map((a) => {
    const done = unlocked.includes(a.id);
    return `<div class="ach-badge ${done ? 'unlocked' : 'locked'}" title="${a.desc}">
      <span class="ach-emoji">${a.label.split(' ').pop()}</span>
      <small>${a.label.split(' ').slice(0, -1).join(' ')}</small>
    </div>`;
  }).join('');
}

// ─── Share Card ───────────────────────────────────────────────────────────────
shareBtn?.addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');

  // Background
  const grad = ctx.createLinearGradient(0, 0, 600, 340);
  grad.addColorStop(0, '#2f1b04');
  grad.addColorStop(1, '#6c3a0e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 340);

  // Gold border
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 576, 316);

  // Title
  ctx.fillStyle = '#ffd95a';
  ctx.font = 'bold 28px Poppins, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🙏 Devotion Hub', 300, 60);

  // Username
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Poppins, sans-serif';
  ctx.fillText(currentUsername, 300, 105);

  // Stats
  const stats = [
    ['Radha Count', countText.textContent, '#ffd95a'],
    ['🔥 Streak', streakText?.textContent || '0', '#fb923c'],
    [
      '🏆 Badges',
      `${userAchievements.length}/${ALL_ACHIEVEMENTS.length}`,
      '#a78bfa',
    ],
  ];

  ctx.textAlign = 'center';
  stats.forEach(([label, value, color], i) => {
    const x = 120 + i * 180;
    ctx.fillStyle = color;
    ctx.font = 'bold 32px Poppins, sans-serif';
    ctx.fillText(value, x, 185);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '14px Poppins, sans-serif';
    ctx.fillText(label, x, 210);
  });

  // Footer
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '13px Poppins, sans-serif';
  ctx.fillText('devotionhub.app • Radhe Radhe 🌸', 300, 305);

  // Download
  const link = document.createElement('a');
  link.download = `${currentUsername}-devotion-card.png`;
  link.href = canvas.toDataURL();
  link.click();
});

// ─── API ─────────────────────────────────────────────────────────────────────
async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── Session Start ────────────────────────────────────────────────────────────
async function startSession() {
  const username = usernameInput.value.trim();
  if (username.length < 2) {
    setMessage('Please enter a valid username.', 'warn');
    return;
  }

  try {
    const data = await requestJSON('/api/session/start', {
      method: 'POST',
      body: JSON.stringify({ sessionId, username }),
    });

    currentUsername = data.username;
    started = true;
    userAchievements = data.achievements || [];
    dailyGoal = data.dailyGoal || 50;
    dailyCount = data.dailyCount || 0;

    typingSection.classList.remove('hidden');
    countText.textContent = data.radhaCount;
    warningText.textContent = `${data.warnings} / 3`;
    updateProgress(data.radhaCount);
    updateStreakUI(data.currentStreak || 0, data.longestStreak || 0);
    updateDailyProgress(dailyCount, dailyGoal);
    renderAchievements(userAchievements);
    setMessage('Session started. Type "Radha" to gain points. 🙏', 'ok');
  } catch (error) {
    setMessage(error.message, 'warn');
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submitWord() {
  if (!started) {
    setMessage('Start your session first.', 'warn');
    return;
  }
  const word = wordInput.value.trim();
  if (!word || word.includes(' ')) {
    setMessage('Only one word is allowed per submission.', 'warn');
    wordInput.value = '';
    return;
  }

  try {
    const prev = Number(countText.textContent || 0);
    const data = await requestJSON('/api/submit', {
      method: 'POST',
      body: JSON.stringify({ sessionId, username: currentUsername, word }),
    });

    animateCounter(countText, prev, data.radhaCount);
    warningText.textContent = `${data.warnings} / 3`;
    updateProgress(data.radhaCount);
    updateStreakUI(data.currentStreak, data.longestStreak);

    dailyCount = data.dailyCount;
    dailyGoal = data.dailyGoal;
    updateDailyProgress(dailyCount, dailyGoal);

    // Achievement updates
    if (data.newAchievements?.length) {
      userAchievements = [
        ...userAchievements,
        ...data.newAchievements.map((a) => a.id),
      ];
      renderAchievements(userAchievements);
      showAchievementPopup(data.newAchievements);
    }

    if (data.dailyGoalReached) {
      setMessage(
        `🎯 Daily goal of ${dailyGoal} reached! Radhe Radhe! 🙏`,
        'ok',
      );
    } else if ([50, 100, 200].includes(data.radhaCount) || data.milestone) {
      setMessage('Radhe Radhe 🙏 Sacred milestone reached!', 'ok');
    } else {
      setMessage('Accepted: Radha 🙏', 'ok');
    }

    playChantSound();
    wordInput.value = '';
    wordInput.classList.add('accepted-glow');
    setTimeout(() => wordInput.classList.remove('accepted-glow'), 360);
    await loadLeaderboard();
  } catch (error) {
    if (error.message.includes('Abusive words')) {
      const old = Number(warningText.textContent.split('/')[0].trim()) || 0;
      warningText.textContent = `${Math.min(old + 1, 3)} / 3`;
    }
    setMessage(error.message, 'warn');
    wordInput.value = '';
  }
}

// ─── Daily Goal ───────────────────────────────────────────────────────────────
setGoalBtn?.addEventListener('click', async () => {
  if (!started) {
    setMessage('Start session first.', 'warn');
    return;
  }
  const goal = Number(dailyGoalInput.value);
  if (!goal || goal < 1) return;
  try {
    const data = await requestJSON('/api/daily-goal', {
      method: 'POST',
      body: JSON.stringify({ sessionId, goal }),
    });
    dailyGoal = data.dailyGoal;
    updateDailyProgress(dailyCount, dailyGoal);
  } catch (_) {}
});

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function renderTopThree(rows) {
  const labels = ['🥇', '🥈', '🥉'];
  topThree.innerHTML = rows
    .slice(0, 3)
    .map((item, i) => {
      const crown = i === 0 ? ' 👑' : '';
      const cls = i === 0 ? 'podium first' : 'podium';
      return `<article class="${cls}">
        <span class="badge">${labels[i]} Rank ${item.rank}</span>
        <h3>${item.username}${crown}</h3>
        <p>${item.radhaCount} chants</p>
        ${item.currentStreak ? `<small>🔥 ${item.currentStreak} day streak</small>` : ''}
      </article>`;
    })
    .join('');
}

async function loadLeaderboard() {
  try {
    const data = await requestJSON('/api/leaderboard');
    leaderboardBody.innerHTML = '';
    renderTopThree(data.leaderboard);
    data.leaderboard.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="rank-badge">#${item.rank}</span></td>
        <td>${item.username}</td>
        <td>${item.radhaCount}</td>
        <td>${item.currentStreak ? `🔥 ${item.currentStreak}` : '-'}</td>
        <td>${item.badgeCount ? `🏅 ${item.badgeCount}` : '-'}</td>
      `;
      leaderboardBody.appendChild(tr);
    });
  } catch (_) {
    leaderboardBody.innerHTML =
      '<tr><td colspan="5">Unable to load leaderboard.</td></tr>';
    topThree.innerHTML = '';
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
wordInput.addEventListener('paste', (e) => {
  e.preventDefault();
  setMessage('Paste is disabled for fair typing.', 'warn');
});
wordInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    setMessage('Ctrl/Cmd + V is disabled.', 'warn');
  }
  if (e.key === 'Enter') submitWord();
});

navToggle?.addEventListener('click', () => navMenu.classList.toggle('open'));

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('devotionAuthToken');
  localStorage.removeItem('devotionAuthUser');
  updateAuthUI();
});

startBtn.addEventListener('click', startSession);
submitBtn.addEventListener('click', submitWord);

// ─── Init ─────────────────────────────────────────────────────────────────────
updateAuthUI();
renderAchievements([]);
setInterval(loadLeaderboard, 5000);
loadLeaderboard();
