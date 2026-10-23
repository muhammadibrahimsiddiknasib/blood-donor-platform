// Coordinator contact block: phone / Messenger / WhatsApp from admin settings. Never a donor's private phone.
import { t } from './i18n.js';
import { h } from './ui.js';

const isHttps = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);

export function whatsappLink(url, text) {
  if (!isHttps(url)) return '';
  if (!text || /^https:\/\/wa\.link\//.test(url)) return url; // short links cannot carry a prefilled text
  return url + (url.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(text);
}

// opts.message: optional pre-filled message (donor card flow)
export function contactBlock(org, opts = {}) {
  const phone = (org?.coordinatorPhone || '').trim();
  const items = [];
  if (phone) {
    items.push(h('a', { class: 'btn', href: 'tel:' + phone.replace(/[^0-9+]/g, '') }, `${t('call')}: ${phone}`));
  }
  if (isHttps(org?.messengerUrl)) {
    items.push(h('a', { class: 'btn secondary', href: org.messengerUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Messenger'));
  }
  if (isHttps(org?.whatsappUrl)) {
    items.push(h('a', { class: 'btn secondary', href: whatsappLink(org.whatsappUrl, opts.message), target: '_blank', rel: 'noopener noreferrer' }, 'WhatsApp'));
  }
  const box = h('div', {});
  if (!items.length) {
    box.append(h('p', { class: 'notice' }, t('contact_not_set')));
    return box;
  }
  box.append(h('div', { class: 'actions' }, items));
  if (opts.message) {
    const msg = h('textarea', { readonly: true, rows: '3', 'aria-label': t('message_to_send') }, opts.message);
    const copy = h('button', { class: 'btn secondary', type: 'button' }, t('copy_message'));
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(opts.message); copy.textContent = t('copied'); }
      catch { msg.select(); }
    });
    box.append(h('p', { class: 'notice' }, t('message_hint')), msg, h('div', { class: 'actions' }, copy));
  }
  return box;
}

export function openContactDialog(org, donorName) {
  const dlg = document.getElementById('contact-dialog');
  const body = document.getElementById('contact-dialog-body');
  const message = t('wa_msg_donor', { name: donorName });
  body.replaceChildren(
    h('h2', {}, t('get_blood')),
    h('p', {}, t('contact_panel_intro', { name: donorName })),
    contactBlock(org, { message }));
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
