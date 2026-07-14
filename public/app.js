const socket = io();
const form = document.getElementById('build-form');
const input = document.getElementById('repo-url');
const status = document.getElementById('status');
const logBox = document.getElementById('log');
const clearButton = document.getElementById('clear-workspaces');
const envFields = document.getElementById('env-fields');
const addEnvFieldButton = document.getElementById('add-env-field');
const dockerCommandList = document.getElementById('docker-command-list');

socket.on('connect', () => {
  status.textContent = `Status: connected (${socket.id})`;
});

socket.on('build-log', (payload) => {
  const text = payload.message || '';
  if (!text) return;

  if (payload.stage === 'docker-command') {
    const commandText = payload.command || text.replace(/^Docker command:\s*/i, '');
    const li = document.createElement('li');
    li.textContent = commandText;
    dockerCommandList.appendChild(li);
    return;
  }

  logBox.textContent += text;
  if (!text.endsWith('\n')) {
    logBox.textContent += '\n';
  }
});

function addEnvField(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'env-row';
  row.innerHTML = `
    <input type="text" class="env-key" placeholder="VARIABLE_NAME" value="${key}" />
    <input type="text" class="env-value" placeholder="value" value="${value}" />
    <button type="button" class="remove-env">×</button>
  `;
  row.querySelector('.remove-env').addEventListener('click', () => row.remove());
  envFields.appendChild(row);
}

addEnvFieldButton.addEventListener('click', () => addEnvField());
addEnvField('PORT', '3000');

clearButton.addEventListener('click', async () => {
  status.textContent = 'Status: clearing workspaces...';
  try {
    const response = await fetch('/api/workspaces/clear', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to clear workspaces');
    }
    status.textContent = `Status: ${data.message}`;
    logBox.textContent = data.message;
  } catch (error) {
    status.textContent = `Status: ${error.message}`;
    logBox.textContent = error.message;
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = 'Status: starting build...';
  logBox.textContent = '';
  dockerCommandList.innerHTML = '';

  const repoUrl = input.value.trim();
  const envEntries = Array.from(document.querySelectorAll('.env-row')).map((row) => {
    const key = row.querySelector('.env-key').value.trim();
    const value = row.querySelector('.env-value').value.trim();
    return key ? { key, value } : null;
  }).filter(Boolean);

  try {
    const response = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, socketId: socket.id, env: envEntries })
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
