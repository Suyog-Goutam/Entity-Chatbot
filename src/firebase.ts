import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAjzeCFBvwq7wlDlvUazp7oqU2j_klXtAM",
  authDomain: "entity-chatbot.firebaseapp.com",
  projectId: "entity-chatbot",
  storageBucket: "entity-chatbot.firebasestorage.app",
  messagingSenderId: "1072422008604",
  appId: "1:1072422008604:web:10bcb13c54b90bcaa36cd9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
