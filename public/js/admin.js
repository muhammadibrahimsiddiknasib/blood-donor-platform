import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, collection, doc, getDoc, query, where, getCountFromServer,
  getDocs, orderBy, limit,
} from './firebase.js';
import { initI18n, t, fmtDate, fmtNum } from './i18n.js';
import { h, field } from './ui.js';
import { renderSignature } from './signature.js';
import { state, hooks, link, tsDate, OPEN_REQ } from './admin-core.js';
import { donorList, donorEdit } from './admin-donors.js';
import { applications, reports, requests } from './admin-queue.js';
import { settingsView, adminsView } from './admin-settings.js';

const root = document.getElementById('app');
const nav = document.getElementById('nav');
hooks.route = () => route();

// ---------- auth gate ----------
onAuthStateChanged(auth, async (u) => {
  if (!u) {
    state.me = null;
    nav.replaceChildren();
    await initI18n();
    return renderLogin();
  }
  try {
    const s = await getDoc(doc(db, 'users', u.uid));
    if (!s.exists() || s.data().role !== 'admin' || s.data().active !== true) {
      state.me = null;
      await initI18n();
      return renderDenied();
    }
    state.me = u;
    const o = await getDoc(doc(db, 'organization', 'public'));
    if (o.exists()) state.settings = { ...state.settings, ...o.data() };
    await initI18n(state.settings.enabledLanguages, state.settings.defaultLanguage);
    renderSignature(document.getElementById('signature'), { admin: true });
    route();
  } catch (e) {
    renderError(e);
  }
});
window.addEventListener('popstate', () => state.me && route());

async function renderLogin() {
  const msg = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { class: 'panel' },
    field('email', t('email'), h('input', { id: 'email', type: 'email', required: true, autocomplete: 'username' })),
    field('pw', t('password'), h('input', { id: 'pw', type: 'password', required: true, autocomplete: 'current-password' })),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, t('sign_in'))), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    try { await signInWithEmailAndPassword(auth, form.email.value.trim(), form.pw.value); }
    catch { msg.textContent = t('login_failed'); }
  });
  const kids = [h('h1', {}, t('login_admin')), form, h('p', {}, h('a', { href: '/' }, t('back_home')))];
  root.replaceChildren(...kids);
  // Only a brand-new project (no first admin yet) is pointed to setup; otherwise nothing is announced.
  try {
    const st = await getDoc(doc(db, 'setup', 'state'));
    if (!st.exists()) root.append(h('p', { class: 'notice' }, h('a', { href: '/setup' }, t('first_time_setup'))));
  } catch { /* ignore */ }
}

function renderDenied() {
  root.replaceChildren(h('h1', {}, t('no_access')), h('p', {}, t('no_access_body')),
    h('button', { class: 'btn secondary', onclick: () => signOut(auth) }, t('sign_out')));
}

function renderError(e) {
  console.error(e);
  root.replaceChildren(h('p', { class: 'error', role: 'alert' }, t('error_load')),
    h('button', { class: 'btn secondary', onclick: () => route() }, t('retry')));
}

function renderNav() {
  const p = location.pathname.replace(/\/+$/, '') || '/admin';
  const item = (path, key) => {
    const a = link(path, t(key));
    if (p === path || (path !== '/admin' && p.startsWith(path))) a.setAttribute('aria-current', 'page');
    return a;
  };
  nav.replaceChildren(item('/admin', 'dashboard'), item('/admin/applications', 'applications'), item('/admin/requests', 'requests'),
    item('/admin/reports', 'reports'), item('/admin/donors', 'donors'), item('/admin/settings', 'settings'), item('/admin/admins', 'admins'),
    h('a', { href: '/' }, t('public_site')),
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); signOut(auth); } }, t('sign_out')));
}

async function route() {
  renderNav();
  const p = location.pathname.replace(/\/+$/, '') || '/admin';
  root.replaceChildren(h('p', {}, t('loading')));
  try {
    if (p === '/admin') return await dashboard();
    if (p === '/admin/applications') return await applications();
    if (p === '/admin/requests') return await requests();
    if (p === '/admin/reports') return await reports();
    if (p === '/admin/donors') return await donorList();
    if (p === '/admin/donors/new') return await donorEdit(null);
    const m = p.match(/^\/admin\/donors\/([^/]+)$/);
    if (m) return await donorEdit(m[1]);
    if (p === '/admin/settings') return await settingsView();
    if (p === '/admin/admins') return await adminsView();
    root.replaceChildren(h('p', {}, t('not_found')));
  } catch (e) { renderError(e); }
}

async function dashboard() {
  const count = async (q) => (await getCountFromServer(q)).data().count;
  const [active, pub, apps, open, reps] = await Promise.all([
    count(query(collection(db, 'donors'), where('activeStatus', '==', true))),
    count(collection(db, 'publicDonors')),
    count(query(collection(db, 'donorApplications'), where('status', '==', 'pending'))),
    count(query(collection(db, 'bloodRequests'), where('status', 'in', OPEN_REQ))),
    count(query(collection(db, 'donationReports'), where('status', '==', 'pending'))),
  ]);
  const stat = (n, key, path) => h('div', { class: 'stat' }, h('b', {}, fmtNum(n)), path ? link(path, t(key)) : t(key));
  const recent = await getDocs(query(collection(db, 'auditEvents'), orderBy('timestamp', 'desc'), limit(10)));
  root.replaceChildren(
    h('h1', {}, t('dashboard')),
    h('div', { class: 'stats' },
      stat(apps, 'pending_applications', '/admin/applications'), stat(open, 'open_requests', '/admin/requests'),
      stat(reps, 'pending_reports', '/admin/reports'), stat(active, 'active_donors', '/admin/donors'), stat(pub, 'public_profiles')),
    h('h2', {}, t('recent_activity')),
    recent.empty ? h('p', {}, t('none')) : h('ul', {}, recent.docs.map((d) => {
      const e = d.data();
      return h('li', {}, `${fmtDate(tsDate(e.timestamp))} — ${e.action} ${e.targetType || ''}`);
    })),
    h('p', { class: 'notice' }, t('medical_notice')));
}
