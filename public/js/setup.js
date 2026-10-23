import {
  db, auth, createUserWithEmailAndPassword, doc, getDoc, setDoc, writeBatch, serverTimestamp,
} from './firebase.js';
import { initI18n, t } from './i18n.js';
import { h, field } from './ui.js';

const root = document.getElementById('app');

async function boot() {
  await initI18n();
  try {
    const s = await getDoc(doc(db, 'setup', 'state'));
    if (s.exists()) { location.replace('/admin'); return; }
  } catch {
    root.replaceChildren(h('p', { class: 'error', role: 'alert' }, t('error_load')),
      h('p', { class: 'notice' }, t('setup_config_hint')));
    return;
  }
  renderForm();
}

function renderForm() {
  const msg = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, t('setup_create'));
  const form = h('form', { class: 'panel' },
    field('org', t('org_name'), h('input', { id: 'org', required: true, maxlength: '80' })),
    field('email', t('email'), h('input', { id: 'email', type: 'email', required: true, autocomplete: 'username' })),
    field('pw', t('password'), h('input', { id: 'pw', type: 'password', required: true, minlength: '12', autocomplete: 'new-password' }), t('password_hint')),
    h('div', { class: 'actions' }, btn), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    btn.disabled = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.value.trim(), form.pw.value);
      const uid = cred.user.uid;
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), { role: 'admin', displayName: 'Admin', active: true, createdAt: serverTimestamp() });
      batch.set(doc(db, 'setup', 'state'), { completed: true, adminUid: uid, createdAt: serverTimestamp() });
      await batch.commit();
      await setDoc(doc(db, 'organization', 'public'), {
        organizationName: form.org.value.trim(), defaultLanguage: 'en', enabledLanguages: ['en', 'bn'],
        donationIntervalMonths: 4, slogan: '', logoUrl: '', publicPolicy: '', contactInfo: '', updatedAt: serverTimestamp(),
      });
      location.href = '/admin';
    } catch (err) {
      msg.textContent = err?.code === 'permission-denied' ? t('setup_closed') : t('setup_failed');
      btn.disabled = false;
    }
  });
  root.replaceChildren(
    h('h1', {}, t('setup_title')),
    h('p', { class: 'notice' }, t('setup_intro')),
    form);
}

boot();
