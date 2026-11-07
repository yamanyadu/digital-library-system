import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Nav from './components/Nav.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Catalog from './pages/Catalog.jsx';
import BookDetail from './pages/BookDetail.jsx';
import MyIssues from './pages/MyIssues.jsx';
import Desk from './pages/Desk.jsx';
import ManageBooks from './pages/ManageBooks.jsx';
import Admin from './pages/Admin.jsx';

function Guard({ staff, admin, children }) {
  const { user, loading, isStaff, isAdmin } = useAuth();
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if ((staff && !isStaff) || (admin && !isAdmin)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Guard><Catalog /></Guard>} />
          <Route path="/books/:id" element={<Guard><BookDetail /></Guard>} />
          <Route path="/my-issues" element={<Guard><MyIssues /></Guard>} />
          <Route path="/desk" element={<Guard staff><Desk /></Guard>} />
          <Route path="/manage-books" element={<Guard staff><ManageBooks /></Guard>} />
          <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
