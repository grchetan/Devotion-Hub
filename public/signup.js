const form = document.getElementById('signupForm');
const usernameInput = document.getElementById('username');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const messageEl = document.getElementById('formMessage');

function setMessage(text, type = 'warn') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!username) {
    setMessage('Username is required.', 'warn');
    return;
  }

  if (password.length < 6) {
    setMessage('Password must be at least 6 characters.', 'warn');
    return;
  }

  if (password !== confirmPassword) {
    setMessage('Passwords do not match.', 'warn');
    return;
  }

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, confirmPassword }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed.');

    setMessage('Signup successful. Redirecting to login...', 'ok');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 700);
  } catch (error) {
    setMessage(error.message || 'Signup failed.', 'warn');
  }
});
