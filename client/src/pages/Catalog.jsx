import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Msg, Pager, Availability } from '../components/Bits.jsx';

export default function Catalog() {
  const [filters, setFilters] = useState({ q: '', subject: '', available_only: false });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ results: [], total: 0, limit: 10 });
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { api('/books/subjects/list').then(setSubjects).catch(() => {}); }, []);

  useEffect(() => {
    api('/books', { params: { ...applied, available_only: applied.available_only ? 'true' : '', page } })
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message));
  }, [applied, page]);

  const search = (e) => { e.preventDefault(); setPage(1); setApplied(filters); };

  return (
    <>
      <form className="card searchbar" onSubmit={search}>
        <input placeholder="Search title, author, ISBN or subject…" value={filters.q}
               onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.books})</option>)}
        </select>
        <label className="inline">
          <input type="checkbox" checked={filters.available_only}
                 onChange={(e) => setFilters({ ...filters, available_only: e.target.checked })} /> Available only
        </label>
        <button className="btn primary">Search</button>
      </form>

      <Msg error={error} />
      {data.results.length === 0 && !error && <p className="muted">No books found.</p>}

      {data.results.map((b) => (
        <div className="card result" key={b.book_id}>
          <div className="info">
            <Link to={`/books/${b.book_id}`} className="title">{b.title}</Link>
            <div className="muted">{b.author}{b.publication_year ? ` · ${b.publication_year}` : ''}</div>
            <div>{b.subjects.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
          </div>
          <Availability a={b.availability} />
        </div>
      ))}

      {data.total > 0 && <Pager page={page} limit={data.limit} total={data.total} onPage={setPage} />}
    </>
  );
}
