const auth = requireAuthOrRedirect();
if (auth) {
  if (auth.admin?.role !== 'admin') {
    window.location.href = '/admin/build.html';
  }
  document.getElementById('username-label').textContent = auth.admin?.username || '';
}

const resourceServerForm = document.getElementById('resource-server-form');
const domainNameInput = document.getElementById('domain-name');
const externalPortInput = document.getElementById('external-port');
const resourceServerError = document.getElementById('resource-server-error');
const resourceServerRows = document.getElementById('resource-server-rows');
const containerRows = document.getElementById('container-rows');
const containerError = document.getElementById('container-error');
const logoutButton = document.getElementById('logout-button');

async function loadResourceServers() {
  const response = await apiFetch('/api/resource-servers');
  const resourceServers = await response.json();

  resourceServerRows.innerHTML = '';
  for (const rs of resourceServers) {
    const tr = document.createElement('tr');
    const statusClass = rs.status === 'available' ? 'status-running' : 'status-error';
    tr.innerHTML = `
      <td>${rs.resourceServerId}</td>
      <td>${rs.domainName}</td>
      <td>${rs.port}</td>
      <td><span class="status-pill ${statusClass}">${rs.status}</span></td>
      <td><button class="btn-secondary" data-action="edit" data-id="${rs.resourceServerId}" data-domain="${rs.domainName}" data-port="${rs.port}">Edit</button></td>
      <td>${rs.status !== 'available' ? `<button class="btn-secondary" data-action="release" data-id="${rs.resourceServerId}">Release</button>` : ''}</td>
      <td><button class="btn-danger" data-action="delete" data-id="${rs.resourceServerId}">Delete</button></td>
    `;
    resourceServerRows.appendChild(tr);
  }
}

async function loadContainers() {
  const response = await apiFetch('/api/containers');
  const containers = await response.json();

  containerRows.innerHTML = '';
  for (const c of containers) {
    const tr = document.createElement('tr');
    const statusClass = c.status === 'running' ? 'status-running' : c.status === 'stopped' ? 'status-stopped' : 'status-error';
    tr.innerHTML = `
      <td>${c.containerName}</td>
      <td>${c.containerId || '—'}</td>
      <td>${c.userId}</td>
      <td>${c.internalPort}</td>
      <td>${c.resourceServer ? `${c.resourceServer.domainName}:${c.resourceServer.port}` : c.resourceServerId}</td>
      <td><span class="status-pill ${statusClass}">${c.status}</span></td>
      <td>${new Date(c.createdAt).toLocaleString()}</td>
      <td>${c.status === 'running'
        ? `<button class="btn-secondary" data-action="stop" data-id="${c.containerName}">Stop</button>`
        : `<button class="btn-secondary" data-action="start" data-id="${c.containerName}">Start</button>`}</td>
      <td><button class="btn-secondary" data-action="restart" data-id="${c.containerName}">Restart</button></td>
      <td><button class="btn-danger" data-action="delete" data-id="${c.containerName}">Delete</button></td>
    `;
    containerRows.appendChild(tr);
  }
}

containerRows.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === 'delete' && !confirm(`Delete container "${id}"? This removes the Docker container/image and frees its port.`)) {
    return;
  }

  containerError.textContent = '';
  button.disabled = true;

  try {
    const response = action === 'delete'
      ? await apiFetch(`/api/containers/${id}`, { method: 'DELETE' })
      : await apiFetch(`/api/containers/${id}/${action}`, { method: 'POST' });

    if (!response.ok && response.status !== 204) {
      const data = await response.json();
      throw new Error(data.error || `Failed to ${action} container`);
    }
    await loadContainers();
  } catch (error) {
    containerError.textContent = error.message;
    button.disabled = false;
  }
});

resourceServerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  resourceServerError.textContent = '';

  const editingId = resourceServerForm.dataset.editingId;
  const domainName = domainNameInput.value.trim();
  const port = Number(externalPortInput.value);

  try {
    const response = await apiFetch(editingId ? `/api/resource-servers/${editingId}` : '/api/resource-servers', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify({ domainName, port }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to save resource server');
    }

    resetForm();
    await loadResourceServers();
  } catch (error) {
    resourceServerError.textContent = error.message;
  }
});

resourceServerRows.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === 'edit') {
    resourceServerForm.dataset.editingId = id;
    domainNameInput.value = button.dataset.domain;
    externalPortInput.value = button.dataset.port;
    resourceServerForm.querySelector('button[type="submit"]').textContent = 'Save';
    return;
  }

  if (action === 'delete') {
    if (!confirm('Delete this resource server?')) return;
    resourceServerError.textContent = '';
    try {
      const response = await apiFetch(`/api/resource-servers/${id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete resource server');
      }
      await loadResourceServers();
    } catch (error) {
      resourceServerError.textContent = error.message;
    }
  }

  if (action === 'release') {
    resourceServerError.textContent = '';
    try {
      const response = await apiFetch(`/api/resource-servers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'available' }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to release resource server');
      }
      await loadResourceServers();
    } catch (error) {
      resourceServerError.textContent = error.message;
    }
  }
});

function resetForm() {
  delete resourceServerForm.dataset.editingId;
  resourceServerForm.reset();
  resourceServerForm.querySelector('button[type="submit"]').textContent = 'Add';
}

logoutButton.addEventListener('click', async () => {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearStoredAuth();
  window.location.href = '/admin/index.html';
});

loadResourceServers();
loadContainers();
