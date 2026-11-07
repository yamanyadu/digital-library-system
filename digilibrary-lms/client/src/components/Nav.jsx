import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Nav() {
  const { user, logout, isStaff, isAdmin } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="nav">
      <strong className="brand">DigiLibrary</strong>
      {user ? (
        <>
          <NavLink to="/" end>Catalog</NavLink>
          <NavLink to="/my-issues">My Books</NavLink>
          {isStaff && <NavLink to="/desk">Issue Desk</NavLink>}
          {isStaff && <NavLink to="/manage-books">Manage Books</NavLink>}
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          <span className="spacer" />
          <span className="muted small">{user.name} · {user.role} · {user.member_code}</span>
          <button className="btn small" onClick={() => { logout(); navigate('/login'); }}>Logout</button>
        </>
      ) : (
        <>
          <span className="spacer" />
          <NavLink to="/login">Login</NavLink>
          <NavLink to="/register">Register</NavLink>
        </>
      )}
    </header>
  );
}
