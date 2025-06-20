// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBWOQpG6OijqOviZnPl9u6p1c_PeKkvEXE",
  authDomain: "swapx-4b762.firebaseapp.com",
  projectId: "swapx-4b762",
  storageBucket: "swapx-4b762.firebasestorage.app",
  messagingSenderId: "125084061204",
  appId: "1:125084061204:web:d9d106e42872733937a101",
  measurementId: "G-51H0H3LEYS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);