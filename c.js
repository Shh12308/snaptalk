import firebase from "firebase/app";
import "firebase/auth";
import "firebase/firestore";
import firebaseConfig from "./config";  // Import the Firebase config

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
} else {
  firebase.app(); // Use the existing Firebase app
}

const db = firebase.firestore();



// WebRTC Setup with STUN and TURN servers
const APP_ID = 'a5cecbdb5cc746209b9371a0d5f8aeac'; // Replace with your Agora App ID
const TOKEN = '007eJxTYGiwUKgX+n76QMnuA/fKp0z6N/VDvYHDzZe9NoxuxeEVaxwVGBJNk1OTk1KSTJOTzU3MjAwskyyNzQ0TDVJM0ywSUxOT63pepTcEMjIEil9kYWSAQBCflSEsMyU1n4EBAAy2Ie0='; // Use a generated token for production
const CHANNEL_NAME = 'video'; // Set a unique channel name

let localTracks = [];
let remoteUsers = {};
const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

// Join Channel and Start Call
async function startCall() {
  try {
    // Join Agora Channel
    await client.join(APP_ID, CHANNEL_NAME, TOKEN, null);

    // Get local media (audio and video)
    localTracks = await AgoraRTC.createMicrophoneAndCameraTracks();
    const localPlayer = document.getElementById('localVideo');
    localPlayer.srcObject = new MediaStream([localTracks[1].getMediaStreamTrack()]);

    // Publish local tracks
    await client.publish(localTracks);
    console.log('Published local stream.');

    // Handle remote users
    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);

  } catch (error) {
    console.error('Error starting call:', error);
  }
}

// Handle Remote User Stream
async function handleUserPublished(user, mediaType) {
  await client.subscribe(user, mediaType);

  if (mediaType === 'video') {
    const remotePlayer = document.getElementById('remoteVideo');
    remotePlayer.srcObject = new MediaStream([user.videoTrack.getMediaStreamTrack()]);
  }

  if (mediaType === 'audio') {
    user.audioTrack.play();
  }

  console.log('Remote user connected:', user.uid);
}

// Handle User Leaving
function handleUserUnpublished(user) {
  console.log('User left:', user.uid);
  const remotePlayer = document.getElementById('remoteVideo');
  remotePlayer.srcObject = null;
}

// End Call
function endCall() {
  localTracks.forEach(track => track.stop());
  client.leave();
  console.log('Call ended.');
}

// Element References
const startChatBtn = document.getElementById("startChat");
const stopChatBtn = document.getElementById("stopChat");
const skipChatBtn = document.getElementById("skipChat");
const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings");
const saveSettingsBtn = document.getElementById("saveSettings");

// Check if Elements Exist
if (!startChatBtn || !stopChatBtn || !skipChatBtn || !settingsToggle || !settingsPanel) {
  console.error("One or more UI elements are missing.");
} else {
  // Toggle Settings Panel
  settingsToggle.addEventListener("click", () => {
    settingsPanel.style.display = settingsPanel.style.display === "block" ? "none" : "block";
  });

  // Save Preferences to Local Storage
  saveSettingsBtn.addEventListener("click", () => {
    const preferences = {
      age: document.getElementById("age").value,
      gender: document.getElementById("gender").value,
      location: document.getElementById("location").value.toLowerCase(),
    };

    localStorage.setItem("preferences", JSON.stringify(preferences));
    alert("Preferences saved!");
  });

  // Event Listeners
  startChatBtn.addEventListener("click", findMatch);
  stopChatBtn.addEventListener("click", endCall);
  skipChatBtn.addEventListener("click", async () => {
    endCall();
    findMatch();
  });
}

// Display Opponent Info
function displayOpponent(user) {
  document.getElementById("opponent-username").textContent = `Username: ${user.username}`;
  document.getElementById("opponent-gender").textContent = `Gender: ${user.gender}`;
  document.getElementById("opponent-age").textContent = `Age: ${user.age}`;
  document.getElementById("opponent-location").textContent = `Location: ${user.location}`;
  document.getElementById("opponent-avatar").src = user.avatarUrl || 'default-avatar.png';
}

// Start WebRTC Call
async function startWebRTC() {
  try {
    if (!navigator.mediaDevices) throw new Error("Media devices not available.");

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;

    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;

    peerConnection = new RTCPeerConnection();
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({ type: 'candidate', candidate: event.candidate });
      }
    };

    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    sendMessage({ type: 'offer', offer });

    // UI State Management
    startChatBtn.style.display = "none";
    stopChatBtn.style.display = "inline-block";
    skipChatBtn.style.display = "inline-block";
  } catch (error) {
    console.error('Error starting call:', error);
  }
}

// End Call
function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  document.getElementById("localVideo").srcObject = null;
  document.getElementById("remoteVideo").srcObject = null;

  // UI State Management
  startChatBtn.style.display = "inline-block";
  stopChatBtn.style.display = "none";
  skipChatBtn.style.display = "none";

  console.log('Call ended.');
}

// Handle signaling messages
function handleSignalingMessage(message) {
  switch (message.type) {
    case 'offer':
      handleOffer(message.offer);
      break;
    case 'answer':
      handleAnswer(message.answer);
      break;
    case 'candidate':
      handleCandidate(message.candidate);
      break;
    case 'chat':
      displayChatMessage('Opponent', message.text);
      break;
    default:
      console.error('Unknown message type:', message.type);
  }
}

// Send a message to the signaling server
function sendMessage(message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    console.error('WebSocket not open. Cannot send message.');
  }
}

// Ensure Elements Exist
const sendButton = document.getElementById("send-button");
const chatInput = document.getElementById("chat-input");
const chatBox = document.getElementById("chat-box");

if (!sendButton || !chatInput || !chatBox) {
  console.error("Chat elements are missing.");
} else {
  // Send Message
  sendButton.addEventListener("click", sendMessage);
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  function sendMessage() {
    const message = chatInput.value.trim();
    if (message === "") {
      alert("Please enter a message.");
      return;
    }

    // Display Sent Message
    displayChatMessage("You", message, true);
    chatInput.value = ""; // Clear input after sending

    // Simulate Opponent Response (For Demo Purposes)
    setTimeout(() => {
      displayChatMessage("Opponent", "This is a response!", false);
    }, 1000);
  }

  // Display Messages in Chat Box
  function displayChatMessage(sender, message, isUser) {
    const msgElement = document.createElement("div");
    msgElement.classList.add("message", isUser ? "user-message" : "opponent-message");
    msgElement.textContent = `${sender}: ${message}`;
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll to the bottom
  }
}

// List of countries
const countries = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
  "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
  "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso",
  "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic",
  "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia",
  "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic",
  "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini",
  "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana",
  "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras",
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein",
  "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali",
  "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova",
  "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Saudi Arabia",
  "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
  "Solomon Islands", "Somalia", "South Africa", "Spain", "Sri Lanka", "Sudan", "Suriname",
  "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste",
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

// Populate countries into the select element
const locationSelect = document.getElementById("location");
countries.forEach(country => {
  const option = document.createElement("option");
  option.value = country.toLowerCase();
  option.textContent = country;
  locationSelect.appendChild(option);
});