import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { Msg, Availability } from '../components/Bits.jsx';

export default function BookDetail() {
  const { id } = useParams();
  const { isStaff } = useAuth();
  const [book, setBook] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [count, setCount] = useState(1);

  const load = useCallback(() => {
    api(`/books/${id}`).then((b) => { setBook(b); setError(''); }).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn, msg) => {
    setError(''); setOk('');
    try { await fn(); setOk(msg); load(); } catch (e) { setError(e.message); }
  };

  if (!book) return <Msg error={error} />;
  const row = (label, v) => v ? <tr><th>{label}</th><td>{v}</td></tr> : null;

  return (
    <>
      <Link to="/" className="small">← Back to catalog</Link>
      <Msg error={error} ok={ok} />
      <div className="card result">
        <div className="info">
          <h2>{book.title}</h2>
          <div className="muted">{book.author}</div>
          <div>{book.subjects.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
        </div>
        <Availability a={book.availability} />
      </div>

      <div className="card">
        <h3>More details</h3>
        <table className="kv"><tbody>
          {row('ISBN', book.isbn)}{row('Publisher', book.publisher)}{row('Year', book.publication_year)}
          {row('Edition', book.edition)}{row('Language', book.language)}{row('Call number', book.call_number)}
          {row('Shelf location', book.shelf_location)}
          <tr><th>Quantity</th><td>{book.availability.available} available out of {book.availability.total}</td></tr>
          {row('Description', book.description)}
        </tbody></table>
      </div>

      <div className="card">
        <h3>Copies</h3>
        <table>
          <thead><tr><th>Serial no.</th><th>Status</th><th>Due back</th>{isStaff && <><th>Borrower</th><th>Action</th></>}</tr></thead>
          <tbody>
            {book.copies.map((c) => (
              <tr key={c.copy_id}>
                <td>{c.serial_no}</td>
                <td><span className={'tag ' + c.status}>{c.status}</span></td>
                <td>{c.status === 'issued' ? c.due_date : '—'}</td>
                {isStaff && <>
                  <td>{c.borrower_name ? `${c.borrower_name} (${c.borrower_code})` : '—'}</td>
                  <td>
                    {c.status !== 'issued' && ['available', 'damaged', 'lost'].filter((s) => s !== c.status).map((s) => (
                      <button key={s} className="btn small" onClick={() => act(() => api(`/books/copies/${c.copy_id}`, { method: 'PATCH', body: { status: s } }), `Copy marked ${s}`)}>
                        Mark {s}
                      </button>
                    ))}
                  </td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
        {isStaff && (
          <div className="row">
            <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 80 }} />
            <button className="btn" onClick={() => act(() => api(`/books/${id}/copies`, { method: 'POST', body: { count } }), 'Copies added')}>Add copies</button>
          </div>
        )}
      </div>

      {book.related_books.length > 0 && (
        <div className="card">
          <h3>Related books (same subjects)</h3>
          <ul>{book.related_books.map((r) => <li key={r.book_id}><Link to={`/books/${r.book_id}`}>{r.title}</Link> <span className="muted">— {r.author}</span></li>)}</ul>
        </div>
      )}
    </>
  );
}
