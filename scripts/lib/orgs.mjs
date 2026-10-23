// Shared helpers for the multi-organization setup. Every organization = one folder orgs/<slug>/config.json
// = one Firebase project owned by that organization. Nothing in config.json is secret (it is all visible on the live site).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const PROJECT_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
export const SITE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

export function orgsDir(root = '.') { return join(root, 'orgs'); }

export function loadOrgs(root = '.') {
  const dir = orgsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const file = join(dir, e.name, 'config.json');
      if (!existsSync(file)) return { folder: e.name, error: 'config.json is missing' };
      try { return { folder: e.name, config: JSON.parse(readFileSync(file, 'utf8')) }; }
      catch (err) { return { folder: e.name, error: 'config.json is not valid JSON: ' + err.message }; }
    });
}

// Returns an array of human-readable problems (empty = valid).
export function validateOrg(cfg, folder) {
  const e = [];
  const need = (cond, msg) => { if (!cond) e.push(msg); };
  if (!cfg || typeof cfg !== 'object') return ['config is empty'];
  need(typeof cfg.slug === 'string' && SLUG_RE.test(cfg.slug), 'slug must be 2-41 chars: a-z, 0-9, "-"');
  if (folder) need(cfg.slug === folder, `slug "${cfg.slug}" must equal the folder name "${folder}"`);
  need(typeof cfg.name === 'string' && cfg.name.trim().length > 0, 'name is required');
  need(typeof cfg.projectId === 'string' && PROJECT_RE.test(cfg.projectId), 'projectId is not a valid Firebase project ID');
  if (cfg.hostingSite !== undefined && cfg.hostingSite !== '') need(SITE_RE.test(cfg.hostingSite), 'hostingSite is not a valid Hosting site ID');
  need(cfg.canary === undefined || typeof cfg.canary === 'boolean', 'canary must be true or false');
  const f = cfg.firebase;
  if (!f || typeof f !== 'object') { e.push('firebase{} web config is required'); return e; }
  for (const k of FIREBASE_KEYS) need(typeof f[k] === 'string' && f[k].trim() !== '', `firebase.${k} is required`);
  for (const [k, v] of Object.entries(f)) need(!/YOUR_|PASTE|XXXX/i.test(String(v)), `firebase.${k} still looks like a placeholder`);
  need(f.projectId === cfg.projectId, 'firebase.projectId must equal projectId');
  need(/^AIza[0-9A-Za-z_-]{20,}$/.test(f.apiKey || ''), 'firebase.apiKey does not look like a web API key (starts with AIza)');
  need(/^[a-z0-9.-]+\.(firebaseapp\.com|web\.app)$/.test(f.authDomain || ''), 'firebase.authDomain must end with firebaseapp.com or web.app');
  need(/^\d+$/.test(f.messagingSenderId || ''), 'firebase.messagingSenderId must be digits');
  need(/^1:\d+:web:[0-9a-f]+$/.test(f.appId || ''), 'firebase.appId must be a WEB app id like 1:123:web:abc');
  if (f.measurementId) need(/^G-[A-Z0-9]+$/.test(f.measurementId), 'firebase.measurementId must look like G-XXXX');
  return e;
}

// Validates every organization and the cross-organization rules. Returns { orgs, errors }.
export function checkAll(root = '.') {
  const errors = [];
  const orgs = [];
  for (const o of loadOrgs(root)) {
    if (o.error) { errors.push(`orgs/${o.folder}: ${o.error}`); continue; }
    const problems = validateOrg(o.config, o.folder);
    problems.forEach((p) => errors.push(`orgs/${o.folder}: ${p}`));
    if (!problems.length) orgs.push(o.config);
  }
  const dup = (key) => {
    const seen = new Map();
    for (const c of orgs) {
      const v = key(c);
      if (seen.has(v)) errors.push(`duplicate ${v} in orgs/${c.slug} and orgs/${seen.get(v)}`);
      seen.set(v, c.slug);
    }
  };
  dup((c) => 'projectId ' + c.projectId);
  dup((c) => 'hosting site ' + (c.hostingSite || c.projectId));
  const canaries = orgs.filter((c) => c.canary === true);
  if (orgs.length && canaries.length !== 1) errors.push(`exactly one organization must have "canary": true (found ${canaries.length})`);
  return { orgs, errors };
}

export function pickTarget(orgs, target) {
  if (target === 'all') return orgs;
  if (target === 'canary') return orgs.filter((c) => c.canary);
  if (target === 'others') return orgs.filter((c) => !c.canary);
  const one = orgs.filter((c) => c.slug === target);
  if (!one.length) throw new Error(`unknown target "${target}" (use all, canary, others or an organization slug)`);
  return one;
}

// Reads the snippet the Firebase console shows ("const firebaseConfig = { apiKey: "...", ... }") or plain JSON.
export function parseFirebaseSnippet(text) {
  const out = {};
  for (const m of String(text).matchAll(/["']?([A-Za-z]+)["']?\s*:\s*["']([^"']*)["']/g)) out[m[1]] = m[2];
  const keep = {};
  for (const k of [...FIREBASE_KEYS, 'measurementId']) if (out[k]) keep[k] = out[k];
  return keep;
}

// Two-stage rollout: the canary organization first, then everyone else (after approval).
// target: all | canary | others | <slug>   ->  { first: [slugs], rest: [slugs] }
export function planDeploy(orgs, target = 'all') {
  const slugs = (list) => list.map((c) => c.slug);
  if (target === 'all') return { first: slugs(pickTarget(orgs, 'canary')), rest: slugs(pickTarget(orgs, 'others')) };
  if (target === 'canary') return { first: slugs(pickTarget(orgs, 'canary')), rest: [] };
  if (target === 'others') return { first: [], rest: slugs(pickTarget(orgs, 'others')) };
  const one = pickTarget(orgs, target);
  return one[0].canary ? { first: slugs(one), rest: [] } : { first: [], rest: slugs(one) };
}
