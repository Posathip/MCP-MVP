const auth = requireAuthOrRedirect();
if (auth) {
  document.getElementById('username-label').textContent = auth.admin?.username || '';
  document.getElementById('owner-uuid').textContent = auth.admin?.uuid || '';
  if (auth.admin?.role === 'admin') {
    document.getElementById('admin-nav-link').style.display = '';
  }
}

const socket = io({ autoConnect: false });
const form = document.getElementById('build-form');
const repoUrlInput = document.getElementById('repo-url');
const internalPortInput = document.getElementById('internal-port');
const status = document.getElementById('status');
const logBox = document.getElementById('log');
const clearButton = document.getElementById('clear-workspaces');
const envFields = document.getElementById('env-fields');
const addEnvFieldButton = document.getElementById('add-env-field');
const dockerCommandList = document.getElementById('docker-command-list');
const buildButton = document.getElementById('build-button');
const logoutButton = document.getElementById('logout-button');

let buildFinished = false;

socket.on('connect', () => {
  status.textContent = `Status: connected (${socket.id})`;
});

socket.on('disconnect', () => {
  if (!buildFinished) {
    status.textContent = 'Status: disconnected';
  }
  buildFinished = false;
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

  if (payload.stage === 'done' && payload.url) {
    status.textContent = `Status: deployed at ${payload.url}`;
  }

  if (payload.stage === 'done' || payload.stage === 'error') {
    buildFinished = true;
    socket.disconnect();
  }
});

function connectSocket() {
  if (socket.connected) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    socket.once('connect', resolve);
    socket.connect();
  });
}

function addEnvField(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'env-row';
  row.innerHTML = `
    <input type="text" class="env-key" placeholder="VARIABLE_NAME" value="${key}" />
    <input type="text" class="env-value" placeholder="value" value="${value}" />
    <button type="button" class="btn-secondary remove-env">×</button>
  `;
  row.querySelector('.remove-env').addEventListener('click', () => row.remove());
  envFields.appendChild(row);
}

addEnvFieldButton.addEventListener('click', () => addEnvField());

clearButton.addEventListener('click', async () => {
  status.textContent = 'Status: clearing workspaces...';
  try {
    const response = await apiFetch('/api/workspaces/clear', { method: 'POST' });
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
  status.textContent = 'Status: connecting...';
  logBox.textContent = '';
  dockerCommandList.innerHTML = '';
  buildButton.disabled = true;

  try {
    await connectSocket();
    status.textContent = 'Status: starting build...';

    const repoUrl = repoUrlInput.value.trim();
    const internalPort = internalPortInput.value.trim();
    const envEntries = Array.from(document.querySelectorAll('.env-row')).map((row) => {
      const key = row.querySelector('.env-key').value.trim();
      const value = row.querySelector('.env-value').value.trim();
      return key ? { key, value } : null;
    }).filter(Boolean);

    const response = await apiFetch('/api/build', {
      method: 'POST',
      body: JSON.stringify({ repoUrl, socketId: socket.id, env: envEntries, internalPort }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    status.textContent = `Status: deployed at ${data.url}`;
  } catch (error) {
    status.textContent = `Status: ${error.message}`;
    logBox.textContent += `${error.message}\n`;
  } finally {
    buildButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearStoredAuth();
  window.location.href = '/admin/index.html';
});
