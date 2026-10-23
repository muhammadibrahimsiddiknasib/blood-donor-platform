// Plain Node tests (no emulator needed): npm run test:logic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, computeNextEligible, remaining, publicStatus, publicProjection, phoneKey, normalizeDigits,
} from '../public/js/availability.js';
import { csvEscape } from '../public/js/ui.js';

test('addMonths clamps to month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-10-22', 4), '2027-02-22');
  assert.equal(addMonths('2026-11-30', 4), '2027-03-30');
  assert.equal(addMonths('', 4), '');
});

test('computeNextEligible', () => {
  assert.equal(computeNextEligible('2026-10-01', 4), '2027-02-01');
  assert.equal(computeNextEligible('', 4), '');
});

test('remaining: now / same day / past', () => {
  assert.deepEqual(remaining('2026-10-22', '2026-10-22'), { kind: 'now' });
  assert.deepEqual(remaining('2026-10-22', '2026-10-01'), { kind: 'now' });
  assert.deepEqual(remaining('2026-10-22', ''), { kind: 'now' });
});

test('remaining: under one month shows days only, never "0 months N days"', () => {
  assert.deepEqual(remaining('2026-10-22', '2026-10-23'), { kind: 'days', days: 1 });
  assert.deepEqual(remaining('2026-10-22', '2026-11-20'), { kind: 'days', days: 29 });
  assert.deepEqual(remaining('2026-10-22', '2026-10-29'), { kind: 'days', days: 7 });
});

test('remaining: one month or more shows months + days', () => {
  assert.deepEqual(remaining('2026-10-22', '2026-11-22'), { kind: 'months', months: 1, days: 0 });
  assert.deepEqual(remaining('2026-10-22', '2026-12-27'), { kind: 'months', months: 2, days: 5 });
  assert.deepEqual(remaining('2026-10-22', '2027-02-22'), { kind: 'months', months: 4, days: 0 });
});

test('remaining: month-end boundary stays consistent', () => {
  // Jan 31 + 1 month clamps to Feb 28 -> Mar 1 is 1 month 1 day away
  assert.deepEqual(remaining('2027-01-31', '2027-03-01'), { kind: 'months', months: 1, days: 1 });
  assert.deepEqual(remaining('2027-01-31', '2027-02-27'), { kind: 'days', days: 27 });
});

test('publicStatus', () => {
  const today = '2026-10-22';
  assert.equal(publicStatus({ availabilityLabel: 'unavailable' }, today).key, 'status_unavailable');
  assert.equal(publicStatus({ availabilityLabel: 'dated', availableFrom: '' }, today).key, 'status_unverified');
  assert.equal(publicStatus({ availabilityLabel: 'dated', availableFrom: '2026-10-22' }, today).key, 'status_maybe');
  const r = publicStatus({ availabilityLabel: 'dated', availableFrom: '2026-11-20' }, today);
  assert.equal(r.key, 'status_recovery');
  assert.deepEqual(r.remaining, { kind: 'days', days: 29 });
});

test('publicProjection hides pending/hidden/review/no-consent/inactive', () => {
  const base = { displayName: 'Rahim', bloodGroup: 'O+', district: ' Dhaka ', publicConsent: true, activeStatus: true, status: 'available', lastDonationDate: '2026-06-01' };
  const p = publicProjection(base, 4, '1');
  assert.equal(p.districtKey, 'dhaka');
  assert.equal(p.availableFrom, '2026-10-01');
  assert.equal(p.availabilityLabel, 'dated');
  for (const status of ['pending', 'hidden', 'review']) assert.equal(publicProjection({ ...base, status }, 4, '1'), null);
  assert.equal(publicProjection({ ...base, publicConsent: false }, 4, '1'), null);
  assert.equal(publicProjection({ ...base, activeStatus: false }, 4, '1'), null);
  assert.equal(publicProjection({ ...base, status: 'unavailable' }, 4, '1').availabilityLabel, 'unavailable');
  // private fields never appear
  assert.equal('phone' in publicProjection({ ...base, phone: '017' }, 4, '1'), false);
});

test('phone matching', () => {
  assert.equal(phoneKey('+880 1712-345678'), phoneKey('01712345678'));
  assert.equal(phoneKey('০১৭১২৩৪৫৬৭৮'), phoneKey('01712345678'));
  assert.notEqual(phoneKey('01712345678'), phoneKey('01812345678'));
  assert.equal(normalizeDigits('০১২'), '012');
});

test('csv formula injection is neutralised', () => {
  assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape(null), '');
});
