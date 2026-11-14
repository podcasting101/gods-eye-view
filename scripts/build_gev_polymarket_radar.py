#!/usr/bin/env python3
"""
build_gev_polymarket_radar.py — God's Eye View Real-Time Polymarket Odds Radar

Fetches live active markets from Polymarket's public Gamma API ordered by 24h volume,
filters out pure sports match markets using Gamma tags, geocodes geopolitical,
macroeconomic, aerospace, and tech risk events to hub coordinates, prefers active
non-settled probability brackets, and atomically writes
`/home/paul/gods-eye-view/public/gev-intel/polymarket-radar.json`.
"""
from __future__ import annotations

import datetime
import json
import math
import os
import re
import urllib.request
from pathlib import Path
from typing import Any

GAMMA_EVENTS_URL = (
    "https://gamma-api.polymarket.com/events"
    "?active=true&closed=false&limit=50&order=volume24hr&ascending=false"
)

EXCLUDED_SPORTS_SLUGS = {
    "sports",
    "soccer",
    "football",
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "ufc",
    "mma",
    "tennis",
    "golf",
    "esports",
    "fifa",
    "fifa-world-cup",
    "premier-league",
    "champions-league",
    "ncaa",
    "cfb",
    "cbb",
    "cricket",
    "formula-1",
}

# Ordered specificity rules: (region_label, category, lat, lon, regex_keywords)
GEO_HUB_RULES: list[tuple[str, str, float, float, re.Pattern[str]]] = [
    ("Kyiv · Ukraine", "geopolitics", 50.45, 30.52, re.compile(r"\b(ukraine|ukrainian|kyiv|kiev|zelenskyy?|crimea|donbas)\b", re.I)),
    ("Moscow · Russia", "geopolitics", 55.75, 37.62, re.compile(r"\b(russia|russian|moscow|putin|kremlin|wagner)\b", re.I)),
    ("Jerusalem / Gaza · Levant", "geopolitics", 31.77, 35.21, re.compile(r"\b(israel|israeli|gaza|hamas|netanyahu|jerusalem|west bank|idf)\b", re.I)),
    ("Beirut · Lebanon", "geopolitics", 33.89, 35.50, re.compile(r"\b(lebanon|lebanese|beirut|hezbollah)\b", re.I)),
    ("Damascus · Syria", "geopolitics", 33.51, 36.29, re.compile(r"\b(syria|syrian|damascus)\b", re.I)),
    ("Tehran / Hormuz · Iran", "geopolitics", 35.69, 51.39, re.compile(r"\b(iran|iranian|tehran|khamenei|hormuz|pezeshkian)\b", re.I)),
    ("Riyadh · Persian Gulf / OPEC", "energy", 24.71, 46.67, re.compile(r"\b(saudi|opec|crude oil|brent|wti|oil price)\b", re.I)),
    ("Taipei · Taiwan Strait", "geopolitics", 25.03, 121.56, re.compile(r"\b(taiwan|taiwanese|taipei)\b", re.I)),
    ("Beijing · China", "geopolitics", 39.90, 116.40, re.compile(r"\b(china|beijing|xi jinping|pla|chinese|tik\s?tok)\b", re.I)),
    ("Seoul / Korean Peninsula", "geopolitics", 37.57, 126.98, re.compile(r"\b(korea|korean|seoul|pyongyang|kim jong)\b", re.I)),
    ("Caracas · Venezuela", "geopolitics", 10.48, -66.90, re.compile(r"\b(venezuela|venezuelan|caracas|maduro)\b", re.I)),
    ("Panama Canal", "trade", 9.08, -79.68, re.compile(r"\b(panama)\b", re.I)),
    ("Nuuk · Greenland", "geopolitics", 64.18, -51.72, re.compile(r"\b(greenland|arctic)\b", re.I)),
    ("Starbase · TX Aerospace", "space", 25.997, -97.158, re.compile(r"\b(spacex|starship|falcon|starlink|nasa|artemis)\b", re.I)),
    ("Silicon Valley · AI & Tech", "tech", 37.77, -122.42, re.compile(r"\b(openai|anthropic|claude|gemini|google|nvidia|apple|tesla|gpt-?\d|agi|meta|deepmind|grok|xai)\b", re.I)),
    ("Brussels · EU / NATO", "geopolitics", 50.85, 4.35, re.compile(r"\b(eu|european union|nato|brussels|ecb|eurozone)\b", re.I)),
    ("London · UK", "politics", 51.51, -0.13, re.compile(r"\b(uk|united kingdom|britain|british|london|starmer|bank of england)\b", re.I)),
    ("Paris · France", "politics", 48.86, 2.35, re.compile(r"\b(france|french|paris|macron)\b", re.I)),
    ("Berlin · Germany", "politics", 52.52, 13.40, re.compile(r"\b(germany|german|berlin|merz|scholz)\b", re.I)),
    ("Tokyo · Japan", "macro", 35.68, 139.76, re.compile(r"\b(japan|japanese|tokyo|boj|bank of japan|yen)\b", re.I)),
    ("New Delhi · India", "politics", 28.61, 77.21, re.compile(r"\b(india|indian|modi|delhi)\b", re.I)),
    ("Ottawa · Canada", "politics", 45.42, -75.70, re.compile(r"\b(canada|canadian|ottawa|carney|trudeau)\b", re.I)),
    ("Mexico City · Mexico", "politics", 19.43, -99.13, re.compile(r"\b(mexico|mexican|sheinbaum|peso)\b", re.I)),
    ("Brasilia · Brazil", "politics", -15.79, -47.88, re.compile(r"\b(brazil|brazilian|lula|bolsonaro)\b", re.I)),
    ("New York · Wall Street", "markets", 40.71, -74.01, re.compile(r"\b(s&p|sp500|nasdaq|dow jones|wall street|nyse|ipo|mamdani|nyc)\b", re.I)),
    ("Washington DC · US Policy", "politics", 38.90, -77.04, re.compile(r"\b(trump|biden|vance|fed|fomc|federal reserve|interest rate|rate cut|tariff|congress|senate|house|supreme court|shutdown|recession|cpi|inflation|gdp|united states|presidential election|president|governor|cabinet)\b", re.I)),
    ("Zurich · Crypto Macro", "crypto", 47.37, 8.54, re.compile(r"\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|etf)\b", re.I)),
]


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    try:
        with tmp.open("w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def fetch_events(url: str = GAMMA_EVENTS_URL, timeout: float = 20.0) -> list[dict[str, Any]]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 GodsEyeView-PolymarketRadar/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8", errors="replace"))
        return data if isinstance(data, list) else []


def is_sports_event(event: dict[str, Any]) -> bool:
    tags = event.get("tags") or []
    for t in tags:
        slug = str(t.get("slug") or "").lower()
        label = str(t.get("label") or "").lower()
        if slug in EXCLUDED_SPORTS_SLUGS or label in EXCLUDED_SPORTS_SLUGS:
            return True
    return False


def geocode_event(title: str, slug: str, hub_counts: dict[str, int]) -> tuple[str, str, float, float] | None:
    text = f"{title} {slug.replace('-', ' ')}"
    for region, category, lat, lon, pattern in GEO_HUB_RULES:
        if pattern.search(text):
            count = hub_counts.get(region, 0)
            hub_counts[region] = count + 1
            if count == 0:
                return region, category, lat, lon
            angle = count * 2.399963229728653
            radius_deg = 0.65 * math.sqrt(count)
            j_lat = round(lat + radius_deg * math.sin(angle), 4)
            j_lon = round(lon + (radius_deg * math.cos(angle)) / max(0.35, math.cos(math.radians(lat))), 4)
            return region, category, j_lat, j_lon
    return None


def extract_primary_market_odds(event: dict[str, Any]) -> tuple[float, float, str, str]:
    markets = event.get("markets") or []
    if not markets:
        return 0.0, 1.0, "Yes", str(event.get("title") or "")

    candidates: list[tuple[float, float, str, str, bool, float]] = []
    for m in markets:
        try:
            outcomes = json.loads(m.get("outcomes") or "[]")
            prices = [float(p) for p in json.loads(m.get("outcomePrices") or "[]")]
        except Exception:
            continue
        if not outcomes or not prices:
            continue
        yes_p = prices[0]
        no_p = prices[1] if len(prices) > 1 else max(0.0, 1.0 - yes_p)
        q_label = str(m.get("groupItemTitle") or m.get("question") or "").strip()
        is_closed = bool(m.get("closed")) or not bool(m.get("active", True))
        vol = float(m.get("volume24hr") or m.get("volume") or 0.0)
        is_placeholder = bool(re.match(r"^(Candidate|Person|Option)\s+[A-Z0-9]+$", q_label, re.I))
        top_out = f"{q_label}: {outcomes[0]}" if (len(markets) > 1 and q_label) else str(outcomes[0])
        candidates.append((yes_p, no_p, top_out, q_label, is_closed or is_placeholder, vol))

    if not candidates:
        return 0.0, 1.0, "Yes", str(event.get("title") or "")

    # Prefer open, non-placeholder, actively contested markets (2%..98%)
    contested = [c for c in candidates if (not c[4]) and (0.02 <= c[0] <= 0.98)]
    if contested:
        contested.sort(key=lambda c: (c[0], c[5]), reverse=True)
        chosen = contested[0]
    else:
        open_real = [c for c in candidates if not c[4]] or candidates
        open_real.sort(key=lambda c: (c[0], c[5]), reverse=True)
        chosen = open_real[0]

    return round(chosen[0], 4), round(chosen[1], 4), chosen[2][:72], (chosen[3] or str(event.get("title") or ""))[:120]


def build_polymarket_radar(out_json_path: Path) -> dict[str, Any]:
    events = fetch_events()
    hub_counts: dict[str, int] = {}
    markers: list[dict[str, Any]] = []
    total_vol24 = 0.0

    for ev in events:
        if is_sports_event(ev):
            continue
        title = str(ev.get("title") or "").strip()
        slug = str(ev.get("slug") or "").strip()
        vol24 = float(ev.get("volume24hr") or 0.0)
        liq = float(ev.get("liquidity") or 0.0)
        total_vol24 += vol24
        geo = geocode_event(title, slug, hub_counts)
        if not geo:
            continue
        region, category, lat, lon = geo
        yes_p, no_p, top_outcome, question = extract_primary_market_odds(ev)
        markers.append(
            {
                "id": f"poly-{ev.get('id') or slug}",
                "title": title,
                "slug": slug,
                "url": f"https://polymarket.com/event/{slug}" if slug else "https://polymarket.com",
                "lat": lat,
                "lon": lon,
                "region": region,
                "category": category,
                "yesPrice": yes_p,
                "noPrice": no_p,
                "topOutcome": top_outcome,
                "question": question,
                "volume24hr": round(vol24, 2),
                "liquidity": round(liq, 2),
                "endDate": ev.get("endDate"),
            }
        )

    payload = {
        "schema": "gev-polymarket-radar-v1",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": GAMMA_EVENTS_URL,
        "events_scanned": len(events),
        "total_volume_24hr_usd": round(total_vol24, 2),
        "marker_count": len(markers),
        "markers": markers,
    }
    atomic_write_text(out_json_path, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return payload


if __name__ == "__main__":
    out_file = Path("/home/paul/gods-eye-view/public/gev-intel/polymarket-radar.json")
    result = build_polymarket_radar(out_file)
    print(
        f"POLYMARKET_RADAR_OK: {out_file} scanned={result['events_scanned']} "
        f"markers={result['marker_count']} vol24=${result['total_volume_24hr_usd']:,.0f}"
    )
