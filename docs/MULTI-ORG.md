# Many organizations, one repository (operator reference)

Full step-by-step (Bengali): `docs/Multi-Org-Guide-bn.docx`.

## Model
- One organization = one folder `orgs/<slug>/config.json` = one **Firebase project owned by that organization** (data never shared).
- Same code for everyone. Only `public/js/firebase-config.js` differs; `scripts/build-org.mjs` writes it into `dist/<slug>/` at deploy time. The source file only holds placeholders (self-hosters edit it).
- `config.json` holds **no secrets** (name, project ID, Firebase web config, optional `hostingSite`, `canary`). Everything else (coordinator phone, Messenger, WhatsApp, logo, policy) is entered in Admin → Settings and lives in the organization's own Firestore.
- One shared **deployer service account** (created by the operator in the operator's own Google Cloud project). Each organization grants its e-mail only: Firebase Hosting Admin, Firebase Rules Admin, Cloud Datastore Index Admin, Service Usage Consumer, Firebase Viewer. These roles can publish the site and rules but cannot read donor data. *(Role list not yet pilot-verified.)* Secret in GitHub: `FIREBASE_DEPLOYER_KEY`.

## Flow
`push to main` → tests (logic, i18n, org configs, Firestore rules) → deploy **canary** org → approval (Environment `production`, required reviewers) → all other organizations, one at a time.
Manual run: choose `target` (`all` / `canary` / `others` / one slug) and optionally an older `ref` for rollback.

## Add an organization
1. Organization creates its Firebase project and adds the operator as temporary Owner.
2. Operator: register a Web app, create Firestore (production mode), enable Email/Password, enable Hosting, grant the deployer the roles above.
3. Save the web-app config snippet to a file **outside** the repo, then:
   `npm run add-org -- --slug <slug> --name "<name>" --project-id <id> --config-file <file> [--hosting-site <site>]`
4. `npm run orgs:validate`, commit `orgs/<slug>`, push. Approve the production deploy.
5. Open `/setup` immediately, create the first admin, fill Settings, add the organization's own admin, hand over, remove temporary Owner.

Never ask anyone to send passwords, verification codes, service-account JSON or tokens in chat.

## Scripts
| Command | What |
| --- | --- |
| `npm run orgs:validate` | checks every `orgs/*/config.json` (placeholders, ids, duplicates, exactly one canary) |
| `npm run add-org -- ...` | creates a new `orgs/<slug>/config.json` from the Firebase console snippet |
| `npm run build:org -- <slug\|all\|others\|canary>` | builds `dist/<slug>/` |
| `npm run deploy:org -- <slug>` | builds and deploys one organization from this PC |
| `node scripts/plan-deploy.mjs <target>` | what CI uses to decide canary / rest |
