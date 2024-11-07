const { Client } = require('ssh2');
const express = require('express');
const dotenv = require('dotenv');
const axios = require('axios');
const WebSocket = require('ws'); 

dotenv.config( { path: './.env' } );

const app = express();
const port = process.env.APP_PORT || 3000;
const host = process.env.HOST;
const user = process.env.USERNAMEx;
const password = process.env.PASSWORD;

const conn = new Client();
const usedPorts = [];
let logs = [];
const instances = [];

const wss = new WebSocket.Server({ noServer: true });
let connectedClients = [];

function broadcastLogs(log) {
  connectedClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ log }));
    }
  });
}

app.use(express.static('public')); 

function logMessage(message) {
  const timestampedMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(timestampedMessage);
  logs.push(timestampedMessage);
  broadcastLogs(timestampedMessage);
}

app.use((req, res, next) => {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  logMessage(`${req.method} ${url}`);
  next();
});

function getRandomPort(min, max, usedPorts) {
  let port;
  do {
    port = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (usedPorts.includes(port));
  return port;
}

function registerInstance(host, port) {
  instances.push({ host, port });
  logMessage(`Instancia registrada: ${host}:${port}`);
}

app.post('/launch', (req, res) => {
  const connection = new Client();
  connection.on('ready', () => {
    logMessage("Cliente SSH conectado");

    const randomPort = getRandomPort(5000, 6000, usedPorts);
    const dockerCommand = `sudo docker run -d -p ${randomPort}:${randomPort} --name ${randomPort} -e PORT=${randomPort} -e HOST_IP=${host} -e LOCAL_IP=${host} imagen`;

    logMessage(`Ejecutando comando Docker: ${dockerCommand}`);

    connection.exec(dockerCommand, (err, stream) => {
      if (err) {
        logMessage(`Error ejecutando el comando Docker: ${err.message}`);
        connection.end();
        return res.status(500).send('Error ejecutando el comando Docker');
      }

      stream.on('close', async (code, signal) => {
        registerInstance(host, randomPort);
        usedPorts.push(randomPort);
        connection.end();
        res.status(200).send(`Instancia lanzada en puerto: ${randomPort}`);
      }).on('data', (data) => {
        console.log(`STDOUT: ${data}`);
      }).stderr.on('data', (data) => {
        console.error(`STDERR: ${data}`);
      });
    });
  }).on('error', (err) => {
    logMessage(`Error de conexión: ${err.message}`);
    res.status(500).send('Error de conexión SSH');
  }).connect({
    host: host,
    port: 22,
    username: user,
    password: password,
  });
});

app.get('/instances', (req, res) => {
  res.status(200).json(instances);
});

app.get('/logs', (req, res) => {
  res.json({ logs });
});

async function getInstanceTimes() {
  const times = [];
  for (const { host, port } of instances) {
    try {
      const response = await axios.get(`http://${host}:${port}/time`);
      const instanceTime = new Date(response.data.time);
      times.push({ host, port, time: instanceTime });
      logMessage(`Hora de la instancia ${host}:${port} - ${instanceTime}`);
    } catch (error) {
      logMessage(`Error al obtener la hora de la instancia ${host}:${port}: ${error.message}`);
    }
  }
  return times;
}

app.post('/sync-clocks', async (req, res) => {
  const coordinatorTime = await getWorldTime();
  const instanceTimes = await getInstanceTimes();

  const offsets = instanceTimes.map(({ host, port, time }) => {
    const offset = (time - coordinatorTime) / 1000;
    return { host, port, offset };
  });

  const averageOffset = offsets.reduce((sum, { offset }) => sum + offset, 0) / offsets.length;

  for (const { host, port, offset } of offsets) {
    const correction = averageOffset - offset;
    try {
      await axios.post(`http://${host}:${port}/sync`, { offset: correction });
      logMessage(`Sincronizado ${host}:${port} con desfase: ${correction} segundos`);
    } catch (error) {
      logMessage(`Error al sincronizar la instancia ${host}:${port}: ${error.message}`);
    }
  }

  res.status(200).json({ message: 'Sincronización completada' });
});

const server = app.listen(port, () => {
  console.log(`${user} ${password} ${host}`);

  logMessage(`Coordinator running at ${port}`);
});

async function getWorldTime() {
  try {
    const response = await axios.get('https://timeapi.io/api/time/current/zone?timeZone=America%2FBogota');
    return new Date(response.data.dateTime);
  } catch (error) {
    logMessage(`Error fetching world time: ${error.message}`);
    throw new Error('Error fetching world time');
  }
}

app.get('/worldtime', async (req, res) => {
  try {
    const datetime = await getWorldTime();
    res.json({ datetime });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  connectedClients.push(ws);

  ws.on('close', () => {
    connectedClients = connectedClients.filter(client => client !== ws);
  });
});