fetch('/instance-info')
    .then(response => response.json())
    .then(data => {
        const instanceInfo = `${data.host}`;
        document.getElementById('instance-info').textContent = instanceInfo;

        const ws = new WebSocket(`ws://${instanceInfo}`);

        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            document.getElementById('time').textContent = data.time;
        };

        ws.onopen = function() {
            console.log('Connected to WebSocket');
        };

        ws.onclose = function() {
            console.log('Disconnected from WebSocket');
        };
    })
    .catch(error => {
        console.error('Error fetching instance info:', error);
    });
    
function fetchLogs() {
    fetch('/logs')
        .then(response => response.json())
        .then(data => {
            const logsTbody = document.getElementById('logs-tbody');
            logsTbody.innerHTML = '';  

            if (data.logs && Array.isArray(data.logs)) {
                data.logs.forEach(log => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${log.split(']')[0] + ']'}</td>
                        <td>${log.split('] ')[1]}</td>
                    `;
                    logsTbody.appendChild(row);
                });
            } else {
                console.error('No logs found in the response.');
            }
        })
        .catch(error => console.error('Error fetching logs:', error));
}

setInterval(fetchLogs, 5000);

document.addEventListener('DOMContentLoaded', fetchLogs);
