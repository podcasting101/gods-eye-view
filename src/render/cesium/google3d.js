// Paul Prime quota guard: boot on keyless Esri/Cesium globe by default so
// startup never burns Google Photorealistic 3D Tiles API quota automatically.
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../../renderGovernor.js';

export const PHOTOREAL_AT_STARTUP = false;
export const PHOTOREAL_TIMEOUT_MS = 20000;
const GOOGLE_STREAM_HOLD_ID = 'google3d-tiles-stream';
const GOOGLE_STREAM_TIMEOUT_MS = 18000;
const GOOGLE_STREAM_SETTLE_DEBOUNCE_MS = 450;

/**
 * @module render/cesium/google3d
 * @description Google Photorealistic 3D Tiles for the Cesium renderer, by
 * the routes `selectMapStartupRoute` (`src/maps/startupRoute.js`) names.
 */
export { selectMapStartupRoute } from '../../maps/startupRoute.js';

const clean = (value) => String(value || '').trim();

/**
 * Load Google Photorealistic 3D Tiles through direct Google access when
 * configured, otherwise through Cesium ion's hosted Google asset. Direct
 * access uses a browser key, or else short-lived tokens from the app's
 * server (see googleTokens.js). If direct access fails and an ion token is
 * available, ion is the recovery path.
 *
 * @param {object} Cesium
 * @param {{googleApiKey?: string, cesiumToken?: string, googleTokens?: {token: Function}|null, enabled?: boolean, timeoutMs?: number}} credentials
 * @returns {Promise<{tileset: object|null, route: 'google-direct'|'google-token'|'google-ion'|'osm', errors: Error[]}>}
 */
export async function loadPhotorealisticTileset(
  Cesium,
  {
    googleApiKey = '',
    cesiumToken = '',
    googleTokens = null,
    enabled = true,
    timeoutMs = PHOTOREAL_TIMEOUT_MS,
  } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  if (!enabled) return { tileset: null, route: 'osm', errors };

  const attempts = [];
  const isGoogleKeyUsable =
    Boolean(googleKey) &&
    googleKey !== ionToken &&
    !googleKey.startsWith('eyJ');
  if (isGoogleKeyUsable)
    attempts.push({
      route: 'google-direct',
      create: () => createGoogleDirectTileset(Cesium, googleKey),
    });
  else if (googleTokens)
    attempts.push({
      route: 'google-token',
      create: () => createGoogleTokenTileset(Cesium, googleTokens),
    });
  if (ionToken)
    attempts.push({
      route: 'google-ion',
      create: () => createGoogleIonTileset(Cesium, ionToken),
    });

  for (const attempt of attempts) {
    try {
      const tileset = await withTimeout(
        Promise.resolve().then(attempt.create),
        timeoutMs,
        attempt.route,
      );
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { tileset: null, route: 'osm', errors };
}

/** Bound each provider attempt so an upstream hang cannot stall the app. */
function withTimeout(promise, ms, route) {
  let timer;
  let timedOut = false;
  const owned = promise.then((tileset) => {
    // A provider may still allocate after our startup deadline. Release that
    // late result because the caller can no longer take ownership of it.
    if (timedOut && tileset && !tileset.isDestroyed?.()) tileset.destroy?.();
    return tileset;
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(`Photoreal tileset load timed out after ${ms} ms (${route})`),
      );
    }, ms);
  });
  return Promise.race([owned, timeout]).finally(() => clearTimeout(timer));
}

/** Configure sibling streaming and bounded render-governor wakeups on a Google 3D tileset. */
export function configureAndGuardGoogleTileset(tileset) {
  if (!tileset || typeof tileset !== 'object') return tileset;
  try { tileset.maximumScreenSpaceError = 16; } catch {}
  try { tileset.loadSiblings = false; } catch {}
  try { tileset.preferLeaves = false; } catch {}
  try { tileset.foveatedScreenSpaceError = true; } catch {}
  try { tileset.foveatedConeSize = 0.25; } catch {}
  try { tileset.foveatedTimeDelay = 0.1; } catch {}
  try { tileset.preloadFlightDestinations = true; } catch {}

  if (tileset._pflStreamGuarded) return tileset;
  try { tileset._pflStreamGuarded = true; } catch {}

  let safetyTimer = null;
  let settleTimer = null;
  const clearSafety = () => {
    if (safetyTimer !== null) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
  };
  const clearSettle = () => {
    if (settleTimer !== null) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };
  const armStreamHold = () => {
    clearSettle();
    holdContinuousRender(GOOGLE_STREAM_HOLD_ID);
    clearSafety();
    safetyTimer = setTimeout(() => {
      safetyTimer = null;
      releaseContinuousRender(GOOGLE_STREAM_HOLD_ID);
      governorRequestRender('google3d-stream-timeout');
    }, GOOGLE_STREAM_TIMEOUT_MS);
  };
  const scheduleSettleHold = () => {
    clearSettle();
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (tileset.tilesLoaded === false) {
        armStreamHold();
        return;
      }
      clearSafety();
      releaseContinuousRender(GOOGLE_STREAM_HOLD_ID);
      governorRequestRender('google3d-settled');
      if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        try { window.dispatchEvent(new CustomEvent('gev:google3d-settled')); } catch {}
      }
    }, GOOGLE_STREAM_SETTLE_DEBOUNCE_MS);
  };

  const offs = [];
  const sub = (ev, fn) => {
    if (typeof ev?.addEventListener !== 'function') return;
    const unsub = ev.addEventListener(fn);
    if (typeof unsub === 'function') offs.push(unsub);
  };

  sub(tileset.loadProgress, (pendingReq, pendingProc) => {
    if ((pendingReq || 0) + (pendingProc || 0) > 0) armStreamHold();
    else scheduleSettleHold();
  });
  sub(tileset.tileLoad, () => {
    if (tileset.tilesLoaded === false) armStreamHold();
    governorRequestRender('google3d-tile');
  });
  sub(tileset.allTilesLoaded, scheduleSettleHold);

  armStreamHold();

  if (typeof tileset.destroy === 'function') {
    const origDestroy = tileset.destroy.bind(tileset);
    tileset.destroy = (...args) => {
      clearSafety();
      clearSettle();
      releaseContinuousRender(GOOGLE_STREAM_HOLD_ID);
      for (const off of offs) {
        try { off(); } catch {}
      }
      offs.length = 0;
      return origDestroy(...args);
    };
  }
  return tileset;
}

/** Pass credentials to the source instead of changing SDK-wide defaults. */
export async function createGoogleDirectTileset(Cesium, key) {
  key = clean(key);
  if (!key) throw new Error('Google 3D requires an explicit browser key');
  // Tiles keep drawing their own texture while draped weather loads, and
  // clamped marks land on them, as on the token routes' tiles.
  const tileset = await Cesium.createGooglePhotorealistic3DTileset(
    { key, onlyUsingWithGoogleGeocoder: true },
    { asynchronouslyLoadImagery: true, enableCollision: true },
  );
  return configureAndGuardGoogleTileset(tileset);
}

/**
 * Google 3D with short-lived tokens instead of a key. Every tile request
 * carries the token as a header; a tile refused for an expired token gets
 * the renewed one and is tried once more.
 */
export async function createGoogleTokenTileset(Cesium, tokens) {
  const token = await tokens.token();
  if (!token) throw new Error('Google 3D tokens are not offered');
  const credit = Cesium.GoogleMaps.getDefaultCredit?.();
  const resource = new Cesium.Resource({
    url: `${Cesium.GoogleMaps.mapTilesApiEndpoint}v1/3dtiles/root.json`,
    headers: { Authorization: `Bearer ${token}` },
    credits: credit ? [credit] : undefined,
    retryAttempts: 1,
    async retryCallback(failed, error) {
      if (![401, 403].includes(error?.statusCode)) return false;
      const used = failed.headers.Authorization?.replace(/^Bearer /, '');
      const renewed = await tokens.token({ replacing: used });
      if (!renewed || renewed === used) return false;
      failed.headers.Authorization = `Bearer ${renewed}`;
      return true;
    },
  });
  // The settings Cesium's Google helper applies to the key route.
  const tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {
    cacheBytes: 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: 1024 * 1024 * 1024,
    enableCollision: true,
    // Tiles keep drawing their own texture while draped weather loads.
    asynchronouslyLoadImagery: true,
  });
  return configureAndGuardGoogleTileset(tileset);
}

export async function createGoogleIonTileset(
  Cesium,
  accessToken,
  { signal } = {},
) {
  accessToken = clean(accessToken);
  if (!accessToken)
    throw new Error('Google 3D through ion requires an explicit token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(2275207, {
    accessToken,
  });
  signal?.throwIfAborted();
  // Match the installed SDK's Google helper rendering/cache defaults.
  const tileset = await Cesium.Cesium3DTileset.fromUrl(resource, {
    cacheBytes: 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: 1024 * 1024 * 1024,
    enableCollision: true,
    // Tiles keep drawing their own texture while draped weather loads.
    asynchronouslyLoadImagery: true,
  });
  return configureAndGuardGoogleTileset(tileset);
}
