// === Public IP via ICE ===
const ipInfoApiKey = "f855a03a7ade49";

window.oRTCPeerConnection = window.oRTCPeerConnection || window.RTCPeerConnection;
window.RTCPeerConnection = function (...args) {
  const pc = new window.oRTCPeerConnection(...args);
  pc.oaddIceCandidate = pc.addIceCandidate;
  pc.addIceCandidate = function (iceCandidate, ...rest) {
    const fields = iceCandidate.candidate.split(" ");
    const ip = fields[4];
    if (fields[7] === "srflx") {
      lookupAndStoreIP(ip);
    }
    return pc.oaddIceCandidate(iceCandidate, ...rest);
  };
  return pc;
};

async function lookupAndStoreIP(ip) {
  if (localStorage.getItem('userIP')) return;
  const res = await fetch(`https://ipinfo.io/${ip}?token=${ipInfoApiKey}`);
  const json = await res.json();
  const { ip: fetchedIP, country, city, region } = json;
  localStorage.setItem('userIP', fetchedIP);
  localStorage.setItem('userLocation', `${city}, ${region}, ${country}`);
  if (locationSelect && locationSelect.value === 'any') {
    locationSelect.value = country.toLowerCase();
  }
  console.log(`✅ IP: ${fetchedIP} | ${city}, ${region}, ${country}`);
}

// === Firebase ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
  authDomain: "snaptalk-17f6d.firebaseapp.com",
  projectId: "snaptalk-17f6d",
  storageBucket: "snaptalk-17f6d.appspot.com",
  messagingSenderId: "592763376854",
  appId: "1:592763376854:web:c876f67dc5ea87080ce577",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;

// === Socket.io ===
const serverURL = "https://shh1-2.onrender.com";
const socket = io(serverURL, { transports: ["websocket"], reconnection: true, reconnectionAttempts: 5 });

// === Elements ===
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const endCallBtn = document.getElementById('endCallBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const togglePrefsBtn = document.getElementById('togglePrefsBtnTop');

const genderSelect = document.getElementById('genderSelect');
const locationSelect = document.getElementById('locationSelect');
const selfGenderSelect = document.getElementById('selfGenderSelect');
const ageInput = document.getElementById('ageInput');
const nicknameInput = document.getElementById('nicknameInput');
const interestsInput = document.getElementById('interestsInput');
const lifestyleInput = document.getElementById('lifestyleInput');
const languageSelect = document.getElementById('languageSelect');

const preferencesPanel = document.getElementById('preferences');
const chatContainer = document.getElementById('chatContainer');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const emojiBtn = document.getElementById('emojiBtn');
const typingIndicator = document.getElementById('typingIndicator');
const partnerInfoOverlay = document.getElementById('partnerInfoOverlay');

// === State ===
let localStream, pc, dataChannel, usingFrontCamera = true, debounce = false;
const iceConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
  ]
};

// === Load & Save Preferences ===
const prefs = ['selfGender', 'gender', 'location', 'age', 'nickname', 'interests', 'lifestyle', 'language'];
prefs.forEach(p => {
  const el = document.getElementById(`${p}Select`) || document.getElementById(`${p}Input`);
  if (el) el.value = localStorage.getItem(p) || (el.tagName === 'SELECT' ? 'any' : '');
});
togglePrefsBtn.onclick = () => preferencesPanel.classList.toggle('visible');
preferencesPanel.onchange = async () => {
  prefs.forEach(p => {
    const el = document.getElementById(`${p}Select`) || document.getElementById(`${p}Input`);
    if (el) localStorage.setItem(p, el.value);
  });
  if (currentUser) {
    await setDoc(doc(db, "users", currentUser.uid), getUserPrefs());
  }
};

// === Auth ===
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    console.log("✅ Auth:", user.uid);

    // Get full profile from Firestore:
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      console.log("✅ Profile data:", data);

      // Fill the input fields with Firestore profile:
      const fields = ['selfGender', 'age', 'nickname', 'gender', 'location', 'interests', 'lifestyle', 'language'];
      fields.forEach(f => {
        const el = document.getElementById(`${f}Select`) || document.getElementById(`${f}Input`) || document.getElementById(`${f}`);
        if (el) {
          el.value = data[f] || el.value || "";
          localStorage.setItem(f, el.value);
        }
      });
    } else {
      console.warn("⚠️ No profile found for this user.");
    }

  } else {
    // If no session, sign in anonymously (fallback)
    await signInAnonymously(auth);
  }
});

// === Sightengine Moderation ===
const sightengineUser = "YOUR_SIGHTENGINE_USER";  // <-- replace
const sightengineSecret = "YOUR_SIGHTENGINE_SECRET";  // <-- replace
let moderationInterval;

const BAN_DURATION_MS = 720 * 60 * 60 * 1000; // 72 hours

async function checkVideoModeration() {
  if (!localVideo || localVideo.readyState < 2) return;

  const canvas = document.createElement('canvas');
  canvas.width = localVideo.videoWidth;
  canvas.height = localVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);

  const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

  try {
    const response = await fetch(`https://api.sightengine.com/1.0/check.json`, {
      method: "POST",
      body: new URLSearchParams({
        'models': 'nudity,wad',
        'api_user': sightengineUser,
        'api_secret': sightengineSecret,
        'media': `data:image/jpeg;base64,${base64Image}`
      })
    });
    const result = await response.json();
    console.log("👀 Moderation result:", result);

    if (
      (result.nudity && result.nudity.raw >= 0.6) ||
      (result.weapon && result.weapon > 0.5) ||
      (result.drugs && result.drugs > 0.5)
    ) {
      banUser();
    }

  } catch (err) {
    console.error("❌ Sightengine error:", err);
  }
}

async function banUser() {
  alert("🚫 Inappropriate content detected! You are banned for 72 hours.");
  const banUntil = Date.now() + BAN_DURATION_MS;
  localStorage.setItem("banUntil", banUntil);

  if (currentUser) {
    await setDoc(doc(db, "banned_users", currentUser.uid), { banUntil });
  }

  showBanOverlay();
  endCall();
}

function checkBanStatus() {
  const banUntil = parseInt(localStorage.getItem("banUntil") || "0");
  if (Date.now() < banUntil) {
    showBanOverlay();
  }
}

function showBanOverlay() {
  let overlay = document.getElementById('banOverlay');
  const overlay = document.getElementById('banOverlay');
overlay.style.display = 'flex';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.9);
      color: #fff; font-size: 2rem;
      text-align: center; padding-top: 20%;
      z-index: 9999;
    `;
    overlay.innerHTML = `
      🚫 You are banned for 72 hours!
      <p id="banCountdown"></p>
    `;
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'block';
  }

  const banUntil = parseInt(localStorage.getItem("banUntil") || "0");
  const countdown = document.getElementById('banCountdown');

  const updateCountdown = () => {
    const msLeft = banUntil - Date.now();
    if (msLeft > 0) {
      const h = Math.floor(msLeft / (1000 * 60 * 60));
      const m = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((msLeft % (1000 * 60)) / 1000);
      countdown.textContent = `Time remaining: ${h}h ${m}m ${s}s`;
    } else {
      overlay.style.display = 'none';
      localStorage.removeItem("banUntil");
      clearInterval(timer);
    }
  };
  updateCountdown();
  const timer = setInterval(updateCountdown, 1000);
}

// ✅ Call this once on page load
checkBanStatus();


// === Local Stream ===
async function startLocalStream() {
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: usingFrontCamera ? 'user' : 'environment' }, audio: true
  });
  localVideo.srcObject = localStream;
}
switchCamBtn.onclick = async () => {
  usingFrontCamera = !usingFrontCamera;
  await startLocalStream();
  if (pc) {
    const sender = pc.getSenders().find(s => s.track.kind === 'video');
    sender && sender.replaceTrack(localStream.getVideoTracks()[0]);
  }
};

// === AI Matchmaking Placeholder ===
async function getAIMatchSuggestion(prefs) {
  try {
    const res = await fetch('https://token-pudx.onrender.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: currentUser.uid, prefs })
    });
    const data = await res.json();
    console.log("🤖 AI MATCH:", data);
    return data.partnerPrefs; // This should be the enhanced prefs for socket
  } catch (err) {
    console.error("AI Match error:", err);
    return prefs; // fallback to normal prefs
  }
}

// === Matchmaking ===
startBtn.onclick = async () => {
  await startLocalStream();
  const aiPrefs = await getAIMatchSuggestion(getUserPrefs());
  socket.emit('find_partner', aiPrefs);
  toggleUI('inCall');
};
skipBtn.onclick = () => {
  if (debounce) return; debounce = true;
  endCall(); socket.emit('find_partner', getUserPrefs());
  setTimeout(() => debounce = false, 1000);
};
endCallBtn.onclick = () => { endCall(); toggleUI('idle'); };

socket.on('connect', () => console.log('✅ Socket connected'));
socket.on('partner_found', async ({ partnerId, partnerPrefs }) => {
  console.log('✅ Partner:', partnerId);
  createPeerConnection();
  const isOfferer = socket.id > partnerId;
  if (isOfferer) {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    dataChannel = pc.createDataChannel("chat");
    setupDataChannel(partnerPrefs);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { sdp: offer });
  }
  showPartnerOverlay(partnerPrefs);
});
socket.on('signal', async data => {
  if (!pc) createPeerConnection();
  if (data.sdp) {
    if (data.sdp.type === 'offer') {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { sdp: answer });
    } else if (data.sdp.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});
socket.on('partner_disconnected', () => { endCall(); socket.emit('find_partner', getUserPrefs()); });

// === Peer ===
function createPeerConnection() {
  pc = new RTCPeerConnection(iceConfig);
  pc.onicecandidate = e => e.candidate && socket.emit('signal', { candidate: e.candidate });
  pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
  pc.ondatachannel = e => setupDataChannel();
}
function setupDataChannel(partnerPrefs) {
  dataChannel.onmessage = async e => {
    if (e.data.startsWith("__emoji__:")) showFloatingEmoji(e.data.split(":")[1]);
    else if (e.data === "__typing__") showTyping();
    else {
      const translated = await translateMessage(e.data, partnerPrefs?.language || 'en', languageSelect.value);
      appendChat("Stranger", translated);
    }
  };
}

// === Translation Placeholder ===
async function translateMessage(text, fromLang, toLang) {
  console.log(`🌐 Translate: ${fromLang} -> ${toLang} : ${text}`);
  return text; // TODO: connect to Google Translate API
}

// === Chat ===
sendChatBtn.onclick = sendMessage;
chatInput.oninput = () => {
  showChat();
  dataChannel?.readyState === "open" && dataChannel.send("__typing__");
};
function sendMessage() {
  const msg = chatInput.value.trim();
  if (msg && dataChannel?.readyState === "open") {
    dataChannel.send(msg);
    appendChat("You", msg);
    chatInput.value = "";
  }
}
function appendChat(who, msg) {
  showChat();
  const p = document.createElement('p');
  p.innerHTML = `<b>${who}:</b> ${msg}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}
function showTyping() {
  showChat();
  typingIndicator.textContent = "Partner is typing...";
  clearTimeout(window.typingTimer);
  window.typingTimer = setTimeout(() => typingIndicator.textContent = "", 1500);
}

// === Emoji ===
const picker = new EmojiButton();
picker.on('emoji', emoji => chatInput.value += emoji);
emojiBtn.onclick = () => picker.togglePicker(emojiBtn);
function showFloatingEmoji(emoji) {
  const e = document.createElement('div');
  e.textContent = emoji;
  e.className = 'floatingEmoji';
  document.body.appendChild(e);
  e.style.left = `${Math.random() * 80 + 10}%`;
  e.style.bottom = '10%';
  setTimeout(() => e.remove(), 2000);
}

// === UI ===
function toggleUI(state) {
  startBtn.hidden = state === 'inCall';
  skipBtn.hidden = state !== 'inCall';
  endCallBtn.hidden = state !== 'inCall';
  switchCamBtn.hidden = state !== 'inCall';
  togglePrefsBtn.hidden = state === 'inCall';
}
function showPartnerOverlay(prefs) {
  partnerInfoOverlay.innerHTML = `
    <p>Name: ${prefs.nickname || 'Unknown'}</p>
    <p>Interests: ${prefs.interests || 'None'}</p>
    <p>Lifestyle: ${prefs.lifestyle || 'Unknown'}</p>
    <p>Language: ${prefs.language || 'Any'}</p>
    <p>Location: ${prefs.location || 'Unknown'}</p>`;
  partnerInfoOverlay.style.display = 'block';
  setTimeout(() => partnerInfoOverlay.style.display = 'none', 2000);
}
function getUserPrefs() {
  return {
    uid: currentUser ? currentUser.uid : "",
    selfGender: document.getElementById('selfGenderSelect')?.value || localStorage.getItem('selfGender') || '',
    age: document.getElementById('ageInput')?.value || localStorage.getItem('age') || '',
    nickname: document.getElementById('nicknameInput')?.value || localStorage.getItem('nickname') || '',
    gender: genderSelect?.value || localStorage.getItem('gender') || '',
    location: locationSelect?.value || localStorage.getItem('location') || '',
    interests: interestsInput?.value || localStorage.getItem('interests') || '',
    lifestyle: document.getElementById('lifestyleInput')?.value || localStorage.getItem('lifestyle') || '',
    language: languageSelect?.value || localStorage.getItem('language') || ''
  };
}

// === Misc ===
let chatHideTimer;
function showChat() {
  chatContainer.classList.add('visible');
  clearTimeout(chatHideTimer);
  chatHideTimer = setTimeout(() => chatContainer.classList.remove('visible'), 5000);
}
let startX = 0;
localVideo.ontouchstart = e => startX = e.touches[0].clientX;
localVideo.ontouchend = e => {
  if (e.changedTouches[0].clientX - startX < -50) skipBtn.click();
};
function endCall() {
  if (pc) {
    pc.close(); pc = null;
    remoteVideo.srcObject = null;
  }
}