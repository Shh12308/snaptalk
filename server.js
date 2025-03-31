const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = {}; // Store user connections

// Serve a simple index for testing (Optional)
app.get('/', (req, res) => {
  res.send('WebSocket Server is running!');
});

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  console.log('New user connected');

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'login':
          if (data.userId) {
            users[data.userId] = ws;
            console.log(`User ${data.userId} logged in`);
            ws.send(JSON.stringify({ type: 'login-success', userId: data.userId }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid userId' }));
          }
          break;

        case 'offer':
        case 'answer':
        case 'candidate':
          handleSignal(data);
          break;

        case 'chat':
          handleChatMessage(data);
          break;

        default:
          console.error('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  // Handle connection close
  ws.on('close', () => {
    for (const userId in users) {
      if (users[userId] === ws) {
        console.log(`User ${userId} disconnected`);
        delete users[userId];
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

// Handle signaling messages
function handleSignal(data) {
  const target = users[data.target];
  if (target) {
    console.log(`Sending ${data.type} to ${data.target}`);
    target.send(JSON.stringify(data));
  } else {
    console.error(`User ${data.target} not found`);
  }
}

// Handle chat messages
function handleChatMessage(data) {
  const chatTarget = users[data.target];
  if (chatTarget) {
    console.log(`Sending chat from ${data.sender} to ${data.target}`);
    chatTarget.send(JSON.stringify({ type: 'chat', message: data.message, sender: data.sender }));
  } else {
    console.error(`Chat target ${data.target} not found`);
  }
}

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});