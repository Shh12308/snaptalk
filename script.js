import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, addDoc, collection, getDoc, onSnapshot, query, where, getDocs, updateDoc } from "firebase/firestore";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
    authDomain: "snaptalk-17f6d.firebaseapp.com",
    projectId: "snaptalk-17f6d",
    storageBucket: "snaptalk-17f6d.firebasestorage.app",
    messagingSenderId: "592763376854",
    appId: "1:592763376854:web:c876f67dc5ea87080ce577",
    measurementId: "G-BJ36XXEJQ3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Firebase Authentication Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log('User is logged in:', user);
    } else {
        console.log('No user logged in');
    }
});

// DOM Elements
const locationSelect = document.getElementById('location');
const settingsToggle = document.getElementById('settings-toggle');
const settingsSection = document.getElementById('settings');
const saveSettingsButton = document.getElementById('save-settings');
const genderSelect = document.getElementById('gender');
const ageSelect = document.getElementById('age');
const topicsSelect = document.getElementById('topics');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startVideoCallButton = document.getElementById('start-video-call');
const acceptCallButton = document.getElementById('accept-call');
const rejectCallButton = document.getElementById('reject-call');

// Blacklisted words (inappropriate content)
const blacklistedWords = [
    "f***", "s***", "b****", "a******", "d***", "c***", "b******", "p****",
    "sex", "porn", "nude", "pornography", "boobs", "penis", "vagina", "asshole", 
    "masturbation", "cum", "hookup", "orgy", "racist", "xenophobe", "sexist", 
    "homophobic", "bigot", "retard", "cripple", "kill", "murder", "rape", "abuse", 
    "stabbing", "shoot", "violent", "terrorist", "suicide", "kill myself", "self-harm", 
    "overdose", "cutting", "depressed", "hopeless", "address", "email", 
    "social security number", "credit card", "bank account", "cocaine", "heroin", 
    "weed", "meth", "marijuana", "ecstasy", "alcoholism"
];

// Nudity-related words (for age 13-17)
const nudityKeywords = ["nude", "porn", "boobs", "penis", "vagina", "sex"];

// Populate Location Dropdown
const countries = ['Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Belgium', 'Brazil', 'Canada', 'China', 'France', 'Germany', 'India', 'Italy', 'Japan', 'Mexico', 'Russia', 'United Kingdom', 'United States', 'South Africa'];
countries.forEach(country => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    locationSelect.appendChild(option);
});

// Toggle Settings Visibility
settingsToggle.addEventListener('click', () => {
    settingsSection.style.display = settingsSection.style.display === 'none' ? 'block' : 'none';
});

// Save Settings
saveSettingsButton.addEventListener('click', () => {
    const gender = genderSelect.value;
    const age = ageSelect.value;
    const location = locationSelect.value;
    const topics = Array.from(topicsSelect.selectedOptions).map(option => option.value);

    console.log(`Gender: ${gender}, Age: ${age}, Location: ${location}, Topics: ${topics.join(', ')}`);
    saveUserSettingsToFirebase(gender, age, location, topics);
});

// Save Settings to Firestore
function saveUserSettingsToFirebase(gender, age, location, topics) {
    const userId = auth.currentUser?.uid;
    if (userId) {
        setDoc(doc(db, 'userSettings', userId), {
            gender,
            age,
            location,
            topics,
            lastUpdated: serverTimestamp(),
        })
        .then(() => {
            alert('Settings saved!');
        })
        .catch(error => {
            console.error('Error saving settings:', error);
            alert('Error saving your settings.');
        });
}

// Display Message in Chat Box
function displayMessage(sender, message) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = `${sender}: ${message}`;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll to bottom
}

// Send Message
sendButton.addEventListener('click', async () => {
    const messageText = chatInput.value.trim();
    if (messageText) {
        const userName = auth.currentUser?.displayName || 'Anonymous';  // Default to 'Anonymous' if no display name
        const userId = auth.currentUser?.uid;

        // Check if the user is banned
        const isBanned = await checkBanStatus(userId);
        if (isBanned) {
            alert('You are banned from sending messages.');
            return;
        }

        // Get the user's age to determine if nudity detection is active
        const userSettings = await getUserSettings(userId);
        const isUnderage = userSettings.age >= 13 && userSettings.age <= 17;
        const is18Plus = userSettings.age >= 18;

        // Check for inappropriate content (blacklisted words)
        if (containsInappropriateContent(messageText) && (isUnderage || is18Plus)) {
            if (containsNudity(messageText) && isUnderage) {
                await banUser(userId, 700 * 60 * 60 * 1000); // Ban for 700 hours
                await reportToAuthorities(messageText, userId);
                alert('You have been banned for 700 hours due to nudity.');
            } else if (isUnderage) {
                await banUser(userId, 2 * 60 * 60 * 1000); // Ban for 2 hours
                await reportToAuthorities(messageText, userId);
                alert('You have been banned for 2 hours due to inappropriate language.');
            }
            return;
        }

        // Display the message in chat box
        displayMessage(userName, messageText);

        // Clear input field
        chatInput.value = '';

        // Save message to Firebase
        saveChatToFirebase(messageText);
    }
});

// Save Message to Firestore
function saveChatToFirebase(messageText) {
    const messageData = {
        sender: auth.currentUser?.uid || 'Anonymous',
        message: messageText,
        timestamp: serverTimestamp(),
    };

    addDoc(collection(db, 'messages'), messageData)
        .then(() => {
            console.log('Message saved to Firebase');
        })
        .catch(error => {
            console.error('Error saving message:', error);
        });
}

// Check for Inappropriate Content
function containsInappropriateContent(message) {
    return blacklistedWords.some(word => message.toLowerCase().includes(word));
}

// Detect Nudity in Content
function containsNudity(message) {
    return nudityKeywords.some(word => message.toLowerCase().includes(word));
}

// Get User Settings
async function getUserSettings(userId) {
    const userRef = doc(db, 'userSettings', userId);
    const userSnap = await getDoc(userRef);
    return userSnap.data();
}

// Check if User is Banned
async function checkBanStatus(userId) {
    const userRef = doc(db, 'users', userId);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
        const userData = docSnap.data();
        const bannedUntil = userData.bannedUntil?.toDate();

        if (bannedUntil && bannedUntil > new Date()) {
            return true; // User is banned
        }
    }
    return false; // User is not banned
}

// Ban User
async function banUser(userId, banDuration) {
    const userRef = doc(db, 'users', userId);
    
    try {
        await setDoc(userRef, {
            bannedUntil: new Date(Date.now() + banDuration),
        }, { merge: true });

        console.log(`User banned for ${banDuration / (1000 * 60 * 60)} hours`);
    } catch (error) {
        console.error('Error banning user:', error);
    }
}

// Report Content to Authorities
async function reportToAuthorities(content, userId) {
    const reportData = {
        content: content,
        userId: userId,
        timestamp: serverTimestamp(),
    };

    try {
        await addDoc(collection(db, 'policeReports'), reportData);
        console.log('Report sent to authorities');
    } catch (error) {
        console.error('Error reporting to authorities:', error);
    }
}

// WebRTC: Start Video Call
startVideoCallButton.addEventListener('click', async () => {
    const userSettings = await getUserSettings(auth.currentUser.uid);
    const isUnderage = userSettings.age >= 13 && userSettings.age <= 17;
    if (isUnderage) {
        alert('Video calls are not allowed for users under 18.');
        return;
    }

    // WebRTC setup (signaling, peer connection)
    const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // STUN server
    });

    // Get media stream (audio/video)
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    // Add local tracks to the connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Set up signaling (via Firestore or custom signaling server)
    const signalingDocRef = doc(db, 'signaling', auth.currentUser.uid);

    // Send Offer to peer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await setDoc(signalingDocRef, { offer: offer, timestamp: serverTimestamp() });

    // Handle ICE candidate gathering
    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            await setDoc(signalingDocRef, {
                iceCandidates: firebase.firestore.FieldValue.arrayUnion(event.candidate),
                timestamp: serverTimestamp()
            }, { merge: true });
        }
    };

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Listen for the peer's offer and set up the connection
    const unsubscribe = onSnapshot(signalingDocRef, async (snapshot) => {
        const data = snapshot.data();
        if (data?.offer && !peerConnection.remoteDescription) {
            const offer = new RTCSessionDescription(data.offer);
            await peerConnection.setRemoteDescription(offer);

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await setDoc(signalingDocRef, { answer: answer, timestamp: serverTimestamp() });

            // Send ICE candidates from remote peer
            if (data?.iceCandidates) {
                data.iceCandidates.forEach(async (candidate) => {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                });
            }
        }
    });
});