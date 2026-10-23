// Run with: npm run test:rules  (needs Java + Firebase emulator; CI runs it automatically)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, deleteDoc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-blood-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const seedAdmin = (uid = 'admin1') =>
  env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', uid), { role: 'admin', displayName: 'A', active: true, createdAt: new Date() });
    await setDoc(doc(db, 'setup', 'state'), { completed: true, adminUid: uid, createdAt: new Date() });
  });
const anon = () => env.unauthenticatedContext().firestore();
const admin = (uid = 'admin1') => env.authenticatedContext(uid).firestore();

const goodPublic = {
  displayName: 'Rahim', bloodGroup: 'O+', district: 'Dhaka', districtKey: 'dhaka',
  availabilityLabel: 'dated', availableFrom: '', lastUpdated: serverTimestamp(), consentVersion: '1',
};
const goodApp = (id = 'DA-ABC234') => ({
  ref: id, name: 'Rahim Uddin', displayName: 'Rahim', phone: '01712345678', bloodGroup: 'O+', district: 'Dhaka', area: '',
  lastDonationDate: '', contactPref: 'phone', publicConsent: true, privacyConsent: true, consentVersion: '1',
  status: 'pending', submittedAt: serverTimestamp(),
});
const goodReq = (id = 'BR-ABC234') => ({
  ref: id, contactName: 'Karim', phone: '01712345678', bloodGroup: 'A+', units: 2, district: 'Dhaka', hospital: 'City Hospital',
  neededAt: '2026-11-01T10:00', urgency: 'urgent', note: '', privacyConsent: true, pledge: false, status: 'pending',
  source: 'public', createdAt: serverTimestamp(),
});
const goodPubReq = (id = 'BR-ABC234') => ({
  ref: id, bloodGroup: 'A+', units: 2, district: 'Dhaka', neededDate: '2026-11-01', urgency: 'urgent', publicStatus: 'pending', createdAt: serverTimestamp(),
});
const goodReport = (id = 'DR-ABC234') => ({
  ref: id, reporterName: 'Rahim Uddin', phone: '01712345678', donationDate: '2026-10-01', recipientType: 'hospital',
  recipientRef: 'City Hospital', notes: '', privacyConsent: true, status: 'pending', createdAt: serverTimestamp(),
});

// ---------------------------------------------------------------- baseline
test('anonymous can read public collections but not private ones', async () => {
  await seedAdmin();
  const db = anon();
  await assertSucceeds(getDoc(doc(db, 'publicDonors', 'x')));
  await assertSucceeds(getDoc(doc(db, 'publicBloodRequests', 'x')));
  await assertSucceeds(getDoc(doc(db, 'organization', 'public')));
  for (const c of ['donors', 'bloodRequests', 'donorApplications', 'donationReports', 'donations', 'auditEvents', 'users']) {
    await assertFails(getDoc(doc(db, c, 'x')));
    await assertFails(getDocs(collection(db, c)));
  }
});

test('anonymous cannot write directly to protected collections', async () => {
  const db = anon();
  await assertFails(setDoc(doc(db, 'publicDonors', 'x'), goodPublic));
  await assertFails(setDoc(doc(db, 'donors', 'x'), { legalName: 'x' }));
  await assertFails(setDoc(doc(db, 'donations', 'x'), { donorId: 'x' }));
  await assertFails(setDoc(doc(db, 'organization', 'public'), { organizationName: 'x' }));
});

test('first admin bootstrap works once, then is closed', async () => {
  const a = env.authenticatedContext('first').firestore();
  const b1 = writeBatch(a);
  b1.set(doc(a, 'users', 'first'), { role: 'admin', displayName: 'F', active: true, createdAt: serverTimestamp() });
  b1.set(doc(a, 'setup', 'state'), { completed: true, adminUid: 'first', createdAt: serverTimestamp() });
  await assertSucceeds(b1.commit());

  const m = env.authenticatedContext('mallory').firestore();
  const b2 = writeBatch(m);
  b2.set(doc(m, 'users', 'mallory'), { role: 'admin', displayName: 'M', active: true, createdAt: serverTimestamp() });
  b2.set(doc(m, 'setup', 'state'), { completed: true, adminUid: 'mallory', createdAt: serverTimestamp() });
  await assertFails(b2.commit());
  await assertFails(setDoc(doc(m, 'users', 'mallory'), { role: 'admin', displayName: 'M', active: true, createdAt: serverTimestamp() }));
});

test('signed-in non-admin has no private access and cannot self-promote', async () => {
  await seedAdmin();
  const db = env.authenticatedContext('random').firestore();
  await assertFails(getDoc(doc(db, 'donors', 'x')));
  await assertFails(setDoc(doc(db, 'publicDonors', 'x'), goodPublic));
  await assertFails(setDoc(doc(db, 'users', 'random'), { role: 'admin', displayName: 'R', active: true, createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users', 'random'), { role: 'admin', displayName: 'R', active: true, createdAt: serverTimestamp(), email: 'r@x.org', createdBy: 'random' }));
});

test('admin can write a clean public donor but not one with a phone', async () => {
  await seedAdmin();
  const db = admin();
  await assertSucceeds(setDoc(doc(db, 'publicDonors', 'ok'), goodPublic));
  await assertFails(setDoc(doc(db, 'publicDonors', 'bad'), { ...goodPublic, phone: '01700000000' }));
  await assertFails(setDoc(doc(db, 'publicDonors', 'bad2'), { ...goodPublic, bloodGroup: 'Z+' }));
});

test('admin cannot change own role; audit log is append-only', async () => {
  await seedAdmin();
  const db = admin();
  await assertFails(setDoc(doc(db, 'users', 'admin1'), { role: 'admin', displayName: 'A', active: true, createdAt: new Date() }));
  const ref = doc(db, 'auditEvents', 'e1');
  await assertSucceeds(setDoc(ref, { actorUid: 'admin1', action: 'x', targetType: 'donor', targetId: '1', timestamp: serverTimestamp() }));
  await assertFails(setDoc(ref, { actorUid: 'admin1', action: 'y' }));
  await assertFails(deleteDoc(ref));
});

// ------------------------------------------------------------ add new admin
test('an existing admin can add another admin; non-admins and bad shapes cannot', async () => {
  await seedAdmin();
  const db = admin();
  const base = { role: 'admin', displayName: 'Second', active: true, createdAt: serverTimestamp(), email: 'second@example.org', createdBy: 'admin1' };
  await assertSucceeds(setDoc(doc(db, 'users', 'admin2'), base));
  await assertFails(setDoc(doc(db, 'users', 'admin3'), { ...base, createdBy: 'someone-else' }));
  await assertFails(setDoc(doc(db, 'users', 'admin4'), { ...base, role: 'superuser' }));
  await assertFails(setDoc(doc(db, 'users', 'admin5'), { ...base, extra: 1 }));
  // the new admin now works; a deactivated admin does not
  await assertSucceeds(setDoc(doc(admin('admin2'), 'donors', 'd1'), { legalName: 'x' }));
  await assertSucceeds(updateDoc(doc(db, 'users', 'admin2'), { active: false }));
  await assertFails(setDoc(doc(admin('admin2'), 'donors', 'd2'), { legalName: 'x' }));
  // admins cannot deactivate themselves
  await assertFails(updateDoc(doc(db, 'users', 'admin1'), { active: false }));
});

// ------------------------------------------------------ donor applications
test('public can create a valid donor application exactly once; cannot read, edit or fake approval', async () => {
  await seedAdmin();
  const db = anon();
  await assertSucceeds(setDoc(doc(db, 'donorApplications', 'DA-ABC234'), goodApp()));
  await assertFails(setDoc(doc(db, 'donorApplications', 'DA-ABC234'), goodApp())); // replay/overwrite
  await assertFails(updateDoc(doc(db, 'donorApplications', 'DA-ABC234'), { status: 'approved' }));
  await assertFails(getDoc(doc(db, 'donorApplications', 'DA-ABC234')));
  await assertFails(setDoc(doc(db, 'donorApplications', 'DA-ZZZ999'), { ...goodApp('DA-ZZZ999'), status: 'approved' }));
  await assertFails(setDoc(doc(db, 'donorApplications', 'DA-ZZZ998'), { ...goodApp('DA-ZZZ998'), extra: 'x' }));
  await assertFails(setDoc(doc(db, 'donorApplications', 'DA-ZZZ997'), { ...goodApp('DA-ZZZ997'), phone: 'abc' }));
  await assertFails(setDoc(doc(db, 'donorApplications', 'DA-ZZZ996'), { ...goodApp('DA-ZZZ996'), privacyConsent: false }));
  await assertFails(setDoc(doc(db, 'donorApplications', 'DA-ZZZ995'), { ...goodApp('DA-ZZZ995'), submittedAt: new Date('2020-01-01') }));
  await assertFails(setDoc(doc(db, 'donorApplications', 'free-form-id'), goodApp('free-form-id')));
  // admin can review it
  await assertSucceeds(updateDoc(doc(admin(), 'donorApplications', 'DA-ABC234'), { status: 'approved' }));
});

test('an application never appears in the public donor list by itself', async () => {
  await seedAdmin();
  await assertSucceeds(setDoc(doc(anon(), 'donorApplications', 'DA-ABC234'), goodApp()));
  await assertFails(setDoc(doc(anon(), 'publicDonors', 'DA-ABC234'), goodPublic));
});

// ---------------------------------------------------------- blood requests
test('public can submit a blood request only as a private+public pair', async () => {
  await seedAdmin();
  const a = anon();
  const b = writeBatch(a);
  b.set(doc(a, 'bloodRequests', 'BR-ABC234'), goodReq());
  b.set(doc(a, 'publicBloodRequests', 'BR-ABC234'), goodPubReq());
  await assertSucceeds(b.commit());

  // private only (no public projection) is refused, and vice versa
  await assertFails(setDoc(doc(anon(), 'bloodRequests', 'BR-ABC235'), goodReq('BR-ABC235')));
  await assertFails(setDoc(doc(anon(), 'publicBloodRequests', 'BR-ABC236'), goodPubReq('BR-ABC236')));
  // nobody can read the private record anonymously; the public one is readable
  await assertFails(getDoc(doc(anon(), 'bloodRequests', 'BR-ABC234')));
  await assertSucceeds(getDoc(doc(anon(), 'publicBloodRequests', 'BR-ABC234')));
  // public cannot rewrite or close it
  await assertFails(updateDoc(doc(anon(), 'publicBloodRequests', 'BR-ABC234'), { publicStatus: 'fulfilled' }));
});

test('the public request projection can never carry a phone or patient detail', async () => {
  await seedAdmin();
  const a = anon();
  const b = writeBatch(a);
  b.set(doc(a, 'bloodRequests', 'BR-ABC237'), goodReq('BR-ABC237'));
  b.set(doc(a, 'publicBloodRequests', 'BR-ABC237'), { ...goodPubReq('BR-ABC237'), phone: '01712345678' });
  await assertFails(b.commit());
  // not even an admin can put extra fields into the public projection
  await assertFails(setDoc(doc(admin(), 'publicBloodRequests', 'x'), { ...goodPubReq('x'), contactName: 'Karim' }));
  await assertSucceeds(setDoc(doc(admin(), 'publicBloodRequests', 'manual1'), goodPubReq('manual1')));
});

test('request validation: units, status and urgency', async () => {
  await seedAdmin();
  const a = anon();
  const t1 = writeBatch(a);
  t1.set(doc(a, 'bloodRequests', 'BR-BAD001'), { ...goodReq('BR-BAD001'), units: 500 });
  t1.set(doc(a, 'publicBloodRequests', 'BR-BAD001'), goodPubReq('BR-BAD001'));
  await assertFails(t1.commit());
  const t2 = writeBatch(a);
  t2.set(doc(a, 'bloodRequests', 'BR-BAD002'), { ...goodReq('BR-BAD002'), status: 'fulfilled' });
  t2.set(doc(a, 'publicBloodRequests', 'BR-BAD002'), goodPubReq('BR-BAD002'));
  await assertFails(t2.commit());
  const t3 = writeBatch(a);
  t3.set(doc(a, 'bloodRequests', 'BR-BAD003'), goodReq('BR-BAD003'));
  t3.set(doc(a, 'publicBloodRequests', 'BR-BAD003'), { ...goodPubReq('BR-BAD003'), publicStatus: 'fulfilled' });
  await assertFails(t3.commit());
});

test('admin can change request status and hide the public summary', async () => {
  await seedAdmin();
  const a = anon();
  const b = writeBatch(a);
  b.set(doc(a, 'bloodRequests', 'BR-ABC234'), goodReq());
  b.set(doc(a, 'publicBloodRequests', 'BR-ABC234'), goodPubReq());
  await assertSucceeds(b.commit());
  const db = admin();
  const upd = writeBatch(db);
  upd.update(doc(db, 'bloodRequests', 'BR-ABC234'), { status: 'coordinating' });
  upd.update(doc(db, 'publicBloodRequests', 'BR-ABC234'), { publicStatus: 'coordinating' });
  await assertSucceeds(upd.commit());
  await assertSucceeds(deleteDoc(doc(db, 'publicBloodRequests', 'BR-ABC234')));
});

// ------------------------------------------------- donation reports & records
test('public can submit a donation report once, but never read or approve it', async () => {
  await seedAdmin();
  await assertSucceeds(setDoc(doc(anon(), 'donationReports', 'DR-ABC234'), goodReport()));
  await assertFails(setDoc(doc(anon(), 'donationReports', 'DR-ABC234'), goodReport()));
  await assertFails(getDoc(doc(anon(), 'donationReports', 'DR-ABC234')));
  await assertFails(updateDoc(doc(anon(), 'donationReports', 'DR-ABC234'), { status: 'approved' }));
  await assertFails(setDoc(doc(anon(), 'donationReports', 'DR-ABC235'), { ...goodReport('DR-ABC235'), status: 'approved' }));
  await assertFails(setDoc(doc(anon(), 'donationReports', 'DR-ABC236'), { ...goodReport('DR-ABC236'), donationDate: 'yesterday' }));
  // a report does not create approved history
  await assertFails(setDoc(doc(anon(), 'donations', 'x'), { donorId: 'd1', approvalStatus: 'approved' }));
});

test('donation history is admin-only and can be reversed but never hard-deleted', async () => {
  await seedAdmin();
  const db = admin();
  const rec = { donorId: 'd1', donationDate: '2026-10-01', approvalStatus: 'approved', reportedBy: 'admin' };
  await assertSucceeds(setDoc(doc(db, 'donations', 'don1'), rec));
  await assertSucceeds(updateDoc(doc(db, 'donations', 'don1'), { approvalStatus: 'reversed', reversedReason: 'typo' }));
  await assertFails(deleteDoc(doc(db, 'donations', 'don1')));
  await assertFails(getDoc(doc(anon(), 'donations', 'don1')));
});

// ------------------------------------------------------- organization settings
test('organization settings: https-only links, known keys only', async () => {
  await seedAdmin();
  const db = admin();
  const base = { organizationName: 'Org', slogan: '', defaultLanguage: 'en', enabledLanguages: ['en'], donationIntervalMonths: 4, publicPolicy: '', contactInfo: '', updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'organization', 'public'), { ...base, coordinatorPhone: '017', messengerUrl: 'https://m.me/x', whatsappUrl: 'https://wa.me/880', iconUrl: 'https://example.org/i.png', logoUrl: '' }));
  await assertFails(setDoc(doc(db, 'organization', 'public'), { ...base, whatsappUrl: 'javascript:alert(1)' }));
  await assertFails(setDoc(doc(db, 'organization', 'public'), { ...base, iconUrl: 'http://example.org/i.png' }));
  await assertFails(setDoc(doc(db, 'organization', 'public'), { ...base, secretKey: 'x' }));
  await assertFails(setDoc(doc(anon(), 'organization', 'public'), base));
});
