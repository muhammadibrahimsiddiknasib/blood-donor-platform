// Firebase SDK is loaded only on admin/setup pages (the public site uses a tiny REST client instead).
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, orderBy,
  limit, where, serverTimestamp, getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './site-config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Create a login account WITHOUT replacing the current admin's session: use a throw-away
// second app instance. The account has no access until an admin writes its users/{uid} document.
export async function createAuthAccount(email, password) {
  const second = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  try {
    const a = getAuth(second);
    const cred = await createUserWithEmailAndPassword(a, email, password);
    const uid = cred.user.uid;
    await signOut(a);
    return uid;
  } finally {
    await deleteApp(second);
  }
}

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, orderBy, limit, where,
  serverTimestamp, getCountFromServer,
};
