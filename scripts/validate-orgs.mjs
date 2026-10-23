// npm run orgs:validate  — checks every orgs/<slug>/config.json (used by CI and before every push).
import { checkAll } from './lib/orgs.mjs';

const { orgs, errors } = checkAll('.');
if (errors.length) { console.error('PROBLEMS:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`OK: ${orgs.length} organization(s): ` + orgs.map((c) => c.slug + (c.canary ? ' (canary)' : '')).join(', '));
