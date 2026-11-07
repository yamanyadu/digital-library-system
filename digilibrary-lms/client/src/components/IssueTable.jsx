// Shared table of issue records. `actions` (optional) renders extra buttons per row.
export default function IssueTable({ rows, showMember, actions }) {
  if (!rows.length) return <p className="muted">No records.</p>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {showMember && <th>Member</th>}
            <th>Book</th><th>Serial</th><th>Issued</th><th>Due</th><th>Returned</th><th>Fine</th>{actions && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.issue_id} className={r.is_overdue ? 'overdue' : ''}>
              {showMember && <td>{r.member_name}<div className="muted small">{r.member_code}</div></td>}
              <td>{r.title}<div className="muted small">{r.author}</div></td>
              <td>{r.serial_no}</td>
              <td>{r.issue_date}</td>
              <td>{r.due_date}{r.is_overdue ? <span className="tag lost">overdue</span> : null}</td>
              <td>{r.return_date || '—'}</td>
              <td>{Number(r.fine) > 0 ? `${r.fine} ${r.return_date ? (r.fine_paid ? '(paid)' : '(unpaid)') : '(running)'}` : '—'}</td>
              {actions && <td>{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
