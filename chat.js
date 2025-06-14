// === SOCKET.IO ===
const socket = io('https://shh1-2.onrender.com');

// === DOM ===
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');

const startBtn = document.getElementById('startBtn');
const togglePrefsBtn = document.getElementById('togglePrefsBtn');
const savePrefsBtn = document.getElementById('savePrefsBtn');

const blockBtn = document.getElementById('blockBtn');
const endCallBtn = document.getElementById('endCallBtn');
const skipBtn = document.getElementById('skipBtn');

const preferencesPanel = document.getElementById('preferencesPanel');
const genderSelect = document.getElementById('genderSelect');
const locationSelect = document.getElementById('locationSelect');

const initialButtons = document.getElementById('initialButtons');
const callButtons = document.getElementById('callButtons');

const chatContainer = document.getElementById('chatContainer');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const emojiBtn = document.getElementById('emojiBtn');
const typingIndicator = document.getElementById('typingIndicator');

const banOverlay = document.getElementById('banOverlay');

// === STATE ===
let localStream;
let peerConnection;
let partnerSocketId;
let typingTimeout;

// === ICE servers ===
const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

// === MEDIA ===
async function startLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

// === BUTTONS ===

// Show/hide preferences
togglePrefsBtn.onclick = () => {
  preferencesPanel.style.display = preferencesPanel.style.display === 'none' ? 'flex' : 'none';
};

// Save preferences (currently just closes panel)
savePrefsBtn.onclick = () => {
  preferencesPanel.style.display = 'none';
};

// Start match
startBtn.onclick = async () => {
  await startLocalStream();
  socket.emit('find_match', {
    gender: genderSelect.value,
    location: locationSelect.value
  });
  initialButtons.classList.add('hidden');
  callButtons.classList.remove('hidden');
  chatContainer.classList.remove('hidden');
};

// Skip to next
skipBtn.onclick = () => {
  endCall();
  socket.emit('find_match', {
    gender: genderSelect.value,
    location: locationSelect.value
  });
};

// End call & return to start
endCallBtn.onclick = () => {
  endCall();
  initialButtons.classList.remove('hidden');
  callButtons.classList.add('hidden');
  chatContainer.classList.add('hidden');
};

// Block current peer
blockBtn.onclick = () => {
  socket.emit('block_user', partnerSocketId);
  skipBtn.onclick();
};

// === CHAT ===

// Send chat message
sendChatBtn.onclick = () => {
  const msg = chatInput.value.trim();
  if (msg && partnerSocketId) {
    socket.emit('chat', { to: partnerSocketId, message: msg });
    appendChatMessage('You', msg);
    chatInput.value = '';
  }
};

// Typing indicator
chatInput.oninput = () => {
  socket.emit('typing', { to: partnerSocketId });
};

// Emoji button (hook for picker)
emojiBtn.onclick = () => {
  // Example: use your emoji picker library here
  alert('Open emoji picker here!');
};

// === HELPERS ===

function appendChatMessage(sender, msg) {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${sender}:</strong> ${msg}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showTyping() {
  typingIndicator.innerText = 'Partner is typing...';
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    typingIndicator.innerText = '';
  }, 1500);
}

// === SIGNALING ===

socket.on('match_found', async ({ socketId }) => {
  partnerSocketId = socketId;
  createPeerConnection();

  // Caller sends offer
  if (socketId > socket.id) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: socketId, data: offer });
  }
});

socket.on('signal', async ({ from, data }) => {
  partnerSocketId = from;
  if (!peerConnection) createPeerConnection();

  if (data.type === 'offer') {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('signal', { to: from, data: answer });
  } else if (data.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
  } else if (data.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data));
  }
});

socket.on('chat', ({ from, message }) => {
  appendChatMessage('Stranger', message);
});

socket.on('typing', () => {
  showTyping();
});

socket.on('end_call', () => {
  endCall();
});

// === PEER CONNECTION ===

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceConfig);

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('signal', { to: partnerSocketId, data: e.candidate });
    }
  };

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      endCall();
    }
  };
}

// === END CALL ===

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  partnerSocketId && socket.emit('end_call', { to: partnerSocketId });
  partnerSocketId = null;
}

// === BAN OVERLAY (example hook) ===

socket.on('banned', ({ time }) => {
  banOverlay.style.display = 'flex';
  banOverlay.querySelector('.timer').innerText = `Time Remaining: ${time}`;
});

// === INIT ===
preferencesPanel.style.display = 'none';
chatContainer.classList.add('hidden');
callButtons.classList.add('hidden');