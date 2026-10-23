import { getDocument, runQuery } from './rest.js';
import { initI18n, t, apply, fmtDate, fmtNum, remainingText } from './i18n.js';
import { publicStatus } from './availability.js';
import { renderSignature } from './signature.js';
import { h } from './ui.js';
import { openContactDialog, contactBlock } from './contact.js';
import { donorForm, requestForm, reportForm } from './forms.js';

const BG = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const PAGE = 20;
const ACTIVE = ['pending', 'coordinating', 'partial'];
const $ = (id) => document.getElementById(id);
let org = null;
let offset = 0;
let requestsLoaded = false;

// ---------- view switching (hash routing; no page reloads) ----------
const VIEWS = ['donors', 'requests', 'join', 'need', 'gave'];
function currentView() {
  const v = location.hash.replace('#', '');
  return VIEWS.includes(v) ? v : 'donors';
}
function showView() {
  const v = currentView();
  const tab = v === 'requests' || v === 'need' ? 'requests' : 'donors';
  $('view-donors').hidden = v !== 'donors';
  $('view-requests').hidden = v !== 'requests';
  $('view-form').hidden = !['join', 'need', 'gave'].includes(v);
  for (const name of ['donors', 'requests']) {
    const b = $('tab-' + name);
    b.setAttribute('aria-selected', String(name === tab));
    b.tabIndex = name === tab ? 0 : -1;
  }
  const form = $('view-form');
  if (v === 'join') donorForm(form, org);
  if (v === 'need') requestForm(form, org);
  if (v === 'gave') reportForm(form, org);
  if (v === 'requests' && !requestsLoaded) loadRequests();
  window.scrollTo(0, 0);
}

async function boot() {
  let orgError = false;
  try { org = await getDocument('organization/public'); } catch { orgError = true; }
  await initI18n(org?.enabledLanguages, org?.defaultLanguage);

  const name = org?.organizationName || t('default_org_name');
  document.title = name;
  const brand = $('brand');
  if (org?.logoUrl && /^https:\/\//.test(org.logoUrl)) {
    const img = document.createElement('img');
    img.src = org.logoUrl; img.alt = ''; img.loading = 'lazy'; img.height = 36;
    brand.append(img);
  }
  brand.append(h('span', { class: 'brand-name' }, name));
  if (org?.slogan) $('slogan').textContent = org.slogan; else $('slogan').hidden = true;
  if (org?.iconUrl && /^https:\/\//.test(org.iconUrl)) {
    // Admin-provided icon replaces the built-in blood-drop fallback (which stays in the HTML).
    const l = document.querySelector('link[rel="icon"]');
    if (l) { l.href = org.iconUrl; l.removeAttribute('type'); }
  }

  const sel = $('s-group');
  sel.append(new Option(t('any'), ''));
  BG.forEach((g) => sel.append(new Option(g, g)));

  if (org?.contactInfo) $('contact').textContent = org.contactInfo; else $('contact-text-box').hidden = true;
  $('contact-block').replaceChildren(contactBlock(org));
  if (org?.publicPolicy) $('policy').textContent = org.publicPolicy; else $('policy-box').hidden = true;

  renderSignature($('signature'));
  apply();

  $('search').addEventListener('submit', (e) => { e.preventDefault(); search(true); });
  $('more').addEventListener('click', () => search(false));
  $('retry').addEventListener('click', () => search(true));
  $('retry-req').addEventListener('click', () => { requestsLoaded = false; loadRequests(); });
  $('contact-close').addEventListener('click', () => $('contact-dialog').close?.() ?? $('contact-dialog').removeAttribute('open'));
  window.addEventListener('hashchange', showView);
  for (const name2 of ['donors', 'requests']) $('tab-' + name2).addEventListener('click', () => { location.hash = '#' + name2; });

  if (orgError) showError();
  showView();
  search(true);
}

function showError() { $('error-box').hidden = false; $('status').textContent = ''; }

// ---------- donors ----------
function donorCard(p) {
  const st = publicStatus(p);
  const statusLine = h('p', {}, h('span', { class: 'status ' + st.cls }, t(st.key)));
  if (st.remaining) statusLine.append(' ', h('span', { class: 'remaining' }, remainingText(st.remaining)));
  const btn = h('button', { class: 'btn', type: 'button' }, t('get_blood'));
  btn.addEventListener('click', () => openContactDialog(org, p.displayName));
  return h('li', { class: 'card' },
    h('h3', {}, h('span', { class: 'group' }, p.bloodGroup), p.displayName),
    h('p', {}, p.district), statusLine,
    h('p', {}, `${t('updated')}: ${fmtDate(p.lastUpdated)}`),
    h('div', { class: 'actions' }, btn));
}

async function search(reset) {
  if (reset) { offset = 0; $('results').replaceChildren(); }
  const equals = {};
  const g = $('s-group').value;
  const d = $('s-district').value.trim().toLowerCase();
  if (g) equals.bloodGroup = g;
  if (d) equals.districtKey = d;
  $('error-box').hidden = true;
  $('status').textContent = t('loading');
  $('more').hidden = true;
  try {
    const rows = await runQuery({ collection: 'publicDonors', equals, orderBy: 'lastUpdated', limit: PAGE, offset });
    offset += rows.length;
    const ul = $('results');
    rows.forEach((p) => ul.append(donorCard(p)));
    const total = ul.children.length;
    $('status').textContent = total ? t('showing', { n: fmtNum(total) }) : '';
    $('empty').hidden = total !== 0;
    $('more').hidden = rows.length < PAGE;
  } catch {
    $('status').textContent = '';
    showError();
  }
}

// ---------- requests ----------
async function loadRequests() {
  $('req-error').hidden = true;
  $('req-status').textContent = t('loading');
  try {
    const rows = await runQuery({ collection: 'publicBloodRequests', orderBy: 'createdAt', limit: 100 });
    requestsLoaded = true;
    const count = (list) => rows.filter((r) => list.includes(r.publicStatus)).length;
    const stat = (n, key) => h('div', { class: 'stat' }, h('b', {}, fmtNum(n)), t(key));
    $('counts').replaceChildren(
      stat(rows.length, 'count_total'), stat(count(['pending']), 'count_pending'),
      stat(count(['coordinating', 'partial']), 'count_coordinating'),
      stat(count(['fulfilled']), 'count_done'), stat(count(['closed']), 'count_closed'));
    const active = rows.filter((r) => ACTIVE.includes(r.publicStatus));
    $('req-results').replaceChildren(...active.map((r) => h('li', { class: 'card' },
      h('h3', {}, h('span', { class: 'group' }, r.bloodGroup), `${fmtNum(r.units)} ${t('units')}`),
      h('p', {}, `${r.district}${r.neededDate ? ' • ' + fmtDate(r.neededDate) : ''}`),
      h('p', {}, h('span', { class: 'status wait' }, t('rs_' + r.publicStatus)), ' ', h('span', { class: 'status ' + (r.urgency === 'normal' ? 'unk' : 'no') }, t('urg_' + r.urgency))),
      h('p', {}, `${t('ref')}: ${r.ref}`))));
    $('req-empty').hidden = active.length !== 0;
    $('req-status').textContent = '';
  } catch {
    $('req-status').textContent = '';
    $('req-error').hidden = false;
  }
}

boot();
