const form = document.getElementById('loginForm');
const identifierInput = document.getElementById('identifier');
const passwordInput = document.getElementById('password');
const messageEl = document.getElementById('formMessage');

function setMessage(text, type = 'warn') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;

  if (!identifier || !password) {
    setMessage('Please enter email/username and password.', 'warn');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');

    localStorage.setItem('devotionAuthToken', data.token);
    localStorage.setItem('devotionAuthUser', JSON.stringify(data.user));
    setMessage('Login successful. Redirecting...', 'ok');
    setTimeout(() => {
      window.location.href = '/';
    }, 600);
  } catch (error) {
    setMessage(error.message || 'Invalid username/email or password.', 'warn');
  }
});
