// Small shared UI pieces
export const Msg = ({ error, ok }) =>
  error ? <p className="alert error">{error}</p> : ok ? <p className="alert ok">{ok}</p> : null;

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span className="muted small">Page {page} of {pages} · {total} results</span>
      <button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

export const Availability = ({ a }) => (
  <div className={'avail ' + (a.is_available ? 'yes' : 'no')}>
    <strong>{a.available} / {a.total}</strong>
    <span>{a.is_available ? 'available' : 'not available'}</span>
  </div>
);

export const Field = ({ label, children }) => (
  <label className="field"><span>{label}</span>{children}</label>
);
