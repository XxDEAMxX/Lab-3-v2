document.addEventListener('DOMContentLoaded', () => {
  const logsContainer = document.getElementById('logs-container');
  const instanceList = document.getElementById('instance-list');
  const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${wsProtocol}://${location.host}`);

  ws.onmessage = (event) => {
    const { log } = JSON.parse(event.data);
    logsContainer.textContent += log + '\n';
    logsContainer.scrollTop = logsContainer.scrollHeight;
  };

  async function updateInstances() {
    const response = await fetch('/instances');
    const instances = await response.json();
    instanceList.innerHTML = '';
    
    instances.forEach(({ host, port }) => {
      const item = document.createElement('li');
      
      const link = document.createElement('a');
      link.href = `http://${host}:${port}`;
      link.textContent = `Host: ${host}, Port: ${port}`;
      link.target = '_blank';
      link.title = 'Ir a la instancia';
  
      item.appendChild(link);
      instanceList.appendChild(item);
    });
  }  

  async function launchInstance() {
    console.log('Launching instance...');
    const response = await fetch('/launch', { method: 'POST' });
    logsContainer.textContent += await response.text() + '\n';
    await updateInstances();
  }

  async function syncClocks() {
    const response = await fetch('/sync-clocks', { method: 'POST' });
    const { message } = await response.json();
    logsContainer.textContent += message + '\n';
  }

  document.getElementById('launch-instance').onclick = launchInstance;
  document.getElementById('sync-clocks').onclick = syncClocks;
  
  updateInstances();
});
