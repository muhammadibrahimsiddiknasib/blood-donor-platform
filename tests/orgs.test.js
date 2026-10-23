// Plain Node tests for the multi-organization tooling: npm run test:orgs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateOrg, checkAll, pickTarget, parseFirebaseSnippet, planDeploy } from '../scripts/lib/orgs.mjs';
import { buildOrg } from '../scripts/build-org.mjs';

const good = (over = {}) => ({
  slug: 'demo-org', name: 'Demo', projectId: 'demo-org-1a2b', canary: false,
  firebase: {
    apiKey: 'AIzaSyDrkEyaul84yDrZu0Xcln0DE9cC2QVZdns', authDomain: 'demo-org-1a2b.firebaseapp.com', projectId: 'demo-org-1a2b',
    storageBucket: 'demo-org-1a2b.firebasestorage.app', messagingSenderId: '123456789', appId: '1:123456789:web:abcdef012345',
  },
  ...over,
});

function fixture(orgs) {
  const root = mkdtempSync(join(tmpdir(), 'orgs-'));
  for (const [folder, cfg] of Object.entries(orgs)) {
    mkdirSync(join(root, 'orgs', folder), { recursive: true });
    writeFileSync(join(root, 'orgs', folder, 'config.json'), typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
  }
  return root;
}

test('a correct config has no problems', () => {
  assert.deepEqual(validateOrg(good(), 'demo-org'), []);
});

test('bad configs are rejected with clear messages', () => {
  const has = (cfg, text, folder = 'demo-org') => assert.ok(validateOrg(cfg, folder).some((m) => m.includes(text)), text);
  has(good({ slug: 'Bad Slug' }), 'slug', 'Bad Slug');
  has(good(), 'must equal the folder', 'other-folder');
  has(good({ projectId: 'X' }), 'projectId');
  has(good({ name: ' ' }), 'name');
  has(good({ hostingSite: 'Bad_Site' }), 'hostingSite');
  has(good({ firebase: { ...good().firebase, projectId: 'another-project-9z' } }), 'must equal projectId');
  has(good({ firebase: { ...good().firebase, apiKey: 'YOUR_API_KEY' } }), 'placeholder');
  has(good({ firebase: { ...good().firebase, appId: '1:123:android:abc' } }), 'WEB app id');
  has(good({ firebase: { ...good().firebase, authDomain: 'evil.example.com' } }), 'authDomain');
  has(good({ firebase: undefined }), 'firebase{}');
});

test('checkAll: exactly one canary, no duplicate projects or hosting sites', () => {
  const a = good({ slug: 'a-org', canary: true });
  const b = good({ slug: 'b-org', projectId: 'demo-org-1a2b' });
  let r = checkAll(fixture({ 'a-org': a, 'b-org': b }));
  assert.ok(r.errors.some((e) => e.includes('duplicate projectId')));
  const b2 = good({ slug: 'b-org', projectId: 'b-org-9z8y', firebase: { ...good().firebase, projectId: 'b-org-9z8y', authDomain: 'b-org-9z8y.firebaseapp.com' } });
  r = checkAll(fixture({ 'a-org': a, 'b-org': b2 }));
  assert.deepEqual(r.errors, []);
  r = checkAll(fixture({ 'a-org': { ...a, canary: false }, 'b-org': b2 }));
  assert.ok(r.errors.some((e) => e.includes('canary')));
  r = checkAll(fixture({ 'a-org': a, 'b-org': '{ not json' }));
  assert.ok(r.errors.some((e) => e.includes('not valid JSON')));
});

test('pickTarget: all / canary / others / one / unknown', () => {
  const orgs = [good({ slug: 'a-org', canary: true }), good({ slug: 'b-org' }), good({ slug: 'c-org' })];
  assert.equal(pickTarget(orgs, 'all').length, 3);
  assert.deepEqual(pickTarget(orgs, 'canary').map((o) => o.slug), ['a-org']);
  assert.deepEqual(pickTarget(orgs, 'others').map((o) => o.slug), ['b-org', 'c-org']);
  assert.deepEqual(pickTarget(orgs, 'c-org').map((o) => o.slug), ['c-org']);
  assert.throws(() => pickTarget(orgs, 'nope'), /unknown target/);
});

test('parseFirebaseSnippet reads the console snippet and plain JSON', () => {
  const snippet = `// Import the functions
const firebaseConfig = {
  apiKey: "AIzaSyDrkEyaul84yDrZu0Xcln0DE9cC2QVZdns",
  authDomain: "demo-org-1a2b.firebaseapp.com",
  projectId: "demo-org-1a2b",
  storageBucket: "demo-org-1a2b.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef012345",
  measurementId: "G-ABC123"
};`;
  const p = parseFirebaseSnippet(snippet);
  assert.equal(p.projectId, 'demo-org-1a2b');
  assert.equal(p.measurementId, 'G-ABC123');
  assert.deepEqual(validateOrg({ ...good(), firebase: p }, 'demo-org'), []);
  assert.equal(parseFirebaseSnippet('{"apiKey":"AIzaX","projectId":"p"}').projectId, 'p');
});

test('buildOrg writes a self-contained folder with the org config only in firebase-config.js', () => {
  const out = mkdtempSync(join(tmpdir(), 'dist-'));
  const cfg = good({ hostingSite: 'demo-site-1' });
  const dir = buildOrg(cfg, '.', out);
  const fc = readFileSync(join(dir, 'public/js/firebase-config.js'), 'utf8');
  assert.ok(fc.includes('"projectId": "demo-org-1a2b"'));
  assert.ok(!fc.includes('YOUR_'));
  const fb = JSON.parse(readFileSync(join(dir, 'firebase.json'), 'utf8'));
  assert.equal(fb.hosting.site, 'demo-site-1');
  assert.equal(fb.hosting.public, 'public');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.firebaserc'), 'utf8')), { projects: { default: 'demo-org-1a2b' } });
  for (const f of ['public/index.html', 'public/js/public.js', 'firestore.rules', 'firestore.indexes.json']) assert.ok(existsSync(join(dir, f)), f);
  // the source folder is untouched
  assert.ok(readFileSync('public/js/firebase-config.js', 'utf8').includes('YOUR_API_KEY'));
  // site defaults to the project id
  const dir2 = buildOrg(good(), '.', out);
  assert.equal(JSON.parse(readFileSync(join(dir2, 'firebase.json'), 'utf8')).hosting.site, 'demo-org-1a2b');
});

test('the real orgs/ folder in this repository is valid', () => {
  const { orgs, errors } = checkAll('.');
  assert.deepEqual(errors, []);
  assert.ok(orgs.length >= 1);
});

test('planDeploy: canary first, everyone else second; single targets go to the right stage', () => {
  const orgs = [good({ slug: 'a-org', canary: true }), good({ slug: 'b-org' }), good({ slug: 'c-org' })];
  assert.deepEqual(planDeploy(orgs, 'all'), { first: ['a-org'], rest: ['b-org', 'c-org'] });
  assert.deepEqual(planDeploy(orgs, 'canary'), { first: ['a-org'], rest: [] });
  assert.deepEqual(planDeploy(orgs, 'others'), { first: [], rest: ['b-org', 'c-org'] });
  assert.deepEqual(planDeploy(orgs, 'b-org'), { first: [], rest: ['b-org'] });
  assert.deepEqual(planDeploy(orgs, 'a-org'), { first: ['a-org'], rest: [] });
  assert.throws(() => planDeploy(orgs, 'zzz'), /unknown target/);
});
