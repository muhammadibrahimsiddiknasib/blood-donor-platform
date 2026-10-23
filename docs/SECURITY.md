# Security notes (v0.2)

## What is enforced by Firestore rules (not just the UI)
- Default deny. Private collections (`donors`, `donorApplications`, `bloodRequests`, `donationReports`, `donations`, `auditEvents`, `organization/private`) are admin-only for reading.
- The public can only **create** (once, with a strict shape and server timestamp): donor applications, blood requests (together with their public-safe summary), donation reports. They cannot read back, edit or delete.
- `publicDonors` and `publicBloodRequests` accept only an explicit list of safe fields — even an admin cannot add a phone number there.
- Links in settings must be `https://`. Donation history documents cannot be deleted. The audit log is append-only.
- Only an existing active admin can create another admin document; nobody can change their own role/active flag.

## Known limits (be honest with your users)
- **No OTP / no rate limiting by IP.** Firestore rules cannot count requests per visitor. Protection = strict validation + honeypot + 30 s browser cooldown + admin moderation + duplicate warnings. A determined attacker can still flood the queues; admins can hide/reject. If abuse appears, enable Firebase App Check (reCAPTCHA) — see README.
- **Public request summaries go live immediately** (by design). Admin can hide any of them.
- **Add New Admin runs in the browser** (free plan, no Cloud Functions): the admin panel creates the login on a second Firebase app instance and then writes the `users/{uid}` document. No secret is stored in the client. Email/Password sign-up must therefore stay enabled in Firebase Authentication; an account without a `users` document has no access at all. A server-side (Admin SDK) provisioning function is the stricter alternative but needs the paid Blaze plan.
- First-admin setup is first-come-first-served: run `/setup` immediately after the first deploy.
- Never commit passwords, service-account JSON, or notes containing logins. `.gitignore` blocks common names, but check `git status` before every commit.
- Admin passwords: use a password manager; rotate if shared in a chat or file.

## Multi-organization deployment
- The deployer key (`FIREBASE_DEPLOYER_KEY`) lives only in GitHub Secrets. Anyone who gets it can deploy to every organization; rotate it regularly and delete it if exposed.
- Organizations grant the deployer only Hosting/Rules/Index roles; it cannot read donor data. A bad `firestore.rules` release still reaches every organization, so run `npm run test:rules` and check the canary before approving.
- Pull requests from forks never receive secrets; only pushes to `main` and manual runs deploy.
- `config.json` and `firebase-config.js` contain only public identifiers.
