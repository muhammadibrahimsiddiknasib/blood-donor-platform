import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, query, orderBy, limit, where, serverTimestamp,
} from './firebase.js';
import { t, fmtDate } from './i18n.js';
import { h, field, downloadCsv } from './ui.js';
import { publicProjection, computeNextEligible, publicStatus, remaining, DONOR_STATUSES, todayStr } from './availability.js';
import { consentVersion } from './site-config.js';
import { state, go, link, audit } from './admin-core.js';
import { remainingText } from './i18n.js';

const BG = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const root = () => document.getElementById('app');

// Write (or remove) the public-safe projection inside the same batch as the private change.
export function projectDonor(batch, id, donor) {
  const proj = publicProjection(donor, state.settings.donationIntervalMonths, consentVersion);
  const ref = doc(db, 'publicDonors', id);
  if (proj) batch.set(ref, { ...proj, lastUpdated: serverTimestamp() });
  else batch.delete(ref);
}

export function donorBadges(d) {
  const nextEligible = computeNextEligible(d.lastDonationDate, state.settings.donationIntervalMonths);
  const st = d.status === 'unavailable' ? { key: 'status_unavailable', cls: 'no' }
    : publicStatus({ availabilityLabel: 'dated', availableFrom: nextEligible });
  const items = [h('span', { class: 'badge' }, t('ds_' + (d.status || 'pending')))];
  if (['available', 'recovery', 'unavailable'].includes(d.status)) {
    const s = h('span', { class: 'status ' + st.cls }, t(st.key));
    items.push(' ', s);
    if (st.remaining) items.push(' ', h('span', { class: 'remaining' }, remainingText(st.remaining)));
  }
  items.push(' ', h('span', { class: 'status ' + (d.publicConsent ? 'ok' : 'unk') }, t(d.publicConsent ? 'public_yes' : 'public_no')));
  return h('p', {}, items);
}

// ---------------- list ----------------
export async function donorList() {
  const snap = await getDocs(query(collection(db, 'donors'), orderBy('updatedAt', 'desc'), limit(500)));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const list = h('ul', { class: 'cards' });
  const q = h('input', { id: 'q', type: 'search', placeholder: t('search_donors') });
  const filter = h('select', { id: 'sf' }, [h('option', { value: '' }, t('all_statuses')), ...DONOR_STATUSES.map((s) => h('option', { value: s }, t('ds_' + s)))]);
  const render = () => {
    const s = q.value.trim().toLowerCase();
    const rows = all.filter((d) => (!filter.value || (d.status || 'pending') === filter.value)
      && (!s || [d.legalName, d.displayName, d.bloodGroup, d.district, d.area, d.phone].some((v) => String(v || '').toLowerCase().includes(s))));
    list.replaceChildren(...rows.map((d) => h('li', { class: 'card' },
      h('h3', {}, h('span', { class: 'group' }, d.bloodGroup), link('/admin/donors/' + d.id, d.legalName || d.displayName)),
      h('p', {}, `${d.district || ''} • ${d.phone || ''}`), donorBadges(d))));
    if (!rows.length) list.replaceChildren(h('li', {}, t('no_results')));
  };
  q.addEventListener('input', render);
  filter.addEventListener('change', render);
  render();
  const cols = ['id', 'legalName', 'displayName', 'phone', 'area', 'district', 'bloodGroup', 'status', 'publicConsent', 'activeStatus', 'lastDonationDate'];
  root().replaceChildren(
    h('h1', {}, t('donors')),
    h('div', { class: 'actions' }, link('/admin/donors/new', t('add_donor'), 'btn'),
      h('button', { class: 'btn secondary', onclick: async () => {
        if (!confirm(`${t('export_warn')}\n\n${cols.join(', ')}`)) return;
        downloadCsv('donors.csv', cols, all);
        await audit(null, 'export.donors', 'donors', '');
      } }, t('export_csv'))),
    h('div', { class: 'row' }, field('q', t('search'), q), field('sf', t('status'), filter)), list);
}

// ---------------- create / edit ----------------
async function saveDonor(id, data, existing) {
  const isNew = !id;
  const ref = isNew ? doc(collection(db, 'donors')) : doc(db, 'donors', id);
  const rec = { ...data, activeStatus: data.status !== 'hidden', updatedAt: serverTimestamp() };
  if (isNew) rec.createdAt = serverTimestamp();
  if (data.publicConsent && (isNew || !existing.publicConsent)) { rec.consentAt = serverTimestamp(); rec.consentVersion = consentVersion; }
  if (!data.publicConsent && existing?.publicConsent) rec.consentWithdrawnAt = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(ref, rec, { merge: true });
  projectDonor(batch, ref.id, { ...rec, consentVersion: rec.consentVersion || existing?.consentVersion });
  await audit(batch, isNew ? 'donor.create' : 'donor.update', 'donor', ref.id);
  await batch.commit();
  return ref.id;
}

export async function donorEdit(id) {
  let d = { bloodGroup: 'O+', status: 'available', publicConsent: false };
  if (id) {
    const s = await getDoc(doc(db, 'donors', id));
    if (!s.exists()) return root().replaceChildren(h('p', {}, t('not_found')));
    d = { id, ...s.data() };
  }
  const msg = h('p', { role: 'status' });
  const f = {};
  const input = (key, attrs = {}) => (f[key] = h('input', { id: key, value: d[key] ?? '', ...attrs }));
  f.bloodGroup = h('select', { id: 'bloodGroup' }, BG.map((g) => h('option', { value: g, selected: d.bloodGroup === g }, g)));
  f.status = h('select', { id: 'status' }, DONOR_STATUSES.map((s) => h('option', { value: s, selected: (d.status || 'pending') === s }, t('ds_' + s))));
  f.publicConsent = h('input', { id: 'publicConsent', type: 'checkbox', checked: d.publicConsent });
  f.privateNotes = h('textarea', { id: 'privateNotes', maxlength: '500' }, d.privateNotes || '');
  const form = h('form', { class: 'panel' },
    h('div', { class: 'row' },
      field('legalName', t('legal_name'), input('legalName', { required: true, maxlength: '100' })),
      field('displayName', t('display_name'), input('displayName', { required: true, maxlength: '60' }), t('display_name_hint'))),
    h('div', { class: 'row' },
      field('phone', t('phone'), input('phone', { type: 'tel', required: true, maxlength: '30' })),
      field('bloodGroup', t('blood_group'), f.bloodGroup)),
    h('div', { class: 'row' },
      field('district', t('district'), input('district', { required: true, maxlength: '60' })),
      field('area', t('area'), input('area', { maxlength: '120' }))),
    field('status', t('status'), f.status, t('status_hint')),
    field('lastDonationDate', t('last_donation_verified'), input('lastDonationDate', { type: 'date', max: todayStr() }), t('last_donation_hint')),
    h('div', { class: 'panel' }, h('p', {}, t('consent_text')),
      h('div', { class: 'check' }, f.publicConsent, h('label', { for: 'publicConsent' }, t('consent_label')))),
    field('privateNotes', t('private_notes'), f.privateNotes, t('private_notes_hint')),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, t('save')), link('/admin/donors', t('cancel'), 'btn secondary')), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';
    const data = {
      legalName: f.legalName.value.trim(), displayName: f.displayName.value.trim(), phone: f.phone.value.trim(),
      area: f.area.value.trim(), district: f.district.value.trim(), bloodGroup: f.bloodGroup.value, status: f.status.value,
      lastDonationDate: f.lastDonationDate.value || '', publicConsent: f.publicConsent.checked, privateNotes: f.privateNotes.value.trim(),
    };
    try {
      const newId = await saveDonor(id, data, d);
      msg.className = 'msg-ok'; msg.textContent = t('saved');
      if (!id) go('/admin/donors/' + newId);
    } catch (err) { console.error(err); msg.className = 'error'; msg.textContent = t('save_failed'); }
  });

  const kids = [h('h1', {}, id ? (d.legalName || '') : t('add_donor')), form];
  if (id) {
    kids.push(await donationSection(id, d), dangerZone(id, d));
  }
  root().replaceChildren(...kids);
}

// ---------------- archive / permanent delete ----------------
function dangerZone(id, d) {
  const archive = h('button', { class: 'btn secondary', type: 'button', disabled: d.status === 'hidden' }, t('archive_donor'));
  archive.addEventListener('click', async () => {
    if (!confirm(t('archive_confirm'))) return;
    try { await saveDonor(id, { ...stripId(d), status: 'hidden' }, d); go('/admin/donors'); }
    catch (e) { console.error(e); alert(t('save_failed')); }
  });
  const kids = [h('h2', {}, t('danger_zone')), h('p', { class: 'notice' }, t('archive_hint')), h('div', { class: 'actions' }, archive)];
  if (d.status === 'hidden') {
    const del = h('button', { class: 'btn danger', type: 'button' }, t('delete_permanently'));
    del.addEventListener('click', async () => {
      const typed = prompt(t('delete_type_confirm', { name: d.legalName }));
      if (typed == null || typed.trim() !== d.legalName) return;
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'donors', id));
        batch.delete(doc(db, 'publicDonors', id));
        await audit(batch, 'donor.delete', 'donor', id, 'permanent');
        await batch.commit();
        go('/admin/donors');
      } catch (e) { console.error(e); alert(t('save_failed')); }
    });
    kids.push(h('p', { class: 'notice' }, t('delete_hint')), h('div', { class: 'actions' }, del));
  }
  return h('section', {}, kids);
}
const stripId = (d) => { const { id, ...rest } = d; return rest; };

// ---------------- donations ----------------
export async function addApprovedDonation(donorId, donor, data, { reportId, reportedBy }) {
  const batch = writeBatch(db);
  const dref = doc(collection(db, 'donations'));
  batch.set(dref, {
    donorId, donationDate: data.donationDate, recipientType: data.recipientType, recipientRef: data.recipientRef || '',
    notes: data.notes || '', reportedBy, approvalStatus: 'approved', approvedBy: state.me.uid,
    approvedAt: serverTimestamp(), createdAt: serverTimestamp(),
  });
  const newLast = !donor.lastDonationDate || data.donationDate > donor.lastDonationDate ? data.donationDate : donor.lastDonationDate;
  batch.update(doc(db, 'donors', donorId), { lastDonationDate: newLast, updatedAt: serverTimestamp() });
  projectDonor(batch, donorId, { ...donor, lastDonationDate: newLast });
  if (reportId) {
    batch.update(doc(db, 'donationReports', reportId), {
      status: 'approved', donorId, donationId: dref.id, reviewedBy: state.me.uid, reviewedAt: serverTimestamp(),
    });
  }
  await audit(batch, reportId ? 'donation.approve_report' : 'donation.add', 'donation', dref.id);
  await batch.commit();
}

async function reverseDonation(donation, donor, reason) {
  const snap = await getDocs(query(collection(db, 'donations'), where('donorId', '==', donation.donorId), orderBy('donationDate', 'desc'), limit(50)));
  const others = snap.docs.filter((x) => x.id !== donation.id && x.data().approvalStatus === 'approved');
  const newLast = others.length ? others[0].data().donationDate : '';
  const batch = writeBatch(db);
  batch.update(doc(db, 'donations', donation.id), {
    approvalStatus: 'reversed', reversedReason: reason.slice(0, 300), reversedBy: state.me.uid, reversedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'donors', donation.donorId), { lastDonationDate: newLast, updatedAt: serverTimestamp() });
  projectDonor(batch, donation.donorId, { ...donor, lastDonationDate: newLast });
  await audit(batch, 'donation.reverse', 'donation', donation.id, reason);
  await batch.commit();
}

async function donationSection(donorId, donor) {
  const snap = await getDocs(query(collection(db, 'donations'), where('donorId', '==', donorId), orderBy('donationDate', 'desc'), limit(50)));
  const items = snap.docs.map((s) => ({ id: s.id, ...s.data() }));
  const list = h('ul', { class: 'cards' }, items.map((x) => {
    const rev = x.approvalStatus === 'reversed';
    const btn = rev ? null : h('button', { class: 'btn secondary small', type: 'button' }, t('reverse'));
    if (btn) btn.addEventListener('click', async () => {
      const reason = prompt(t('reverse_reason'));
      if (!reason) return;
      try { await reverseDonation(x, donor, reason); go('/admin/donors/' + donorId); } catch (e) { console.error(e); alert(t('save_failed')); }
    });
    return h('li', { class: 'card' },
      h('h3', {}, x.donationDate), h('p', {}, `${t('rt_' + x.recipientType)}${x.recipientRef ? ' — ' + x.recipientRef : ''}`),
      x.notes ? h('p', {}, x.notes) : null,
      h('p', {}, h('span', { class: 'status ' + (rev ? 'no' : 'ok') }, t(rev ? 'reversed' : 'approved')), ' ', h('span', { class: 'badge' }, t('src_' + (x.reportedBy || 'admin')))),
      rev ? h('p', { class: 'notice' }, x.reversedReason) : btn);
  }));
  const msg = h('p', { role: 'status' });
  const date = h('input', { id: 'dDate', type: 'date', required: true, max: todayStr() });
  const type = h('select', { id: 'dType' }, ['person', 'hospital', 'organization', 'other'].map((v) => h('option', { value: v }, t('rt_' + v))));
  const ref = h('input', { id: 'dRef', maxlength: '120' });
  const note = h('input', { id: 'dNote', maxlength: '300' });
  const form = h('form', { class: 'panel' }, h('h3', {}, t('add_donation')),
    h('div', { class: 'row' }, field('dDate', t('donation_date'), date), field('dType', t('recipient_type'), type)),
    field('dRef', t('recipient_ref'), ref, t('recipient_ref_hint')), field('dNote', t('note'), note, t('donation_note_hint')),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, t('add_donation'))), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await addApprovedDonation(donorId, donor, { donationDate: date.value, recipientType: type.value, recipientRef: ref.value.trim(), notes: note.value.trim() }, { reportedBy: 'admin' });
      go('/admin/donors/' + donorId);
    } catch (err) { console.error(err); msg.className = 'error'; msg.textContent = t('save_failed'); }
  });
  return h('section', {}, h('h2', {}, t('donation_history')), items.length ? list : h('p', {}, t('none')), form);
}
