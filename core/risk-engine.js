'use strict';

/**
 * Ronghe's deterministic risk boundary.
 *
 * The UI may suggest a position, but this module is the final gate before an
 * order-like decision is accepted. It deliberately fails closed when inputs
 * are missing or invalid.
 */
function finite(value, name) {
  var number = Number(value);
  if (!Number.isFinite(number)) throw new Error(name + ' must be a finite number');
  return number;
}

function nonNegative(value, name) {
  var number = finite(value, name);
  if (number < 0) throw new Error(name + ' must be non-negative');
  return number;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculatePositionLimit(equity, price, maxPositionPct) {
  var accountEquity = nonNegative(equity, 'equity');
  var mark = finite(price, 'price');
  var limitPct = finite(maxPositionPct, 'maxPositionPct');
  if (mark <= 0) throw new Error('price must be greater than zero');
  if (limitPct < 0 || limitPct > 1) throw new Error('maxPositionPct must be between 0 and 1');
  return (accountEquity * limitPct) / mark;
}

function calculateDrawdown(equity, highWaterMark) {
  var current = nonNegative(equity, 'equity');
  var high = nonNegative(highWaterMark, 'highWaterMark');
  if (high === 0) return 0;
  return clamp((high - current) / high, 0, 1);
}

function evaluateOrder(input) {
  var order = input || {};
  var side = String(order.side || '').toLowerCase();
  var reduceOnly = Boolean(order.reduceOnly);
  var quantity = nonNegative(order.quantity, 'quantity');
  var price = finite(order.price, 'price');
  var equity = nonNegative(order.equity, 'equity');
  var currentPosition = finite(order.currentPosition || 0, 'currentPosition');
  var maxPositionPct = finite(order.maxPositionPct, 'maxPositionPct');
  var drawdown = calculateDrawdown(order.equity, order.highWaterMark);
  var maxDrawdownPct = finite(order.maxDrawdownPct, 'maxDrawdownPct');

  if (side !== 'buy' && side !== 'sell') throw new Error('side must be buy or sell');
  if (price <= 0) throw new Error('price must be greater than zero');
  if (maxPositionPct < 0 || maxPositionPct > 1) throw new Error('maxPositionPct must be between 0 and 1');
  if (maxDrawdownPct < 0 || maxDrawdownPct > 1) throw new Error('maxDrawdownPct must be between 0 and 1');

  // A sell that reduces exposure must remain possible during a circuit break.
  if (reduceOnly || (side === 'sell' && currentPosition > 0)) {
    return { decision: 'allow', quantity: Math.min(quantity, currentPosition), reasons: ['risk-reducing order allowed'] };
  }

  if (drawdown >= maxDrawdownPct) {
    return { decision: 'reject', quantity: 0, reasons: ['drawdown circuit breaker is active'] };
  }

  var maxQuantity = calculatePositionLimit(equity, price, maxPositionPct);
  var resultingPosition = side === 'buy' ? currentPosition + quantity : currentPosition - quantity;
  if (side === 'sell' && resultingPosition < 0) {
    return { decision: 'reject', quantity: 0, reasons: ['short selling is not enabled'] };
  }
  var allowed = Math.max(0, maxQuantity - Math.max(0, currentPosition));
  if (quantity > allowed) {
    return { decision: allowed > 0 ? 'resize' : 'reject', quantity: allowed, reasons: ['position limit applied'] };
  }
  return { decision: 'allow', quantity: quantity, reasons: [] };
}

function stressTest(portfolio, shockPct) {
  var positions = Array.isArray(portfolio && portfolio.positions) ? portfolio.positions : [];
  var shock = finite(shockPct, 'shockPct');
  if (shock < -1) throw new Error('shockPct cannot be less than -1');
  var equity = nonNegative(portfolio && portfolio.equity, 'equity');
  var exposure = positions.reduce(function (total, position) {
    return total + nonNegative(position.quantity, 'position.quantity') * finite(position.price, 'position.price');
  }, 0);
  var loss = exposure * Math.max(0, -shock);
  return { equityBefore: equity, exposure: exposure, estimatedLoss: loss, equityAfter: Math.max(0, equity - loss) };
}

var api = { calculatePositionLimit: calculatePositionLimit, calculateDrawdown: calculateDrawdown, evaluateOrder: evaluateOrder, stressTest: stressTest };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.RongheRiskEngine = api;
