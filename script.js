import { initializeApp } from "firebase/app";
import { 
    getAuth, onAuthStateChanged, signInAnonymously 
} from "firebase/auth";
import { 
    getFirestore, doc, setDoc, serverTimestamp, addDoc, collection, getDoc, 
    onSnapshot, updateDoc, query, where, getDocs, deleteDoc 
} from "firebase/firestore";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
    authDomain: "snaptalk-17f6d.firebaseapp.com",
    projectId: "snaptalk-17f6d",
    storageBucket: "snaptalk-17f6d.firebaseapp.com",
    messagingSenderId: "592763376854",
    appId: "1:592763376854:web:c876f67dc5ea87080ce577",
    measurementId: "G-BJ36XXEJQ3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DOM Elements
const elements = {
    chatBox: document.getElementById('chat-box'),
    chatInput: document.getElementById('chat-input'),
    sendButton: document.getElementById('send-button'),
    localVideo: document.getElementById('localVideo'),
    remoteVideo: document.getElementById('remoteVideo'),
    startVideoCallButton: document.getElementById('start-video-call'),
    skipButton: document.getElementById('skip'),
    stopButton: document.getElementById('stop')
};

// Word Filtering
const blacklistedWords = ["sex", "porn", "nude", "racist", "kill", "suicide"];
const nudityKeywords = ["nude", "porn", "boobs", "penis", "vagina", "sex"];

let chatPartnerId = null; // Store matched user
let peerConnection; // WebRTC Peer Connection
let localStream; // Local media stream

/** ✅ Anonymous Authentication */
async function signIn() {
    try {
        await signInAnonymously(auth);
    } catch (error) {
        console.error("Authentication error:", error);
    }
}

/** ✅ Listen for Authentication State */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log(`User logged in: ${user.uid}`);
        findChatPartner(user.uid);
    } else {
        console.log("No user logged in.");
        signIn();
    }
});

/** ✅ Find a Chat Partner */
async function findChatPartner(userId) {
    const usersRef = collection(db, "users");
    const availableUsersQuery = query(usersRef, where("isAvailable", "==", true), where("uid", "!=", userId));

    const querySnapshot = await getDocs(availableUsersQuery);
    if (!querySnapshot.empty) {
        const partner = querySnapshot.docs[0].data();
        chatPartnerId = partner.uid;

        await updateDoc(doc(db, "users", userId), { isAvailable: false, chatPartner: chatPartnerId });
        await updateDoc(doc(db, "users", chatPartnerId), { isAvailable: false, chatPartner: userId });

        startVideoCall();
        listenForMessages();
    } else {
        await updateDoc(doc(db, "users", userId), { isAvailable: true });
    }
}

/** ✅ Listen for Chat Messages */
function listenForMessages() {
    if (!chatPartnerId) return;
    const chatRef = collection(db, "chats");
    const chatQuery = query(chatRef, where("participants", "array-contains", auth.currentUser.uid));

    onSnapshot(chatQuery, (snapshot) => {
        elements.chatBox.innerHTML = "";
        snapshot.docs.forEach((doc) => {
            const { sender, message } = doc.data();
            displayMessage(sender, message);
        });
    });
}

/** ✅ Send Message with Moderation */
elements.sendButton.addEventListener('click', async () => {
    const messageText = elements.chatInput.value.trim();
    if (!messageText) return;

    const userId = auth.currentUser?.uid;
    if (!userId || !chatPartnerId) return alert("No chat partner found.");

    if (containsNudity(messageText)) {
        await banUser(userId, 700);
        alert('You are banned for 700 hours due to nudity.');
        return;
    }

    if (containsInappropriateContent(messageText)) {
        await banUser(userId, 2);
        alert('You are banned for 2 hours due to inappropriate content.');
        return;
    }

    await saveChatToFirebase(userId, messageText);
});

/** ✅ Save Message to Firestore */
async function saveChatToFirebase(userId, messageText) {
    const messageData = {
        sender: userId,
        message: messageText,
        timestamp: serverTimestamp(),
        participants: [userId, chatPartnerId]
    };

    await addDoc(collection(db, 'chats'), messageData);
}

/** ✅ Display Message */
function displayMessage(sender, message) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = `${sender}: ${message}`;
    elements.chatBox.appendChild(messageDiv);
}

/** ✅ WebRTC: Start Video Call */
async function startVideoCall() {
    if (!chatPartnerId) return alert("No chat partner found.");

    peerConnection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    elements.localVideo.srcObject = localStream;
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        elements.remoteVideo.srcObject = event.streams[0];
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await setDoc(doc(db, 'signaling', auth.currentUser.uid), { offer, timestamp: serverTimestamp() });

    listenForAnswer(peerConnection);
}

/** ✅ WebRTC: Listen for Answer */
function listenForAnswer(peerConnection) {
    const signalingDoc = doc(db, 'signaling', chatPartnerId);
    onSnapshot(signalingDoc, async (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.answer) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        }
    });
}

/** ✅ Skip User */
elements.skipButton.addEventListener('click', async () => {
    if (!chatPartnerId) return;
    await updateDoc(doc(db, "users", auth.currentUser.uid), { isAvailable: true, chatPartner: null });
    chatPartnerId = null;
    findChatPartner(auth.currentUser.uid);
});

/** ✅ Stop Video Call */
elements.stopButton.addEventListener('click', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    elements.localVideo.srcObject = null;
    elements.remoteVideo.srcObject = null;
});

/** ✅ Check for Inappropriate Content */
function containsInappropriateContent(message) {
    return blacklistedWords.some(word => message.toLowerCase().includes(word));
}

/** ✅ Detect Nudity in Content */
function containsNudity(message) {
    return nudityKeywords.some(word => message.toLowerCase().includes(word));
}

/** ✅ Ban User */
async function banUser(userId, hours) {
    const bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await updateDoc(doc(db, 'users', userId), { bannedUntil });
    alert(`User banned for ${hours} hours.`);
}