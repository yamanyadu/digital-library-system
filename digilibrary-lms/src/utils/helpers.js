const crypto = require('crypto');

const pad = (n, w) => String(n).padStart(w, '0');
const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

// Builds "col1 = ?, col2 = ?" from an object, restricted to allowed columns.
function buildUpdate(data, allowed) {
  const cols = Object.keys(data).filter((k) => allowed.includes(k) && data[k] !== undefined);
  return { sql: cols.map((c) => `${c} = ?`).join(', '), params: cols.map((c) => data[c]), empty: cols.length === 0 };
}

// Unambiguous alphabet (no 0/O/1/I)
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(prefix) {
  const part = () => Array.from({ length: 4 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
  return `${prefix}-${part()}-${part()}`;
}

const ROLE_PREFIX = { admin: 'ADM', librarian: 'LIB', staff: 'STF', faculty: 'FAC', student: 'STU' };

module.exports = { pad, escapeLike, buildUpdate, randomCode, ROLE_PREFIX };
