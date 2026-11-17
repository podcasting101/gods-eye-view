import fs from 'node:fs';
import path from 'node:path';
import {
  HUD_SUMMARY_INSTRUCTIONS,
  keylessHudSummaryResponse,
} from '../../../src/hudSummaryResponse.js';
import { enforceRateLimit, openAiRateLimiter } from './rate-limit.js';
import { readRequestBody } from '../common/request.js';
import { OPENAI_HUD_SUMMARY_MODEL_DEFAULT } from './constants.js';

function extractOpenAiResponseText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (!Array.isArray(data?.output)) return '';
  return data.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((part) => part?.text || part?.output_text || '')
    .join(' ')
    .trim();
}

function toFiveWordHudSummary(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}


const _hudSummaryCachePath = path.join(process.cwd(), '.gev-cache', 'hud-summary-cache.json');
let _hudSummaryDiskCache = null;
let _openAi429Until = 0;

function loadHudCache() {
  if (_hudSummaryDiskCache) return _hudSummaryDiskCache;
  try {
    _hudSummaryDiskCache = JSON.parse(fs.readFileSync(_hudSummaryCachePath, 'utf8'));
  } catch {
    _hudSummaryDiskCache = {};
  }
  return _hudSummaryDiskCache;
}

function saveHudCache() {
  try {
    fs.mkdirSync(path.dirname(_hudSummaryCachePath), { recursive: true });
    fs.writeFileSync(_hudSummaryCachePath, JSON.stringify(_hudSummaryDiskCache || {}));
  } catch {}
}

function hudCacheKey(ctx) {
  const lat = Number(ctx?.lat ?? ctx?.latitude ?? 0).toFixed(2);
  const lon = Number(ctx?.lon ?? ctx?.longitude ?? 0).toFixed(2);
  const locality = String(ctx?.locality || ctx?.place || '').slice(0, 40);
  return `${lat},${lon}:${locality}`;
}

async function handleHudSummary(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const keyless = keylessHudSummaryResponse(apiKey);
  if (keyless) {
    res.statusCode = keyless.statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(keyless.payload));
    return;
  }

  // Per-IP throttle (GEV_RATELIMIT_OPENAI_PER_MIN). On by default; 0 disables.
  // Keyless HUD fallback has no provider cost and resolves above without
  // consuming a paid-endpoint quota slot.
  if (!enforceRateLimit(openAiRateLimiter(), req, res)) return;

  try {
    const body = await readRequestBody(req, 64 * 1024);
    const context = JSON.parse(body || '{}');
    const cKey = hudCacheKey(context);
    const cache = loadHudCache();
    if (cache[cKey] && Date.now() - cache[cKey].at < 24 * 3600 * 1000) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ summary: cache[cKey].summary, error: null, cached: true }));
      return;
    }
    if (Date.now() < _openAi429Until) {
      const fallback = keylessHudSummaryResponse('');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ summary: cache[cKey]?.summary || fallback?.payload?.summary || null, error: null, cooldown: true }));
      return;
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          process.env.OPENAI_HUD_SUMMARY_MODEL ||
          OPENAI_HUD_SUMMARY_MODEL_DEFAULT,
        instructions: HUD_SUMMARY_INSTRUCTIONS,
        input: JSON.stringify(context),
        reasoning: { effort: 'minimal' },
        max_output_tokens: 100,
      }),
    });
    const data = await response.json().catch(() => ({}));
    const summary = toFiveWordHudSummary(extractOpenAiResponseText(data));
    res.statusCode = response.ok && summary ? 200 : response.status || 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (response.status === 429) {
      _openAi429Until = Date.now() + 30 * 60 * 1000;
    }
    if (response.ok && summary) {
      cache[cKey] = { summary, at: Date.now() };
      saveHudCache();
    } else if (!response.ok) {
      console.warn(`[hud-summary] upstream HTTP ${response.status}`);
    }
    res.end(
      JSON.stringify({
        summary: summary || null,
        // Never relay `data.error.message`: that is OpenAI's own wording, and
        // it carries request ids, organization hints and quota phrasing.
        error: response.ok ? null : 'OpenAI HUD summary request failed',
      }),
    );
  } catch {
    console.warn('[hud-summary] request failed');
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'OpenAI HUD summary request failed',
      }),
    );
  }
}

export { handleHudSummary };
