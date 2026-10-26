// 免费方案版：只运行确定性风控接口，不依赖 Python、Docker 或付费 Container。
const finite = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`);
  return number;
};
const nonNegative = (value, name) => {
  const number = finite(value, name);
  if (number < 0) throw new Error(`${name} must be non-negative`);
  return number;
};
const drawdown = (equity, highWaterMark) => {
  const current = nonNegative(equity, "equity");
  const high = nonNegative(highWaterMark, "highWaterMark");
  return high === 0 ? 0 : Math.max(0, Math.min(1, (high - current) / high));
};

function evaluateOrder(order = {}) {
  const side = String(order.side || "").toLowerCase();
  const quantity = nonNegative(order.quantity, "quantity");
  const price = finite(order.price, "price");
  const equity = nonNegative(order.equity, "equity");
  const currentPosition = nonNegative(order.currentPosition || 0, "currentPosition");
  const maxPositionPct = finite(order.maxPositionPct, "maxPositionPct");
  const maxDrawdownPct = finite(order.maxDrawdownPct, "maxDrawdownPct");
  if (!["buy", "sell"].includes(side)) throw new Error("side must be buy or sell");
  if (price <= 0) throw new Error("price must be greater than zero");
  if (maxPositionPct < 0 || maxPositionPct > 1 || maxDrawdownPct < 0 || maxDrawdownPct > 1) {
    throw new Error("risk percentages must be between 0 and 1");
  }
  if (order.reduceOnly && (side !== "sell" || currentPosition === 0)) {
    return { decision: "reject", quantity: 0, reasons: ["order does not reduce an existing position"] };
  }
  if (side === "sell" && currentPosition > 0) {
    return { decision: quantity > currentPosition ? "resize" : "allow", quantity: Math.min(quantity, currentPosition), reasons: ["risk-reducing order allowed"] };
  }
  if (drawdown(equity, order.highWaterMark) >= maxDrawdownPct) {
    return { decision: "reject", quantity: 0, reasons: ["drawdown circuit breaker is active"] };
  }
  const maxQuantity = equity * maxPositionPct / price;
  const allowed = Math.max(0, maxQuantity - Math.max(0, currentPosition));
  if (side === "sell" && currentPosition - quantity < 0) {
    return { decision: "reject", quantity: 0, reasons: ["short selling is not enabled"] };
  }
  if (quantity > allowed) {
    return { decision: allowed > 0 ? "resize" : "reject", quantity: allowed, reasons: ["position limit applied"] };
  }
  return { decision: "allow", quantity, reasons: [] };
}

function qualityReport(bars) {
  const rows = Array.isArray(bars) ? bars : [];
  const issues = [];
  const warnings = [];
  const required = ["open", "high", "low", "close", "volume"];
  if (!Array.isArray(bars)) issues.push("K线数据格式无效");
  if (!rows.length) issues.push("K线数据为空");
  if (rows.length > 5000) issues.push("K线数据超过 5000 条上限");
  if (rows.length && rows.length < 20) issues.push(`K线样本不足：仅${rows.length}条`);
  else if (rows.length && rows.length < 60) warnings.push(`K线样本偏少：${rows.length}条`);
  for (let index = 0; index < Math.min(rows.length, 5000) && issues.length < 8; index += 1) {
    const bar = rows[index];
    if (!bar || typeof bar !== "object" || Array.isArray(bar) || required.some(field => bar[field] === undefined || bar[field] === null || String(bar[field]).trim() === "")) {
      issues.push(`第${index + 1}条缺少必要K线字段`);
      continue;
    }
    const [open, high, low, close, volume] = required.map(field => Number(bar[field]));
    if (![open, high, low, close, volume].every(Number.isFinite) || Math.min(open, high, low, close) <= 0 || volume < 0) {
      issues.push(`第${index + 1}条价格或成交量无效`);
    } else if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      issues.push(`第${index + 1}条 OHLC 关系异常`);
    } else if (volume === 0 && !warnings.includes("存在零成交量K线")) {
      warnings.push("存在零成交量K线");
    }
  }
  const score = Math.max(0, 100 - issues.length * 35 - warnings.length * 8);
  return { score, status: issues.length || score < 50 ? "blocked" : score < 85 ? "watch" : "ok", block_new_entries: Boolean(issues.length || score < 50), issues, warnings };
}

const marketFeeds = [
  { source: "国家统计局 · 最新发布", url: "https://www.stats.gov.cn/sj/zxfb/rss.xml", hostname: "www.stats.gov.cn" },
  { source: "国家统计局 · 数据解读", url: "https://www.stats.gov.cn/sj/sjjd/rss.xml", hostname: "www.stats.gov.cn" },
  { source: "中国人民银行 · 新闻公告", url: "https://www.pbc.gov.cn/goutongjiaoliu/113456/2986536/index.html", hostname: "www.pbc.gov.cn" }
];
function rssText(value) {
  return String(value || "").replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code) => {
      const number = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[entity.toLowerCase()])
    .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
function rssField(item, field) {
  const match = item.match(new RegExp("<" + field + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + field + ">", "i"));
  return rssText(match && match[1]);
}
function parseMarketFeed(xml, feed) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks.slice(0, 30)) {
    const title = rssField(block, "title").slice(0, 180);
    const rawUrl = rssField(block, "link");
    const rawDate = rssField(block, "pubDate") || rssField(block, "pubTime");
    let link;
    try { link = new URL(rawUrl.startsWith("www.") ? "https://" + rawUrl : rawUrl, feed.url); } catch (_) { continue; }
    const published = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(rawDate) ? rawDate.replace(" ", "T") + "+08:00" : rawDate);
    if (!title || link.protocol !== "https:" || link.hostname !== feed.hostname || !Number.isFinite(published) || published > Date.now() + 86400000) continue;
    items.push({ title, url: link.href, source: feed.source, publishedAt: new Date(published).toISOString() });
  }
  return items;
}
async function readMarketFeed(response) {
  if (!response.ok || !response.body) throw new Error("market_feed_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (size < 131072) {
      const { done, value } = await reader.read();
      if (done) break;
      const slice = value.slice(0, 131072 - size);
      size += slice.length;
      text += decoder.decode(slice, { stream: true });
      if (slice.length < value.length) break;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return text;
}
async function loadMarketHotspots(fetcher = fetch) {
  const results = await Promise.allSettled(marketFeeds.map(async feed => {
    const response = await fetcher(feed.url, { headers: { range: "bytes=0-131071" } });
    return parseMarketFeed(await readMarketFeed(response), feed);
  }));
  const items = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const unique = new Map();
  for (const item of items) if (!unique.has(item.url)) unique.set(item.url, item);
  return { items: [...unique.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 12), partial: results.some(result => result.status === "rejected"), fetchedAt: new Date().toISOString() };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}

const encoder = new TextEncoder();
const hex = (bytes) => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
async function sha256(value) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return hex(bits);
}
function requestToken(request) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}
async function createSession(db, user) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  await db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").bind(user.id, tokenHash, expires).run();
  return { token, expiresAt: expires };
}
async function recordLogin(db, userId, eventType) {
  try {
    await db.prepare("INSERT INTO login_events (user_id, event_type) VALUES (?, ?)").bind(userId, eventType).run();
  } catch (error) {
    console.error("login_event_write_failed", error);
  }
}
async function authenticatedUser(request, db) {
  const token = requestToken(request);
  if (!token || !db) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare("SELECT u.id, u.email, u.entitlement_until, s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").bind(tokenHash).first();
  return row && Number.isFinite(Date.parse(row.session_expires_at)) && Date.parse(row.session_expires_at) > Date.now() ? row : null;
}
function canViewMessages(user, env) {
  const adminId = Number(env.MESSAGE_ADMIN_USER_ID);
  return Boolean(user && Number.isSafeInteger(adminId) && adminId > 0 && user.id === adminId);
}
function publicUser(user, env) {
  return { id: user.id, email: user.email, entitlementUntil: user.entitlement_until || null, active: Boolean(user.entitlement_until && new Date(user.entitlement_until) > new Date()), canViewMessages: canViewMessages(user, env) };
}
function authRequired(user) { return json({ error: "login_required", message: "请先登录并兑换有效卡密" }, 401); }
function entitlementRequired(user) { return user && user.entitlement_until && new Date(user.entitlement_until) > new Date(); }
function validCandleReading(reading) {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading) ||
      typeof reading.chapter !== 'string' || reading.chapter.length > 32 ||
      typeof reading.last !== 'string' || reading.last.length > 100 ||
      !Number.isFinite(reading.scrollY) || reading.scrollY < 0 || reading.scrollY > 10000000 ||
      !Number.isFinite(reading.updatedAt) || reading.updatedAt < 0 ||
      !Array.isArray(reading.favorites) || reading.favorites.length > 500 ||
      reading.favorites.some(id => typeof id !== 'string' || id.length > 100) ||
      !reading.favoriteEdits || typeof reading.favoriteEdits !== 'object' || Array.isArray(reading.favoriteEdits)) return false;
  const edits = Object.entries(reading.favoriteEdits);
  return edits.length <= 500 && edits.every(([id, edit]) => id.length <= 100 && edit &&
    typeof edit.saved === 'boolean' && Number.isFinite(edit.at) && edit.at >= 0);
}

async function saveDecision(db, body, result, userId) {
  if (!db) return false;
  await db.prepare("INSERT INTO risk_decisions (user_id, symbol, side, requested_quantity, allowed_quantity, price, equity, decision, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(userId, String(body.symbol || "UNKNOWN"), String(body.side || "buy"), Number(body.quantity), Number(result.quantity), Number(body.price), Number(body.equity), result.decision, JSON.stringify(result.reasons || []))
    .run();
  return true;
}

async function saveQuality(db, result, userId) {
  if (!db) return false;
  await db.prepare("INSERT INTO data_quality_checks (user_id, score, status, block_new_entries, issues, warnings) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(userId, result.score, result.status, result.block_new_entries ? 1 : 0, JSON.stringify(result.issues || []), JSON.stringify(result.warnings || []))
    .run();
  return true;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-admin-secret", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" } });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return Response.redirect("https://www.zunshoujilv.top/", 302);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "ronghe-free-worker", stateful: Boolean(env.DB) });
    if (request.method === "GET" && url.pathname === "/api") return json({ ok: true, service: "ronghe-free-worker", stateful: Boolean(env.DB), endpoints: { risk_check: { method: "POST", path: "/api/risk/check", content_type: "application/json" }, quality: { method: "POST", path: "/api/analysis/quality", content_type: "application/json" }, risk_history: { method: "GET", path: "/api/risk/history" } } });
    if (url.pathname === "/api/market/hotspots" && request.method === "GET") {
      const user = await authenticatedUser(request, env.DB);
      if (!user) return authRequired(user);
      if (!entitlementRequired(user)) return json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403);
      const data = await loadMarketHotspots(env.MARKET_FEED_FETCH || fetch);
      return data.items.length ? json(data) : json({ error: "market_feed_unavailable", message: "官方动态暂时无法加载，请稍后重试", ...data }, 503);
    }
    if (request.method === "GET" && url.pathname === "/api/risk/check") return json({ error: "method_not_allowed", message: "请使用 POST，并发送 JSON 风控参数", method: "POST", endpoint: "/api/risk/check" }, 405);
    if (request.method === "GET" && url.pathname === "/api/analysis/quality") return json({ error: "method_not_allowed", message: "请使用 POST，并发送 JSON K线数据", method: "POST", endpoint: "/api/analysis/quality" }, 405);
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
        if (!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /^\d{8,}$/.test(email))) return json({ error: "invalid_account", message: "账号需为有效邮箱或 8 位以上数字" }, 400);
        if (password.length < 8) return json({ error: "weak_password", message: "密码至少 8 位" }, 400);
        if (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first()) return json({ error: "email_exists", message: "该账号已注册，请直接登录" }, 409);
        const salt = randomToken(); const hash = await passwordHash(password, salt);
        const result = await env.DB.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)").bind(email, hash, salt).run();
        const user = { id: result.meta.last_row_id, email, entitlement_until: null }; const session = await createSession(env.DB, user);
        await recordLogin(env.DB, user.id, "register");
        return json({ user: publicUser(user, env), token: session.token, expiresAt: session.expiresAt }, 201);
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
        const user = await env.DB.prepare("SELECT id, email, password_hash, password_salt, entitlement_until FROM users WHERE email = ?").bind(email).first();
        if (!user || (await passwordHash(password, user.password_salt)) !== user.password_hash) return json({ error: "invalid_credentials", message: "账号或密码不正确" }, 401);
        const session = await createSession(env.DB, user); await recordLogin(env.DB, user.id, "login");
        return json({ user: publicUser(user, env), token: session.token, expiresAt: session.expiresAt });
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/auth/password" && request.method === "POST") {
      const user = await authenticatedUser(request, env.DB); if (!user) return authRequired(user);
      try { const body = await request.json(); const password = String(body.password || ""); if (password.length < 8) return json({ error: "weak_password", message: "密码至少 8 位" }, 400); const salt = randomToken(); const hash = await passwordHash(password, salt); await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").bind(hash, salt, user.id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id)
      ]); return json({ ok: true }); } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/messages" && request.method === "GET") {
      const user = await authenticatedUser(request, env.DB); if (!user) return authRequired(user); if (!canViewMessages(user, env)) return json({ error: "forbidden", message: "留言内容仅管理员可查看" }, 403);
      const rows = await env.DB.prepare("SELECT m.id, m.message, m.created_at, u.email FROM messages m JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 500").all(); return json({ messages: rows.results || [] });
    }
    if (url.pathname === "/api/messages" && request.method === "POST") {
      const user = await authenticatedUser(request, env.DB); if (!user) return authRequired(user);
      try { const body = await request.json(); const message = String(body.message || "").trim(); if (!message || message.length > 2000) return json({ error: "invalid_message", message: "留言不能为空且不能超过 2000 字" }, 400); await env.DB.prepare("INSERT INTO messages (user_id, message) VALUES (?, ?)").bind(user.id, message).run(); return json({ ok: true }); } catch (error) { return json({ error: "message_save_failed", message: error.message }, 400); }
    }
    if (url.pathname === "/api/admin/messages" && request.method === "GET") {
      const secret = request.headers.get("x-admin-secret") || ""; if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) return json({ error: "forbidden", message: "管理员权限不足" }, 403);
      const rows = await env.DB.prepare("SELECT m.id, m.message, m.created_at, u.email FROM messages m JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT 500").all(); return json({ messages: rows.results || [] });
    }
    if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
      const user = await authenticatedUser(request, env.DB);
      if (!user) return authRequired(user);
      if (!canViewMessages(user, env)) return json({ error: "forbidden", message: "仅管理员可查看后台" }, 403);
      const section = url.searchParams.get("section") || "overview";
      if (section === "overview") {
        const summary = await env.DB.prepare(`SELECT
          (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM users WHERE entitlement_until > ?) AS active_users,
          (SELECT COUNT(*) FROM activation_codes) AS codes,
          (SELECT COUNT(*) FROM code_redemptions) AS redemptions,
          (SELECT COUNT(*) FROM login_events WHERE event_type = 'login') AS logins,
          (SELECT COUNT(*) FROM desk_state) AS desk_synced,
          (SELECT COUNT(*) FROM candle_reading) AS candle_synced,
          (SELECT COUNT(*) FROM messages) AS messages`).bind(new Date().toISOString()).first();
        return json({ summary });
      }
      const offset = Number(url.searchParams.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return json({ error: "invalid_offset" }, 400);
      const limit = 50;
      const queries = {
        users: `SELECT u.id, u.email, u.created_at, u.entitlement_until,
          (SELECT MAX(created_at) FROM login_events WHERE user_id = u.id AND event_type = 'login') AS last_login,
          (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND expires_at > ?) AS active_sessions,
          d.updated_at AS desk_sync, c.updated_at AS candle_sync
          FROM users u LEFT JOIN desk_state d ON d.user_id = u.id
          LEFT JOIN candle_reading c ON c.user_id = u.id ORDER BY u.id DESC LIMIT ? OFFSET ?`,
        codes: `SELECT id, days, max_redemptions, redeemed_count, expires_at, created_at
          FROM activation_codes ORDER BY id DESC LIMIT ? OFFSET ?`,
        redemptions: `SELECT r.id, r.redeemed_at, u.email, a.id AS code_id, a.days
          FROM code_redemptions r JOIN users u ON u.id = r.user_id
          JOIN activation_codes a ON a.id = r.code_id ORDER BY r.id DESC LIMIT ? OFFSET ?`,
        logins: `SELECT l.id, l.created_at, l.event_type, u.email
          FROM login_events l JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ? OFFSET ?`,
        messages: `SELECT m.id, m.created_at, m.message, u.email
          FROM messages m JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT ? OFFSET ?`
      };
      if (!Object.hasOwn(queries, section)) return json({ error: "invalid_section" }, 400);
      const statement = env.DB.prepare(queries[section]);
      const rows = await (section === "users" ? statement.bind(new Date().toISOString(), limit + 1, offset) : statement.bind(limit + 1, offset)).all();
      const items = rows.results || [];
      return json({ items: items.slice(0, limit), nextOffset: items.length > limit ? offset + limit : null });
    }
    if (url.pathname.startsWith("/api/admin/activation-codes/") && request.method === "DELETE") {
      const user = await authenticatedUser(request, env.DB);
      if (!user) return authRequired(user);
      if (!canViewMessages(user, env)) return json({ error: "forbidden", message: "仅管理员可删除卡密" }, 403);
      const match = /^\/api\/admin\/activation-codes\/(\d+)$/.exec(url.pathname);
      const id = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: "invalid_code_id", message: "卡密编号无效" }, 400);
      const result = await env.DB.prepare("DELETE FROM activation_codes WHERE id = ? AND redeemed_count = 0 AND NOT EXISTS (SELECT 1 FROM code_redemptions WHERE code_id = ?)").bind(id, id).run();
      if (result.meta.changes) return json({ ok: true });
      const existing = await env.DB.prepare("SELECT id FROM activation_codes WHERE id = ?").bind(id).first();
      return existing
        ? json({ error: "code_redeemed", message: "这张卡密已经兑换，不能删除" }, 409)
        : json({ error: "code_not_found", message: "卡密不存在或已被删除" }, 404);
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await authenticatedUser(request, env.DB); return user ? json({ user: publicUser(user, env) }) : authRequired(user);
    }
    if (url.pathname === "/api/desk/state" && (request.method === "GET" || request.method === "PUT")) {
      const user = await authenticatedUser(request, env.DB);
      if (!user) return authRequired(user);
      if (!entitlementRequired(user)) return json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403);
      if (!env.DB) return json({ error: "database_not_configured" }, 503);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT payload, revision, updated_at FROM desk_state WHERE user_id = ?").bind(user.id).first();
        return json(row ? { state: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updated_at } : { state: null, revision: 0 });
      }
      try {
        const body = await request.json();
        const revision = Number(body.revision);
        const state = body.state;
        if (!Number.isInteger(revision) || revision < 0 || !state || typeof state !== "object" || Array.isArray(state) || !Array.isArray(state.history)) return json({ error: "invalid_state" }, 400);
        const payload = JSON.stringify({ draft: state.draft || null, history: state.history.slice(0, 20), pauseUntil: Number(state.pauseUntil) || 0 });
        if (payload.length > 900000) return json({ error: "state_too_large", message: "研究记录超过保存上限，请先导出备份" }, 413);
        const now = new Date().toISOString();
        const result = revision === 0
          ? await env.DB.prepare("INSERT INTO desk_state (user_id, payload, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING").bind(user.id, payload, now).run()
          : await env.DB.prepare("UPDATE desk_state SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?").bind(payload, now, user.id, revision).run();
        if (!result.meta.changes) return json({ error: "revision_conflict", message: "另一台设备已更新记录，请重新加载" }, 409);
        return json({ ok: true, revision: revision + 1, updatedAt: now });
      } catch (error) { return json({ error: "state_save_failed", message: error.message }, 400); }
    }
    if (url.pathname === "/api/market/notes" && (request.method === "GET" || request.method === "PUT")) {
      const user = await authenticatedUser(request, env.DB);
      if (!user) return authRequired(user);
      if (!entitlementRequired(user)) return json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403);
      if (!env.DB) return json({ error: "database_not_configured" }, 503);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT payload, revision, updated_at FROM market_notes WHERE user_id = ?").bind(user.id).first();
        return json(row ? { note: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updated_at } : { note: null, revision: 0 });
      }
      try {
        const body = await request.json();
        const revision = Number(body.revision);
        const note = body.note;
        const fields = note && note.fields;
        const allowed = new Set([
          "hotspotTitle", "hotspotPublished", "hotspotSourceName", "hotspotSourceUrl", "hotspotFacts", "hotspotPath", "hotspotDirection", "hotspotWatch", "hotspotCounter", "hotspotOutput",
          "analysisCompany", "analysisAsOf", "analysisYear", "analysisSource", "analysisOcf", "analysisCapex", "analysisCurrentPrice", "analysisPriceDate",
          "analysisMethod", "analysisProfit", "analysisShares", "analysisPe", "analysisManualFormula", "analysisManualTarget",
          "analysisBeforeDate", "analysisBeforePrice", "analysisAfterDate", "analysisAfterPrice", "questionOutput",
          "qProfit", "qOperatingCash", "qRevenue", "qCashRetention", "qUncertainty", "qExpectations", "qMethodReasoning",
          "qProfitEvidence", "qValuationEvidence", "qAssumptionChange", "qPriceReaction"
        ]);
        if (!Number.isInteger(revision) || revision < 0 || !note || typeof note !== "object" || Array.isArray(note) ||
            !fields || typeof fields !== "object" || Array.isArray(fields) ||
            Object.keys(fields).some(key => !allowed.has(key) || typeof fields[key] !== "string")) return json({ error: "invalid_note" }, 400);
        const payload = JSON.stringify({ updatedAt: String(note.updatedAt || ""), fields });
        if (payload.length > 60000) return json({ error: "note_too_large", message: "热点记录超过保存上限" }, 413);
        const now = new Date().toISOString();
        const result = revision === 0
          ? await env.DB.prepare("INSERT INTO market_notes (user_id, payload, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING").bind(user.id, payload, now).run()
          : await env.DB.prepare("UPDATE market_notes SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?").bind(payload, now, user.id, revision).run();
        if (!result.meta.changes) return json({ error: "revision_conflict", message: "另一台设备已更新热点记录，请重新加载" }, 409);
        return json({ ok: true, revision: revision + 1, updatedAt: now });
      } catch (error) { return json({ error: "note_save_failed", message: error.message }, 400); }
    }
    if (url.pathname === "/api/candle/reading" && (request.method === "GET" || request.method === "PUT")) {
      const user = await authenticatedUser(request, env.DB);
      if (!user) return authRequired(user);
      if (!entitlementRequired(user)) return json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT payload, revision, updated_at FROM candle_reading WHERE user_id = ?").bind(user.id).first();
        return json(row ? { reading: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updated_at } : { reading: null, revision: 0 });
      }
      try {
        const body = await request.json();
        const revision = Number(body.revision);
        if (!Number.isInteger(revision) || revision < 0 || !validCandleReading(body.reading)) return json({ error: "invalid_reading" }, 400);
        const reading = body.reading;
        const payload = JSON.stringify({ chapter: reading.chapter, last: reading.last, scrollY: reading.scrollY,
          updatedAt: reading.updatedAt, favorites: reading.favorites, favoriteEdits: reading.favoriteEdits });
        if (payload.length > 100000) return json({ error: "reading_too_large" }, 413);
        const now = new Date().toISOString();
        const result = revision === 0
          ? await env.DB.prepare("INSERT INTO candle_reading (user_id, payload, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING").bind(user.id, payload, now).run()
          : await env.DB.prepare("UPDATE candle_reading SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?").bind(payload, now, user.id, revision).run();
        if (!result.meta.changes) return json({ error: "revision_conflict", message: "另一台设备已更新阅读进度，请重新加载" }, 409);
        return json({ ok: true, revision: revision + 1, updatedAt: now });
      } catch (error) { return json({ error: "reading_save_failed" }, 400); }
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const token = requestToken(request); if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run(); return json({ ok: true });
    }
    if (url.pathname === "/api/auth/redeem" && request.method === "POST") {
      const user = await authenticatedUser(request, env.DB); if (!user) return authRequired(user);
      try {
        const body = await request.json(); const code = String(body.code || "").trim().toUpperCase(); if (!code) return json({ error: "code_required", message: "请输入卡密" }, 400);
        const codeHash = await sha256(code); const activation = await env.DB.prepare("SELECT * FROM activation_codes WHERE code_hash = ?").bind(codeHash).first();
        if (!activation || (activation.expires_at && new Date(activation.expires_at) <= new Date())) return json({ error: "invalid_code", message: "卡密无效或已过期" }, 400);
        if (activation.redeemed_count >= activation.max_redemptions) return json({ error: "code_used", message: "卡密已达到使用次数" }, 400);
        if (await env.DB.prepare("SELECT id FROM code_redemptions WHERE code_id = ? AND user_id = ?").bind(activation.id, user.id).first()) return json({ error: "already_redeemed", message: "你已经兑换过这张卡密" }, 400);
        const current = user.entitlement_until && new Date(user.entitlement_until) > new Date() ? new Date(user.entitlement_until).getTime() : Date.now();
        const entitlement = new Date(current + Number(activation.days) * 86400000).toISOString();
        await env.DB.batch([
          env.DB.prepare("UPDATE activation_codes SET redeemed_count = redeemed_count + 1 WHERE id = ?").bind(activation.id),
          env.DB.prepare("INSERT INTO code_redemptions (code_id, user_id) VALUES (?, ?)").bind(activation.id, user.id),
          env.DB.prepare("UPDATE users SET entitlement_until = ? WHERE id = ?").bind(entitlement, user.id)
        ]);
        return json({ ok: true, message: "卡密兑换成功", user: { id: user.id, email: user.email, entitlementUntil: entitlement, active: true, canViewMessages: canViewMessages(user, env) } });
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/admin/activation-codes" && request.method === "POST") {
      const user = await authenticatedUser(request, env.DB);
      const secret = request.headers.get("x-admin-secret") || "";
      if (!canViewMessages(user, env) && (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET)) return json({ error: "forbidden" }, 403);
      try {
        const body = await request.json(); const days = Number(body.days ?? 30); const count = Number(body.count ?? 1);
        if (!Number.isInteger(days) || days < 1 || days > 3650 || !Number.isInteger(count) || count < 1 || count > 100) return json({ error: "invalid_code_request", message: "有效天数须为 1–3650，数量须为 1–100" }, 400);
        const codes = [], statements = [];
        for (let i = 0; i < count; i += 1) {
          const code = "RONGHE-" + randomToken().slice(0, 12).toUpperCase();
          statements.push(env.DB.prepare("INSERT INTO activation_codes (code_hash, days) VALUES (?, ?)").bind(await sha256(code), days));
          codes.push(code);
        }
        await env.DB.batch(statements);
        return json({ codes, days });
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (request.method === "GET" && url.pathname === "/api/risk/history") {
      const user = await authenticatedUser(request, env.DB); if (!entitlementRequired(user)) return user ? entitlementRequired(user) || json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403) : authRequired(user);
      if (!env.DB) return json({ error: "database_not_configured" }, 503);
      const { results } = await env.DB.prepare("SELECT id, symbol, side, requested_quantity, allowed_quantity, price, equity, decision, reasons, created_at FROM risk_decisions WHERE user_id = ? ORDER BY id DESC LIMIT 50").bind(user.id).all();
      return json({ results });
    }
    if (request.method !== "POST") return json({ error: "not_found" }, 404);
    try {
      const body = await request.json();
      if (url.pathname === "/api/risk/check") {
        const user = await authenticatedUser(request, env.DB); if (!entitlementRequired(user)) return user ? json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403) : authRequired(user);
        const result = evaluateOrder(body);
        result.persisted = await saveDecision(env.DB, body, result, user.id);
        return json(result);
      }
      if (url.pathname === "/api/analysis/quality") {
        const user = await authenticatedUser(request, env.DB); if (!entitlementRequired(user)) return user ? json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403) : authRequired(user);
        const result = qualityReport(body.bars);
        result.persisted = await saveQuality(env.DB, result, user.id);
        return json(result);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return json({ error: "invalid_request", message: error.message }, 400);
    }
  },
};
