import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))
from server import quality_report, risk_check


def test_quality_blocks_empty_bars():
    report = quality_report([])
    assert report["block_new_entries"] is True


def test_quality_blocks_nonfinite_and_out_of_range_ohlc():
    bars = [{"open": 10, "high": 12, "low": 9, "close": 11, "volume": 100} for _ in range(60)]
    bars[30] = {"open": 13, "high": 12, "low": 9, "close": 11, "volume": 100}
    assert quality_report(bars)["block_new_entries"] is True
    bars[30] = {"open": 10, "high": 12, "low": 9, "close": 11, "volume": float("nan")}
    assert quality_report(bars)["block_new_entries"] is True


def test_risk_check_resizes_large_order():
    result = risk_check({"symbol": "TEST", "side": "buy", "quantity": 1000, "price": 20, "equity": 100000})
    assert result["decision"] == "resize"
    # RiskGuard 的新策略隔离规则会把首笔订单进一步限制到权益的1%。
    assert result["quantity"] == 50


def test_response_is_json_serializable():
    result = risk_check({"symbol": "TEST", "side": "sell", "quantity": 10, "price": 20, "equity": 100000})
    json.dumps(result, ensure_ascii=False)
