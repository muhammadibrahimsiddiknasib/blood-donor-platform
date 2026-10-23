// Shared admin state and helpers (kept tiny so view modules can import without cycles).
import { auth, db, collection, doc, setDoc, serverTimestamp } from './firebase.js';
import { h } from './ui.js';

export const state = { me: null, settings: { donationIntervalMonths: 4 } };
export const hooks = { route: () => {} };
export const norm = (s) => String(s || '').trim().toLowerCase();

export function go(path) { history.pushState({}, '', path); hooks.route(); }
export function link(path, label, cls) {
  return h('a', { href: path, class: cls, onclick: (e) => { e.preventDefault(); go(path); } }, label);
}

// Append-only audit trail; pass a batch to make it atomic with the change itself.
export async function audit(batch, action, targetType, targetId, details = '') {
  const ref = doc(collection(db, 'auditEvents'));
  const data = {
    actorUid: auth.currentUser.uid, action, targetType, targetId: targetId || '',
    details: String(details).slice(0, 200), timestamp: serverTimestamp(),
  };
  if (batch) batch.set(ref, data); else await setDoc(ref, data);
}

export const tsDate = (v) => (v && v.toDate ? v.toDate() : null);
// Legacy statuses ("new", "verifying") from the first release are shown as "pending".
export const normReq = (s) => (s === 'new' || s === 'verifying' ? 'pending' : s || 'pending');
export const REQ_STATUS = ['pending', 'coordinating', 'partial', 'fulfilled', 'closed'];
export const OPEN_REQ = ['pending', 'coordinating', 'partial', 'new', 'verifying'];
