// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
import { getFirestore } from "firebase/firestore";   // ← Esta línea faltaba
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCxRzLsafBCVqJqepAV_PJQ2Td45q16TaY",
  authDomain: "examen-app-syl.firebaseapp.com",
  projectId: "examen-app-syl",
  storageBucket: "examen-app-syl.firebasestorage.app",
  messagingSenderId: "154437060002",
  appId: "1:154437060002:web:415ffad89c05c848841efb",
  measurementId: "G-1G0ZBB735N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Exporta db y auth
export const db = getFirestore(app);
export const auth = getAuth(app);
