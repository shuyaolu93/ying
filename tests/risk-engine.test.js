'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var risk = require('../core/risk-engine');

test('caps a buy at the configured position limit', function () {
  var result = risk.evaluateOrder({ side: 'buy', quantity: 100, price: 100, equity: 10000, currentPosition: 0, maxPositionPct: 0.1, highWaterMark: 10000, maxDrawdownPct: 0.15 });
  assert.equal(result.decision, 'resize');
  assert.equal(result.quantity, 10);
});

test('fails closed when the drawdown circuit breaker is active', function () {
  var result = risk.evaluateOrder({ side: 'buy', quantity: 1, price: 100, equity: 8000, currentPosition: 0, maxPositionPct: 0.1, highWaterMark: 10000, maxDrawdownPct: 0.15 });
  assert.equal(result.decision, 'reject');
  assert.equal(result.quantity, 0);
});

test('allows a reducing order during a circuit break', function () {
  var result = risk.evaluateOrder({ side: 'sell', quantity: 5, price: 100, equity: 8000, currentPosition: 10, maxPositionPct: 0.1, highWaterMark: 10000, maxDrawdownPct: 0.15 });
  assert.equal(result.decision, 'allow');
  assert.equal(result.quantity, 5);
});

test('rejects invalid prices instead of guessing', function () {
  assert.throws(function () {
    risk.evaluateOrder({ side: 'buy', quantity: 1, price: 0, equity: 10000, currentPosition: 0, maxPositionPct: 0.1, highWaterMark: 10000, maxDrawdownPct: 0.15 });
  }, /price/);
});

test('stress test is read-only and deterministic', function () {
  assert.deepEqual(risk.stressTest({ equity: 10000, positions: [{ quantity: 10, price: 100 }] }, -0.2), { equityBefore: 10000, exposure: 1000, estimatedLoss: 200, equityAfter: 9800 });
});
