// Human-friendly reference IDs, e.g. BR-7K3M9Q (no 0/O/1/I to avoid confusion).
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function refId(prefix) {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return prefix + '-' + Array.from(b, (x) => A[x % A.length]).join('');
}
