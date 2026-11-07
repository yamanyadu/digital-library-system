import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { Msg, Field } from '../components/Bits.jsx';

// Which extra fields each role must fill (mirrors the server rules)
const EXTRA = {
  student: ['department', 'course', 'year_of_study', 'enrollment_no'],
  faculty: ['department', 'employee_id', 'designation'],
  staff: ['department', 'employee_id', 'designation', 'registration_code'],
  librarian: ['employee_id', 'registration_code'],
  admin: ['registration_code'],
};
const LABELS = {
  department: 'Department', course: 'Course', year_of_study: 'Year of study', enrollment_no: 'Enrollment no.',
  employee_id: 'Employee ID', designation: 'Designation', registration_code: 'Registration code (from admin)',
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ role: 'student', name: '', email: '', password: '', address: '', phone: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    // send only fields that belong to the chosen role and are not empty
    const allowed = ['role', 'name', 'email', 'password', 'address', 'phone', ...EXTRA[form.role]];
    const payload = Object.fromEntries(Object.entries(form).filter(([k, v]) => allowed.includes(k) && v !== ''));
    try { await register(payload); navigate('/'); }
    catch (err) { setError(err.message); }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Register</h2>
      <Msg error={error} />
      <Field label="I am a">
        <select value={form.role} onChange={set('role')}>
          {Object.keys(EXTRA).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Full name"><input required value={form.name} onChange={set('name')} /></Field>
      <Field label="Email"><input type="email" required value={form.email} onChange={set('email')} /></Field>
      <Field label="Password (min 8 characters)"><input type="password" required minLength={8} value={form.password} onChange={set('password')} /></Field>
      <Field label="Address"><textarea required rows={2} value={form.address} onChange={set('address')} /></Field>
      <Field label="Phone (optional)"><input value={form.phone} onChange={set('phone')} /></Field>
      {EXTRA[form.role].map((f) => (
        <Field key={f} label={LABELS[f]}>
          <input required type={f === 'year_of_study' ? 'number' : 'text'} min={1} max={8} value={form[f] || ''} onChange={set(f)} />
        </Field>
      ))}
      <button className="btn primary">Create account</button>
      <p className="muted small">Already registered? <Link to="/login">Login</Link></p>
    </form>
  );
}
