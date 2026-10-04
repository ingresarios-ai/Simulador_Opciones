/* =====================================================================
   INGRESARIOS · OptionLab — Gráfico P/L (canvas, sin dependencias)
   Dibuja: payoff al vencimiento, curva T+0, curva T+n, zonas de ganancia/
   pérdida, strikes, spot, breakevens y tooltip al pasar el mouse.
   ===================================================================== */
(function (global) {
  'use strict';

  const COLORS = {
    grid: 'rgba(0,210,255,0.08)',
    axis: 'rgba(0,210,255,0.35)',
    text: '#8FA3B8',
    textStrong: '#E6EEF5',
    profit: '#00FF94',
    loss: '#FF4D6D',
    expiry: '#E6EEF5',
    t0: '#00D2FF',
    tn: '#FFB020',
    spot: '#00D2FF',
    strike: 'rgba(230,238,245,0.25)',
    be: '#00FF94'
  };

  const fmtMoney = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-US', { maximumFractionDigits: 0 });
  const fmtPrice = v => '$' + v.toLocaleString('es-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  class PLChart {
    constructor(canvas, tooltipEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tooltip = tooltipEl;
      this.data = null;
      this.hoverX = null;
      this.pad = { l: 64, r: 20, t: 20, b: 40 };
      canvas.addEventListener('mousemove', e => this._onMove(e));
      canvas.addEventListener('mouseleave', () => { this.hoverX = null; this.tooltip.style.opacity = 0; this.draw(); });
      canvas.addEventListener('touchmove', e => { this._onMove(e.touches[0]); e.preventDefault(); }, { passive: false });
      new ResizeObserver(() => this.draw()).observe(canvas.parentElement);
    }

    /**
     * data = { lo, hi, spot, series: [{label, color, dash, points:[{x,y}]}],
     *          strikes:[...], breakevens:[...], currentPL:number }
     */
    setData(data) { this.data = data; this.draw(); }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.parentElement.clientWidth;
      const h = this.canvas.parentElement.clientHeight;
      if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
        this.canvas.width = w * dpr; this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w; this.h = h;
    }

    _scales() {
      const d = this.data, p = this.pad;
      let yMin = Infinity, yMax = -Infinity;
      for (const s of d.series) for (const pt of s.points) { if (pt.y < yMin) yMin = pt.y; if (pt.y > yMax) yMax = pt.y; }
      if (!isFinite(yMin)) { yMin = -100; yMax = 100; }
      const span = Math.max(yMax - yMin, 1);
      yMin -= span * 0.12; yMax += span * 0.12;
      if (yMin > 0) yMin = -span * 0.1;
      if (yMax < 0) yMax = span * 0.1;
      const xs = x => p.l + (x - d.lo) / (d.hi - d.lo) * (this.w - p.l - p.r);
      const ys = y => p.t + (yMax - y) / (yMax - yMin) * (this.h - p.t - p.b);
      const xInv = px => d.lo + (px - p.l) / (this.w - p.l - p.r) * (d.hi - d.lo);
      return { xs, ys, xInv, yMin, yMax };
    }

    _niceStep(range, target) {
      const raw = range / target;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / mag;
      const step = norm < 1.5 ? 1 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10;
      return step * mag;
    }

    draw() {
      this._resize();
      const ctx = this.ctx, d = this.data;
      ctx.clearRect(0, 0, this.w, this.h);
      if (!d) return;
      const { xs, ys, xInv, yMin, yMax } = this._scales();
      const p = this.pad;
      const plotW = this.w - p.l - p.r, plotH = this.h - p.t - p.b;

      // --- Grid ---
      ctx.font = '11px "DM Mono", monospace';
      ctx.fillStyle = COLORS.text; ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
      const xStep = this._niceStep(d.hi - d.lo, 8);
      for (let x = Math.ceil(d.lo / xStep) * xStep; x <= d.hi; x += xStep) {
        ctx.beginPath(); ctx.moveTo(xs(x), p.t); ctx.lineTo(xs(x), p.t + plotH); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillText(x.toLocaleString('es-US', { maximumFractionDigits: 2 }), xs(x), this.h - p.b + 16);
      }
      const yStep = this._niceStep(yMax - yMin, 6);
      for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
        ctx.beginPath(); ctx.moveTo(p.l, ys(y)); ctx.lineTo(p.l + plotW, ys(y)); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText(fmtMoney(y), p.l - 8, ys(y) + 4);
      }

      // --- Zonas ganancia/pérdida bajo la curva de vencimiento ---
      const exp = d.series.find(s => s.key === 'expiry');
      if (exp) {
        const zero = ys(0);
        ctx.save();
        ctx.beginPath(); ctx.rect(p.l, p.t, plotW, plotH); ctx.clip();
        // ganancia
        let g = ctx.createLinearGradient(0, p.t, 0, zero);
        g.addColorStop(0, 'rgba(0,255,148,0.28)'); g.addColorStop(1, 'rgba(0,255,148,0.02)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(xs(exp.points[0].x), zero);
        for (const pt of exp.points) ctx.lineTo(xs(pt.x), ys(Math.max(pt.y, 0)));
        ctx.lineTo(xs(exp.points[exp.points.length - 1].x), zero); ctx.closePath(); ctx.fill();
        // pérdida
        g = ctx.createLinearGradient(0, zero, 0, p.t + plotH);
        g.addColorStop(0, 'rgba(255,77,109,0.02)'); g.addColorStop(1, 'rgba(255,77,109,0.30)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(xs(exp.points[0].x), zero);
        for (const pt of exp.points) ctx.lineTo(xs(pt.x), ys(Math.min(pt.y, 0)));
        ctx.lineTo(xs(exp.points[exp.points.length - 1].x), zero); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // --- Línea cero ---
      ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.l, ys(0)); ctx.lineTo(p.l + plotW, ys(0)); ctx.stroke();

      // --- Strikes ---
      ctx.setLineDash([3, 5]); ctx.strokeStyle = COLORS.strike;
      for (const k of d.strikes || []) {
        if (k < d.lo || k > d.hi) continue;
        ctx.beginPath(); ctx.moveTo(xs(k), p.t); ctx.lineTo(xs(k), p.t + plotH); ctx.stroke();
        ctx.fillStyle = COLORS.text; ctx.textAlign = 'center'; ctx.fillText('K ' + k, xs(k), p.t + 10);
      }
      ctx.setLineDash([]);

      // --- Series ---
      for (const s of d.series) {
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        s.points.forEach((pt, i) => { const X = xs(pt.x), Y = ys(pt.y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // --- Spot ---
      ctx.strokeStyle = COLORS.spot; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(xs(d.spot), p.t); ctx.lineTo(xs(d.spot), p.t + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.spot; ctx.textAlign = 'center'; ctx.font = 'bold 11px "DM Mono", monospace';
      ctx.fillText('SPOT ' + fmtPrice(d.spot), xs(d.spot), this.h - p.b + 30);

      // --- Breakevens ---
      ctx.fillStyle = COLORS.be;
      for (const be of d.breakevens || []) {
        ctx.beginPath(); ctx.arc(xs(be), ys(0), 5, 0, Math.PI * 2); ctx.fill();
        ctx.font = '10px "DM Mono", monospace'; ctx.textAlign = 'center';
        ctx.fillText('BE ' + be.toFixed(2), xs(be), ys(0) - 10);
      }

      // --- Hover ---
      if (this.hoverX !== null) {
        const price = Math.min(Math.max(xInv(this.hoverX), d.lo), d.hi);
        ctx.strokeStyle = 'rgba(230,238,245,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xs(price), p.t); ctx.lineTo(xs(price), p.t + plotH); ctx.stroke();
        let html = `<div class="tt-price">${fmtPrice(price)} <span>(${((price / d.spot - 1) * 100).toFixed(1)}%)</span></div>`;
        for (const s of d.series) {
          const y = interp(s.points, price);
          ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(xs(price), ys(y), 4, 0, Math.PI * 2); ctx.fill();
          html += `<div class="tt-row"><i style="background:${s.color}"></i>${s.label}<b class="${y >= 0 ? 'pos' : 'neg'}">${fmtMoney(y)}</b></div>`;
        }
        this.tooltip.innerHTML = html;
        const rect = this.canvas.getBoundingClientRect();
        const left = xs(price) + 14 + this.tooltip.offsetWidth > this.w ? xs(price) - this.tooltip.offsetWidth - 14 : xs(price) + 14;
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = (p.t + 8) + 'px';
        this.tooltip.style.opacity = 1;
      }
    }

    _onMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverX = e.clientX - rect.left;
      this.draw();
    }
  }

  function interp(points, x) {
    if (x <= points[0].x) return points[0].y;
    for (let i = 1; i < points.length; i++) {
      if (x <= points[i].x) {
        const a = points[i - 1], b = points[i];
        return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
      }
    }
    return points[points.length - 1].y;
  }

  global.PLChart = PLChart;
  global.ChartColors = COLORS;
})(typeof window !== 'undefined' ? window : globalThis);
