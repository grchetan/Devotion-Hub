const startBtn = document.getElementById('startBtn');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const usernameInput = document.getElementById('username');
const radhaInput = document.getElementById('radhaInput');
const totalCountEl = document.getElementById('totalCount');
const warningsCountEl = document.getElementById('warningsCount');
const messageEl = document.getElementById('message');
const typingPanel = document.getElementById('typingPanel');
const leaderboardBody = document.getElementById('leaderboardBody');
const inputRow = document.getElementById('inputRow');

let username = '';
let sessionId = localStorage.getItem('radhaSessionId') || crypto.randomUUID();
let started = false;

localStorage.setItem('radhaSessionId', sessionId);

function setMessage(text, type = '') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function playTypingSound() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 523;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.06);
}

async function startSession() {
  username = usernameInput.value.trim();
  if (username.length < 2) {
    setMessage('Please enter a valid username.', 'warn');
    return;
  }

  const res = await fetch('/api/session/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, sessionId }),
  });

  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || 'Could not start session.', 'warn');
    return;
  }

  started = true;
  typingPanel.classList.remove('hidden');
  totalCountEl.textContent = data.radha_count;
  warningsCountEl.textContent = `${data.warnings} / 3`;
  setMessage('Session started. Type "Radha" with devotion.', 'ok');
  loadLeaderboard();
}

async function submitWord() {
  if (!started) {
    setMessage('Start your session first.', 'warn');
    return;
  }

  const word = radhaInput.value.trim();

  if (!word || word.includes(' ')) {
    setMessage('Only one word is allowed per submission.', 'warn');
    radhaInput.value = '';
    return;
  }

  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, sessionId, word }),
  });

  const data = await res.json();

  if (!res.ok) {
    if (data.error === 'Warning: Abusive words are not allowed.') {
      warningsCountEl.textContent = `${data.warnings} / 3`;
      setMessage(data.error, 'warn');
    } else {
      setMessage(data.error || 'Submission failed.', 'warn');
    }
    radhaInput.value = '';
    return;
  }

  totalCountEl.textContent = data.radha_count;
  warningsCountEl.textContent = `${data.warnings} / 3`;
  setMessage('Accepted: Radha 🙏', 'ok');
  inputRow.classList.remove('pulse');
  void inputRow.offsetWidth;
  inputRow.classList.add('pulse');
  playTypingSound();

  if (data.milestone) {
    setMessage('Radhe Radhe 🙏 You reached a sacred milestone!', 'ok');
  }

  radhaInput.value = '';
  loadLeaderboard();
}

async function loadLeaderboard() {
  const res = await fetch('/api/leaderboard');
  const data = await res.json();

  leaderboardBody.innerHTML = '';
  data.leaderboard.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${entry.rank}</td><td>${entry.username}</td><td>${entry.radha_count}</td>`;
    leaderboardBody.appendChild(tr);
  });
}

async function resetDaily() {
  const key = prompt('Enter reset key');
  if (!key) return;

  const res = await fetch('/api/admin/reset-daily', {
    method: 'POST',
    headers: { 'x-reset-key': key },
  });
  const data = await res.json();

  if (!res.ok) {
    setMessage(data.error || 'Reset failed', 'warn');
    return;
  }
  setMessage('Daily leaderboard reset successful.', 'ok');
  loadLeaderboard();
}

radhaInput.addEventListener('paste', (e) => {
  e.preventDefault();
  setMessage('Paste is disabled for fair devotion typing.', 'warn');
});

radhaInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    setMessage('Copy-paste shortcuts are disabled.', 'warn');
  }
});

startBtn.addEventListener('click', startSession);
submitBtn.addEventListener('click', submitWord);
radhaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitWord();
});
resetBtn.addEventListener('click', resetDaily);

setInterval(loadLeaderboard, 4000);
loadLeaderboard();
