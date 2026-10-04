/* =====================================================================
   INGRESARIOS · OptionLab — Motor de pricing
   Black-Scholes-Merton, Greeks, P/L, breakevens y probabilidad de ganancia.
   Sin dependencias. Expone window.Pricing
   ===================================================================== */
(function (global) {
  'use strict';

  const MULT = 100;            // multiplicador estándar de opciones sobre acciones
  const DAYS = 365;            // base anual

  // ---------- Distribución normal ----------
  function normPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
  // Abramowitz & Stegun 26.2.17 (error < 7.5e-8)
  function normCdf(x) {
    if (x < -8) return 0;
    if (x > 8) return 1;
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const v = 1 - normPdf(x) * poly;
    return x >= 0 ? v : 1 - v;
  }

  // ---------- Black-Scholes-Merton ----------
  /**
   * @param {'call'|'put'} type
   * @param {number} S  spot
   * @param {number} K  strike
   * @param {number} T  años hasta vencimiento
   * @param {number} r  tasa libre de riesgo (decimal)
   * @param {number} sigma volatilidad implícita (decimal)
   * @param {number} q  dividend yield (decimal)
   * @returns {{price:number, delta:number, gamma:number, theta:number, vega:number, rho:number}}
   */
  function bsm(type, S, K, T, r, sigma, q = 0) {
    if (T <= 0 || sigma <= 0) {
      // valor intrínseco al vencimiento (o sin vol)
      const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
      const itm = type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
      return { price: intrinsic, delta: itm, gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;
    const eqT = Math.exp(-q * T), erT = Math.exp(-r * T);
    const Nd1 = normCdf(d1), Nd2 = normCdf(d2), nd1 = normPdf(d1);
    let price, delta, theta, rho;
    if (type === 'call') {
      price = S * eqT * Nd1 - K * erT * Nd2;
      delta = eqT * Nd1;
      theta = (-(S * eqT * nd1 * sigma) / (2 * sqrtT) - r * K * erT * Nd2 + q * S * eqT * Nd1) / DAYS;
      rho = K * T * erT * Nd2 / 100;
    } else {
      price = K * erT * normCdf(-d2) - S * eqT * normCdf(-d1);
      delta = -eqT * normCdf(-d1);
      theta = (-(S * eqT * nd1 * sigma) / (2 * sqrtT) + r * K * erT * normCdf(-d2) - q * S * eqT * normCdf(-d1)) / DAYS;
      rho = -K * T * erT * normCdf(-d2) / 100;
    }
    const gamma = eqT * nd1 / (S * sigma * sqrtT);
    const vega = S * eqT * nd1 * sqrtT / 100; // por 1 punto de IV
    return { price, delta, gamma, theta, vega, rho };
  }

  // Volatilidad implícita por bisección (dado un precio de mercado)
  function impliedVol(type, price, S, K, T, r, q = 0) {
    let lo = 0.001, hi = 5, mid = 0.3;
    for (let i = 0; i < 80; i++) {
      mid = (lo + hi) / 2;
      const p = bsm(type, S, K, T, r, mid, q).price;
      if (Math.abs(p - price) < 1e-6) break;
      if (p > price) hi = mid; else lo = mid;
    }
    return mid;
  }

  // ---------- Patas (legs) ----------
  /**
   * Una pata:
   *  { kind: 'call'|'put'|'stock', side: 1|-1 (long/short), qty: entero>0,
   *    strike: number (ignorado para stock), dte: días a vencimiento,
   *    iv: decimal, entry: precio pagado/recibido por unidad }
   */

  // Valor teórico de una pata en un escenario
  function legValue(leg, S, daysElapsed, ivShift, r, q) {
    if (leg.kind === 'stock') return S;
    const T = Math.max(leg.dte - daysElapsed, 0) / DAYS;
    const sigma = Math.max(leg.iv + ivShift, 0.0001);
    return bsm(leg.kind, S, leg.strike, T, r, sigma, q).price;
  }

  // P/L de toda la estrategia en un escenario (en dinero, con multiplicador)
  function strategyPL(legs, S, daysElapsed, ivShift, r, q) {
    let pl = 0;
    for (const leg of legs) {
      const v = legValue(leg, S, daysElapsed, ivShift, r, q);
      const mult = leg.kind === 'stock' ? 1 : MULT;
      pl += leg.side * leg.qty * (v - leg.entry) * mult;
    }
    return pl;
  }

  // P/L al vencimiento (del vencimiento más corto) = intrínseco
  function payoffAtExpiry(legs, S) {
    const minDte = Math.min(...legs.map(l => l.kind === 'stock' ? Infinity : l.dte));
    return strategyPL(legs, S, minDte === Infinity ? 0 : minDte, 0, 0, 0);
  }

  // Greeks netos (en términos de posición, con multiplicador)
  function netGreeks(legs, S, daysElapsed, ivShift, r, q) {
    const g = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    for (const leg of legs) {
      if (leg.kind === 'stock') { g.delta += leg.side * leg.qty; continue; }
      const T = Math.max(leg.dte - daysElapsed, 0) / DAYS;
      const res = bsm(leg.kind, S, leg.strike, T, r, Math.max(leg.iv + ivShift, 0.0001), q);
      const f = leg.side * leg.qty * MULT;
      g.delta += f * res.delta; g.gamma += f * res.gamma;
      g.theta += f * res.theta; g.vega += f * res.vega; g.rho += f * res.rho;
    }
    return g;
  }

  // Costo neto: positivo = débito (pagas), negativo = crédito (recibes)
  function netCost(legs) {
    return legs.reduce((acc, l) => acc + l.side * l.qty * l.entry * (l.kind === 'stock' ? 1 : MULT), 0);
  }

  // Rango de precios para gráficos
  function priceRange(legs, S, iv, dte, widthSigmas = 2.5) {
    const T = Math.max(dte, 1) / DAYS;
    const move = S * iv * Math.sqrt(T) * widthSigmas;
    const strikes = legs.filter(l => l.kind !== 'stock').map(l => l.strike);
    let lo = Math.min(S - move, ...strikes) * 0.97;
    let hi = Math.max(S + move, ...strikes) * 1.03;
    lo = Math.max(lo, 0.01);
    return { lo, hi };
  }

  // Breakevens al vencimiento (cruces por cero)
  function breakevens(legs, lo, hi, steps = 2000) {
    const out = [];
    let prevS = lo, prevP = payoffAtExpiry(legs, lo);
    for (let i = 1; i <= steps; i++) {
      const S = lo + (hi - lo) * i / steps;
      const P = payoffAtExpiry(legs, S);
      if ((prevP <= 0 && P > 0) || (prevP >= 0 && P < 0)) {
        // interpolación lineal
        const be = prevS + (0 - prevP) * (S - prevS) / (P - prevP);
        if (!out.length || Math.abs(out[out.length - 1] - be) > (hi - lo) / steps * 2) out.push(be);
      }
      prevS = S; prevP = P;
    }
    return out;
  }

  // Máxima ganancia / pérdida al vencimiento. Detecta ilimitado por la pendiente en las colas.
  function maxProfitLoss(legs, lo, hi) {
    let maxP = -Infinity, maxL = Infinity;
    const steps = 1500;
    for (let i = 0; i <= steps; i++) {
      const S = lo + (hi - lo) * i / steps;
      const P = payoffAtExpiry(legs, S);
      if (P > maxP) maxP = P;
      if (P < maxL) maxL = P;
    }
    // Pendientes en las colas, en acciones-equivalentes (1 contrato = 100 acciones).
    // upSlope > 0: la ganancia crece sin límite al alza; < 0: la pérdida crece sin límite.
    const upSlope = legs.reduce((a, l) => a + (l.kind === 'call' ? l.side * l.qty * MULT : l.kind === 'stock' ? l.side * l.qty : 0), 0);
    // downSlope > 0: la posición GANA cuando el precio cae (puts largos, stock corto); < 0: pierde.
    const downSlope = legs.reduce((a, l) => a + (l.kind === 'put' ? l.side * l.qty * MULT : l.kind === 'stock' ? -l.side * l.qty : 0), 0);
    const result = { maxProfit: maxP, maxLoss: maxL, unlimitedProfit: false, unlimitedLoss: false };
    if (upSlope > 0) result.unlimitedProfit = true;
    if (upSlope < 0) result.unlimitedLoss = true;
    // hacia abajo el precio está acotado en 0: finito pero grande; lo evaluamos en S=0.01
    const pAtZero = payoffAtExpiry(legs, 0.01);
    if (downSlope > 0 && pAtZero > result.maxProfit) result.maxProfit = pAtZero;
    if (downSlope < 0 && pAtZero < result.maxLoss) result.maxLoss = pAtZero;
    return result;
  }

  // Probabilidad de ganancia (POP) al vencimiento bajo lognormal risk-neutral con drift r
  function probabilityOfProfit(legs, S, iv, dte, r, q = 0) {
    const T = Math.max(dte, 0.5) / DAYS;
    const sigma = Math.max(iv, 0.0001);
    const mu = Math.log(S) + (r - q - 0.5 * sigma * sigma) * T;
    const sd = sigma * Math.sqrt(T);
    // integración sobre z en [-5,5]
    const N = 600; let pop = 0, ev = 0;
    for (let i = 0; i < N; i++) {
      const z = -5 + 10 * (i + 0.5) / N;
      const price = Math.exp(mu + sd * z);
      const w = normPdf(z) * (10 / N);
      const P = payoffAtExpiry(legs, price);
      if (P > 0) pop += w;
      ev += w * P;
    }
    return { pop, expectedValue: ev };
  }

  // Movimiento esperado (1σ) a X días
  function expectedMove(S, iv, dte) {
    return S * iv * Math.sqrt(Math.max(dte, 0) / DAYS);
  }

  // Probabilidad de que S termine por encima / por debajo de K al vencimiento
  function probAbove(S, K, iv, dte, r, q = 0) {
    const T = Math.max(dte, 0.5) / DAYS;
    const d2 = (Math.log(S / K) + (r - q - 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
    return normCdf(d2);
  }

  // Requerimiento de capital aproximado (margen Reg-T simplificado, educativo)
  function capitalRequired(legs, mpl, cost) {
    if (mpl.unlimitedLoss) return { amount: null, note: 'Riesgo ilimitado: el margen lo define el bróker (posición descubierta).' };
    if (cost > 0) return { amount: cost, note: 'Débito neto pagado = riesgo máximo del débito.' };
    return { amount: Math.abs(mpl.maxLoss), note: 'Crédito: el margen ≈ pérdida máxima (ancho del spread − crédito).' };
  }

  // Matriz P/L (precio × día) para el mapa de calor
  function plMatrix(legs, prices, days, ivShift, r, q) {
    return prices.map(S => days.map(d => strategyPL(legs, S, d, ivShift, r, q)));
  }

  global.Pricing = {
    MULT, DAYS, normCdf, normPdf, bsm, impliedVol, legValue, strategyPL, payoffAtExpiry,
    netGreeks, netCost, priceRange, breakevens, maxProfitLoss, probabilityOfProfit,
    expectedMove, probAbove, capitalRequired, plMatrix
  };
})(typeof window !== 'undefined' ? window : globalThis);
