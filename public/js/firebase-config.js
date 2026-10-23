// The ONLY per-organization browser setting: the Firebase web-app config (public identifiers, NOT secrets).
// - Self-hosting (clone) : replace the placeholder values below with yours (Firebase console -> Project settings -> Your apps).
// - Operator deployment  : leave this file alone. `npm run build:org` overwrites it from orgs/<slug>/config.json
//                          inside dist/<slug>/, never in this source folder.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
