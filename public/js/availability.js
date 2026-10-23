// Pure date/phone helpers (no DOM, no Firebase) so they can be unit-tested with plain Node.
// Cautious wording only: this is coordination help, never medical eligibility.

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d) ? null : d;
};

export const todayStr = () => fmt(new Date());

// Calendar-month addition that clamps to the end of the target month (Jan 31 + 1 month = Feb 28/29).
export function addMonths(dateStr, months) {
  const d = parse(dateStr);
  if (!d) return '';
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(months), 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return fmt(t);
}

// last verified donation date + policy interval => next possible date ('' if unknown)
export function computeNextEligible(lastDonationDate, months) {
  if (!lastDonationDate) return '';
  return addMonths(lastDonationDate, months || 4);
}

// Remaining time between today and next date, in calendar terms.
//   today >= next            -> { kind: 'now' }
//   under 1 calendar month   -> { kind: 'days', days }            (never "0 months N days")
//   1 month or more          -> { kind: 'months', months, days }
export function remaining(today, next) {
  const t = parse(today);
  const n = parse(next);
  if (!t || !n || t >= n) return { kind: 'now' };
  let months = 0;
  while (parse(addMonths(today, months + 1)) <= n) months++;
  const base = parse(addMonths(today, months));
  const days = Math.round((n - base) / 86400000);
  if (months === 0) return { kind: 'days', days };
  return { kind: 'months', months, days };
}

// Public donor -> i18n key + css class + optional remaining info
export function publicStatus(p, today = todayStr()) {
  if (p.availabilityLabel === 'unavailable') return { key: 'status_unavailable', cls: 'no' };
  if (!p.availableFrom) return { key: 'status_unverified', cls: 'unk' };
  const r = remaining(today, p.availableFrom);
  if (r.kind === 'now') return { key: 'status_maybe', cls: 'ok' };
  return { key: 'status_recovery', cls: 'wait', remaining: r, nextDate: p.availableFrom };
}

// ---- admin-side status model (six statuses) ----
export const DONOR_STATUSES = ['available', 'unavailable', 'recovery', 'pending', 'hidden', 'review'];
const PUBLIC_STATUSES = ['available', 'unavailable', 'recovery'];

// Which public document (if any) should exist for this private donor record?
export function publicProjection(d, months, consentVersion) {
  if (!d.publicConsent || d.activeStatus === false) return null;
  if (!PUBLIC_STATUSES.includes(d.status)) return null;
  return {
    displayName: d.displayName,
    bloodGroup: d.bloodGroup,
    district: d.district,
    districtKey: String(d.district || '').trim().toLowerCase(),
    availabilityLabel: d.status === 'unavailable' ? 'unavailable' : 'dated',
    availableFrom: d.status === 'unavailable' ? '' : computeNextEligible(d.lastDonationDate, months),
    consentVersion: consentVersion || d.consentVersion || '1',
  };
}

// ---- phone helpers (duplicate warnings) ----
const BN = '০১২৩৪৫৬৭৮৯';
export function normalizeDigits(s) {
  return String(s || '').replace(/[০-৯]/g, (c) => String(BN.indexOf(c)));
}
export function phoneKey(p) {
  const digits = normalizeDigits(p).replace(/\D/g, '');
  return digits.slice(-10); // last 10 digits: matches +880 17… and 017…
}
