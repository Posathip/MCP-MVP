const form = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submit-button');
const errorText = document.getElementById('error-text');
const formTitle = document.getElementById('form-title');
const togglePrompt = document.getElementById('toggle-prompt');
const toggleLink = document.getElementById('toggle-link');

let mode = 'login';

if (getStoredAuth()?.accessToken) {
  window.location.href = '/admin/build.html';
}

function setMode(nextMode) {
  mode = nextMode;
  errorText.textContent = '';
  if (mode === 'login') {
    formTitle.textContent = 'User Login';
    submitButton.textContent = 'Log in';
    togglePrompt.textContent = "Don't have an account?";
    toggleLink.textContent = 'Register';
    passwordInput.setAttribute('autocomplete', 'current-password');
  } else {
    formTitle.textContent = 'Register';
    submitButton.textContent = 'Register';
    togglePrompt.textContent = 'Already have an account?';
    toggleLink.textContent = 'Log in';
    passwordInput.setAttribute('autocomplete', 'new-password');
  }
}

toggleLink.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorText.textContent = '';
  submitButton.disabled = true;

  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    setStoredAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      admin: data.admin,
    });
    window.location.href = '/admin/build.html';
  } catch (error) {
    errorText.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
