export const LANGS = {
  en: 'English', bn: 'বাংলা', ar: 'العربية', zh: '中文', fr: 'Français', ru: 'Русский', es: 'Español',
};
const RTL = ['ar'];
let dict = {};
let fallback = {};
export let currentLang = 'en';

async function load(l) {
  const r = await fetch(`/locales/${l}.json`);
  if (!r.ok) throw new Error('locale ' + l);
  return r.json();
}

export async function initI18n(enabled, def) {
  const list = Array.isArray(enabled) && enabled.length ? enabled.filter((l) => l in LANGS) : Object.keys(LANGS);
  let l = null;
  try { l = localStorage.getItem('lang'); } catch { /* storage unavailable */ }
  if (!l || !list.includes(l)) l = list.includes(def) ? def : list.includes('en') ? 'en' : list[0];
  fallback = await load('en').catch(() => ({}));
  dict = l === 'en' ? fallback : await load(l).catch(() => ({}));
  currentLang = l;
  document.documentElement.lang = l;
  document.documentElement.dir = RTL.includes(l) ? 'rtl' : 'ltr';
  apply();
  const sel = document.getElementById('lang');
  if (sel) {
    sel.replaceChildren(...list.map((code) => {
      const o = document.createElement('option');
      o.value = code; o.textContent = LANGS[code]; o.selected = code === l;
      return o;
    }));
    sel.hidden = list.length < 2;
    sel.onchange = () => {
      try { localStorage.setItem('lang', sel.value); } catch { /* ignore */ }
      location.reload();
    };
  }
  return l;
}

export function t(key, vars) {
  let s = dict[key] ?? fallback[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((e) => { e.placeholder = t(e.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-label]').forEach((e) => { e.setAttribute('aria-label', t(e.dataset.i18nLabel)); });
}

export function fmtDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString(currentLang, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtNum(n) {
  try { return new Intl.NumberFormat(currentLang).format(n); } catch { return String(n); }
}

// Remaining-time text from availability.remaining(): days only under one month, otherwise months + days.
export function remainingText(r) {
  if (r.kind === 'days') return t('remaining_days', { n: fmtNum(r.days) });
  if (r.kind === 'months') {
    return r.days
      ? t('remaining_months_days', { m: fmtNum(r.months), d: fmtNum(r.days) })
      : t('remaining_months', { m: fmtNum(r.months) });
  }
  return '';
}
