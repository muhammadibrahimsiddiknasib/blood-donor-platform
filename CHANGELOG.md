# Changelog

## 0.3.0 — multi-organization deployment
- `orgs/<slug>/config.json` per organization; `scripts/{add-org,build-org,validate-orgs,list-orgs,plan-deploy,deploy-org}.mjs`
- Firebase web config moved to `public/js/firebase-config.js` (generated per organization at deploy time); `site` removed from `firebase.json` (generated per organization)
- New workflow: tests → canary → approval → all organizations; per-organization or rollback runs; shared deployer service account (`FIREBASE_DEPLOYER_KEY`)
- Tests: `tests/orgs.test.js` (+ `logic.test.js`, `rules.test.js` restored)
- Docs: `docs/MULTI-ORG.md`, `docs/Multi-Org-Guide-bn.docx`; removed `src/`, `.env.example`; WhatsApp onboarding doc folded into the multi-org docs

## 0.2.0 — Unreleased

Implements the "Final Master Planning" document (22 Oct 2026).

**Public site**
- Inquiry page with two tabs: donor list and blood-request list (counts: total / awaiting / coordinating / completed / closed)
- "Join as a donor", "Request blood" and "I donated blood" forms (no OTP; honeypot, 30 s cooldown, strict Firestore-rule validation)
- Reference IDs (DA-/BR-/DR-xxxxxx) and coordinator contact (phone, Messenger, WhatsApp) on confirmation screens
- "Get blood" button on every donor card opens the coordinator panel with a pre-filled message; donor phone numbers are never shown
- Remaining-time display: days only under one month, otherwise months + days
- Built-in blood-drop favicon / app icons / manifest; optional icon URL from Settings
- Small "Admin" link in the header

**Admin**
- Donor-application queue with duplicate-phone warnings, approve / reject, optional date verification
- Donation-report queue, donation history with reversal (never hard-deleted), next-eligible recalculation
- Six donor statuses; only available / recovery / unavailable (with consent) are public
- Blood requests: public submissions + manual entry, status changes, hide public summary
- Archive by default; permanent delete only for archived donors with typed confirmation
- Settings: coordinator phone / Messenger / WhatsApp, icon URL, pledge wording, policy, languages, interval
- "Add New Admin" (existing admin only) and admin activate/deactivate
- No "already set up" notice, no forgot-password option

**Security / infra**
- Firestore rules extended (public create-only forms, private+public request pair, https-only links, no-delete donations)
- REST calls now send the API key (fixes the "Could not load data" error caused by anonymous REST calls)
- GitHub Actions: tests (logic, translations, rules emulator) → preview on PRs → protected production deploy → manual rollback
- Unit tests for date/phone logic; extended rules tests

## 0.1.0

Initial implementation of Master Specification v0.2.
