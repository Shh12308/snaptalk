import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";

// ✅ Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBNhwdNP7wDEBcIvVApge_jQqC46GX-Ei0",
    authDomain: "snaptalk-17f6d.firebaseapp.com",
    projectId: "snaptalk-17f6d",
    storageBucket: "snaptalk-17f6d.appspot.com",
    messagingSenderId: "592763376854",
    appId: "1:592763376854:web:c876f67dc5ea87080ce577",
    measurementId: "G-BJ36XXEJQ3"
};

// ✅ Prevent multiple Firebase initializations
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener("DOMContentLoaded", async () => {
    const errorMessage = document.getElementById("error-message");
    const countryInput = document.getElementById("country");

    let userIP = "Unknown";
    let userCountry = "Unknown";

    // ✅ Fetch User's IP & Country using ipinfo.io API
    async function getUserIP() {
        try {
            let response = await fetch("https://ipinfo.io/json?token=f855a03a7ade49");
            let data = await response.json();
            userIP = data.ip || "Unknown";
            userCountry = data.country || "Unknown";
            countryInput.value = userCountry;
        } catch (error) {
            console.error("Error fetching location:", error);
            countryInput.value = "Could not detect";
        }
    }

    await getUserIP(); // Fetch user IP before form submission

    // ✅ Handle Sign-Up
    document.getElementById("signup-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const displayName = document.getElementById("display-name").value.trim();
        const email = document.getElementById("email").value.trim();
        const age = parseInt(document.getElementById("age").value);
        const gender = document.getElementById("gender").value;
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirm-password").value;

        errorMessage.textContent = "";

        // ✅ Form Validation
        if (!displayName || !email || !age || !password || !confirmPassword || gender === "") {
            errorMessage.textContent = "All fields are required.";
            return;
        }
        if (age < 13) {
            errorMessage.textContent = "You must be at least 13 years old.";
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorMessage.textContent = "Enter a valid email address.";
            return;
        }
        if (password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
            errorMessage.textContent = "Password must be at least 8 characters with letters & numbers.";
            return;
        }
        if (password !== confirmPassword) {
            errorMessage.textContent = "Passwords do not match.";
            return;
        }

        try {
            // ✅ Create User in Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // ✅ Update Display Name
            await updateProfile(user, { displayName });

            // ✅ Store User Data in Firestore
            await setDoc(doc(db, "users", user.uid), {
                displayName,
                email,
                age,
                gender,
                ip: userIP,
                country: userCountry,
                createdAt: new Date()
            });

            // ✅ Redirect to Home Page
            alert("Sign-up successful! Redirecting...");
            window.location.href = "home.html";

        } catch (error) {
            console.error("Error during sign-up:", error);

            if (error.code === "auth/email-already-in-use") {
                errorMessage.textContent = "Email is already in use.";
            } else if (error.code === "auth/weak-password") {
                errorMessage.textContent = "Password is too weak.";
            } else {
                errorMessage.textContent = "Sign-up failed. Please try again.";
            }
        }
    });
});