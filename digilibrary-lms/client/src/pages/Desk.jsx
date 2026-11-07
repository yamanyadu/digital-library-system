import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { Msg, Pager, Field } from '../components/Bits.jsx';
import IssueTable from '../components/IssueTable.jsx';

export default function Desk() {
  // ----- issue form -----
  const [form, setForm] = useState({ member_code: '', serial_no: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // ----- member finder -----
  const [mq, setMq] = useState('');
  const [members, setMembers] = useState([]);

  // ----- records -----
  const [filter, setFilter] = useState({ status: 'active', member_code: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ results: [], total: 0, limit: 20 });
  const [condition, setCondition] = useState({}); // per-issue return condition

  const load = useCallback(() => {
    api('/issues', { params: { ...filter, page } }).then(setData).catch((e) => setError(e.message));
  }, [filter, page]);
  useEffect(load, [load]);

  const run = async (fn, msg) => {
    setError(''); setOk('');
    try { await fn(); setOk(msg); load(); } catch (e) { setError(e.message); }
  };

  const issue = (e) => {
    e.preventDefault();
    run(async () => { await api('/issues', { method: 'POST', body: form }); setForm({ ...form, serial_no: '' }); }, 'Book issued');
  };

  const findMembers = async (e) => {
    e.preventDefault();
    try { setMembers((await api('/users', { params: { q: mq, limit: 8 } })).results); } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h2>Issue desk</h2>
      <Msg error={error} ok={ok} />

      <div className="grid2">
        <form className="card" onSubmit={issue}>
          <h3>Issue a book</h3>
          <Field label="Member code (e.g. STU-2026-00012)"><input required value={form.member_code} onChange={(e) => setForm({ ...form, member_code: e.target.value })} /></Field>
          <Field label="Copy serial no. (e.g. BK00001-001)"><input required value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} /></Field>
          <button className="btn primary">Issue</button>
        </form>

        <div className="card">
          <h3>Find member</h3>
          <form className="row" onSubmit={findMembers}>
            <input placeholder="Name, email or code" value={mq} onChange={(e) => setMq(e.target.value)} />
            <button className="btn">Find</button>
          </form>
          {members.map((m) => (
            <div key={m.user_id} className="member" onClick={() => setForm({ ...form, member_code: m.member_code })}>
              <strong>{m.name}</strong> <span className="chip">{m.role}</span>
              <div className="muted small">{m.member_code} · {m.department || '—'} · {m.status}</div>
            </div>
          ))}
          {members.length > 0 && <p className="muted small">Click a member to fill the issue form.</p>}
        </div>
      </div>

      <h3>Records</h3>
      <div className="row">
        <select value={filter.status} onChange={(e) => { setPage(1); setFilter({ ...filter, status: e.target.value }); }}>
          <option value="">All</option><option value="active">Currently issued</option>
          <option value="overdue">Overdue</option><option value="returned">Returned</option>
          <option value="unpaid_fine">Unpaid fines</option>
        </select>
        <input placeholder="Filter by member code" value={filter.member_code}
               onChange={(e) => { setPage(1); setFilter({ ...filter, member_code: e.target.value }); }} />
      </div>
      <div className="card">
        <IssueTable rows={data.results} showMember actions={(r) => (
          <div className="row nowrap">
            {!r.return_date && (
              <>
                <select value={condition[r.issue_id] || 'good'} onChange={(e) => setCondition({ ...condition, [r.issue_id]: e.target.value })}>
                  <option value="good">good</option><option value="damaged">damaged</option><option value="lost">lost</option>
                </select>
                <button className="btn small" onClick={() => run(() => api(`/issues/${r.issue_id}/return`, { method: 'POST', body: { condition: condition[r.issue_id] || 'good' } }), 'Returned')}>Return</button>
                <button className="btn small" onClick={() => run(() => api(`/issues/${r.issue_id}/renew`, { method: 'POST' }), 'Renewed')}>Renew</button>
              </>
            )}
            {r.return_date && Number(r.fine) > 0 && !r.fine_paid && (
              <button className="btn small" onClick={() => run(() => api(`/issues/${r.issue_id}/pay-fine`, { method: 'POST' }), 'Fine marked paid')}>Mark fine paid</button>
            )}
          </div>
        )} />
      </div>
      {data.total > 0 && <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />}
    </>
  );
}
