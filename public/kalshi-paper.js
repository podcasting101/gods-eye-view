// CSP-clean Kalshi & TradingView Lightweight-Charts Paper Arena (synced with /api/pfl/kalshi)
(function () {
  const tvEl = document.getElementById('tv_advanced_chart');
  const probEl = document.getElementById('kalshi_prob_chart');

  let mainChart = null;
  let candleSeries = null;
  let probChart = null;
  let probSeries = null;

  if (window.LightweightCharts && tvEl) {
    mainChart = LightweightCharts.createChart(tvEl, {
      width: tvEl.clientWidth || 720,
      height: 410,
      layout: { background: { color: '#070b12' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#131d2e' }, horzLines: { color: '#131d2e' } },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true },
    });
    candleSeries = mainChart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
  }

  if (window.LightweightCharts && probEl) {
    probChart = LightweightCharts.createChart(probEl, {
      width: probEl.clientWidth || 500,
      height: 215,
      layout: { background: { color: '#070b12' }, textColor: '#94a3b8' },
      grid: { vertLines: { color: '#131d2e' }, horzLines: { color: '#131d2e' } },
      timeScale: { timeVisible: true },
    });
    probSeries = probChart.addAreaSeries({
      lineColor: '#38bdf8', topColor: 'rgba(56,189,248,0.35)', bottomColor: 'rgba(56,189,248,0.02)', lineWidth: 2,
    });
  }

  function loadSymbolSeries(sym) {
    if (!candleSeries) return;
    const base = sym.includes('BTC') ? 63900 : sym.includes('SPX') || sym.includes('SPY') ? 7315 : 73.5;
    const step = sym.includes('BTC') ? 85 : sym.includes('SPX') || sym.includes('SPY') ? 6 : 0.6;
    const now = Math.floor(Date.now() / 1000);
    let p = base;
    const bars = [];
    for (let i = 80; i >= 0; i--) {
      const o = p;
      const c = Number((o + (Math.sin(i * 0.35) + (Math.random() - 0.48)) * step).toFixed(2));
      const h = Number((Math.max(o, c) + Math.random() * step * 0.7).toFixed(2));
      const l = Number((Math.min(o, c) - Math.random() * step * 0.7).toFixed(2));
      bars.push({ time: now - i * 900, open: o, high: h, low: l, close: c });
      p = c;
    }
    candleSeries.setData(bars);
    mainChart.timeScale().fitContent();
  }

  function renderProbSeries(baseCents, label, ticker) {
    const pt = document.getElementById('prob-title');
    const pk = document.getElementById('prob-ticker');
    if (pt) pt.textContent = label + ' — Kalshi Implied Probability (¢)';
    if (pk) pk.textContent = ticker;
    if (!probSeries) return;
    const now = Math.floor(Date.now() / 1000);
    const pts = [];
    let v = Math.max(4, Math.min(96, baseCents - 6));
    for (let i = 48; i >= 0; i--) {
      v = Math.max(1, Math.min(99, v + (Math.random() - 0.47) * 2.5));
      pts.push({ time: now - i * 900, value: Number(v.toFixed(1)) });
    }
    pts[pts.length - 1].value = baseCents;
    probSeries.setData(pts);
    probChart.timeScale().fitContent();
  }

  async function syncServerArena() {
    try {
      const res = await fetch('/api/pfl/kalshi');
      const d = await res.json();
      if (!d.ok) return;
      const lbBody = document.getElementById('leaderboard-body');
      if (lbBody) {
        lbBody.innerHTML = (d.leaderboard || []).map((r) => `
          <tr>
            <td><strong>${r.name}</strong></td>
            <td>$${r.cash.toFixed(2)}</td>
            <td>${r.count} ($${r.posVal.toFixed(2)})</td>
            <td><strong>$${r.equity.toFixed(2)}</strong></td>
            <td class="${r.pnl >= 0 ? 'pos-yes' : 'pos-no'}">${r.pnl >= 0 ? '+' : ''}$${r.pnl.toFixed(2)}</td>
          </tr>
        `).join('');
      }
      const ledBody = document.getElementById('ledger-body');
      if (ledBody) {
        ledBody.innerHTML = (d.trades || []).map((t) => `
          <tr class="market-row" data-tkr="${t.ticker}" data-mark="${t.markCents}" data-title="${t.title || t.ticker}">
            <td>${(t.placedAt || '').slice(11, 16) || '14:28'}</td>
            <td>${t.owner}</td>
            <td><strong>${t.ticker}</strong></td>
            <td class="${t.side === 'YES' ? 'pos-yes' : 'pos-no'}">${t.side}×${t.qty}</td>
            <td>${t.entryCents}¢ → <strong>${t.markCents}¢</strong></td>
            <td style="color:#94a3b8;">${t.thesis}</td>
          </tr>
        `).join('');
        ledBody.querySelectorAll('.market-row').forEach((tr) => {
          tr.addEventListener('click', () => renderProbSeries(Number(tr.dataset.mark) || 50, tr.dataset.title, tr.dataset.tkr));
        });
      }
      const mkBody = document.getElementById('markets-body');
      if (mkBody) {
        mkBody.innerHTML = (d.markets || []).map((m) => `
          <tr class="market-row" data-tkr="${m.ticker}" data-ask="${m.yesAsk || m.mid}" data-title="${m.eventTitle} (${m.bracket})">
            <td><strong>${m.ticker}</strong></td>
            <td>${m.eventTitle} — <strong>${m.bracket}</strong></td>
            <td>${m.yesBid}¢ / ${m.yesAsk}¢</td>
            <td><span class="badge">${m.mid}%</span></td>
            <td style="color:#38bdf8;">${m.category}</td>
          </tr>
        `).join('');
        mkBody.querySelectorAll('.market-row').forEach((tr) => {
          tr.addEventListener('click', () => {
            const ti = document.getElementById('pos-ticker');
            const pi = document.getElementById('pos-price');
            if (ti) ti.value = tr.dataset.tkr || '';
            if (pi) pi.value = tr.dataset.ask || '50';
            renderProbSeries(Number(tr.dataset.ask) || 50, tr.dataset.title, tr.dataset.tkr);
          });
        });
      }
    } catch (e) {
      console.error('Kalshi sync failed', e);
    }
  }

  // Wire symbol buttons & Log Position button without inline onclick
  document.querySelectorAll('button').forEach((btn) => {
    const t = btn.textContent.trim();
    if (t.includes('BTC')) btn.addEventListener('click', () => loadSymbolSeries('BTC'));
    else if (t.includes('S&P') || t.includes('SPX') || t.includes('SPY')) btn.addEventListener('click', () => loadSymbolSeries('SPX'));
    else if (t.includes('HOU') || t.includes('Weather') || t.includes('QQQ') || t.includes('NVDA')) btn.addEventListener('click', () => loadSymbolSeries(t));
    else if (t.includes('Log') || t.includes('Place') || t.includes('Submit')) {
      btn.addEventListener('click', async () => {
        const owner = document.getElementById('agent-select')?.value || 'Paul Prime';
        const ticker = document.getElementById('pos-ticker')?.value?.trim() || 'KXHIGHTHOU-26NOV18-B73.5';
        const side = document.getElementById('pos-side')?.value || 'YES';
        const qty = Number(document.getElementById('pos-qty')?.value) || 20;
        const entryCents = Number(document.getElementById('pos-price')?.value) || 53;
        await fetch('/api/pfl/kalshi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner, ticker, side, qty, entryCents, thesis: 'Logged in Full Paper Arena' }),
        });
        syncServerArena();
      });
    }
  });

  loadSymbolSeries('BTC');
  renderProbSeries(53, 'Houston Daily High Nov 18 (73° to 74°F)', 'KXHIGHTHOU-26NOV18-B73.5');
  syncServerArena();
  window.addEventListener('resize', () => {
    if (mainChart && tvEl) mainChart.applyOptions({ width: tvEl.clientWidth });
    if (probChart && probEl) probChart.applyOptions({ width: probEl.clientWidth });
  });
})();
