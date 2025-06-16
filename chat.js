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

const switchCamBtn = document.getElementById('switchCamBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');

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
let usingFrontCamera = true;
let findingMatch = false;
let debounce = false; // ✅ Prevent spam clicks

// === ICE servers ===
const iceConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// === BLOCKED ===
let blockedIds = JSON.parse(localStorage.getItem('blockedIds') || '[]');

// === Load saved preferences ===
genderSelect.value = localStorage.getItem('gender') || 'any';
locationSelect.value = localStorage.getItem('location') || 'any';

// === MEDIA ===
async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: usingFrontCamera ? 'user' : 'environment' },
      audio: true
    });
    localVideo.srcObject = localStream;
  } catch (err) {
    alert('Could not access camera/mic. Please check your permissions.');
    console.error(err);
  }
}

// === BUTTONS ===

// Toggle preferences with smooth animation
togglePrefsBtn.onclick = () => {
  preferencesPanel.classList.toggle('visible');
};

// Save preferences
savePrefsBtn.onclick = () => {
  localStorage.setItem('gender', genderSelect.value);
  localStorage.setItem('location', locationSelect.value);
  preferencesPanel.classList.remove('visible');
};

// Start
startBtn.onclick = async () => {
  await startLocalStream();
  findMatch();
  initialButtons.classList.add('hidden');
  callButtons.classList.remove('hidden');
  chatContainer.classList.remove('hidden');
};

// Skip with debounce
skipBtn.onclick = () => {
  if (debounce) return;
  debounce = true;
  endCall();
  findMatch();
  setTimeout(() => debounce = false, 1000);
};

// End call
endCallBtn.onclick = () => {
  endCall();
  initialButtons.classList.remove('hidden');
  callButtons.classList.add('hidden');
  chatContainer.classList.add('hidden');
};

// Block with debounce
blockBtn.onclick = () => {
  if (debounce || !partnerSocketId) return;
  debounce = true;
  blockedIds.push(partnerSocketId);
  localStorage.setItem('blockedIds', JSON.stringify(blockedIds));
  socket.emit('block_user', partnerSocketId);
  endCall();
  findMatch();
  setTimeout(() => debounce = false, 1000);
};

// Switch camera
switchCamBtn.onclick = async () => {
  usingFrontCamera = !usingFrontCamera;
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  await startLocalStream();
  if (peerConnection && partnerSocketId) {
    const videoSender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (videoSender) videoSender.replaceTrack(localStream.getVideoTracks()[0]);
  }
};

// Toggle camera on/off
toggleCamBtn.onclick = () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
  }
};

// === CHAT ===
sendChatBtn.onclick = () => {
  const msg = chatInput.value.trim();
  if (msg && partnerSocketId) {
    socket.emit('chat', { to: partnerSocketId, message: msg });
    appendChatMessage('You', msg);
    chatInput.value = '';
  }
};

chatInput.oninput = () => {
  if (partnerSocketId) socket.emit('typing', { to: partnerSocketId });
};

// Emoji picker using Emoji Button library
const picker = new EmojiButton();
picker.on('emoji', emoji => {
  chatInput.value += emoji;
});
emojiBtn.onclick = () => picker.togglePicker(emojiBtn);

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
  typingTimeout = setTimeout(() => typingIndicator.innerText = '', 1500);
}

// === SIGNALING ===
socket.on('match_found', async ({ socketId }) => {
  findingMatch = false;
  partnerSocketId = socketId;
  createPeerConnection();

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
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data));
    } catch (err) {
      console.error('Error adding ICE candidate', err);
    }
  }
});

socket.on('chat', ({ from, message }) => {
  appendChatMessage('Stranger', message);
});

socket.on('typing', showTyping);

socket.on('end_call', endCall);

socket.on('banned', ({ time }) => {
  banOverlay.style.display = 'flex';
  banOverlay.querySelector('.timer').innerText = `Time Remaining: ${time}`;
});

// === PEER CONNECTION ===
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceConfig);

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('signal', { to: partnerSocketId, data: e.candidate });
    }
  };

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  peerConnection.onconnectionstatechange = () => {
    if (['disconnected', 'failed'].includes(peerConnection.connectionState)) {
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
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    localStream = null; // ✅ Clear ref
  }
  remoteVideo.srcObject = null;
  if (partnerSocketId) socket.emit('end_call', { to: partnerSocketId });
  partnerSocketId = null;
}

// === MATCH ===
function findMatch() {
  if (findingMatch) return;
  findingMatch = true;
  socket.emit('find_match', {
    gender: genderSelect.value,
    location: locationSelect.value,
    blocked: blockedIds
  });
}

// === INIT ===
preferencesPanel.classList.remove('visible');
chatContainer.classList.add('hidden');
callButtons.classList.add('hidden');