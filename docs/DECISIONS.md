# Decisions

## Taken from your latest instructions (§21)
Blood requests are independent of donor approval · no OTP · public Admin button + "Log in as administrator" · no forgot-password · Add New Admin · GitHub Actions deploy · WhatsApp onboarding (operator-assisted, see MULTI-ORG.md).

## Defaults I chose where the plan said "needs approval" (change any time)
| Open item | Applied |
| --- | --- |
| Pledge ("one bag of blood") | Shown on the request form as an **optional** checkbox. Requests are never blocked without it. Wording editable in Settings. |
| Six donor statuses | Available · Temporarily unavailable · Recovery period · Pending verification · Inactive/Hidden · Needs admin review. Only the first three (with consent) are public. |
| Eligibility interval | Configurable, default 4 months. Display only, never a medical decision. |
| Public request detail | Blood group, units, district, needed date, urgency, status, reference. No hospital, phone, patient or note. Completed/closed requests leave the list but stay in the counts. List and counts use the latest 100 requests. |
| Role matrix | One role ("admin") may do everything. A finer matrix needs your decision first. |
| Donor self-report | Donors have no login yet (no OTP, no accounts). They use the public "I donated blood" form with their phone; an admin matches it to the donor and approves. |
| Donor's own "hide me" request | Done through the coordinator (admin unticks consent / archives). No self-service yet. |
| Duplicate handling | Warning only (same last-10 phone digits). Never auto-merged. |
| Languages | English + Bengali complete. Arabic/Chinese/French/Russian/Spanish: public-page basics only; new texts fall back to English until reviewed by a human. |

## Not done / needs you
- Icon image URL (you said you'll provide it; built-in drop icon is used until then).
- Coordinator phone / Messenger / WhatsApp: enter in Admin → Settings.
- Real Firebase Auth, rules and deploy have **not** been run from here (no network access). Test everything with fake data first.

## Multi-organization deployment (v0.3)
| Topic | Applied |
| --- | --- |
| Model | One repo, one folder per organization, one Firebase project per organization (data separation, organization-owned) |
| Operator | Deploys for everyone; organizations only create their project and add the operator as temporary Owner |
| First admin | Operator runs `/setup` right after the first deploy, then hands over (adds the organization's admin; they deactivate the operator's admin; temporary Owner removed) |
| Updates | One push updates every organization (canary first, approval, then the rest). Self-hosting organizations (clones) do not get updates automatically |
| Deploy credential | One shared deployer service account owned by the operator; each organization grants only Hosting/Rules/Index roles (cannot read donor data). Role list to be confirmed in a pilot |
| Repository | Public recommended (no secrets inside; enables free approval step and self-hosting). Private works too |
