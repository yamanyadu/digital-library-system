// Single place that talks to the Express server. Adds the JWT and turns errors into readable messages.
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, params } = {}) {
  const url = new URL('/api' + path, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) url.searchParams.set(k, v);
  });

  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    const details = Array.isArray(data.details) ? ' — ' + data.details.map((d) => `${d.field}: ${d.message}`).join('; ') : '';
    throw new ApiError((data.error || 'Request failed') + details, res.status);
  }
  return data;
}
