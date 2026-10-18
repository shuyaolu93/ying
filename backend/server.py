"""Ronghe 后端：分析质量门 + RiskGuard 风控门。

只使用 Python 标准库启动 HTTP 服务；RiskGuard 的状态和审计记录写入 SQLite，
因此服务器重启后不会丢失熔断状态，也不会让风控记录只停留在浏览器 localStorage。
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))

from riskguard.audit.sqlite import SqliteAuditSink  # noqa: E402
from riskguard.config import RiskConfig  # noqa: E402
from riskguard.engine import RiskEngine  # noqa: E402
from riskguard.models import Account, Order, OrderType, Portfolio, Position, Side  # noqa: E402
from riskguard.persistence import SqliteStateStore  # noqa: E402


DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
STATE_STORE = SqliteStateStore(str(DATA_DIR / "risk_state.sqlite3"), key="ronghe")
AUDIT = SqliteAuditSink(str(DATA_DIR / "audit.sqlite3"))
ENGINE = RiskEngine(
    config=RiskConfig(
        max_position_pct=0.15,
        max_drawdown_pct=0.15,
        max_gross_exposure_pct=1.0,
        max_net_exposure_pct=1.0,
        auto_register_strategies=True,
    ),
    state_store=STATE_STORE,
    audit=AUDIT,
)


def quality_report(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """TradeHelper 数据质量门的轻量 API 版本。

    完整 pandas 版仍保存在 vendor/tradehelper/core/data_quality.py；这个版本让
    服务器在没有科学计算依赖时也能安全运行，并且采取 fail-closed 策略。
    """
    issues: list[str] = []
    warnings: list[str] = []
    required = {"open", "high", "low", "close", "volume"}
    if not bars:
        issues.append("K线数据为空")
    missing = sorted(required - set(bars[0]) if bars else required)
    if missing:
        issues.append(f"缺少必要K线字段: {', '.join(missing)}")
    if bars and len(bars) < 20:
        issues.append(f"K线样本不足：仅{len(bars)}条，少于20条")
    elif bars and len(bars) < 60:
        warnings.append(f"K线样本偏少：{len(bars)}条，低于60条")
    closes: list[float] = []
    for index, bar in enumerate(bars):
        try:
            high, low, close, opening = (float(bar[k]) for k in ("high", "low", "close", "open"))
            volume = float(bar["volume"])
            if min(high, low, close, opening) <= 0:
                issues.append(f"第{index + 1}条存在非正价格")
            if high < low or close > high * 1.001 or close < low * 0.999:
                issues.append(f"第{index + 1}条 OHLC 关系异常")
            if volume <= 0:
                warnings.append(f"第{index + 1}条成交量为空或为0")
            closes.append(close)
        except (KeyError, TypeError, ValueError):
            issues.append(f"第{index + 1}条包含不可解析的价格或成交量")
    score = max(0.0, 100.0 - 35.0 * len(issues) - 8.0 * len(warnings))
    blocked = bool(issues) or score < 50
    return {
        "score": round(score, 2),
        "status": "blocked" if blocked else ("watch" if score < 85 else "ok"),
        "action": "block" if blocked else ("watch" if score < 85 else "normal"),
        "block_new_entries": blocked,
        "issues": issues,
        "warnings": warnings,
    }


def risk_check(payload: dict[str, Any]) -> dict[str, Any]:
    symbol = str(payload.get("symbol", "UNKNOWN"))
    side = Side(str(payload.get("side", "buy")).lower())
    quantity = float(payload["quantity"])
    price = float(payload["price"])
    equity = float(payload["equity"])
    position_qty = float(payload.get("position_quantity", 0))
    avg_price = float(payload.get("avg_price", price))
    portfolio = Portfolio(
        account=Account(equity=equity, cash=float(payload.get("cash", equity)), buying_power=equity),
        positions={symbol: Position(symbol, position_qty, avg_price)},
        marks={symbol: price},
    )
    order = Order(
        symbol=symbol,
        side=side,
        quantity=quantity,
        order_type=OrderType.LIMIT,
        limit_price=price,
        strategy_id=str(payload.get("strategy_id", "ronghe")),
        reduce_only=bool(payload.get("reduce_only", False)),
    )
    decision = ENGINE.check(order, portfolio)
    return {
        "decision": decision.decision.value,
        "approved": decision.approved,
        "quantity": decision.order.quantity,
        "original_quantity": decision.original_order.quantity,
        "reasons": decision.reasons(),
        "rules": [
            {"rule": result.rule, "action": result.action.value, "passed": result.passed, "message": result.message}
            for result in decision.results
        ],
        "timestamp": decision.timestamp.isoformat(),
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict[str, Any]) -> None:
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, {})

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send(200, {"ok": True, "service": "ronghe-backend", "risk_state": ENGINE.state.breaker_tripped})
            return
        self._send(404, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/analysis/quality":
                self._send(200, quality_report(payload.get("bars", [])))
            elif self.path == "/api/risk/check":
                self._send(200, risk_check(payload))
            else:
                self._send(404, {"error": "not_found"})
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            self._send(400, {"error": "invalid_request", "message": str(exc)})
        except Exception as exc:  # fail closed: never return an apparent approval
            self._send(503, {"error": "risk_service_unavailable", "message": str(exc)})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[ronghe] {format % args}")


def main() -> None:
    host = os.getenv("RONGHE_HOST", "0.0.0.0")
    port = int(os.getenv("RONGHE_PORT", "8787"))
    print(f"Ronghe backend listening on http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
