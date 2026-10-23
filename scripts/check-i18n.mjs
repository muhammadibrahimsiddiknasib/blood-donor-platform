// Verifies every translation key used in code/HTML exists in en.json (required) and reports gaps in other locales.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = 'public';
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk(root).filter((f) => /\.(js|html)$/.test(f));
const used = new Set();
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-z0-9_]+)'\s*[,)]/g)) used.add(m[1]);
  for (const m of s.matchAll(/data-i18n(?:-placeholder|-label)?="([a-z0-9_]+)"/g)) used.add(m[1]);
}
// Keys chosen via ternaries / helper args or built as 'prefix' + value (not matched by the t('key') pattern)
for (const k of ['active_donors', 'public_profiles', 'open_requests', 'inactive', 'public_yes', 'public_no', 'active', 'activate', 'deactivate', 'approved', 'reversed', 'deactivate_confirm', 'activate_confirm', 'count_total', 'count_pending', 'count_coordinating', 'count_done', 'count_closed', 'pending_applications', 'pending_reports']) used.add(k);
const dyn = {
  urg_: ['normal', 'urgent', 'critical'],
  rs_: ['pending', 'coordinating', 'partial', 'fulfilled', 'closed'],
  status_: ['maybe', 'recovery', 'unverified', 'unavailable'],
  ds_: ['available', 'unavailable', 'recovery', 'pending', 'hidden', 'review'],
  rt_: ['person', 'hospital', 'organization', 'other'],
  src_: ['admin', 'donor'],
  app_: ['approved', 'rejected', 'pending'],
};
for (const [p, list] of Object.entries(dyn)) for (const k of list) used.add(p + k);

const load = (l) => JSON.parse(readFileSync(`${root}/locales/${l}.json`, 'utf8'));
const en = load('en');
let fail = false;
const missingEn = [...used].filter((k) => !(k in en));
if (missingEn.length) { console.error('MISSING in en.json:', missingEn.join(', ')); fail = true; }
const unused = Object.keys(en).filter((k) => !used.has(k));
if (unused.length) console.warn('Unused in en.json:', unused.join(', '));

for (const l of ['bn', 'ar', 'zh', 'fr', 'ru', 'es']) {
  const d = load(l);
  const miss = Object.keys(en).filter((k) => !(k in d));
  console.log(`${l}: ${Object.keys(en).length - miss.length}/${Object.keys(en).length} keys (${miss.length} fall back to English)`);
  if (l === 'bn' && miss.length) { console.error('bn must be complete. Missing:', miss.join(', ')); fail = true; }
}
process.exit(fail ? 1 : 0);
