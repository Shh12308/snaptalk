
// Firebase Modular SDK (v9+)
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit, onSnapshot, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';

import firebaseConfig from "./config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Agora Configuration
import AgoraRTC from "agora-rtc-sdk-ng";
const APP_ID = '4e96e55825a3410f9fdc25ba67e47ee1';
const CHANNEL_NAME = 'Vidmint'; // default fallback
let TOKEN = null;

let localTracks = [];
let remoteUsers = {};
let currentRoomId = null;

const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

async function fetchToken() {
  try {
    // Replace with your actual backend URL for token generation
    const response = await fetch('https://token-six-gamma.vercel.app');
    const data = await response.json();
    TOKEN = data.token;
    console.log('Token:', TOKEN);
  } catch (error) {
    console.error('Token fetch failed:', error);
  }
}

// Start Agora Call
async function startAgoraCall(roomId) {
  try {
    await fetchToken();
    await client.join(APP_ID, roomId, TOKEN, null);

    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();
    const localPlayer = document.getElementById('localVideo');
    localPlayer.srcObject = new MediaStream([localTracks[1].getMediaStreamTrack()]);

    await client.publish(localTracks);
    console.log('Streaming to room:', roomId);

    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);
  } catch (error) {
    console.error('Call error:', error);
  }
}

// Matchmaking Function
async function findMatch() {
  const user = auth.currentUser;
  if (!user) return alert("Please log in first.");

  const prefsSnap = await db.collection("users").doc(user.uid).collection("preferences").get();
  let prefs = {};
  prefsSnap.forEach(doc => prefs = doc.data());

  const queueRef = db.collection("queue");
  let queueQuery = queueRef.orderBy("timestamp").limit(1);

  if (prefs.gender) queueQuery = queueQuery.where("gender", "==", prefs.gender);
  if (prefs.location) queueQuery = queueQuery.where("location", "==", prefs.location);

  const snapshot = await queueQuery.get();

  if (!snapshot.empty) {
    const matchDoc = snapshot.docs[0];
    const matchData = matchDoc.data();

    await queueRef.doc(matchDoc.id).delete();

    const roomId = `room-${Date.now()}`;
    await db.collection("rooms").doc(roomId).set({
      users: [user.uid, matchData.uid],
      createdAt: serverTimestamp()
    });

    currentRoomId = roomId;
    await startAgoraCall(roomId);
  } else {
    await queueRef.doc(user.uid).set({
      uid: user.uid,
      gender: prefs.gender || null,
      location: prefs.location || null,
      timestamp: serverTimestamp()
    });

    const unsub = db.collection("rooms")
      .where("users", "array-contains", user.uid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .onSnapshot(snapshot => {
        if (!snapshot.empty) {
          const room = snapshot.docs[0];
          unsub();
          currentRoomId = room.id;
          startAgoraCall(room.id);
        }
      });
  }
}

// Handle Remote User
async function handleUserPublished(user, mediaType) {
  await client.subscribe(user, mediaType);

  if (mediaType === 'video') {
    const remotePlayer = document.getElementById('remoteVideo');
    remotePlayer.srcObject = new MediaStream([user.videoTrack.getMediaStreamTrack()]);
  }

  if (mediaType === 'audio') user.audioTrack.play();
}

// Handle User Leave
function handleUserUnpublished(user) {
  console.log('User left:', user.uid);
  const remotePlayer = document.getElementById('remoteVideo');
  remotePlayer.srcObject = null;
}

// End Call
async function endCall() {
  localTracks.forEach(track => track.stop());
  await client.leave();

  document.getElementById('localVideo').srcObject = null;
  document.getElementById('remoteVideo').srcObject = null;
  console.log('Call ended.');

  const user = auth.currentUser;
  if (user) {
    await db.collection("queue").doc(user.uid).delete().catch(() => {});
  }
}

// Preferences Save
const saveSettingsBtn = document.getElementById("saveSettings");
saveSettingsBtn.addEventListener("click", () => {
  const preferences = {
    age: document.getElementById("age").value,
    gender: document.getElementById("gender").value,
    location: document.getElementById("location").value.toLowerCase(),
  };

  const user = auth.currentUser;
  if (user) {
    const preferencesRef = db.collection("users").doc(user.uid).collection("preferences");
    preferencesRef.set(preferences)
      .then(() => alert("Preferences saved!"))
      .catch(err => console.error("Preferences error:", err));
  }
});

// Chat Logic
const sendButton = document.getElementById("send-button");
const chatInput = document.getElementById("chat-input");
const chatBox = document.getElementById("chat-box");

sendButton.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  const user = auth.currentUser;
  if (user && currentRoomId) {
    const chatRef = db.collection("chats").doc(currentRoomId).collection("messages");
    chatRef.add({
      sender: user.displayName || "User",
      message,
      timestamp: serverTimestamp(),
    }).then(() => {
      displayChatMessage("You", message, true);
      chatInput.value = "";
    });
  }
}

function displayChatMessage(sender, message, isUser) {
  const msg = document.createElement("div");
  msg.classList.add("message", isUser ? "user-message" : "opponent-message");
  msg.textContent = `${sender}: ${message}`;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function receiveMessages() {
  if (!currentRoomId) return;
  const chatRef = db.collection("chats").doc(currentRoomId).collection("messages").orderBy("timestamp");
  chatRef.onSnapshot(snapshot => {
    snapshot.forEach(doc => {
      const msg = doc.data();
      displayChatMessage(msg.sender, msg.message, false);
    });
  });
}

// UI Button Logic
const startChatBtn = document.getElementById("startChat");
const stopChatBtn = document.getElementById("stopChat");
const skipChatBtn = document.getElementById("skipChat");

// ICEBREAKER: Allow user to select a question before chat
const icebreakers = [
  "What's the most interesting place you've traveled to?",
  "What's your favorite movie or show right now?",
  "If you could learn one skill instantly, what would it be?"
];

const icebreakerSelect = document.getElementById("icebreaker");
icebreakers.forEach(q => {
  const option = document.createElement("option");
  option.value = q;
  option.textContent = q;
  icebreakerSelect.appendChild(option);
});

function showIcebreaker() {
  const selected = icebreakerSelect.value;
  if (selected) {
    displayChatMessage("Icebreaker", selected, false);
  }
}

// AI Matchmaking logic (stub)
async function smartMatchmaking(userPrefs) {
  const response = await fetch("/api/ai-match", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userPrefs)
  });

  const match = await response.json();
  return match; // e.g. { uid: 'user123', ... }
}

// Nudity Detection Stub
async function detectNudity(frameBlob) {
  const formData = new FormData();
  formData.append('image', frameBlob);

  const response = await fetch('/api/detect-nudity', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  return data.isNude;
}

// Banned User Redirect on Load
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const banDoc = await db.collection("bannedUsers").doc(user.uid).get();
    if (banDoc.exists) {
      window.location.href = "/banned.html";
    }
  }
});

// Periodic Frame Capture for Nudity Detection
setInterval(async () => {
  const videoElement = document.getElementById('localVideo');
  if (!videoElement || videoElement.readyState < 2) return;

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async (blob) => {
    const isNude = await detectNudity(blob);
    if (isNude) {
      const user = auth.currentUser;
      if (user) {
        await db.collection("bannedUsers").doc(user.uid).set({
          uid: user.uid,
          bannedAt: serverTimestamp(),
          reason: "Nudity detected"
        });
        await endCall();
        window.location.href = "/banned.html";
      }
    }
  }, 'image/jpeg');
}, 10000); // every 10 seconds

// REPORT USER
const reportBtn = document.getElementById("reportUser");
reportBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user || !currentRoomId) return;

  await db.collection("reports").add({
    reporter: user.uid,
    roomId: currentRoomId,
    timestamp: serverTimestamp()
  });

  alert("User reported. Thank you.");
});

// CHAT START
startChatBtn.addEventListener("click", async () => {
  await findMatch();
  receiveMessages();
  showIcebreaker();
});

stopChatBtn.addEventListener("click", async () => {
  await endCall();
});

skipChatBtn.addEventListener("click", async () => {
  await endCall();
  await findMatch();
  receiveMessages();
});

// Settings UI Toggle
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings");

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

// Populate Country List
const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", 
  "Australia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium",
  "Brazil", "Bulgaria", "Canada", "China", "France", "Germany", "India", "Indonesia",
  "Italy", "Japan", "Mexico", "Russia", "Spain", "United Kingdom", "United States"
];

const locationSelect = document.getElementById("location");

// Create and append a default "Select a country" option
const defaultOption = document.createElement("option");
defaultOption.value = "";
defaultOption.textContent = "Select a country";
defaultOption.disabled = true;
defaultOption.selected = true;
locationSelect.appendChild(defaultOption);

// Populate the country dropdown
countries.forEach(country => {
  const option = document.createElement("option");
  // Use lowercase value for consistency in form submission or processing
  option.value = country.toLowerCase();
  // Capitalize the country name for display
  option.textContent = country;
  locationSelect.appendChild(option);
});
