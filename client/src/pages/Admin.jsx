import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Msg, Pager } from '../components/Bits.jsx';

export default function Admin() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [summary, setSummary] = useState(null);

  const [gen, setGen] = useState({ role: 'librarian', count: 1, expires_in_days: 7 });
  const [newCodes, setNewCodes] = useState([]);
  const [codes, setCodes] = useState([]);

  const [uq, setUq] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState({ results: [], total: 0, limit: 20 });

  const loadCodes = useCallback(() => api('/registration-codes').then(setCodes).catch((e) => setError(e.message)), []);
  const loadUsers = useCallback(() => api('/users', { params: { q: uq, page } }).then(setUsers).catch((e) => setError(e.message)), [uq, page]);

  useEffect(() => { api('/reports/summary').then(setSummary).catch((e) => setError(e.message)); loadCodes(); }, [loadCodes]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const run = async (fn, msg, after) => {
    setError(''); setOk('');
    try { await fn(); setOk(msg); after && after(); } catch (e) { setError(e.message); }
  };

  const generate = (e) => {
    e.preventDefault();
    run(async () => { setNewCodes((await api('/registration-codes', { method: 'POST', body: gen })).codes); }, 'Codes created', loadCodes);
  };

  return (
    <>
      <h2>Admin</h2>
      <Msg error={error} ok={ok} />

      {summary && (
        <div className="stats">
          <div className="card stat"><strong>{summary.titles}</strong><span>Titles</span></div>
          <div className="card stat"><strong>{summary.copies.available ?? 0} / {summary.copies.total_copies ?? 0}</strong><span>Copies available</span></div>
          <div className="card stat"><strong>{summary.copies.issued ?? 0}</strong><span>Issued</span></div>
          <div className="card stat"><strong>{summary.overdue_books}</strong><span>Overdue</span></div>
          <div className="card stat"><strong>{summary.unpaid_fines}</strong><span>Unpaid fines</span></div>
        </div>
      )}

      <div className="card">
        <h3>Registration codes</h3>
        <form className="row" onSubmit={generate}>
          <select value={gen.role} onChange={(e) => setGen({ ...gen, role: e.target.value })}>
            <option>librarian</option><option>staff</option><option>admin</option>
          </select>
          <input type="number" min={1} max={50} style={{ width: 70 }} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} title="How many codes" />
          <input type="number" min={1} max={90} style={{ width: 70 }} value={gen.expires_in_days} onChange={(e) => setGen({ ...gen, expires_in_days: e.target.value })} title="Valid for days" />
          <button className="btn primary">Generate</button>
        </form>
        {newCodes.length > 0 && <p className="alert ok">New codes (copy now): <strong>{newCodes.join('  ')}</strong></p>}
        <table>
          <thead><tr><th>Code</th><th>Role</th><th>Status</th><th>Expires</th><th>Used by</th><th /></tr></thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code}>
                <td>{c.code}</td><td>{c.role}</td><td><span className={'tag ' + c.status}>{c.status}</span></td>
                <td>{c.expires_at}</td><td>{c.used_by_name || '—'}</td>
                <td>{c.status === 'unused' && <button className="btn small" onClick={() => run(() => api(`/registration-codes/${c.code}`, { method: 'DELETE' }), 'Code revoked', loadCodes)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Members</h3>
        <div className="row">
          <input placeholder="Search name, email, code" value={uq} onChange={(e) => { setPage(1); setUq(e.target.value); }} />
        </div>
        <div className="scroll">
          <table>
            <thead><tr><th>Name</th><th>Code</th><th>Role</th><th>Department</th><th>Status</th></tr></thead>
            <tbody>
              {users.results.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.name}<div className="muted small">{u.email}</div></td>
                  <td>{u.member_code}</td>
                  <td>
                    <select disabled={u.user_id === user.user_id} value={u.role}
                            onChange={(e) => run(() => api(`/users/${u.user_id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role updated', loadUsers)}>
                      {['student', 'faculty', 'staff', 'librarian', 'admin'].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{u.department || '—'}</td>
                  <td>
                    <span className={'tag ' + (u.status === 'active' ? 'available' : 'lost')}>{u.status}</span>{' '}
                    {u.user_id !== user.user_id && (
                      <button className="btn small" onClick={() => run(() => api(`/users/${u.user_id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'suspended' : 'active' } }), 'Status updated', loadUsers)}>
                        {u.status === 'active' ? 'Suspend' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.total > 0 && <Pager page={page} limit={users.limit} total={users.total} onPage={setPage} />}
      </div>
    </>
  );
}
