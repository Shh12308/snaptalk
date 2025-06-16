// === Imports ===
import { fetchGeoData } from './geolocation.js';

// === Socket for WebRTC signaling only ===
const socket = io('https://shh1-2.onrender.com');

// === Tencent IM ===
// ✅ Replace with your real Tencent Cloud IM SDK AppID
const tim = TIM.create({ SDKAppID: YOUR_TENCENT_APP_ID });
tim.setLogLevel(0);
tim.registerPlugin({ 'emoji': TIMEmoji });

// === Secure userSig ===
async function getUserSigFromServer(userID) {
  const res = await fetch(`/api/getUserSig?uid=${encodeURIComponent(userID)}`);
  if (!res.ok) throw new Error('Failed to fetch userSig');
  const data = await res.json();
  return data.userSig;
}

// === Auth (Custom) ===
let currentUser = null;
async function checkAuth() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    location.href = 'login.html';
    return;
  }
  currentUser = await res.json();
  const userSig = await getUserSigFromServer(currentUser.uid);
  await tim.login({ userID: currentUser.uid, userSig });
}

// === WebRTC ===
let localStream = null;
let peerConnection = null;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// === UI ===
const initialUI = document.getElementById('initialButtons');
const callUI = document.getElementById('callButtons');
const topUI = document.getElementById('topRightButtons');
const status = document.getElementById('statusText');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const chatBox = document.getElementById('chatBox');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const typingIndicator = document.getElementById('typingIndicator');

let filters = {};
let partnerUid = null;
let countdownTimer = null;

let queueUnsub = null;

// === Init ===
(async () => {
  await checkAuth();
  const geo = await fetchGeoData();
  populateCountries(geo.country);

  document.getElementById('startBtn').onclick = startMatchmaking;
  document.getElementById('skipBtn').onclick = skipMatch;
  document.getElementById('endCallBtn').onclick = endCall;
  document.getElementById('blockBtn').onclick = blockUser;
  document.getElementById('homeBtn').onclick = () => location.href = 'home.html';
  document.getElementById('togglePrefsBtn').onclick = () => {
    document.getElementById('preferencesPanel').classList.toggle('hidden');
  };
  document.getElementById('savePrefsBtn').onclick = () => {
    localStorage.setItem('chat_interests', document.getElementById('prefTopics').value.trim());
    alert("Preferences saved.");
  };

  chatSendBtn.onclick = sendChat;
  chatInput.onkeypress = e => {
    if (e.key === 'Enter') sendChat();
    else sendTypingIndicator();
  };

  showInitial();
})();

// === Populate Countries ===
function populateCountries(country) {
  const sel = document.getElementById('prefLocation');
  ['United Kingdom', 'United States', 'Canada', 'Australia'].forEach(c => {
    const o = new Option(c, c);
    if (c === country) o.selected = true;
    sel.add(o);
  });
}

function getFilters() {
  return {
    age: document.getElementById('prefPreferredAge').value,
    gender: document.getElementById('prefGender').value,
    location: document.getElementById('prefLocation').value,
    interests: localStorage.getItem('chat_interests') || '',
  };
}

function showInitial() {
  initialUI.style.display = 'flex';
  callUI.style.display = 'none';
  topUI.style.display = 'none';
  hideChat();
  status.textContent = "Ready to start!";
}

function showInCall() {
  initialUI.style.display = 'none';
  callUI.style.display = 'flex';
  topUI.style.display = 'flex';
  showChat();
}

// === Matchmaking ===
async function startMatchmaking(e) {
  if (e) e.preventDefault();
  if (!currentUser) return alert("You must be logged in.");

  showInCall();
  cancelCountdown();

  if (queueUnsub) {
    queueUnsub();
    queueUnsub = null;
  }

  filters = getFilters();

  // Tell backend to enqueue user with filters
  const res = await fetch('/api/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: currentUser.uid, ...filters }),
  });

  if (!res.ok) {
    status.textContent = "Failed to join queue.";
    return;
  }

  // Poll for matches every 3s
  queueUnsub = setInterval(async () => {
    const matchRes = await fetch(`/api/checkMatch?uid=${currentUser.uid}`);
    if (matchRes.ok) {
      const matchData = await matchRes.json();
      if (matchData.roomId && matchData.peer) {
        clearInterval(queueUnsub);
        queueUnsub = null;
        startCountdown(() => onMatch(matchData.roomId, matchData.peer));
      } else {
        status.textContent = "Searching for a match...";
      }
    }
  }, 3000);

  status.textContent = "Searching for a match...";
}

function startCountdown(callback) {
  cancelCountdown();
  let count = 5;
  status.textContent = `Match found! Connecting in ${count}...`;
  countdownTimer = setInterval(() => {
    count--;
    status.textContent = `Match found! Connecting in ${count}...`;
    if (count <= 0) {
      cancelCountdown();
      callback();
    }
  }, 1000);
}

function cancelCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

async function onMatch(roomId, peer) {
  partnerUid = peer.uid;
  status.textContent = `Connected with ${peer.displayName || 'Partner'} from ${peer.location || 'Unknown'}!`;
  await startConnection(roomId, true);
}

// === WebRTC ===
async function startConnection(roomId, isCaller) {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(config);

  peerConnection.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('signal', { roomId, candidate: e.candidate });
    }
  };

  peerConnection.ontrack = e => {
    remoteVideo.srcObject = e.streams[0];
  };

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  if (isCaller) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { roomId, sdp: offer });
  }
}

socket.on('signal', async ({ roomId, sdp, candidate }) => {
  if (sdp) {
    if (sdp.type === 'offer') {
      await startConnection(roomId, false);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', { roomId, sdp: answer });
    } else if (sdp.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  } else if (candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// === Chat with Tencent IM ===
function showChat() {
  chatBox.classList.remove('hidden');
}
function hideChat() {
  chatBox.classList.add('hidden');
  chatMessages.innerHTML = '';
}

function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  appendChat('You', msg);

  const message = tim.createTextMessage({
    to: partnerUid,
    conversationType: TIM.TYPES.CONV_C2C,
    payload: { text: msg }
  });

  tim.sendMessage(message).catch(console.error);
  chatInput.value = '';
}

tim.on(TIM.EVENT.MESSAGE_RECEIVED, event => {
  event.data.forEach(msg => {
    if (msg.type === TIM.TYPES.MSG_TEXT && msg.from === partnerUid) {
      appendChat('Partner', msg.payload.text);
    }
    if (msg.type === TIM.TYPES.MSG_CUSTOM && msg.payload.data === 'typing') {
      typingIndicator.classList.remove('hidden');
      clearTimeout(typingIndicator._timeout);
      typingIndicator._timeout = setTimeout(() => {
        typingIndicator.classList.add('hidden');
      }, 1000);
    }
  });
});

function sendTypingIndicator() {
  const typingMsg = tim.createCustomMessage({
    to: partnerUid,
    conversationType: TIM.TYPES.CONV_C2C,
    payload: { data: 'typing' }
  });
  tim.sendMessage(typingMsg).catch(console.error);
}

function appendChat(sender, msg) {
  const div = document.createElement('div');
  div.textContent = `${sender}: ${msg}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// === Call Controls ===
function skipMatch(e) {
  if (e) e.preventDefault();
  cancelCountdown();
  endConnection();
  socket.emit('end_call');
  partnerUid = null;
  status.textContent = "Searching for a new match...";
  if (queueUnsub) {
    clearInterval(queueUnsub);
    queueUnsub = null;
  }
  startMatchmaking();
}

function endCall(e) {
  if (e) e.preventDefault();
  cancelCountdown();
  endConnection();
  socket.emit('end_call');
  if (queueUnsub) {
    clearInterval(queueUnsub);
    queueUnsub = null;
  }
  location.reload();
}

async function blockUser(e) {
  if (e) e.preventDefault();
  if (!currentUser || !partnerUid) return alert("No one to block!");
  await fetch('/api/blockUser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: currentUser.uid, blockUid: partnerUid }),
  });
  alert("User blocked!");
  skipMatch();
}

socket.on('end_call', () => {
  cancelCountdown();
  endConnection();
  if (queueUnsub) {
    clearInterval(queueUnsub);
    queueUnsub = null;
  }
  location.reload();
});

async function endConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  hideChat();
}