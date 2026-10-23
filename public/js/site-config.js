// Shared (all organizations) settings. Per-organization Firebase config is in firebase-config.js.
// The Firebase web config is a public identifier, NOT a secret. Real protection = Auth + firestore.rules.
// Never put service-account keys or other privileged secrets in this repository.
// Firebase web config lives in firebase-config.js (per organization; generated at deploy time by scripts/build-org.mjs).
export { firebaseConfig } from './firebase-config.js';

// Increment when your consent wording changes materially.
export const consentVersion = '1';

// Developer signature (optional). To remove it: set enabled to false, or delete the
// <footer id="signature"> call in public/js/public.js. No lock, no tracking, no popups.
export const developerSignature = {
  enabled: true,
  name: 'Ibrahim Siddik',
  portfolio: 'https://ibrahim-siddik.web.app/',
  email: 'muhammadibrahimsiddik@outlook.com',
  github: 'https://github.com/muhammadibrahimsiddiknasib',
  showInAdmin: false,
};
