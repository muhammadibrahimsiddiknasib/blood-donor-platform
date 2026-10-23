// Prints a JSON array of organization slugs for the GitHub Actions matrix.
// Usage: node scripts/list-orgs.mjs [all|others|canary|<slug>]   (also validates everything)
import { checkAll, pickTarget } from './lib/orgs.mjs';

const target = process.argv[2] || 'all';
const { orgs, errors } = checkAll('.');
if (errors.length) { console.error('Organization config problems:\n - ' + errors.join('\n - ')); process.exit(1); }
try { console.log(JSON.stringify(pickTarget(orgs, target).map((c) => c.slug))); }
catch (e) { console.error(e.message); process.exit(1); }
