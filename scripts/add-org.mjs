// Creates orgs/<slug>/config.json for a new organization.
// Usage:
//   node scripts/add-org.mjs --slug rajshahi-blood --name "রাজশাহী রক্তদাতা" --project-id rajshahi-blood-1a2b \
//        --config-file firebase-snippet.txt [--hosting-site my-site] [--canary]
// firebase-snippet.txt = the "const firebaseConfig = {...}" text copied from Firebase console -> Project settings -> Your apps.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirebaseSnippet, validateOrg, checkAll } from './lib/orgs.mjs';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[k] = true; else { args[k] = next; i++; }
}
const fail = (m) => { console.error('ERROR: ' + m); process.exit(1); };
for (const k of ['slug', 'name', 'project-id', 'config-file']) if (!args[k] || args[k] === true) fail(`--${k} is required`);
if (!existsSync(args['config-file'])) fail(`file not found: ${args['config-file']}`);

const cfg = {
  slug: args.slug, name: args.name, projectId: args['project-id'],
  ...(args['hosting-site'] ? { hostingSite: args['hosting-site'] } : {}),
  canary: args.canary === true,
  firebase: parseFirebaseSnippet(readFileSync(args['config-file'], 'utf8')),
};
const problems = validateOrg(cfg, cfg.slug);
if (problems.length) fail('\n - ' + problems.join('\n - '));
const dir = join('orgs', cfg.slug);
if (existsSync(join(dir, 'config.json')) && !args.force) fail(`orgs/${cfg.slug} already exists (use --force to overwrite)`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');
const { errors } = checkAll('.');
if (errors.length) { console.error('Saved, but the whole set has problems:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`Created orgs/${cfg.slug}/config.json\nNext: git add orgs/${cfg.slug} && git commit -m "Add ${cfg.slug}" && git push`);
