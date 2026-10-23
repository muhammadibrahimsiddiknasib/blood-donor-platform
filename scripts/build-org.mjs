// Builds one deployable folder per organization: dist/<slug>/{public,firebase.json,.firebaserc,firestore.*}
// Usage: node scripts/build-org.mjs <slug>|all|others|canary
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkAll, pickTarget } from './lib/orgs.mjs';

export function buildOrg(cfg, root = '.', out = join(root, 'dist')) {
  const dir = join(out, cfg.slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(root, 'public'), join(dir, 'public'), { recursive: true });
  // Only this file differs between organizations.
  const f = cfg.firebase;
  const fc = {};
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId']) if (f[k]) fc[k] = f[k];
  writeFileSync(join(dir, 'public/js/firebase-config.js'),
    `// GENERATED for "${cfg.slug}" from orgs/${cfg.slug}/config.json by scripts/build-org.mjs. Do not edit.\nexport const firebaseConfig = ${JSON.stringify(fc, null, 2)};\n`);
  const fb = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
  fb.hosting.site = cfg.hostingSite || cfg.projectId;
  fb.hosting.public = 'public';
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify(fb, null, 2));
  writeFileSync(join(dir, '.firebaserc'), JSON.stringify({ projects: { default: cfg.projectId } }, null, 2));
  cpSync(join(root, 'firestore.rules'), join(dir, 'firestore.rules'));
  cpSync(join(root, 'firestore.indexes.json'), join(dir, 'firestore.indexes.json'));
  return dir;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-org.mjs')) {
  const target = process.argv[2];
  if (!target) { console.error('Usage: node scripts/build-org.mjs <slug>|all|others|canary'); process.exit(2); }
  const { orgs, errors } = checkAll('.');
  if (errors.length) { console.error('Organization config problems:\n - ' + errors.join('\n - ')); process.exit(1); }
  let list;
  try { list = pickTarget(orgs, target); } catch (e) { console.error(e.message); process.exit(1); }
  for (const c of list) console.log(`built ${buildOrg(c)}  ->  Firebase project ${c.projectId}`);
}
