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
  const currentPosition = finite(order.currentPosition || 0, "currentPosition");
  const maxPositionPct = finite(order.maxPositionPct, "maxPositionPct");
  const maxDrawdownPct = finite(order.maxDrawdownPct, "maxDrawdownPct");
  if (!["buy", "sell"].includes(side)) throw new Error("side must be buy or sell");
  if (price <= 0) throw new Error("price must be greater than zero");
  if (maxPositionPct < 0 || maxPositionPct > 1 || maxDrawdownPct < 0 || maxDrawdownPct > 1) {
    throw new Error("risk percentages must be between 0 and 1");
  }
  if (order.reduceOnly || (side === "sell" && currentPosition > 0)) {
    return { decision: "allow", quantity: Math.min(quantity, currentPosition), reasons: ["risk-reducing order allowed"] };
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
  if (!rows.length) issues.push("K线数据为空");
  if (rows.length && required.some((field) => !(field in rows[0]))) issues.push("缺少必要K线字段");
  if (rows.length && rows.length < 20) issues.push(`K线样本不足：仅${rows.length}条`);
  else if (rows.length && rows.length < 60) warnings.push(`K线样本偏少：${rows.length}条`);
  const score = Math.max(0, 100 - issues.length * 35 - warnings.length * 8);
  return { score, status: issues.length || score < 50 ? "blocked" : score < 85 ? "watch" : "ok", block_new_entries: Boolean(issues.length || score < 50), issues, warnings };
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
async function authenticatedUser(request, db) {
  const token = requestToken(request);
  if (!token || !db) return null;
  const tokenHash = await sha256(token);
  const row = await db.prepare("SELECT u.id, u.email, u.entitlement_until, s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')").bind(tokenHash).first();
  return row || null;
}
function publicUser(user) {
  return { id: user.id, email: user.email, entitlementUntil: user.entitlement_until || null, active: Boolean(user.entitlement_until && new Date(user.entitlement_until) > new Date()) };
}
function authRequired(user) { return json({ error: "login_required", message: "请先登录并兑换有效卡密" }, 401); }
function entitlementRequired(user) { return user && user.entitlement_until && new Date(user.entitlement_until) > new Date(); }

async function saveDecision(db, body, result) {
  if (!db) return false;
  await db.prepare("INSERT INTO risk_decisions (symbol, side, requested_quantity, allowed_quantity, price, equity, decision, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(String(body.symbol || "UNKNOWN"), String(body.side || "buy"), Number(body.quantity), Number(result.quantity), Number(body.price), Number(body.equity), result.decision, JSON.stringify(result.reasons || []))
    .run();
  return true;
}

async function saveQuality(db, result) {
  if (!db) return false;
  await db.prepare("INSERT INTO data_quality_checks (score, status, block_new_entries, issues, warnings) VALUES (?, ?, ?, ?, ?)")
    .bind(result.score, result.status, result.block_new_entries ? 1 : 0, JSON.stringify(result.issues || []), JSON.stringify(result.warnings || []))
    .run();
  return true;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-admin-secret", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return Response.redirect("https://shuyaolu93.github.io/ronghe/", 302);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "ronghe-free-worker", stateful: Boolean(env.DB) });
    if (request.method === "GET" && url.pathname === "/api") return json({ ok: true, service: "ronghe-free-worker", stateful: Boolean(env.DB), endpoints: { risk_check: { method: "POST", path: "/api/risk/check", content_type: "application/json" }, quality: { method: "POST", path: "/api/analysis/quality", content_type: "application/json" }, risk_history: { method: "GET", path: "/api/risk/history" } } });
    if (request.method === "GET" && url.pathname === "/api/risk/check") return json({ error: "method_not_allowed", message: "请使用 POST，并发送 JSON 风控参数", method: "POST", endpoint: "/api/risk/check" }, 405);
    if (request.method === "GET" && url.pathname === "/api/analysis/quality") return json({ error: "method_not_allowed", message: "请使用 POST，并发送 JSON K线数据", method: "POST", endpoint: "/api/analysis/quality" }, 405);
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email", message: "请输入有效邮箱" }, 400);
        if (password.length < 8) return json({ error: "weak_password", message: "密码至少 8 位" }, 400);
        if (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first()) return json({ error: "email_exists", message: "该邮箱已注册，请直接登录" }, 409);
        const salt = randomToken(); const hash = await passwordHash(password, salt);
        const result = await env.DB.prepare("INSERT INTO users (email, password_hash, password_salt) VALUES (?, ?, ?)").bind(email, hash, salt).run();
        const user = { id: result.meta.last_row_id, email, entitlement_until: null }; const session = await createSession(env.DB, user);
        return json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt }, 201);
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      try {
        const body = await request.json(); const email = String(body.email || "").trim().toLowerCase(); const password = String(body.password || "");
        const user = await env.DB.prepare("SELECT id, email, password_hash, password_salt, entitlement_until FROM users WHERE email = ?").bind(email).first();
        if (!user || (await passwordHash(password, user.password_salt)) !== user.password_hash) return json({ error: "invalid_credentials", message: "邮箱或密码不正确" }, 401);
        const session = await createSession(env.DB, user); return json({ user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const user = await authenticatedUser(request, env.DB); return user ? json({ user: publicUser(user) }) : authRequired(user);
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
        return json({ ok: true, message: "卡密兑换成功", user: { id: user.id, email: user.email, entitlementUntil: entitlement, active: true } });
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (url.pathname === "/api/admin/activation-codes" && request.method === "POST") {
      if (!env.ADMIN_SECRET || request.headers.get("x-admin-secret") !== env.ADMIN_SECRET) return json({ error: "forbidden" }, 403);
      try {
        const body = await request.json(); const days = Math.max(1, Math.min(3650, Number(body.days || 30))); const count = Math.max(1, Math.min(100, Number(body.count || 1))); const codes = [];
        for (let i = 0; i < count; i += 1) { const code = "RONGHE-" + randomToken().slice(0, 12).toUpperCase(); await env.DB.prepare("INSERT INTO activation_codes (code_hash, days) VALUES (?, ?)").bind(await sha256(code), days).run(); codes.push(code); }
        return json({ codes, days });
      } catch (error) { return json({ error: "invalid_request", message: error.message }, 400); }
    }
    if (request.method === "GET" && url.pathname === "/api/risk/history") {
      const user = await authenticatedUser(request, env.DB); if (!entitlementRequired(user)) return user ? entitlementRequired(user) || json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403) : authRequired(user);
      if (!env.DB) return json({ error: "database_not_configured" }, 503);
      const { results } = await env.DB.prepare("SELECT * FROM risk_decisions ORDER BY id DESC LIMIT 50").all();
      return json({ results });
    }
    if (request.method !== "POST") return json({ error: "not_found" }, 404);
    try {
      const body = await request.json();
      if (url.pathname === "/api/risk/check") {
        const user = await authenticatedUser(request, env.DB); if (!entitlementRequired(user)) return user ? json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403) : authRequired(user);
        const result = evaluateOrder(body);
        result.persisted = await saveDecision(env.DB, body, result);
        return json(result);
      }
      if (url.pathname === "/api/analysis/quality") {
        const user = await authenticatedUser(request, env.DB); if (!entitlementRequired(user)) return user ? json({ error: "entitlement_required", message: "请先兑换有效卡密" }, 403) : authRequired(user);
        const result = qualityReport(body.bars);
        result.persisted = await saveQuality(env.DB, result);
        return json(result);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return json({ error: "invalid_request", message: error.message }, 400);
    }
  },
};
