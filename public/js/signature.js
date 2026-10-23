// Optional developer signature. Remove or edit freely (see README). No tracking, no popups.
import { developerSignature as s } from './site-config.js';
import { currentLang } from './i18n.js';

function a(href, text) {
  const el = document.createElement('a');
  el.href = href; el.textContent = text;
  if (href.startsWith('http')) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
  return el;
}

export function renderSignature(container, { admin = false } = {}) {
  if (!container || !s || !s.enabled) return;
  if (admin && !s.showInAdmin) return;
  const bn = currentLang === 'bn';
  const p1 = document.createElement('p');
  p1.textContent = bn ? `সফটওয়্যারটি তৈরি করেছেন ${s.name}।` : `Built with care by ${s.name}`;
  const p2 = document.createElement('p');
  p2.textContent = bn
    ? 'আপনার সংগঠনের জন্য এমন ওয়েবসাইট বা ওয়েব অ্যাপ প্রয়োজন? যোগাযোগ করুন।'
    : 'Need a website for your organization? Let’s talk.';
  const p3 = document.createElement('p');
  p3.className = 'sig';
  p3.append(a(s.portfolio, 'Portfolio'), a('mailto:' + s.email, 'Email'), a(s.github, 'GitHub'));
  container.replaceChildren(p1, p2, p3);
}
