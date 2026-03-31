// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getAnalytics, isSupported } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCVIJFJD2A2r0visYeuxXHRJeGguB_bNZ4",
  authDomain: "hvac-auto-67f97.firebaseapp.com",
  databaseURL: "https://hvac-auto-67f97-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hvac-auto-67f97",
  storageBucket: "hvac-auto-67f97.firebasestorage.app",
  messagingSenderId: "571665085144",
  appId: "1:571665085144:web:ceb96737400cd74853ddad",
  measurementId: "G-PM4Z897PL3"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Services
const auth = getAuth(app);
const db = getDatabase(app);

// Initialize Analytics (Browser-only)
let analytics;
if (typeof window !== "undefined") {
  isSupported().then((yes) => {
    if (yes) analytics = getAnalytics(app);
  });
}

export { app, auth, db, analytics };
