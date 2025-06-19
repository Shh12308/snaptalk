// === Firebase ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
  authDomain: "snaptalk-17f6d.firebaseapp.com",
  projectId: "snaptalk-17f6d",
  storageBucket: "snaptalk-17f6d.firebasestorage.app",
  messagingSenderId: "592763376854",
  appId: "1:592763376854:web:c876f67dc5ea87080ce577",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// === SOCKET.IO ===
const socket = io('https://shh1-2.onrender.com');

// === DOM ===
const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');

const togglePrefsBtn = document.getElementById('togglePrefsBtnTop');
const preferencesPanel = document.getElementById('preferences');
const savePrefsBtn = document.getElementById('savePrefsBtn');

const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const endCallBtn = document.getElementById('endCallBtn');
const blockBtn = document.getElementById('blockBtn');
const switchCamBtn = document.getElementById('switchCamBtn');

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

const searchingOverlay = document.getElementById('searchingOverlay');
const banOverlay = document.getElementById('banOverlay');

// === STATE ===
let localStream;
let peerConnection;
let partnerSocketId;
let typingTimeout;
let usingFrontCamera = true;
let findingMatch = false;
let debounce = false;

const iceConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const blockedIds = JSON.parse(localStorage.getItem('blockedIds') || '[]');

// === AUTH ===
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    console.log('✅ Firebase Auth:', user.uid);

    // Load preferences from Firestore
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      genderSelect.value = data.gender || localStorage.getItem('gender') || 'any';
      locationSelect.value = data.location || localStorage.getItem('location') || 'any';
    } else {
      genderSelect.value = localStorage.getItem('gender') || 'any';
      locationSelect.value = localStorage.getItem('location') || 'any';
    }
  } else {
    signInAnonymously(auth);
  }
});

// === GEOLOCATION AUTOFILL ===
window.onIPReady = (ip, info) => {
  console.log('IP Ready:', info.country);
  if (info.country && info.country.length === 2) {
    const countryCode = info.country.toLowerCase();
    locationSelect.value = countryCode;
    localStorage.setItem('location', countryCode);
  }
};

// === MEDIA ===
async function startLocalStream() {
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: usingFrontCamera ? 'user' : 'environment' },
    audio: true
  });
  localVideo.srcObject = localStream;
}

// === BUTTONS ===
// === BUTTONS ===
togglePrefsBtn.onclick = () => {
  preferencesPanel.classList.toggle('hidden');
};

savePrefsBtn.onclick = async () => {
  localStorage.setItem('gender', genderSelect.value);
  localStorage.setItem('location', locationSelect.value);
  if (currentUser) {
    await setDoc(doc(db, "users", currentUser.uid), {
      gender: genderSelect.value,
      location: locationSelect.value
    });
  }
  preferencesPanel.classList.add('hidden');

  if (findingMatch) {
    endCall();
    findMatch();
  }
};

startBtn.onclick = async () => {
  preferencesPanel.classList.add('hidden'); // ✅ AUTO-HIDE
  try {
    await startLocalStream();
    await findMatch();
    initialButtons.classList.add('hidden');
    callButtons.classList.remove('hidden');
    chatContainer.classList.remove('hidden');
  } catch (err) {
    console.error('Start error:', err);
    alert('Could not start video chat.');
  }
};

skipBtn.onclick = async () => {
  preferencesPanel.classList.add('hidden'); // ✅ AUTO-HIDE
  if (debounce) return;
  debounce = true;
  try {
    endCall();
    await findMatch();
  } finally {
    setTimeout(() => debounce = false, 1000);
  }
};

endCallBtn.onclick = () => {
  preferencesPanel.classList.add('hidden'); // ✅ AUTO-HIDE
  endCall();
  initialButtons.classList.remove('hidden');
  callButtons.classList.add('hidden');
  chatContainer.classList.add('hidden');
  searchingOverlay.style.display = 'none';
};

blockBtn.onclick = async () => {
  if (debounce || !partnerSocketId) return;
  debounce = true;
  blockedIds.push(partnerSocketId);
  localStorage.setItem('blockedIds', JSON.stringify(blockedIds));
  socket.emit('block_user', partnerSocketId);
  endCall();
  await findMatch();
  setTimeout(() => debounce = false, 1000);
};

switchCamBtn.onclick = async () => {
  usingFrontCamera = !usingFrontCamera;
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  await startLocalStream();
  if (peerConnection && partnerSocketId) {
    const videoSender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    if (videoSender) {
      videoSender.replaceTrack(localStream.getVideoTracks()[0]);
    }
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

const picker = new EmojiButton();
picker.on('emoji', emoji => {
  chatInput.value += emoji;
});
emojiBtn.onclick = () => picker.togglePicker(emojiBtn);

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
  searchingOverlay.style.display = 'none';
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
    await peerConnection.addIceCandidate(new RTCIceCandidate(data));
  }
});

socket.on('chat', ({ message }) => appendChatMessage('Stranger', message));
socket.on('typing', showTyping);
socket.on('end_call', endCall);

socket.on('disconnect', () => {
  endCall();
  findingMatch = false;
  initialButtons.classList.remove('hidden');
  callButtons.classList.add('hidden');
  chatContainer.classList.add('hidden');
  searchingOverlay.style.display = 'none';
});

socket.on('connect', () => console.log('Connected to server.'));

// === PEER CONNECTION ===
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceConfig);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', { to: partnerSocketId, data: candidate });
    }
  };

  peerConnection.ontrack = ({ streams }) => {
    remoteVideo.srcObject = streams[0];
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
    localStream = null;
  }
  remoteVideo.srcObject = null;
  if (partnerSocketId) socket.emit('end_call', { to: partnerSocketId });
  partnerSocketId = null;
}

// === MATCH ===
async function findMatch() {
  if (findingMatch) return;
  findingMatch = true;
  searchingOverlay.style.display = 'flex';
  await startLocalStream();
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
searchingOverlay.style.display = 'none';