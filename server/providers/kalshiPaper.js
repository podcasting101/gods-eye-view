import fs from 'node:fs';
import path from 'node:path';

const LEDGER_PATH = path.resolve(process.cwd(), '.cache', 'pfl-kalshi-paper-ledger.json');

const SEED_TRADES = [
  {
    id: 'seed-friday-hou-temp',
    placedAt: '2026-11-17T14:28:00-06:00',
    owner: '@friday (Weather/Macro)',
    ticker: 'KXHIGHTHOU-26NOV18-B73.5',
    title: 'Houston Daily High Nov 18: 73° to 74°F',
    side: 'YES',
    qty: 20,
    entryCents: 53,
    thesis: 'ECMWF + Gulf Radar warm sector over Brazoria/Hobby before Thu trough',
  },
  {
    id: 'seed-harry-spx',
    placedAt: '2026-11-17T14:28:05-06:00',
    owner: '@harry (CTO)',
    ticker: 'KXINXU-26NOV17H1600-T7314.9999',
    title: 'S&P 500 >= 7,315 at 4pm EST Today',
    side: 'YES',
    qty: 20,
    entryCents: 56,
    thesis: 'Schwab /ES 15m momentum + AI capex strength',
  },
  {
    id: 'seed-zelenka-tsa',
    placedAt: '2026-11-17T14:28:10-06:00',
    owner: '@zelenka (ADS-B/AIS)',
    ticker: 'KXTSAW-26NOV22-A2.40',
    title: 'TSA Avg Check-ins > 2.40M (Nov 16-22)',
    side: 'NO',
    qty: 25,
    entryCents: 34,
    thesis: 'ADS-B live aircraft lag + post-FAA outage schedule trimming',
  },
  {
    id: 'seed-mckay-btc',
    placedAt: '2026-11-17T14:28:15-06:00',
    owner: '@mckay (Contrarian)',
    ticker: 'KXBTC-26NOV1717-B63875',
    title: 'BTC Range 5pm EST: $63,750 to $63,999.99',
    side: 'YES',
    qty: 30,
    entryCents: 24,
    thesis: 'Mean-reversion pin on 15m Bollinger mid-band',
  },
  {
    id: 'seed-lisa-hou-today',
    placedAt: '2026-11-17T14:28:20-06:00',
    owner: '@lisa (Chief of Staff)',
    ticker: 'KXHIGHTHOU-26NOV17-B70.5',
    title: 'Houston Daily High Today (Nov 17): 70° to 71°F',
    side: 'YES',
    qty: 10,
    entryCents: 89,
    thesis: 'Afternoon Hobby METAR lock in 70-71F bracket',
  },
];

function ensureLedger() {
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    if (!fs.existsSync(LEDGER_PATH)) {
      fs.writeFileSync(LEDGER_PATH, JSON.stringify({ trades: SEED_TRADES }, null, 2));
    }
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch {
    return { trades: [...SEED_TRADES] };
  }
}

function saveLedger(data) {
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

let _marketCache = { at: 0, payload: null };

async function fetchLiveKalshiSummary() {
  const now = Date.now();
  if (_marketCache.payload && now - _marketCache.at < 15000) {
    return _marketCache.payload;
  }
  const seriesList = ['KXHIGHTHOU', 'KXLOWTHOU', 'KXHIGHAUS', 'KXINXU', 'KXBTC', 'KXTSAW'];
  const markets = [];
  const quotesByTicker = {};

  await Promise.all(
    seriesList.map(async (ser) => {
      try {
        const url = 'https://api.elections.kalshi.com/trade-api/v2/events?status=open&series_ticker=' + ser + '&with_nested_markets=true';
        const r = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'PFL-GodsEyeView/1.0' },
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return;
        const d = await r.json();
        for (const ev of (d.events || []).slice(0, 2)) {
          for (const m of ev.markets || []) {
            const yesBid = Math.round(Number(m.yes_bid_dollars || 0) * 100);
            const yesAsk = Math.round(Number(m.yes_ask_dollars || 0) * 100);
            const lastCents = Math.round(Number(m.last_price_dollars || 0) * 100);
            const mid = yesBid && yesAsk ? Math.round((yesBid + yesAsk) / 2) : lastCents || yesAsk || yesBid;
            quotesByTicker[m.ticker] = { yesBid, yesAsk, lastCents, mid };
            if (yesAsk >= 4 && yesAsk <= 95) {
              markets.push({
                ticker: m.ticker,
                series: ser,
                category: ev.category || ser,
                eventTitle: ev.title,
                bracket: m.yes_sub_title || m.subtitle || '',
                yesBid,
                yesAsk,
                lastCents,
                mid,
              });
            }
          }
        }
      } catch {}
    }),
  );

  const picked = [];
  const bySeries = {};
  for (const m of markets) {
    bySeries[m.series] = bySeries[m.series] || [];
    if (bySeries[m.series].length < 3) {
      bySeries[m.series].push(m);
      picked.push(m);
    }
  }

  const payload = { fetchedAt: new Date().toISOString(), markets: picked, quotesByTicker };
  _marketCache = { at: now, payload };
  return payload;
}

export function kalshiPaperProxy() {
  const install = (server) => {
    server.middlewares.use('/api/pfl/kalshi', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.method === 'POST') {
          let body = '';
          for await (const chunk of req) body += chunk;
          const incoming = JSON.parse(body || '{}');
          const ledger = ensureLedger();
          const trade = {
            id: 't-' + Date.now(),
            placedAt: new Date().toISOString(),
            owner: String(incoming.owner || 'Paul Prime'),
            ticker: String(incoming.ticker || 'CUSTOM').toUpperCase(),
            title: String(incoming.title || incoming.ticker || 'Paper Position'),
            side: incoming.side === 'NO' ? 'NO' : 'YES',
            qty: Math.max(1, Math.min(500, Number(incoming.qty) || 10)),
            entryCents: Math.max(1, Math.min(99, Number(incoming.entryCents) || 50)),
            thesis: String(incoming.thesis || 'Operator paper trade'),
          };
          ledger.trades.unshift(trade);
          saveLedger(ledger);
        }

        const ledger = ensureLedger();
        const live = await fetchLiveKalshiSummary();
        const seats = [
          'Paul Prime',
          '@friday (Weather/Macro)',
          '@harry (CTO)',
          '@zelenka (ADS-B/AIS)',
          '@mckay (Contrarian)',
          '@lisa (Chief of Staff)',
        ];
        const stats = {};
        for (const s of seats) stats[s] = { name: s, cash: 100.0, posVal: 0.0, count: 0 };

        const enrichedTrades = ledger.trades.map((t) => {
          const q = live.quotesByTicker[t.ticker];
          let markCents = t.entryCents;
          if (q && q.mid > 0) {
            markCents = t.side === 'YES' ? q.mid : 100 - q.mid;
          }
          if (!stats[t.owner]) stats[t.owner] = { name: t.owner, cash: 100.0, posVal: 0.0, count: 0 };
          stats[t.owner].cash -= (t.qty * t.entryCents) / 100.0;
          stats[t.owner].posVal += (t.qty * markCents) / 100.0;
          stats[t.owner].count += 1;
          return { ...t, markCents, liveQuote: q || null };
        });

        const leaderboard = Object.values(stats)
          .map((s) => ({
            ...s,
            equity: Number((s.cash + s.posVal).toFixed(2)),
            pnl: Number((s.cash + s.posVal - 100.0).toFixed(2)),
          }))
          .sort((a, b) => b.equity - a.equity);

        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            fetchedAt: live.fetchedAt,
            leaderboard,
            trades: enrichedTrades,
            markets: live.markets,
          }),
        );
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    });
  };
  return {
    name: 'pfl-kalshi-paper-proxy',
    configureServer: install,
    configurePreviewServer: install,
  };
}
