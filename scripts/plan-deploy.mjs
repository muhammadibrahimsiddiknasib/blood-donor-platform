// Used by GitHub Actions: decides which organizations deploy in stage 1 (canary) and stage 2 (everyone else).
// Usage: node scripts/plan-deploy.mjs [all|canary|others|<slug>]
import { appendFileSync } from 'node:fs';
import { checkAll, planDeploy } from './lib/orgs.mjs';

const target = (process.argv[2] || 'all').trim() || 'all';
const { orgs, errors } = checkAll('.');
if (errors.length) { console.error('Organization config problems:\n - ' + errors.join('\n - ')); process.exit(1); }
let plan;
try { plan = planDeploy(orgs, target); } catch (e) { console.error(e.message); process.exit(1); }
console.log(JSON.stringify(plan));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `first=${JSON.stringify(plan.first)}\nrest=${JSON.stringify(plan.rest)}\n`);
}
