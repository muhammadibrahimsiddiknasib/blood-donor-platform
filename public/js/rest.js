// Tiny Firestore REST client for the PUBLIC site (no SDK => very small payload on low-end phones).
// Reads public documents and creates form submissions. Everything is still enforced by firestore.rules.
import { firebaseConfig } from './site-config.js';

const base = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const key = `key=${encodeURIComponent(firebaseConfig.apiKey)}`;

function dec(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return decFields(v.mapValue.fields || {});
  return null;
}
function decFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f)) o[k] = dec(v);
  return o;
}
function enc(v) {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Number.isInteger(v)) return { integerValue: String(v) };
  return { stringValue: String(v) };
}

export async function getDocument(path) {
  const r = await fetch(`${base}/${path}?${key}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return decFields(d.fields || {});
}

export async function runQuery({ collection, equals = {}, orderBy, limit = 20, offset = 0 }) {
  const filters = Object.entries(equals).map(([field, value]) => ({
    fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
  }));
  const structuredQuery = { from: [{ collectionId: collection }], limit, offset };
  if (filters.length === 1) structuredQuery.where = filters[0];
  else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
  if (orderBy) structuredQuery.orderBy = [{ field: { fieldPath: orderBy }, direction: 'DESCENDING' }];
  const r = await fetch(`${base}:runQuery?${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  return rows.filter((x) => x.document).map((x) => ({
    id: x.document.name.split('/').pop(),
    ...decFields(x.document.fields || {}),
  }));
}

// Atomically create one or more documents. docs: [{ path:'collection/id', data:{...}, timeField:'createdAt' }]
// "create" semantics: fails if the id already exists. The time field is set by the server (request.time).
export async function createDocuments(docs) {
  const root = `projects/${firebaseConfig.projectId}/databases/(default)/documents`;
  const writes = docs.map((d) => ({
    update: {
      name: `${root}/${d.path}`,
      fields: Object.fromEntries(Object.entries(d.data).map(([k, v]) => [k, enc(v)])),
    },
    updateMask: { fieldPaths: Object.keys(d.data) },
    currentDocument: { exists: false },
    updateTransforms: [{ fieldPath: d.timeField, setToServerValue: 'REQUEST_TIME' }],
  }));
  const r = await fetch(`${base}:commit?${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
}
