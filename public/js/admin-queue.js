// Approval queues: donor applications, donation reports, blood requests (incl. manual entry).
import {
  db, collection, doc, getDoc, getDocs, writeBatch, query, orderBy, limit, where, serverTimestamp,
} from './firebase.js';
import { t, fmtDate } from './i18n.js';
import { h, field, downloadCsv } from './ui.js';
import { phoneKey, normalizeDigits, todayStr } from './availability.js';
import { refId } from './refid.js';
import { state, go, audit, tsDate, normReq, REQ_STATUS } from './admin-core.js';
import { projectDonor, addApprovedDonation } from './admin-donors.js';

const BG = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const root = () => document.getElementById('app');
const when = (v) => { const d = tsDate(v); return d ? d.toLocaleString(document.documentElement.lang || 'en') : ''; };

async function loadDonorIndex() {
  const snap = await getDocs(query(collection(db, 'donors'), limit(1000)));
  const byPhone = new Map();
  const donors = snap.docs.map((s) => ({ id: s.id, ...s.data() }));
  for (const d of donors) {
    const k = phoneKey(d.phone);
    if (!k) continue;
    if (!byPhone.has(k)) byPhone.set(k, []);
    byPhone.get(k).push(d);
  }
  return { donors, byPhone };
}

// ================= donor applications =================
export async function applications() {
  const [pendingSnap, recentSnap, idx] = await Promise.all([
    getDocs(query(collection(db, 'donorApplications'), where('status', '==', 'pending'), limit(100))),
    getDocs(query(collection(db, 'donorApplications'), orderBy('submittedAt', 'desc'), limit(30))),
    loadDonorIndex(),
  ]);
  const pending = pendingSnap.docs.map((s) => ({ id: s.id, ...s.data() }))
    .sort((a, b) => (tsDate(a.submittedAt) || 0) - (tsDate(b.submittedAt) || 0));
  const pendingKeys = new Map();
  pending.forEach((a) => { const k = phoneKey(a.phone); pendingKeys.set(k, (pendingKeys.get(k) || 0) + 1); });

  const cards = pending.map((a) => {
    const key = phoneKey(a.phone);
    const dupDonors = idx.byPhone.get(key) || [];
    const dupApps = (pendingKeys.get(key) || 1) - 1;
    const warns = [];
    if (dupDonors.length) warns.push(h('div', { class: 'warn-box' }, `${t('dup_donor')}: ${dupDonors.map((d) => d.legalName).join(', ')}`));
    if (dupApps) warns.push(h('div', { class: 'warn-box' }, t('dup_application')));
    const verify = a.lastDonationDate ? h('input', { type: 'checkbox', id: 'v' + a.id }) : null;
    const note = h('input', { id: 'n' + a.id, maxlength: '200', placeholder: t('admin_note') });
    const approve = h('button', { class: 'btn small', type: 'button' }, t('approve'));
    const reject = h('button', { class: 'btn secondary small', type: 'button' }, t('reject'));
    approve.addEventListener('click', async () => {
      approve.disabled = true;
      try { await approveApplication(a, verify ? verify.checked : false, note.value.trim()); go('/admin/applications'); }
      catch (e) { console.error(e); alert(t('save_failed')); approve.disabled = false; }
    });
    reject.addEventListener('click', async () => {
      if (!confirm(t('reject_confirm'))) return;
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'donorApplications', a.id), { status: 'rejected', adminNote: note.value.trim(), reviewedBy: state.me.uid, reviewedAt: serverTimestamp() });
        await audit(batch, 'application.reject', 'application', a.id, note.value.trim());
        await batch.commit();
        go('/admin/applications');
      } catch (e) { console.error(e); alert(t('save_failed')); }
    });
    return h('li', { class: 'card' },
      h('h3', {}, h('span', { class: 'group' }, a.bloodGroup), a.name),
      h('p', {}, `${t('display_name')}: ${a.displayName} • ${a.phone}`),
      h('p', {}, `${a.district}${a.area ? ' / ' + a.area : ''} • ${t('contact_pref')}: ${a.contactPref}`),
      h('p', {}, `${t('last_donation')}: ${a.lastDonationDate || '—'} (${t('unverified')})`),
      h('p', {}, h('span', { class: 'status ' + (a.publicConsent ? 'ok' : 'unk') }, t(a.publicConsent ? 'public_yes' : 'public_no')), ' ', h('span', { class: 'badge' }, `${a.ref} • ${when(a.submittedAt)}`)),
      ...warns,
      verify ? h('div', { class: 'check' }, verify, h('label', { for: 'v' + a.id }, t('verify_date'))) : null,
      h('p', { class: 'notice' }, t('verify_by_phone')),
      h('div', { class: 'inline-actions' }, note, approve, reject));
  });

  const recent = recentSnap.docs.map((s) => s.data()).filter((a) => a.status !== 'pending');
  root().replaceChildren(
    h('h1', {}, t('applications')),
    pending.length ? h('ul', { class: 'cards' }, cards) : h('p', {}, t('none_pending')),
    h('h2', {}, t('recent_decisions')),
    recent.length ? h('ul', {}, recent.map((a) => h('li', {}, `${a.ref} — ${a.name} — ${t('app_' + a.status)}`))) : h('p', {}, t('none')));
}

async function approveApplication(a, verified, note) {
  const donor = {
    legalName: a.name, displayName: a.displayName, phone: a.phone, area: a.area, district: a.district,
    bloodGroup: a.bloodGroup, status: 'available', publicConsent: a.publicConsent, contactPref: a.contactPref,
    lastDonationDate: verified ? a.lastDonationDate : '', activeStatus: true, privateNotes: '', applicationRef: a.ref,
    consentVersion: a.consentVersion,
  };
  const ref = doc(collection(db, 'donors'));
  const batch = writeBatch(db);
  batch.set(ref, { ...donor, consentAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  projectDonor(batch, ref.id, donor);
  batch.update(doc(db, 'donorApplications', a.id), { status: 'approved', donorId: ref.id, adminNote: note, reviewedBy: state.me.uid, reviewedAt: serverTimestamp() });
  await audit(batch, 'application.approve', 'application', a.id, `donor=${ref.id}`);
  await batch.commit();
}

// ================= donation reports =================
export async function reports() {
  const [snap, idx] = await Promise.all([
    getDocs(query(collection(db, 'donationReports'), where('status', '==', 'pending'), limit(100))),
    loadDonorIndex(),
  ]);
  const items = snap.docs.map((s) => ({ id: s.id, ...s.data() }));
  const cards = items.map((r) => {
    const matches = idx.byPhone.get(phoneKey(r.phone)) || [];
    const sel = h('select', { id: 'd' + r.id }, [
      h('option', { value: '' }, matches.length ? t('choose_donor') : t('no_match')),
      ...idx.donors.map((d) => h('option', { value: d.id, selected: matches.length === 1 && matches[0].id === d.id }, `${d.legalName} (${d.phone})`)),
    ]);
    const approve = h('button', { class: 'btn small', type: 'button' }, t('approve'));
    const reject = h('button', { class: 'btn secondary small', type: 'button' }, t('reject'));
    approve.addEventListener('click', async () => {
      const donor = idx.donors.find((d) => d.id === sel.value);
      if (!donor) { alert(t('choose_donor')); return; }
      approve.disabled = true;
      try {
        await addApprovedDonation(donor.id, donor, { donationDate: r.donationDate, recipientType: r.recipientType, recipientRef: r.recipientRef, notes: r.notes }, { reportId: r.id, reportedBy: 'donor' });
        go('/admin/reports');
      } catch (e) { console.error(e); alert(t('save_failed')); approve.disabled = false; }
    });
    reject.addEventListener('click', async () => {
      if (!confirm(t('reject_confirm'))) return;
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'donationReports', r.id), { status: 'rejected', reviewedBy: state.me.uid, reviewedAt: serverTimestamp() });
        await audit(batch, 'report.reject', 'report', r.id);
        await batch.commit();
        go('/admin/reports');
      } catch (e) { console.error(e); alert(t('save_failed')); }
    });
    return h('li', { class: 'card' },
      h('h3', {}, `${r.donationDate} — ${r.reporterName}`),
      h('p', {}, `${r.phone} • ${t('rt_' + r.recipientType)}${r.recipientRef ? ' — ' + r.recipientRef : ''}`),
      r.notes ? h('p', {}, r.notes) : null,
      h('p', {}, h('span', { class: 'badge' }, `${r.ref} • ${when(r.createdAt)}`)),
      matches.length > 1 ? h('div', { class: 'warn-box' }, t('multi_match')) : null,
      h('p', { class: 'notice' }, t('report_review_hint')),
      h('div', { class: 'inline-actions' }, sel, approve, reject));
  });
  root().replaceChildren(h('h1', {}, t('reports')), items.length ? h('ul', { class: 'cards' }, cards) : h('p', {}, t('none_pending')));
}

// ================= blood requests =================
async function setRequestStatus(r, status) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bloodRequests', r.id), { status, updatedAt: serverTimestamp() });
  const pubRef = doc(db, 'publicBloodRequests', r.id);
  const pub = await getDoc(pubRef);
  if (pub.exists()) batch.update(pubRef, { publicStatus: status });
  await audit(batch, 'request.status:' + status, 'request', r.id);
  await batch.commit();
}

export async function requests() {
  const snap = await getDocs(query(collection(db, 'bloodRequests'), orderBy('createdAt', 'desc'), limit(100)));
  const rows = snap.docs.map((s) => ({ id: s.id, ...s.data(), status: normReq(s.data().status) }));
  const msg = h('p', { role: 'status' });
  const f = {
    bloodGroup: h('select', { id: 'rg' }, BG.map((g) => h('option', { value: g }, g))),
    units: h('input', { id: 'ru', type: 'number', min: '1', max: '20', value: '1', required: true }),
    hospital: h('input', { id: 'rh', maxlength: '120' }),
    district: h('input', { id: 'rd', required: true, maxlength: '60' }),
    neededAt: h('input', { id: 'rt', type: 'datetime-local' }),
    urgency: h('select', { id: 'rurg' }, ['normal', 'urgent', 'critical'].map((u) => h('option', { value: u }, t('urg_' + u)))),
    contactName: h('input', { id: 'rn', required: true, maxlength: '100' }),
    phone: h('input', { id: 'rc', type: 'tel', required: true, maxlength: '20' }),
    note: h('input', { id: 'rno', maxlength: '300' }),
    show: h('input', { id: 'rshow', type: 'checkbox', checked: true }),
  };
  const form = h('form', { class: 'panel' }, h('h2', {}, t('manual_request')),
    h('div', { class: 'row' }, field('rn', t('contact_name'), f.contactName), field('rc', t('phone'), f.phone)),
    h('div', { class: 'row' }, field('rg', t('blood_group'), f.bloodGroup), field('ru', t('units_needed'), f.units)),
    h('div', { class: 'row' }, field('rh', t('hospital'), f.hospital, t('hospital_hint')), field('rd', t('district'), f.district)),
    h('div', { class: 'row' }, field('rt', t('required_at'), f.neededAt), field('rurg', t('urgency'), f.urgency)),
    field('rno', t('short_note'), f.note),
    h('div', { class: 'check' }, f.show, h('label', { for: 'rshow' }, t('show_public'))),
    h('p', { class: 'notice' }, t('no_forced_donation')),
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, t('save'))), msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = ''; msg.textContent = '';
    const phone = normalizeDigits(f.phone.value).trim();
    if (!/^[0-9+() -]{6,20}$/.test(phone)) { msg.className = 'error'; msg.textContent = t('phone_invalid'); return; }
    try {
      const id = refId('BR');
      const units = Math.max(1, Math.min(20, parseInt(f.units.value, 10) || 1));
      const batch = writeBatch(db);
      batch.set(doc(db, 'bloodRequests', id), {
        ref: id, contactName: f.contactName.value.trim(), phone, bloodGroup: f.bloodGroup.value, units, district: f.district.value.trim(),
        hospital: f.hospital.value.trim(), neededAt: f.neededAt.value || '', urgency: f.urgency.value, note: f.note.value.trim(),
        privacyConsent: true, pledge: false, status: 'pending', source: 'admin', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      if (f.show.checked) {
        batch.set(doc(db, 'publicBloodRequests', id), {
          ref: id, bloodGroup: f.bloodGroup.value, units, district: f.district.value.trim(),
          neededDate: (f.neededAt.value || '').slice(0, 10), urgency: f.urgency.value, publicStatus: 'pending', createdAt: serverTimestamp(),
        });
      }
      await audit(batch, 'request.create_manual', 'request', id);
      await batch.commit();
      go('/admin/requests');
    } catch (err) { console.error(err); msg.className = 'error'; msg.textContent = t('save_failed'); }
  });

  const list = h('ul', { class: 'cards' }, rows.map((r) => {
    const sel = h('select', { 'aria-label': t('status') }, REQ_STATUS.map((s) => h('option', { value: s, selected: r.status === s }, t('rs_' + s))));
    sel.addEventListener('change', async () => {
      try { await setRequestStatus(r, sel.value); } catch (err) { console.error(err); alert(t('save_failed')); }
    });
    const hide = h('button', { class: 'btn secondary small', type: 'button' }, t('hide_public'));
    hide.addEventListener('click', async () => {
      if (!confirm(t('hide_confirm'))) return;
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'publicBloodRequests', r.id));
        await audit(batch, 'request.hide_public', 'request', r.id);
        await batch.commit();
        hide.disabled = true;
      } catch (err) { console.error(err); alert(t('save_failed')); }
    });
    return h('li', { class: 'card' },
      h('h3', {}, h('span', { class: 'group' }, r.bloodGroup), `${r.units} ${t('units')} — ${r.district}`),
      h('p', {}, `${r.contactName} • ${r.phone}`),
      r.hospital ? h('p', {}, `${t('hospital')}: ${r.hospital}`) : null,
      h('p', {}, `${t('urg_' + (r.urgency || 'normal'))} • ${r.neededAt || ''}`),
      r.note ? h('p', {}, r.note) : null,
      h('p', {}, h('span', { class: 'badge' }, `${r.ref || r.id} • ${r.source || ''} • ${when(r.createdAt)}`), r.pledge ? h('span', { class: 'badge' }, t('pledged')) : null),
      h('div', { class: 'inline-actions' }, sel, hide));
  }));
  const cols = ['id', 'ref', 'contactName', 'phone', 'bloodGroup', 'units', 'hospital', 'district', 'neededAt', 'urgency', 'status', 'source'];
  root().replaceChildren(h('h1', {}, t('requests')), form,
    h('div', { class: 'actions' }, h('button', { class: 'btn secondary', onclick: async () => {
      if (!confirm(`${t('export_warn')}\n\n${cols.join(', ')}`)) return;
      downloadCsv('requests.csv', cols, rows);
      await audit(null, 'export.requests', 'requests', '');
    } }, t('export_csv'))),
    rows.length ? list : h('p', {}, t('none')));
}
