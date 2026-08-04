const form = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submit-button');
const errorText = document.getElementById('error-text');

const existingAuth = getStoredAuth();
if (existingAuth?.accessToken) {
  window.location.href = existingAuth.admin?.role === 'admin' ? '/admin/dashboard.html' : '/admin/build.html';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorText.textContent = '';
  submitButton.disabled = true;

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    if (data.admin?.role !== 'admin') {
      throw new Error('This account does not have admin access.');
    }

    setStoredAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      admin: data.admin,
    });
    window.location.href = '/admin/dashboard.html';
  } catch (error) {
    errorText.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
