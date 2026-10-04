/* =====================================================================
   INGRESARIOS · OptionLab — Aplicación
   ===================================================================== */
(function () {
  'use strict';
  const P = window.Pricing, { STRATEGIES, GLOSSARY } = window.Strategies;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmtMoney = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-US', { maximumFractionDigits: 0 });
  const fmtMoney2 = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (v, d = 2) => v.toLocaleString('es-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  // ---------------- Estado ----------------
  const state = {
    ticker: 'SPY', spot: 500, iv: 0.20, dte: 30, r: 0.045, step: 5,
    strategyId: 'iron-condor', legs: [], custom: false,
    sim: { pricePct: 0, days: 0, ivShift: 0 },
    filter: 'Todas', learn: true
  };

  // ---------------- Construcción de patas ----------------
  function atmStrike() { return Math.round(state.spot / state.step) * state.step; }

  function buildLegsFromTemplate(tpl) {
    const atm = atmStrike();
    return tpl.legs.map(l => {
      const leg = {
        kind: l.kind, side: l.side, qty: l.qty,
        strike: l.kind === 'stock' ? 0 : atm + l.off * state.step,
        dte: Math.round(state.dte * (l.dteMult || 1)),
        iv: state.iv, entry: 0, entryEdited: false
      };
      leg.entry = theoEntry(leg);
      return leg;
    });
  }

  function theoEntry(leg) {
    if (leg.kind === 'stock') return state.spot;
    return P.bsm(leg.kind, state.spot, leg.strike, leg.dte / P.DAYS, state.r, leg.iv).price;
  }

  function refreshEntries() {
    for (const leg of state.legs) if (!leg.entryEdited) leg.entry = theoEntry(leg);
  }

  function loadStrategy(id) {
    const tpl = STRATEGIES.find(s => s.id === id) || STRATEGIES[0];
    state.strategyId = tpl.id;
    state.legs = buildLegsFromTemplate(tpl);
    state.custom = false;
    state.sim = { pricePct: 0, days: 0, ivShift: 0 };
    render();
  }

  // ---------------- Cálculo ----------------
  function compute() {
    const legs = state.legs.filter(l => l.qty > 0);
    const optLegs = legs.filter(l => l.kind !== 'stock');
    const minDte = optLegs.length ? Math.min(...optLegs.map(l => l.dte)) : state.dte;
    const avgIv = optLegs.length ? optLegs.reduce((a, l) => a + l.iv, 0) / optLegs.length : state.iv;
    const { lo, hi } = P.priceRange(legs, state.spot, avgIv, minDte);
    const N = 240;
    const xs = Array.from({ length: N + 1 }, (_, i) => lo + (hi - lo) * i / N);
    const expiry = xs.map(x => ({ x, y: P.payoffAtExpiry(legs, x) }));
    const t0 = xs.map(x => ({ x, y: P.strategyPL(legs, x, 0, 0, state.r, 0) }));
    const simDays = clamp(state.sim.days, 0, minDte);
    const ivShift = state.sim.ivShift / 100;
    const tn = xs.map(x => ({ x, y: P.strategyPL(legs, x, simDays, ivShift, state.r, 0) }));
    const breakevens = P.breakevens(legs, lo, hi);
    const mpl = P.maxProfitLoss(legs, lo, hi);
    const cost = P.netCost(legs);
    const pop = P.probabilityOfProfit(legs, state.spot, avgIv, minDte, state.r);
    const greeks = P.netGreeks(legs, state.spot, 0, 0, state.r, 0);
    const em = P.expectedMove(state.spot, avgIv, minDte);
    const simPrice = state.spot * (1 + state.sim.pricePct / 100);
    const simPL = P.strategyPL(legs, simPrice, simDays, ivShift, state.r, 0);
    const simGreeks = P.netGreeks(legs, simPrice, simDays, ivShift, state.r, 0);
    const strikes = [...new Set(optLegs.map(l => l.strike))].sort((a, b) => a - b);
    return { legs, minDte, avgIv, lo, hi, expiry, t0, tn, simDays, ivShift, breakevens, mpl, cost, pop, greeks, em, simPrice, simPL, simGreeks, strikes };
  }

  // ---------------- Render ----------------
  let chart;
  function render() {
    refreshEntries();
    const c = compute();
    const tpl = STRATEGIES.find(s => s.id === state.strategyId);
    renderHeader(tpl, c);
    renderStats(c);
    renderChart(c);
    renderSim(c);
    renderLegs(c);
    renderGreeks(c);
    renderLearn(tpl, c);
    renderHeatmap(c);
    renderEm(c);
    document.querySelectorAll('.strategy-item').forEach(b => b.classList.toggle('active', b.dataset.id === state.strategyId));
    $('#learnPanel').classList.toggle('hidden', !state.learn);
  }

  function renderHeader(tpl, c) {
    $('#strategyName').textContent = (state.custom ? '✎ ' : '') + tpl.name + ' · ' + state.ticker.toUpperCase();
    $('#strategyGroup').textContent = `${tpl.group} · ${tpl.bias}`;
    const b = $('#strategyBadges'); b.innerHTML = '';
    b.append(el('span', 'badge ' + (c.cost > 0 ? 'debit' : 'credit'), c.cost > 0 ? `DÉBITO ${fmtMoney2(c.cost)}` : `CRÉDITO ${fmtMoney2(-c.cost)}`));
    b.append(el('span', 'badge', `${c.minDte} DTE`));
    b.append(el('span', 'badge', `IV ${(c.avgIv * 100).toFixed(1)}%`));
    if (c.mpl.unlimitedLoss) b.append(el('span', 'badge danger', '⚠ RIESGO ILIMITADO'));
    if (c.mpl.unlimitedProfit) b.append(el('span', 'badge credit', '↑ GANANCIA ILIMITADA'));
  }

  function stat(k, v, cls, sub, tip) {
    return `<div class="stat"><div class="k">${k}${tip ? ` <i class="hint" data-tip="${tip}">?</i>` : ''}</div><div class="v ${cls || ''}">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  }
  function renderStats(c) {
    const maxP = c.mpl.unlimitedProfit ? '∞' : fmtMoney(c.mpl.maxProfit);
    const maxL = c.mpl.unlimitedLoss ? '−∞' : fmtMoney(c.mpl.maxLoss);
    const rr = (!c.mpl.unlimitedProfit && !c.mpl.unlimitedLoss && c.mpl.maxLoss < 0) ? (c.mpl.maxProfit / Math.abs(c.mpl.maxLoss)).toFixed(2) : '—';
    const cap = P.capitalRequired(c.legs, c.mpl, c.cost);
    const bes = c.breakevens.length ? c.breakevens.map(b => '$' + fmtNum(b)).join(' · ') : '—';
    const roc = cap.amount ? ((c.mpl.unlimitedProfit ? NaN : c.mpl.maxProfit) / cap.amount * 100) : NaN;
    $('#stats').innerHTML =
      stat('Ganancia máx.', maxP, 'pos', isFinite(roc) ? `${roc.toFixed(1)}% sobre capital` : '') +
      stat('Pérdida máx.', maxL, 'neg', cap.amount ? `Capital ≈ ${fmtMoney(cap.amount)}` : 'Margen según bróker') +
      stat('Prob. de ganancia', (c.pop.pop * 100).toFixed(1) + '%', 'cyan', `EV ${fmtMoney(c.pop.expectedValue)}`, 'pop') +
      stat('Breakeven', bes, '', c.breakevens.length > 1 ? `Rango ${fmtNum(c.breakevens[c.breakevens.length - 1] - c.breakevens[0], 2)} pts` : '', 'be') +
      stat('Riesgo / beneficio', rr === '—' ? '—' : `1 : ${rr}`, rr !== '—' && +rr >= 1 ? 'pos' : 'amber', rr === '—' ? 'No aplica (ilimitado)' : `Arriesgas $1 para ganar $${rr}`) +
      stat('Theta / día', fmtMoney2(c.greeks.theta), c.greeks.theta >= 0 ? 'pos' : 'neg', c.greeks.theta >= 0 ? 'El tiempo te paga' : 'El tiempo te cobra', 'theta');
  }

  function renderChart(c) {
    const series = [
      { key: 'expiry', label: `Al vencimiento (${c.minDte} DTE)`, color: window.ChartColors.expiry, points: c.expiry, width: 2.2 },
      { key: 't0', label: 'Hoy (T+0)', color: window.ChartColors.t0, points: c.t0, width: 1.6, dash: [6, 4] }
    ];
    const showTn = c.simDays > 0 || c.ivShift !== 0;
    if (showTn) series.push({ key: 'tn', label: `T+${c.simDays}d · IV ${c.ivShift >= 0 ? '+' : ''}${(c.ivShift * 100).toFixed(1)}`, color: window.ChartColors.tn, points: c.tn, width: 1.8 });
    chart.setData({ lo: c.lo, hi: c.hi, spot: state.spot, series, strikes: c.strikes, breakevens: c.breakevens });
    $('#legend').innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('') +
      `<span><i style="background:${window.ChartColors.spot};height:1px"></i>Spot</span><span><i style="background:${window.ChartColors.be};width:8px;height:8px;border-radius:50%"></i>Breakeven</span>`;
  }

  function renderSim(c) {
    const sd = $('#simDays'); sd.max = c.minDte; if (+sd.value > c.minDte) sd.value = c.minDte;
    $('#simPrice').value = state.sim.pricePct; $('#simDays').value = state.sim.days; $('#simIv').value = state.sim.ivShift;
    $('#simPriceLbl').textContent = `$${fmtNum(c.simPrice)} (${state.sim.pricePct >= 0 ? '+' : ''}${state.sim.pricePct}%)`;
    $('#simDaysLbl').textContent = `${c.simDays} de ${c.minDte} días`;
    $('#simIvLbl').textContent = `${state.sim.ivShift >= 0 ? '+' : ''}${state.sim.ivShift} pts`;
    $('#simReadout').innerHTML = `P/L estimado: <b class="${c.simPL >= 0 ? 'pos' : 'neg'}">${fmtMoney(c.simPL)}</b> <span class="muted">· Δ ${c.simGreeks.delta.toFixed(1)} · Θ ${fmtMoney2(c.simGreeks.theta)}/día</span>`;
  }

  function renderLegs(c) {
    const tb = $('#legsTable tbody'); tb.innerHTML = '';
    state.legs.forEach((leg, i) => {
      const tr = el('tr');
      const isStock = leg.kind === 'stock';
      const g = isStock ? { delta: leg.side * leg.qty, theta: 0 } : (() => {
        const r = P.bsm(leg.kind, state.spot, leg.strike, leg.dte / P.DAYS, state.r, leg.iv);
        return { delta: leg.side * leg.qty * r.delta * P.MULT, theta: leg.side * leg.qty * r.theta * P.MULT };
      })();
      tr.innerHTML = `
        <td><button class="side-btn ${leg.side > 0 ? 'long' : 'short'}" data-i="${i}" data-act="side">${leg.side > 0 ? 'COMPRA' : 'VENTA'}</button></td>
        <td><select data-i="${i}" data-k="kind"><option value="call"${leg.kind === 'call' ? ' selected' : ''}>Call</option><option value="put"${leg.kind === 'put' ? ' selected' : ''}>Put</option><option value="stock"${isStock ? ' selected' : ''}>Acción</option></select></td>
        <td>${isStock ? '<span class="ro">—</span>' : `<input type="number" step="${state.step}" data-i="${i}" data-k="strike" value="${leg.strike}">`}</td>
        <td><input type="number" step="1" min="1" data-i="${i}" data-k="qty" value="${leg.qty}" style="min-width:56px"></td>
        <td>${isStock ? '<span class="ro">—</span>' : `<input type="number" step="1" min="0" data-i="${i}" data-k="dte" value="${leg.dte}" style="min-width:60px">`}</td>
        <td>${isStock ? '<span class="ro">—</span>' : `<input type="number" step="0.5" min="1" data-i="${i}" data-k="iv" value="${(leg.iv * 100).toFixed(1)}" style="min-width:64px">`}</td>
        <td><input type="number" step="0.01" data-i="${i}" data-k="entry" class="${leg.entryEdited ? 'edited' : ''}" value="${leg.entry.toFixed(2)}" title="${leg.entryEdited ? 'Prima manual (doble clic para volver a la teórica)' : 'Prima teórica Black-Scholes'}"></td>
        <td class="ro">${g.delta.toFixed(1)}</td>
        <td class="ro ${g.theta >= 0 ? 'pos' : 'neg'}">${fmtMoney2(g.theta)}</td>
        <td><button class="del" data-i="${i}" data-act="del" title="Eliminar pata">✕</button></td>`;
      tb.append(tr);
    });
  }

  function renderGreeks(c) {
    const g = c.greeks;
    const items = [
      ['delta', 'Delta', g.delta.toFixed(1), g.delta > 0 ? 'Sesgo alcista: ganas ≈ ' + fmtMoney(g.delta) + ' si el subyacente sube $1.' : g.delta < 0 ? 'Sesgo bajista: ganas ≈ ' + fmtMoney(-g.delta) + ' si el subyacente baja $1.' : 'Neutral en dirección.'],
      ['gamma', 'Gamma', g.gamma.toFixed(2), g.gamma < 0 ? 'Gamma negativa: los movimientos grandes te perjudican y la delta se vuelve en tu contra.' : 'Gamma positiva: los movimientos grandes te benefician.'],
      ['theta', 'Theta', fmtMoney2(g.theta) + '/día', g.theta > 0 ? 'Cada día que pasa sin movimiento suma a tu favor.' : 'Cada día que pasa sin movimiento resta.'],
      ['vega', 'Vega', fmtMoney2(g.vega) + '/pt', g.vega < 0 ? 'Vega negativa: te beneficia que la IV baje (IV crush a tu favor).' : 'Vega positiva: te beneficia que la IV suba.']
    ];
    $('#greeks').innerHTML = items.map(([k, n, v, d]) => `<div class="greek"><div class="k">${n} <i class="hint" data-tip="${k}">?</i></div><div class="v ${k === 'theta' ? (g.theta >= 0 ? 'pos' : 'neg') : ''}">${v}</div><div class="d">${d}</div></div>`).join('');
  }

  function renderLearn(tpl, c) {
    const lvl = ['', 'Principiante', 'Intermedio', 'Avanzado', 'Experto'][tpl.level] || '';
    const probIn = c.breakevens.length === 2 ? P.probAbove(state.spot, c.breakevens[0], c.avgIv, c.minDte, state.r) - P.probAbove(state.spot, c.breakevens[1], c.avgIv, c.minDte, state.r) : null;
    $('#learnContent').innerHTML = `
      <div class="learn-block"><h4>¿Qué es? · Nivel ${lvl}</h4><p>${tpl.summary}</p></div>
      <div class="learn-block"><h4>¿Cuándo usarla?</h4><p>${tpl.when}</p></div>
      <div class="learn-block risk"><h4>Riesgo</h4><p>${tpl.risk}</p></div>
      <div class="learn-block pedem"><h4>PEDEM</h4><p>${tpl.pedem}</p></div>
      <div class="learn-block"><h4>Lectura de este setup</h4><p>
        Movimiento esperado (1σ) a ${c.minDte} días: <b class="cyan">±$${fmtNum(c.em)}</b> → rango $${fmtNum(state.spot - c.em)} – $${fmtNum(state.spot + c.em)}.
        ${probIn !== null ? ` La probabilidad de terminar entre los breakevens es ≈ <b class="cyan">${(probIn * 100).toFixed(1)}%</b>.` : ''}
        ${c.pop.expectedValue < 0 ? ' El valor esperado es negativo: la estrategia solo tiene sentido si tu análisis te da una ventaja sobre lo que descuenta el mercado.' : ' El valor esperado es positivo bajo el modelo; recuerda que el modelo no incluye comisiones ni deslizamiento.'}
      </p></div>`;
  }

  function renderHeatmap(c) {
    const rows = 13, cols = Math.min(8, c.minDte + 1);
    const em2 = Math.max(c.em * 2, state.spot * 0.02);
    const prices = Array.from({ length: rows }, (_, i) => state.spot + em2 - (2 * em2) * i / (rows - 1));
    const days = Array.from({ length: cols }, (_, j) => Math.round(c.minDte * j / (cols - 1)));
    const m = P.plMatrix(c.legs, prices, days, c.ivShift, state.r, 0);
    const maxAbs = Math.max(1, ...m.flat().map(Math.abs));
    const today = new Date();
    const dateLbl = d => { const dt = new Date(today); dt.setDate(dt.getDate() + d); return dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }); };
    let html = `<thead><tr><th>Precio</th>${days.map(d => `<th>+${d}d<br>${dateLbl(d)}</th>`).join('')}</tr></thead><tbody>`;
    prices.forEach((pr, i) => {
      const isSpot = Math.abs(pr - state.spot) < 1e-6;
      html += `<tr class="${isSpot ? 'spot-row' : ''}"><td class="price">$${fmtNum(pr)}</td>`;
      m[i].forEach(v => {
        const a = Math.min(Math.abs(v) / maxAbs, 1);
        const bg = v >= 0 ? `rgba(0,255,148,${0.08 + 0.55 * a})` : `rgba(255,77,109,${0.08 + 0.55 * a})`;
        const col = a > 0.5 ? '#0A0D12' : 'var(--text)';
        html += `<td style="background:${bg};color:${col}">${fmtMoney(v)}</td>`;
      });
      html += '</tr>';
    });
    $('#heatmap').innerHTML = html + '</tbody>';
  }

  function renderEm(c) {
    const em30 = P.expectedMove(state.spot, state.iv, state.dte);
    $('#emBox').innerHTML = `Movimiento esperado 1σ a ${state.dte} DTE: <b>±$${fmtNum(em30)}</b> (${(em30 / state.spot * 100).toFixed(1)}%) · Rango 68 %: <b>$${fmtNum(state.spot - em30)} – $${fmtNum(state.spot + em30)}</b>`;
  }

  // ---------------- Lista de estrategias ----------------
  function renderStrategyList() {
    const groups = ['Todas', ...new Set(STRATEGIES.map(s => s.group))];
    $('#strategyFilter').innerHTML = groups.map(g => `<button class="chip ${g === state.filter ? 'active' : ''}" data-g="${g}">${g}</button>`).join('');
    const list = $('#strategyList'); list.innerHTML = '';
    STRATEGIES.filter(s => state.filter === 'Todas' || s.group === state.filter).forEach(s => {
      const b = el('button', 'strategy-item' + (s.id === state.strategyId ? ' active' : ''));
      b.dataset.id = s.id;
      b.innerHTML = `<div><div class="s-name">${s.name}</div><div class="s-bias">${s.bias}</div></div><span class="level" title="Nivel ${s.level}/4">${[1, 2, 3, 4].map(n => `<i class="${n <= s.level ? 'on' : ''}"></i>`).join('')}</span>`;
      list.append(b);
    });
  }

  // ---------------- Guardar / compartir ----------------
  const SAVE_KEY = 'optionlab.ingresarios.saved';
  function getSaved() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch { return []; } }
  function snapshot() {
    const { ticker, spot, iv, dte, r, step, strategyId, legs, custom, sim } = state;
    return { ticker, spot, iv, dte, r, step, strategyId, legs, custom, sim };
  }
  function restore(snap) {
    Object.assign(state, snap);
    syncMarketInputs();
    render();
  }
  function renderSaved() {
    const saved = getSaved(); const box = $('#savedList');
    if (!saved.length) { box.innerHTML = '<div class="muted">Aún no has guardado estrategias.</div>'; return; }
    box.innerHTML = '';
    saved.forEach((s, i) => {
      const d = el('div', 'saved-item');
      d.innerHTML = `<button class="s-load" data-i="${i}">${s.name}<br><span class="muted" style="font-size:10px">${s.snap.ticker} · ${new Date(s.at).toLocaleDateString('es-ES')}</span></button><button class="s-del" data-i="${i}" title="Eliminar">✕</button>`;
      box.append(d);
    });
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
  function encodeState() { return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot())))); }
  function decodeState(h) { try { return JSON.parse(decodeURIComponent(escape(atob(h)))); } catch { return null; } }

  function syncMarketInputs() {
    $('#ticker').value = state.ticker; $('#spot').value = state.spot; $('#iv').value = +(state.iv * 100).toFixed(2);
    $('#dte').value = state.dte; $('#rate').value = +(state.r * 100).toFixed(2); $('#step').value = state.step;
  }

  // ---------------- Eventos ----------------
  function bind() {
    // Mercado
    const onMarket = () => {
      state.ticker = $('#ticker').value.trim() || 'SPY';
      state.spot = Math.max(+$('#spot').value || 1, 0.01);
      state.iv = Math.max(+$('#iv').value || 1, 0.5) / 100;
      state.dte = Math.max(Math.round(+$('#dte').value || 1), 0);
      state.r = (+$('#rate').value || 0) / 100;
      state.step = Math.max(+$('#step').value || 0.5, 0.01);
      if (!state.custom) state.legs = buildLegsFromTemplate(STRATEGIES.find(s => s.id === state.strategyId));
      render();
    };
    ['ticker', 'spot', 'iv', 'dte', 'rate', 'step'].forEach(id => $('#' + id).addEventListener('input', onMarket));

    // Estrategias
    $('#strategyFilter').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; state.filter = b.dataset.g; renderStrategyList(); });
    $('#strategyList').addEventListener('click', e => { const b = e.target.closest('.strategy-item'); if (b) loadStrategy(b.dataset.id); });

    // Simulador
    const onSim = () => { state.sim.pricePct = +$('#simPrice').value; state.sim.days = +$('#simDays').value; state.sim.ivShift = +$('#simIv').value; render(); };
    ['simPrice', 'simDays', 'simIv'].forEach(id => $('#' + id).addEventListener('input', onSim));

    // Patas: edición
    $('#legsTable').addEventListener('input', e => {
      const t = e.target; if (!t.dataset.k) return;
      const leg = state.legs[+t.dataset.i]; const k = t.dataset.k;
      state.custom = true;
      if (k === 'kind') { leg.kind = t.value; if (leg.kind === 'stock') { leg.qty = Math.max(leg.qty, 1) * (leg.qty < 100 ? 100 : 1); } leg.entryEdited = false; }
      else if (k === 'strike') leg.strike = +t.value || leg.strike;
      else if (k === 'qty') leg.qty = Math.max(Math.round(+t.value) || 1, 1);
      else if (k === 'dte') { leg.dte = Math.max(Math.round(+t.value) || 0, 0); leg.entryEdited = false; }
      else if (k === 'iv') { leg.iv = Math.max(+t.value || 1, 0.5) / 100; leg.entryEdited = false; }
      else if (k === 'entry') { leg.entry = Math.max(+t.value || 0, 0); leg.entryEdited = true; }
      if (k === 'kind' || k === 'strike') leg.entryEdited = false;
      // re-render sin perder foco en el input activo
      const focus = { i: t.dataset.i, k, pos: t.selectionStart };
      render();
      const again = document.querySelector(`[data-i="${focus.i}"][data-k="${focus.k}"]`);
      if (again) { again.focus(); try { again.setSelectionRange(focus.pos, focus.pos); } catch {} }
    });
    $('#legsTable').addEventListener('dblclick', e => {
      const t = e.target; if (t.dataset.k === 'entry') { state.legs[+t.dataset.i].entryEdited = false; render(); }
    });
    $('#legsTable').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const i = +b.dataset.i;
      state.custom = true;
      if (b.dataset.act === 'side') state.legs[i].side *= -1;
      if (b.dataset.act === 'del') { state.legs.splice(i, 1); if (!state.legs.length) state.legs.push(newLeg()); }
      render();
    });
    $('#btnAddLeg').addEventListener('click', () => { state.custom = true; state.legs.push(newLeg()); render(); });

    // Acciones
    $('#learnMode').addEventListener('change', e => { state.learn = e.target.checked; render(); });
    $('#btnReset').addEventListener('click', () => loadStrategy(state.strategyId));
    $('#btnSave').addEventListener('click', () => {
      const tpl = STRATEGIES.find(s => s.id === state.strategyId);
      const name = prompt('Nombre para guardar esta estrategia:', `${tpl.name} ${state.ticker} ${atmStrike()}`);
      if (!name) return;
      const saved = getSaved(); saved.unshift({ name, at: Date.now(), snap: snapshot() });
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved.slice(0, 30)));
      renderSaved(); toast('Estrategia guardada ✓');
    });
    $('#savedList').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const saved = getSaved(); const i = +b.dataset.i;
      if (b.classList.contains('s-del')) { saved.splice(i, 1); localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); renderSaved(); }
      else restore(saved[i].snap);
    });
    $('#btnShare').addEventListener('click', async () => {
      const url = location.origin + location.pathname + '#s=' + encodeState();
      try { await navigator.clipboard.writeText(url); toast('Enlace copiado ✓'); }
      catch { prompt('Copia este enlace:', url); }
      history.replaceState(null, '', '#s=' + encodeState());
    });

    // Tooltips glosario
    const tip = $('#tip');
    document.addEventListener('mouseover', e => {
      const h = e.target.closest('.hint'); if (!h) return;
      tip.textContent = GLOSSARY[h.dataset.tip] || ''; tip.classList.add('show');
      const r = h.getBoundingClientRect();
      tip.style.left = Math.min(r.left, window.innerWidth - 300) + 'px'; tip.style.top = (r.bottom + 8) + 'px';
    });
    document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('.hint')) tip.classList.remove('show'); });
  }

  function newLeg() {
    const leg = { kind: 'call', side: 1, qty: 1, strike: atmStrike(), dte: state.dte, iv: state.iv, entry: 0, entryEdited: false };
    leg.entry = theoEntry(leg); return leg;
  }

  // ---------------- Init ----------------
  function init() {
    chart = new window.PLChart($('#plChart'), $('#chartTooltip'));
    renderStrategyList();
    renderSaved();
    bind();
    const m = location.hash.match(/#s=(.+)/);
    const snap = m && decodeState(m[1]);
    if (snap && snap.legs) restore(snap); else { syncMarketInputs(); loadStrategy(state.strategyId); }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
