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

const sessionId = localStorage.getItem('radhaSessionId') || crypto.randomUUID();
localStorage.setItem('radhaSessionId', sessionId);

let currentUsername = '';
let started = false;

function setMessage(text, type = '') {
  messageText.textContent = text;
  messageText.className = `message ${type}`.trim();
}

function updateProgress(count) {
  const progress = Math.min(100, (count % 50) * 2);
  progressBar.style.width = `${progress}%`;
  progressLabel.textContent = `${progress}%`;
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

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

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
    typingSection.classList.remove('hidden');
    countText.textContent = data.radhaCount;
    warningText.textContent = `${data.warnings} / 3`;
    updateProgress(data.radhaCount);
    setMessage('Session started. Type "Radha" to gain points.', 'ok');
  } catch (error) {
    setMessage(error.message, 'warn');
  }
}

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

    if ([50, 100, 200].includes(data.radhaCount) || data.milestone) {
      setMessage('Radhe Radhe 🙏 Sacred milestone reached', 'ok');
    } else {
      setMessage('Accepted: Radha 🙏', 'ok');
    }

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

function renderTopThree(rows) {
  const labels = ['🥇', '🥈', '🥉'];
  topThree.innerHTML = rows
    .slice(0, 3)
    .map((item, i) => {
      const crown = i === 0 ? ' 👑' : '';
      const cls = i === 0 ? 'podium first' : 'podium';
      return `<article class="${cls}"><span class="badge">${labels[i]} Rank ${item.rank}</span><h3>${item.username}${crown}</h3><p>${item.radhaCount} chants</p></article>`;
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
      tr.innerHTML = `<td><span class="rank-badge">#${item.rank}</span></td><td>${item.username}</td><td>${item.radhaCount}</td>`;
      leaderboardBody.appendChild(tr);
    });
  } catch (_error) {
    leaderboardBody.innerHTML = '<tr><td colspan="3">Unable to load leaderboard.</td></tr>';
    topThree.innerHTML = '';
  }
}

wordInput.addEventListener('paste', (event) => {
  event.preventDefault();
  setMessage('Paste is disabled for fair typing.', 'warn');
});

wordInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
    event.preventDefault();
    setMessage('Ctrl/Cmd + V is disabled.', 'warn');
  }
  if (event.key === 'Enter') submitWord();
});

navToggle?.addEventListener('click', () => {
  navMenu.classList.toggle('open');
});

startBtn.addEventListener('click', startSession);
submitBtn.addEventListener('click', submitWord);

setInterval(loadLeaderboard, 5000);
loadLeaderboard();
