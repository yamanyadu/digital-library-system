import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Msg, Field } from '../components/Bits.jsx';

const EMPTY = { title: '', author: '', isbn: '', publisher: '', publication_year: '', edition: '', language: 'English',
                call_number: '', shelf_location: '', description: '', subjects: '', copies: 1 };

export default function ManageBooks() {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setCreated(null);
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    payload.subjects = form.subjects.split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const res = await api('/books', { method: 'POST', body: payload });
      setCreated(res);
      setForm(EMPTY);
    } catch (err) { setError(err.message); }
  };

  return (
    <>
      <h2>Add a book</h2>
      <Msg error={error} />
      {created && (
        <p className="alert ok">
          Book added. <Link to={`/books/${created.book_id}`}>Open it</Link>. Serial numbers: {created.serial_numbers.join(', ') || 'none yet'}
        </p>
      )}
      <form className="card" onSubmit={submit}>
        <div className="grid2">
          <Field label="Title *"><input required value={form.title} onChange={set('title')} /></Field>
          <Field label="Author *"><input required value={form.author} onChange={set('author')} /></Field>
          <Field label="ISBN"><input value={form.isbn} onChange={set('isbn')} /></Field>
          <Field label="Publisher"><input value={form.publisher} onChange={set('publisher')} /></Field>
          <Field label="Publication year"><input type="number" value={form.publication_year} onChange={set('publication_year')} /></Field>
          <Field label="Edition"><input value={form.edition} onChange={set('edition')} /></Field>
          <Field label="Language"><input value={form.language} onChange={set('language')} /></Field>
          <Field label="Call number"><input value={form.call_number} onChange={set('call_number')} /></Field>
          <Field label="Shelf location"><input value={form.shelf_location} onChange={set('shelf_location')} /></Field>
          <Field label="Number of copies"><input type="number" min={0} max={200} value={form.copies} onChange={set('copies')} /></Field>
        </div>
        <Field label="Subjects (comma separated)"><input placeholder="Mathematics, Linear Algebra" value={form.subjects} onChange={set('subjects')} /></Field>
        <Field label="Description"><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
        <button className="btn primary">Save book</button>
      </form>
    </>
  );
}
