import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('token'));

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const finish = async (data) => {
    localStorage.setItem('token', data.token);
    setUser(await api('/auth/me'));
  };
  const login = async (email, password) => finish(await api('/auth/login', { method: 'POST', body: { email, password } }));
  const register = async (form) => finish(await api('/auth/register', { method: 'POST', body: form }));
  const logout = () => { localStorage.removeItem('token'); setUser(null); };

  const isStaff = user && ['admin', 'librarian'].includes(user.role);
  const isAdmin = user && user.role === 'admin';

  return <Ctx.Provider value={{ user, loading, login, register, logout, isStaff, isAdmin }}>{children}</Ctx.Provider>;
}
