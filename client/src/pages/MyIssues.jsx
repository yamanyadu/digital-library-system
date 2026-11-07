import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Msg, Pager } from '../components/Bits.jsx';
import IssueTable from '../components/IssueTable.jsx';

export default function MyIssues() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ results: [], total: 0, limit: 20 });
  const [error, setError] = useState('');

  useEffect(() => {
    api('/issues/my', { params: { status, page } }).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [status, page]);

  return (
    <>
      <h2>My issued books</h2>
      <div className="row">
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All history</option>
          <option value="active">Currently with me</option>
          <option value="overdue">Overdue</option>
          <option value="returned">Returned</option>
          <option value="unpaid_fine">Unpaid fines</option>
        </select>
      </div>
      <Msg error={error} />
      <div className="card"><IssueTable rows={data.results} /></div>
      {data.total > 0 && <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />}
    </>
  );
}
