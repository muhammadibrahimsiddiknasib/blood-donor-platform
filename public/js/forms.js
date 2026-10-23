// Public forms: donor application, blood request, donation report. No OTP; admin moderation follows.
import { createDocuments } from './rest.js';
import { t, fmtDate } from './i18n.js';
import { h, field } from './ui.js';
import { refId } from './refid.js';
import { normalizeDigits } from './availability.js';
import { consentVersion } from './site-config.js';
import { contactBlock } from './contact.js';

const BG = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const PHONE_RE = /^[0-9+() -]{6,20}$/;
const COOLDOWN_MS = 30000;

function cooldownLeft() {
  try {
    const last = Number(localStorage.getItem('lastSubmit') || 0);
    return Math.max(0, COOLDOWN_MS - (Date.now() - last));
  } catch { return 0; }
}
function markSubmitted() { try { localStorage.setItem('lastSubmit', String(Date.now())); } catch { /* ignore */ } }

const groupSelect = (id) => h('select', { id, required: true }, [h('option', { value: '' }, t('choose')), ...BG.map((g) => h('option', { value: g }, g))]);
const check = (id, label, required) => h('div', { class: 'check' }, h('input', { type: 'checkbox', id, required }), h('label', { for: id }, label));
const honeypot = () => h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', { for: 'website' }, 'Website'), h('input', { id: 'website', name: 'website', tabindex: '-1', autocomplete: 'off' }));

// Shared submit wrapper: honeypot, cooldown, phone check, error/ok handling.
function wire(form, msg, btn, build, onDone) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'error'; msg.textContent = '';
    if (form.website && form.website.value) return; // bot
    const left = cooldownLeft();
    if (left) { msg.textContent = t('wait_seconds', { n: Math.ceil(left / 1000) }); return; }
    const phone = normalizeDigits(form.phone.value).trim();
    if (!PHONE_RE.test(phone)) { msg.textContent = t('phone_invalid'); return; }
    btn.disabled = true;
    try {
      const result = build(phone);
      await createDocuments(result.docs);
      markSubmitted();
      onDone(result);
    } catch (err) {
      console.error(err);
      msg.textContent = t('submit_failed');
      btn.disabled = false;
    }
  });
}

function doneView(title, ref, lines, org, contactNote) {
  return [
    h('h1', {}, title),
    h('div', { class: 'panel' },
      h('p', {}, t('your_reference')),
      h('p', { class: 'refid' }, ref),
      h('p', { class: 'notice' }, t('keep_reference'))),
    ...lines.map((l) => h('p', {}, l)),
    contactNote ? h('h2', {}, t('confirm_with_coordinator')) : null,
    contactNote ? contactBlock(org, { message: t('wa_msg_ref', { ref }) }) : null,
    h('div', { class: 'actions' }, h('a', { class: 'btn secondary', href: '#donors' }, t('back_home'))),
  ];
}

export function donorForm(root, org, show) {
  const msg = h('p', { role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, t('submit'));
  const form = h('form', { class: 'panel', novalidate: false },
    field('name', t('full_name'), h('input', { id: 'name', required: true, minlength: '2', maxlength: '100', autocomplete: 'name' }), t('full_name_hint')),
    field('displayName', t('display_name'), h('input', { id: 'displayName', required: true, maxlength: '60' }), t('display_name_hint')),
    h('div', { class: 'row' },
      field('phone', t('phone'), h('input', { id: 'phone', type: 'tel', required: true, maxlength: '20', autocomplete: 'tel', inputmode: 'tel' })),
      field('bloodGroup', t('blood_group'), groupSelect('bloodGroup'))),
    h('div', { class: 'row' },
      field('district', t('district'), h('input', { id: 'district', required: true, maxlength: '60' })),
      field('area', t('area'), h('input', { id: 'area', maxlength: '120' }))),
    field('lastDonationDate', t('last_donation'), h('input', { id: 'lastDonationDate', type: 'date', max: new Date().toISOString().slice(0, 10) }), t('last_donation_unverified')),
    field('contactPref', t('contact_pref'), h('select', { id: 'contactPref' }, [['phone', t('pref_phone')], ['messenger', 'Messenger'], ['whatsapp', 'WhatsApp']].map(([v, l]) => h('option', { value: v }, l)))),
    h('div', { class: 'panel' }, h('p', {}, t('public_consent_text')), check('publicConsent', t('public_consent_label'), false)),
    check('privacyConsent', t('privacy_consent_label'), true),
    honeypot(),
    h('div', { class: 'actions' }, btn, h('a', { class: 'btn secondary', href: '#donors' }, t('cancel'))), msg);
  wire(form, msg, btn, (phone) => {
    const id = refId('DA');
    return { id, docs: [{ path: 'donorApplications/' + id, timeField: 'submittedAt', data: {
      ref: id, name: form.name.value.trim(), displayName: form.displayName.value.trim(), phone,
      bloodGroup: form.bloodGroup.value, district: form.district.value.trim(), area: form.area.value.trim(),
      lastDonationDate: form.lastDonationDate.value || '', contactPref: form.contactPref.value,
      publicConsent: form.publicConsent.checked, privacyConsent: true, consentVersion, status: 'pending',
    } }] };
  }, (r) => root.replaceChildren(...doneView(t('donor_done_title'), r.id, [t('donor_done_body')], org, true)));
  root.replaceChildren(h('h1', {}, t('join_donor')), h('p', { class: 'notice' }, t('donor_intro')), form);
}

export function requestForm(root, org, show) {
  const msg = h('p', { role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, t('submit'));
  const pledgeText = (org?.pledgeText || '').trim() || t('pledge_default');
  const form = h('form', { class: 'panel' },
    h('div', { class: 'row' },
      field('contactName', t('contact_name'), h('input', { id: 'contactName', required: true, minlength: '2', maxlength: '100' })),
      field('phone', t('phone'), h('input', { id: 'phone', type: 'tel', required: true, maxlength: '20', inputmode: 'tel' }), t('requester_hint'))),
    h('div', { class: 'row' },
      field('bloodGroup', t('blood_group'), groupSelect('bloodGroup')),
      field('units', t('units_needed'), h('input', { id: 'units', type: 'number', min: '1', max: '20', value: '1', required: true }))),
    h('div', { class: 'row' },
      field('district', t('district'), h('input', { id: 'district', required: true, maxlength: '60' })),
      field('hospital', t('hospital'), h('input', { id: 'hospital', maxlength: '120' }), t('hospital_hint'))),
    h('div', { class: 'row' },
      field('neededAt', t('required_at'), h('input', { id: 'neededAt', type: 'datetime-local' })),
      field('urgency', t('urgency'), h('select', { id: 'urgency' }, ['normal', 'urgent', 'critical'].map((u) => h('option', { value: u }, t('urg_' + u)))))),
    field('note', t('short_note'), h('textarea', { id: 'note', maxlength: '300' }), t('note_hint')),
    h('div', { class: 'panel' }, h('p', {}, h('b', {}, t('pledge_title'))), h('p', {}, pledgeText), check('pledge', t('pledge_label'), false), h('p', { class: 'notice' }, t('pledge_optional'))),
    check('privacyConsent', t('request_privacy_label'), true),
    honeypot(),
    h('div', { class: 'actions' }, btn, h('a', { class: 'btn secondary', href: '#requests' }, t('cancel'))), msg);
  wire(form, msg, btn, (phone) => {
    const id = refId('BR');
    const neededAt = form.neededAt.value || '';
    const units = Math.max(1, Math.min(20, parseInt(form.units.value, 10) || 1));
    const district = form.district.value.trim();
    return { id, docs: [
      { path: 'bloodRequests/' + id, timeField: 'createdAt', data: {
        ref: id, contactName: form.contactName.value.trim(), phone, bloodGroup: form.bloodGroup.value, units, district,
        hospital: form.hospital.value.trim(), neededAt, urgency: form.urgency.value, note: form.note.value.trim(),
        privacyConsent: true, pledge: form.pledge.checked, status: 'pending', source: 'public' } },
      { path: 'publicBloodRequests/' + id, timeField: 'createdAt', data: {
        ref: id, bloodGroup: form.bloodGroup.value, units, district, neededDate: neededAt.slice(0, 10),
        urgency: form.urgency.value, publicStatus: 'pending' } },
    ] };
  }, (r) => root.replaceChildren(...doneView(t('request_done_title'), r.id, [t('request_done_body'), t('no_forced_donation')], org, true)));
  root.replaceChildren(h('h1', {}, t('request_blood')), h('p', { class: 'notice' }, t('request_intro')), form);
}

export function reportForm(root, org, show) {
  const msg = h('p', { role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, t('submit'));
  const form = h('form', { class: 'panel' },
    h('div', { class: 'row' },
      field('reporterName', t('full_name'), h('input', { id: 'reporterName', required: true, minlength: '2', maxlength: '100' })),
      field('phone', t('phone'), h('input', { id: 'phone', type: 'tel', required: true, maxlength: '20', inputmode: 'tel' }), t('report_phone_hint'))),
    field('donationDate', t('donation_date'), h('input', { id: 'donationDate', type: 'date', required: true, max: new Date().toISOString().slice(0, 10) })),
    h('div', { class: 'row' },
      field('recipientType', t('recipient_type'), h('select', { id: 'recipientType' }, ['person', 'hospital', 'organization', 'other'].map((v) => h('option', { value: v }, t('rt_' + v))))),
      field('recipientRef', t('recipient_ref'), h('input', { id: 'recipientRef', maxlength: '120' }), t('recipient_ref_hint'))),
    field('notes', t('note'), h('textarea', { id: 'notes', maxlength: '300' }), t('donation_note_hint')),
    check('privacyConsent', t('privacy_consent_label'), true),
    honeypot(),
    h('div', { class: 'actions' }, btn, h('a', { class: 'btn secondary', href: '#donors' }, t('cancel'))), msg);
  wire(form, msg, btn, (phone) => {
    const id = refId('DR');
    return { id, docs: [{ path: 'donationReports/' + id, timeField: 'createdAt', data: {
      ref: id, reporterName: form.reporterName.value.trim(), phone, donationDate: form.donationDate.value,
      recipientType: form.recipientType.value, recipientRef: form.recipientRef.value.trim(), notes: form.notes.value.trim(),
      privacyConsent: true, status: 'pending' } }] };
  }, (r) => root.replaceChildren(...doneView(t('report_done_title'), r.id, [t('report_done_body')], org, false)));
  root.replaceChildren(h('h1', {}, t('report_donation')), h('p', { class: 'notice' }, t('report_intro')), form);
}
