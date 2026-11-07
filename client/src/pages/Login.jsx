import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { Msg, Field } from '../components/Bits.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { await login(form.email, form.password); navigate('/'); }
    catch (err) { setError(err.message); }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Login</h2>
      <Msg error={error} />
      <Field label="Email"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      <Field label="Password"><input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      <button className="btn primary">Login</button>
      <p className="muted small">New here? <Link to="/register">Create an account</Link></p>
    </form>
  );
}
