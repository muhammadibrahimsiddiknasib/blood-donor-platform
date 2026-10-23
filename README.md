<<<<<<< HEAD
# Blood Donor Platform (v0.2)

A small, fast, white-label web app for volunteer blood-donor organizations: public donor list and blood-request list, donor/request/donation forms, coordinator contact, admin approval queues. Plain HTML/CSS/JS on Firebase Hosting + Firestore + Authentication. No build step.

> **Medical disclaimer.** Coordination only. It does not give medical advice, certify eligibility or check compatibility. No UN endorsement, medical-eligibility guarantee or legal-compliance guarantee is claimed.

বাংলা গাইড: `docs/Multi-Org-Guide-bn.docx` (সব সংস্থার জন্য GitHub ডিপ্লয়), `docs/Update-Guide-bn.docx` (আপডেট ও টেস্ট), `docs/Setup-Guide-bn.docx` (প্রথম সেটআপ).

## Quick start (one organization, self-hosted)
1. In `public/js/firebase-config.js` put your Firebase web-app config (replace the `YOUR_...` placeholders).
2. Copy `.firebaserc.example` → `.firebaserc` with your project ID.
3. `npm install` → `npx firebase login` → `npm run deploy`
4. Open `/setup` once to create the first admin, then sign in at `/admin` and fill **Settings**.

## Many organizations from one repository (operator)
`orgs/<slug>/config.json` per organization, one shared deployer service account, GitHub Actions deploys the canary first and everyone else after approval. See `docs/MULTI-ORG.md` and `docs/Multi-Org-Guide-bn.docx`.

## Tests
```bash
npm test            # date/phone logic + organization tooling + translation keys + org configs (no emulator)
npm run test:rules  # Firestore rules (needs Java; GitHub Actions runs it for you)
```

## Deploy from GitHub
`.github/workflows/deploy.yml`: tests → (PR) canary preview → deploy canary → approval → all other organizations; manual run for a single organization or rollback. Required: secret `FIREBASE_DEPLOYER_KEY`, environments `canary` and `production` (add required reviewers to `production`).

## Pages
`/` public (donors tab, requests tab, forms) · `/admin` login + panel · `/setup` first admin (redirects to `/admin` when done)

## More
`docs/MULTI-ORG.md` · `docs/SECURITY.md` · `docs/DECISIONS.md` · `CHANGELOG.md`

## Optional hardening
If spam appears, enable Firebase **App Check** (reCAPTCHA v3/Enterprise) for Firestore and add its token to the REST calls (needs a small code change).

License: MIT. Original author: Ibrahim Siddik — https://ibrahim-siddik.web.app/
=======
# blood-donor-platform
>>>>>>> 096abb5f4a030693d2b1dbf7ae0e91dd3c7348d8
