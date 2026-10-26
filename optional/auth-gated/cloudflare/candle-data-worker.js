// Authenticated catalogue API. The catalogue lives in D1, never in GitHub Pages assets.
const allowedOrigins = new Set([
  'https://shuyaolu93.github.io',
  'https://www.zunshoujilv.top',
  'https://zunshoujilv.top'
]);
const encoder = new TextEncoder();

function reply(data, status = 200, origin = '') {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'vary': 'Origin'
  };
  if (allowedOrigins.has(origin)) headers['access-control-allow-origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    if (origin && !allowedOrigins.has(origin)) return reply({ error: 'forbidden' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        ...(allowedOrigins.has(origin) ? { 'access-control-allow-origin': origin } : {}),
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'authorization',
        'access-control-max-age': '600',
        'vary': 'Origin'
      } });
    }
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/api/candle/data') return reply({ error: 'not_found' }, 404, origin);
    const authorization = request.headers.get('authorization') || '';
    const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] || '';
    if (!token) return reply({ error: 'login_required' }, 401, origin);
    if (!env.DB) return reply({ error: 'database_unavailable' }, 503, origin);

    try {
      const session = await env.DB.prepare(
        'SELECT s.expires_at, u.entitlement_until FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
      ).bind(await sha256(token)).first();
      if (!session || Date.parse(session.expires_at) <= Date.now()) return reply({ error: 'login_required' }, 401, origin);
      if (!session.entitlement_until || Date.parse(session.entitlement_until) <= Date.now()) return reply({ error: 'entitlement_required' }, 403, origin);

      const rows = await env.DB.prepare('SELECT key, payload FROM candle_assets ORDER BY key').all();
      const patterns = [];
      let schematics = null;
      for (const row of rows.results || []) {
        if (row.key.startsWith('patterns:')) patterns.push(...JSON.parse(row.payload));
        else if (row.key === 'schematics') schematics = JSON.parse(row.payload);
      }
      if (!patterns.length || !schematics) return reply({ error: 'catalogue_unavailable' }, 503, origin);
      return reply({ patterns, schematics }, 200, origin);
    } catch (error) {
      return reply({ error: 'catalogue_unavailable' }, 503, origin);
    }
  }
};
