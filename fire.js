// fire.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, getDocs, query, where, onSnapshot, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
  authDomain: "snaptalk-17f6d.firebaseapp.com",
  projectId: "snaptalk-17f6d",
  storageBucket: "snaptalk-17f6d.appspot.com",
  messagingSenderId: "592763376854",
  appId: "1:592763376854:web:c876f67dc5ea87080ce577",
  measurementId: "G-BJ36XXEJQ3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function signIn() {
  return signInAnonymously(auth);
}

function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

async function initializeUser(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      isAvailable: true
    });
  } else {
    await updateDoc(userRef, { isAvailable: true });
  }
}

async function findAvailableMatch(userUid) {
  const availableUsersQuery = query(
    collection(db, "users"),
    where("isAvailable", "==", true),
    where("uid", "!=", userUid)
  );
  const querySnapshot = await getDocs(availableUsersQuery);
  if (querySnapshot.empty) return null;
  return querySnapshot.docs[0].id;
}

async function setUserAvailability(userUid, isAvailable) {
  await updateDoc(doc(db, "users", userUid), { isAvailable });
}

function listenToChatMessages(chatId, callback) {
  return onSnapshot(doc(db, "chats", chatId), (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data().messages || []);
    } else {
      callback([]);
    }
  });
}

async function sendMessageToChat(chatId, senderUid, text) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);

  if (!chatSnap.exists()) {
    await setDoc(chatRef, { messages: [] });
  }

  await updateDoc(chatRef, {
    messages: arrayUnion({
      sender: senderUid,
      text,
      timestamp: serverTimestamp()
    })
  });
}

export {
  auth,
  db,
  signIn,
  onAuthChange,
  initializeUser,
  findAvailableMatch,
  setUserAvailability,
  listenToChatMessages,
  sendMessageToChat,
};