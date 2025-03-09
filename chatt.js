// Firebase Config (Ensure it's added or separate in firebase-config.js)
const firebaseConfig = {
    apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
    authDomain: "snaptalk-17f6d.firebaseapp.com",
    projectId: "snaptalk-17f6d",
    storageBucket: "snaptalk-17f6d.firebasestorage.app",
    messagingSenderId: "592763376854",
    appId: "1:592763376854:web:c876f67dc5ea87080ce577",
    measurementId: "G-BJ36XXEJQ3"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser;
let currentUsername;
let privateKey;
let chatId = "chat123"; // Example chatId

// Initialize the Firebase Auth state listener
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        db.collection("users").doc(user.uid).get().then(doc => {
            if (doc.exists) {
                currentUsername = doc.data().username;
                loadMessages();
            }
        });
    } else {
        window.location.href = "index.html"; // Redirect to login if not authenticated
    }
});

// Functions for key management (generate, encrypt, decrypt)
async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );
    return keyPair;
}

async function encryptMessage(message, publicKey) {
    const encodedMessage = new TextEncoder().encode(message);
    const encryptedMessage = await crypto.subtle.encrypt(
        {
            name: "RSA-OAEP"
        },
        publicKey,
        encodedMessage
    );
    return arrayBufferToBase64(encryptedMessage);
}

async function decryptMessage(encryptedMessage, privateKey) {
    const encryptedArrayBuffer = base64ToArrayBuffer(encryptedMessage);
    const decryptedMessage = await crypto.subtle.decrypt(
        {
            name: "RSA-OAEP"
        },
        privateKey,
        encryptedArrayBuffer
    );
    return new TextDecoder().decode(decryptedMessage);
}

function arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

async function importPublicKey(publicKeyBase64) {
    const binaryDerString = atob(publicKeyBase64);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }
    return crypto.subtle.importKey(
        "spki",
        binaryDer.buffer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        true,
        ["encrypt"]
    );
}

async function importPrivateKey(privateKeyBase64) {
    const binaryDerString = atob(privateKeyBase64);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }
    privateKey = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256"
        },
        true,
        ["decrypt"]
    );
}

// Typing Indicator: Show when user is typing
const typingIndicator = document.getElementById("typing-indicator");
const messageInput = document.getElementById("message-input");
const sendMessageBtn = document.getElementById("send-message-btn");
const usersTypingDiv = document.getElementById("users-typing");

// Firebase typing state
const typingRef = db.collection("chats").doc(chatId).collection("typing");

let typingTimeout;
messageInput.addEventListener("input", () => {
    typingIndicator.style.display = "block"; // Show the typing indicator
    clearTimeout(typingTimeout);
    
    // Send typing status to Firestore
    typingRef.doc(currentUser.uid).set({
        username: currentUsername,
        typing: true
    });

    // Hide the typing indicator after 3 seconds of no input
    typingTimeout = setTimeout(() => {
        typingIndicator.style.display = "none";
        typingRef.doc(currentUser.uid).set({
            username: currentUsername,
            typing: false
        });
    }, 3000);
});

// Listen for other users' typing statuses
typingRef.onSnapshot(snapshot => {
    usersTypingDiv.innerHTML = "";
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.typing && doc.id !== currentUser.uid) {
            const typingUserDiv = document.createElement("div");
            typingUserDiv.textContent = `${data.username} is typing...`;
            usersTypingDiv.appendChild(typingUserDiv);
        }
    });
});

// Load messages from Firestore
function loadMessages() {
    db.collection("chats").doc(chatId).collection("messages")
        .orderBy("timestamp")
        .onSnapshot(snapshot => {
            const messagesBox = document.getElementById("messages-box");
            messagesBox.innerHTML = ""; // Clear the existing messages

            snapshot.forEach(doc => {
                const messageData = doc.data();
                decryptMessage(messageData.text, privateKey).then(decryptedText => {
                    const messageDiv = document.createElement("div");
                    messageDiv.classList.add("message", messageData.senderId === currentUser.uid ? "sent" : "received");
                    messageDiv.innerHTML = `
                        <span class="username">${messageData.senderName}</span>
                        <span>${decryptedText}</span>
                        <span class="timestamp">${formatTimestamp(messageData.timestamp)}</span>
                    `;
                    messagesBox.appendChild(messageDiv);
                });
            });
        });
}

// Send a message
sendMessageBtn.addEventListener("click", () => {
    if (messageInput.value.trim() === "") return;

    // Fetch recipient's public key from Firestore or other storage
    const recipientPublicKeyBase64 = "recipient-public-key";  // Replace with actual recipient's public key

    importPublicKey(recipientPublicKeyBase64).then(publicKey => {
        encryptMessage(messageInput.value, publicKey).then(encryptedText => {
            // Store the encrypted message in Firestore
            db.collection("chats").doc(chatId).collection("messages").add({
                senderId: currentUser.uid,
                senderName: currentUsername,
                text: encryptedText,  // Encrypted message
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            messageInput.value = ""; // Clear the input field after sending
        });
    });
});

// Function to format timestamp (for display purposes)
function formatTimestamp(timestamp) {
    const date = timestamp.toDate();
    return `${date.getHours()}:${date.getMinutes()} - ${date.toDateString()}`;
}