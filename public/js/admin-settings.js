import {
  db, auth, collection, doc, getDocs, setDoc, updateDoc, writeBatch, query, serverTimestamp, createAuthAccount,
} from './firebase.js';
import { t, LANGS } from './i18n.js';
import { h, field } from './ui.js';
import { state, audit, tsDate } from './admin-core.js';

const root = () => document.getElementById('app');

export async function settingsView() {
  const s = state.settings;
  const msg = h('p', { role: 'status' });
  const f = {
    organizationName: h('input', { id: 'sn', value: s.organizationName || '', required: true, maxlength: '80' }),
    slogan: h('input', { id: 'ss', value: s.slogan || '', maxlength: '120' }),
    logoUrl: h('input', { id: 'sl', type: 'url', value: s.logoUrl || '', placeholder: 'https://…' }),
    iconUrl: h('input', { id: 'si2', type: 'url', value: s.iconUrl || '', placeholder: 'https://…' }),
    coordinatorPhone: h('input', { id: 'scp', type: 'tel', value: s.coordinatorPhone || '', maxlength: '30' }),
    messengerUrl: h('input', { id: 'smu', type: 'url', value: s.messengerUrl || '', placeholder: 'https://m.me/…' }),
    whatsappUrl: h('input', { id: 'swu', type: 'url', value: s.whatsappUrl || '', placeholder: 'https://wa.me/8801XXXXXXXXX' }),
    pledgeText: h('textarea', { id: 'spl', maxlength: '600' }, s.pledgeText || ''),
    defaultLanguage: h('select', { id: 'sdl' }, Object.entries(LANGS).map(([c, n]) => h('option', { value: c, selected: (s.defaultLanguage || 'en') === c }, n))),
    donationIntervalMonths: h('input', { id: 'si', type: 'number', min: '1', max: '24', value: s.donationIntervalMonths || 4 }),
    publicPolicy: h('textarea', { id: 'sp', maxlength: '4000' }, s.publicPolicy || ''),
    contactInfo: h('textarea', { id: 'sc', maxlength: '500' }, s.contactInfo || ''),
  };
  const enabled = s.enabledLanguages || ['en', 'bn'];
  const langBoxes = Object.entries(LANGS).map(([c, n]) => h('div', { class: 'check' },
    h('input', { type: 'checkbox', id: 'el_' + c, value: c, checked: enabled.includes(c) }), h('label', { for: 'el_' + c }, n)));
  const form = h('form', { class: 'panel' },
    h('h2', {}, t('settings_org')),
    field('sn', t('org_name'), f.organizationName), field('ss', t('slogan'), f.slogan),
    field('sl', t('logo_url'), f.logoUrl, t('logo_hint')),
    field('si2', t('icon_url'), f.iconUrl, t('icon_hint')),
    h('h2', {}, t('settings_contact')),
    h('p', { class: 'notice' }, t('contact_settings_hint')),
    field('scp', t('coordinator_phone'), f.coordinatorPhone),
    field('smu', t('messenger_url'), f.messengerUrl, t('url_https_hint')),
    field('swu', t('whatsapp_url'), f.whatsappUrl, t('whatsapp_hint')),
    field('sc', t('contact_info'), f.contactInfo, t('contact_hint')),
    h('h2', {}, t('settings_policy')),
    field('spl', t('pledge_text'), f.pledgeText, t('pledge_hint')),
    field('sp', t('public_policy'), f.publicPolicy, t('policy_hint')),
    field('si', t('interval_months'), f.donationIntervalMonths, t('interval_hint')),
    h('h2', {}, t('settings_lang')),
    h('p', {}, h('b', {}, t('enabled_languages'))), langBoxes,
    field('sdl', t('default_language'), f.defaultLanguage),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, t('save'))), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';
    const langs = langBoxes.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    const urls = { logoUrl: f.logoUrl.value.trim(), iconUrl: f.iconUrl.value.trim(), messengerUrl: f.messengerUrl.value.trim(), whatsappUrl: f.whatsappUrl.value.trim() };
    for (const v of Object.values(urls)) {
      if (v && !/^https:\/\/[^\s]+$/.test(v)) { msg.className = 'error'; msg.textContent = t('url_https_hint'); return; }
    }
    if (!langs.length || !langs.includes(f.defaultLanguage.value)) { msg.className = 'error'; msg.textContent = t('lang_invalid'); return; }
    const data = {
      organizationName: f.organizationName.value.trim(), slogan: f.slogan.value.trim(), ...urls,
      coordinatorPhone: f.coordinatorPhone.value.trim(), pledgeText: f.pledgeText.value.trim(),
      defaultLanguage: f.defaultLanguage.value, enabledLanguages: langs,
      donationIntervalMonths: Number(f.donationIntervalMonths.value) || 4,
      publicPolicy: f.publicPolicy.value.trim(), contactInfo: f.contactInfo.value.trim(), updatedAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'organization', 'public'), data);
      await audit(batch, 'settings.update', 'settings', 'public');
      await batch.commit();
      state.settings = { ...state.settings, ...data };
      msg.className = 'msg-ok'; msg.textContent = t('saved');
    } catch (err) { console.error(err); msg.className = 'error'; msg.textContent = t('save_failed'); }
  });
  root().replaceChildren(h('h1', {}, t('settings')), form);
}

// ---------------- Add New Admin ----------------
export async function adminsView() {
  const snap = await getDocs(query(collection(db, 'users')));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === 'admin');
  const list = h('ul', { class: 'cards' }, users.map((u) => {
    const self = u.id === auth.currentUser.uid;
    const btn = self ? null : h('button', { class: 'btn secondary small', type: 'button' }, t(u.active ? 'deactivate' : 'activate'));
    if (btn) btn.addEventListener('click', async () => {
      if (!confirm(t(u.active ? 'deactivate_confirm' : 'activate_confirm'))) return;
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'users', u.id), { active: !u.active });
        await audit(batch, u.active ? 'admin.deactivate' : 'admin.activate', 'admin', u.id);
        await batch.commit();
        adminsView();
      } catch (e) { console.error(e); alert(t('save_failed')); }
    });
    return h('li', { class: 'card' }, h('h3', {}, u.displayName || u.email || u.id),
      h('p', {}, u.email || '—'),
      h('p', {}, h('span', { class: 'status ' + (u.active ? 'ok' : 'no') }, t(u.active ? 'active' : 'inactive')), self ? h('span', { class: 'badge' }, t('you')) : null), btn);
  }));

  const msg = h('p', { role: 'status' });
  const name = h('input', { id: 'an', required: true, maxlength: '80' });
  const email = h('input', { id: 'ae', type: 'email', required: true, maxlength: '120', autocomplete: 'off' });
  const pw = h('input', { id: 'ap', type: 'password', required: true, minlength: '12', autocomplete: 'new-password' });
  const pw2 = h('input', { id: 'ap2', type: 'password', required: true, minlength: '12', autocomplete: 'new-password' });
  const btn = h('button', { class: 'btn', type: 'submit' }, t('add_admin'));
  const form = h('form', { class: 'panel' }, h('h2', {}, t('add_admin')), h('p', { class: 'notice' }, t('add_admin_hint')),
    field('an', t('display_name'), name), field('ae', t('email'), email),
    field('ap', t('password'), pw, t('password_hint')), field('ap2', t('password_again'), pw2),
    h('div', { class: 'actions' }, btn), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'error'; msg.textContent = '';
    if (pw.value !== pw2.value) { msg.textContent = t('password_mismatch'); return; }
    btn.disabled = true;
    try {
      const uid = await createAuthAccount(email.value.trim(), pw.value);
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        role: 'admin', displayName: name.value.trim(), active: true, createdAt: serverTimestamp(),
        email: email.value.trim(), createdBy: auth.currentUser.uid,
      });
      await audit(batch, 'admin.add', 'admin', uid, email.value.trim());
      await batch.commit();
      adminsView();
    } catch (err) {
      console.error(err);
      msg.textContent = err?.code === 'auth/email-already-in-use' ? t('email_in_use')
        : err?.code === 'auth/weak-password' ? t('password_hint') : t('save_failed');
      btn.disabled = false;
    }
  });
  root().replaceChildren(h('h1', {}, t('admins')), list, form, h('p', { class: 'notice' }, t('recovery_hint')));
}
