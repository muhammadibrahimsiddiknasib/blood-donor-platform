// Deploy one organization from THIS computer (useful for the very first deploy or for troubleshooting).
// Usage: node scripts/deploy-org.mjs <slug>      (needs `npx firebase login` once, as someone with access to that project)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { checkAll, pickTarget } from './lib/orgs.mjs';
import { buildOrg } from './build-org.mjs';

const slug = process.argv[2];
if (!slug) { console.error('Usage: node scripts/deploy-org.mjs <slug>'); process.exit(2); }
const { orgs, errors } = checkAll('.');
if (errors.length) { console.error('Organization config problems:\n - ' + errors.join('\n - ')); process.exit(1); }
const [cfg] = pickTarget(orgs, slug);
const dir = buildOrg(cfg);
console.log(`Deploying "${cfg.slug}" to Firebase project ${cfg.projectId} (site ${cfg.hostingSite || cfg.projectId})`);
const local = process.platform === 'win32' ? 'node_modules/.bin/firebase.cmd' : 'node_modules/.bin/firebase';
const cmd = existsSync(local) ? local : 'npx';
const base = existsSync(local) ? [] : ['firebase'];
const r = spawnSync(cmd, [...base, 'deploy', '--only', 'hosting,firestore', '--project', cfg.projectId, '--cwd', dir, ...(process.env.CI ? ['--non-interactive'] : [])],
  { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
