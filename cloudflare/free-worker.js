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
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return Response.redirect("https://shuyaolu93.github.io/ronghe/", 302);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "ronghe-free-worker", stateful: Boolean(env.DB) });
    if (request.method === "GET" && url.pathname === "/api") return json({ ok: true, service: "ronghe-free-worker", stateful: Boolean(env.DB), endpoints: { risk_check: { method: "POST", path: "/api/risk/check", content_type: "application/json" }, quality: { method: "POST", path: "/api/analysis/quality", content_type: "application/json" }, risk_history: { method: "GET", path: "/api/risk/history" } } });
    if (request.method === "GET" && url.pathname === "/api/risk/check") return json({ error: "method_not_allowed", message: "请使用 POST，并发送 JSON 风控参数", method: "POST", endpoint: "/api/risk/check" }, 405);
    if (request.method === "GET" && url.pathname === "/api/analysis/quality") return json({ error: "method_not_allowed", message: "请使用 POST，并发送 JSON K线数据", method: "POST", endpoint: "/api/analysis/quality" }, 405);
    if (request.method === "GET" && url.pathname === "/api/risk/history") {
      if (!env.DB) return json({ error: "database_not_configured" }, 503);
      const { results } = await env.DB.prepare("SELECT * FROM risk_decisions ORDER BY id DESC LIMIT 50").all();
      return json({ results });
    }
    if (request.method !== "POST") return json({ error: "not_found" }, 404);
    try {
      const body = await request.json();
      if (url.pathname === "/api/risk/check") {
        const result = evaluateOrder(body);
        result.persisted = await saveDecision(env.DB, body, result);
        return json(result);
      }
      if (url.pathname === "/api/analysis/quality") {
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
