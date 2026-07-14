const socket = io();
const form = document.getElementById('build-form');
const input = document.getElementById('repo-url');
const status = document.getElementById('status');
const logBox = document.getElementById('log');

socket.on('connect', () => {
  status.textContent = `Status: connected (${socket.id})`;
});

socket.on('build-log', (payload) => {
  const text = payload.message || '';
  if (!text) return;
  logBox.textContent += text;
  if (!text.endsWith('\n')) {
    logBox.textContent += '\n';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = 'Status: starting build...';
  logBox.textContent = '';

  const repoUrl = input.value.trim();
  try {
    const response = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, socketId: socket.id })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    status.textContent = `Status: accepted for ${repoUrl}`;
  } catch (error) {
    status.textContent = `Status: ${error.message}`;
    logBox.textContent = error.message;
  }
});
