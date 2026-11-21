/**
 * Pure ES module for parsing EXIF / XMP (360° GPano + 3D Depth/Stereo + 4D Timestamp),
 * computing compact multi-band color + edge visual feature vectors, matching photos across
 * horizontal panorama shifts, and correlating incoming images onto known 417 Palm Dr anchors.
 */

function readUint16(view, off, le) {
  return off + 2 <= view.byteLength ? view.getUint16(off, le) : 0;
}

function readUint32(view, off, le) {
  return off + 4 <= view.byteLength ? view.getUint32(off, le) : 0;
}

function readAscii(view, off, len) {
  if (off < 0 || off + len > view.byteLength) return '';
  let out = '';
  for (let i = 0; i < len; i++) {
    const ch = view.getUint8(off + i);
    if (ch === 0) break;
    out += String.fromCharCode(ch);
  }
  return out.trim();
}

function readRational(view, off, le) {
  if (off < 0 || off + 8 > view.byteLength) return null;
  const num = view.getUint32(off, le);
  const den = view.getUint32(off + 4, le);
  return den ? num / den : null;
}

function parseDms(view, off, le) {
  if (off < 0 || off + 24 > view.byteLength) return null;
  const d = readRational(view, off, le);
  const m = readRational(view, off + 8, le);
  const s = readRational(view, off + 16, le);
  if (d == null || m == null || s == null) return null;
  return d + m / 60 + s / 3600;
}

function decodeLatin1Slice(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function findAsciiBytes(bytes, needle) {
  const nLen = needle.length;
  for (let i = 0; i <= bytes.length - nLen; i++) {
    let ok = true;
    for (let j = 0; j < nLen; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * Normalizes EXIF DateTime ("YYYY:MM:DD HH:MM:SS") -> ISO-like UTC/local display string & epoch ms.
 */
export function parseExifTimestamp(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return { dateTimeOriginal: s || null, capturedIso: null, timestampMs: null };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const parsed = Date.parse(iso);
  return {
    dateTimeOriginal: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`,
    capturedIso: iso,
    timestampMs: Number.isFinite(parsed) ? parsed : null,
  };
}

/**
 * Extracts JPEG dimensions, binary EXIF (GPS, Heading, FocalLength35mm, DateTimeOriginal, Make/Model),
 * and embedded XMP metadata (GPano 360° projection/heading and GDepth / GStereo 3D flags).
 * @param {ArrayBuffer | Uint8Array} input
 * @param {{ width?: number, height?: number }} [fallbackDims]
 */
export function parsePhotoMetadata(input, fallbackDims = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const meta = {
    width: Number(fallbackDims.width) || null,
    height: Number(fallbackDims.height) || null,
    gpsLat: null,
    gpsLon: null,
    gpsAltM: null,
    headingDeg: null,
    focalLength35mm: null,
    focalLengthMm: null,
    make: null,
    model: null,
    dateTimeOriginal: null,
    capturedIso: null,
    timestampMs: null,
    projectionType: null,
    poseHeadingDegrees: null,
    is360: false,
    is3dStereo: false,
    mediaKind: '2D',
  };

  if (bytes.length < 4) return meta;

  // Scan JPEG SOF0/SOF2 & APP1 segments
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xff) break;
      const marker = bytes[pos + 1];
      if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
        pos += 2;
        continue;
      }
      const segLen = readUint16(view, pos + 2, false);
      if (segLen < 2 || pos + 2 + segLen > bytes.length) break;

      if ((marker === 0xc0 || marker === 0xc2) && segLen >= 7) {
        meta.height = readUint16(view, pos + 5, false);
        meta.width = readUint16(view, pos + 7, false);
      } else if (marker === 0xe1 && segLen > 8) {
        const segStart = pos + 4;
        const sig6 = decodeLatin1Slice(bytes, segStart, Math.min(bytes.length, segStart + 6));
        if (sig6 === 'Exif\x00\x00') {
          parseTiffExif(bytes, segStart + 6, pos + 2 + segLen, meta);
        } else {
          const sigXmp = decodeLatin1Slice(bytes, segStart, Math.min(bytes.length, segStart + 29));
          if (sigXmp.startsWith('http://ns.adobe.com/xap/1.0/') || sigXmp.startsWith('<x:xmpmeta')) {
            const xmpStr = decodeLatin1Slice(bytes, segStart, pos + 2 + segLen);
            parseXmpText(xmpStr, meta);
          }
        }
      }
      pos += 2 + segLen;
    }
  }

  // Fallback XMP / GPano / GStereo scan across first 128KB in case XMP spans extended segments
  if (!meta.projectionType && !meta.is3dStereo) {
    const scanLen = Math.min(bytes.length, 131072);
    const xmpIdx = findAsciiBytes(bytes.subarray(0, scanLen), '<x:xmpmeta');
    if (xmpIdx >= 0) {
      const xmpEnd = findAsciiBytes(bytes.subarray(xmpIdx, scanLen), '</x:xmpmeta>');
      const sliceEnd = xmpEnd >= 0 ? xmpIdx + xmpEnd + 12 : Math.min(scanLen, xmpIdx + 16384);
      parseXmpText(decodeLatin1Slice(bytes, xmpIdx, sliceEnd), meta);
    }
  }

  // 2:1 aspect ratio equirectangular fallback
  const ratio = meta.width && meta.height ? meta.width / meta.height : 0;
  const equirectRatio = ratio > 1.92 && ratio < 2.08 && meta.width >= 1024;
  if (
    String(meta.projectionType || '').toLowerCase() === 'equirectangular' ||
    equirectRatio
  ) {
    meta.is360 = true;
    if (!meta.projectionType) meta.projectionType = 'equirectangular';
  }
  if (meta.poseHeadingDegrees != null && meta.headingDeg == null) {
    meta.headingDeg = meta.poseHeadingDegrees;
  }

  // Detect Stereo SBS (32:9 / >=3.4:1 or explicit GDepth/GStereo)
  if (!meta.is360 && ratio >= 3.2 && meta.width >= 1200) {
    meta.is3dStereo = true;
  }
  meta.mediaKind = meta.is360 ? '360°' : meta.is3dStereo ? '3D' : '2D';
  return meta;
}

function parseTiffExif(bytes, tiffStart, limitEnd, meta) {
  if (tiffStart + 8 > limitEnd) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset + tiffStart, limitEnd - tiffStart);
  const endian = String.fromCharCode(bytes[tiffStart], bytes[tiffStart + 1]);
  const le = endian === 'II';
  const ifd0Off = readUint32(view, 4, le);

  const readIfd = (off) => {
    const out = [];
    if (off <= 0 || off + 2 > view.byteLength) return out;
    const count = readUint16(view, off, le);
    for (let i = 0; i < count; i++) {
      const eOff = off + 2 + i * 12;
      if (eOff + 12 > view.byteLength) break;
      out.push({
        tag: readUint16(view, eOff, le),
        type: readUint16(view, eOff + 2, le),
        num: readUint32(view, eOff + 4, le),
        val: readUint32(view, eOff + 8, le),
        rawOff: eOff + 8,
      });
    }
    return out;
  };

  let exifOff = null;
  let gpsOff = null;
  let dtFallback = null;
  for (const e of readIfd(ifd0Off)) {
    if (e.tag === 0x010f && e.type === 2) meta.make = readAscii(view, e.num <= 4 ? e.rawOff : e.val, e.num);
    else if (e.tag === 0x0110 && e.type === 2) meta.model = readAscii(view, e.num <= 4 ? e.rawOff : e.val, e.num);
    else if (e.tag === 0x0132 && e.type === 2) dtFallback = readAscii(view, e.num <= 4 ? e.rawOff : e.val, e.num);
    else if (e.tag === 0x8769) exifOff = e.val;
    else if (e.tag === 0x8825) gpsOff = e.val;
  }

  let dtOriginal = null;
  if (exifOff) {
    for (const e of readIfd(exifOff)) {
      if (e.tag === 0x9003 && e.type === 2) dtOriginal = readAscii(view, e.num <= 4 ? e.rawOff : e.val, e.num);
      else if (e.tag === 0x920a && e.type === 5) {
        const fl = readRational(view, e.val, le);
        if (fl != null) meta.focalLengthMm = Math.round(fl * 100) / 100;
      } else if (e.tag === 0xa405 && e.type === 3) {
        meta.focalLength35mm = readUint16(view, e.rawOff, le) || null;
      }
    }
  }
  const tsInfo = parseExifTimestamp(dtOriginal || dtFallback);
  meta.dateTimeOriginal = tsInfo.dateTimeOriginal;
  meta.capturedIso = tsInfo.capturedIso;
  meta.timestampMs = tsInfo.timestampMs;

  if (gpsOff) {
    let latRef = 'N';
    let lonRef = 'E';
    let altRef = 0;
    let latVal = null;
    let lonVal = null;
    for (const e of readIfd(gpsOff)) {
      if (e.tag === 1) latRef = String.fromCharCode(view.getUint8(e.rawOff)) || 'N';
      else if (e.tag === 2) latVal = parseDms(view, e.val, le);
      else if (e.tag === 3) lonRef = String.fromCharCode(view.getUint8(e.rawOff)) || 'E';
      else if (e.tag === 4) lonVal = parseDms(view, e.val, le);
      else if (e.tag === 5) altRef = view.getUint8(e.rawOff);
      else if (e.tag === 6) {
        const alt = readRational(view, e.val, le);
        if (alt != null) meta.gpsAltM = Math.round((altRef === 1 ? -alt : alt) * 100) / 100;
      } else if (e.tag === 17) {
        const dir = readRational(view, e.val, le);
        if (dir != null && Number.isFinite(dir)) meta.headingDeg = ((dir % 360) + 360) % 360;
      }
    }
    if (latVal != null && lonVal != null) {
      meta.gpsLat = latRef === 'S' ? -latVal : latVal;
      meta.gpsLon = lonRef === 'W' ? -lonVal : lonVal;
    }
  }
}

function parseXmpText(xmp, meta) {
  if (!xmp) return;
  const projM = /GPano:ProjectionType[="'\s>]+([a-zA-Z0-9_-]+)/i.exec(xmp);
  if (projM) meta.projectionType = projM[1].toLowerCase();
  const hdgM = /GPano:(?:PoseHeadingDegrees|InitialViewHeadingDegrees)[="'\s>]+(-?\d+(?:\.\d+)?)/i.exec(xmp);
  if (hdgM) {
    const h = Number(hdgM[1]);
    if (Number.isFinite(h)) meta.poseHeadingDegrees = ((h % 360) + 360) % 360;
  }
  if (/GDepth:(?:Data|Near|Far)|GStereo:(?:Image|Mime)|GPano:StereoMode/i.test(xmp)) {
    meta.is3dStereo = true;
  }
}

/**
 * Extracts a compact L2-normalized visual feature vector + 16-column horizontal strip
 * (luminance + vertical edge density + sky/greenery cues) from an RGBA buffer.
 */
export function extractVisualVector(rgba, width, height) {
  const w = Math.max(4, Math.floor(width));
  const h = Math.max(4, Math.floor(height));
  const cols = 16;
  const rows = 12;
  const vec = new Float64Array(cols * 3 + rows * 2); // 48 col RGB/edge + 24 vertical band cues
  const colLuma = new Float64Array(cols);
  const colEdge = new Float64Array(cols);
  const colGreen = new Float64Array(cols);
  const colSky = new Float64Array(cols);

  const lumaAt = (x, y) => {
    const idx = (y * w + x) * 4;
    return (0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]) / 255;
  };

  const colCount = new Float64Array(cols);
  const rowLuma = new Float64Array(rows);
  const rowCount = new Float64Array(rows);

  for (let y = 1; y < h - 1; y++) {
    const rBin = Math.min(rows - 1, Math.floor((y * rows) / h));
    for (let x = 1; x < w - 1; x++) {
      const cBin = Math.min(cols - 1, Math.floor((x * cols) / w));
      const idx = (y * w + x) * 4;
      const r = rgba[idx] / 255;
      const g = rgba[idx + 1] / 255;
      const b = rgba[idx + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const gx = Math.abs(lumaAt(x + 1, y) - lumaAt(x - 1, y));
      const gy = Math.abs(lumaAt(x, y + 1) - lumaAt(x, y - 1));
      const edge = Math.min(1, Math.hypot(gx, gy) * 1.4);

      colLuma[cBin] += lum;
      colEdge[cBin] += edge;
      colGreen[cBin] += Math.max(0, g - Math.max(r, b) * 0.92);
      if (y < h * 0.48) colSky[cBin] += Math.max(0, b - r * 0.95);
      colCount[cBin] += 1;

      rowLuma[rBin] += lum;
      rowCount[rBin] += 1;
    }
  }

  for (let c = 0; c < cols; c++) {
    const n = Math.max(1, colCount[c]);
    colLuma[c] /= n;
    colEdge[c] /= n;
    colGreen[c] /= n;
    colSky[c] /= n;
    vec[c * 3] = colLuma[c];
    vec[c * 3 + 1] = colEdge[c];
    vec[c * 3 + 2] = colGreen[c] + colSky[c];
  }
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, rowCount[r]);
    vec[cols * 3 + r] = rowLuma[r] / n;
    vec[cols * 3 + rows + r] = (r < rows / 2 ? 0.5 : 1.0) * (rowLuma[r] / n);
  }

  // L2 normalize vector
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
  const norm = Math.sqrt(normSq) || 1;
  const vector = Array.from(vec, (v) => v / norm);

  return {
    vector,
    colStrip: Array.from({ length: cols }, (_, c) => ({
      luma: colLuma[c],
      edge: colEdge[c],
      green: colGreen[c],
      sky: colSky[c],
    })),
    avgSky: colSky.reduce((a, b) => a + b, 0) / cols,
    avgGreen: colGreen.reduce((a, b) => a + b, 0) / cols,
    brightCol: colLuma.reduce((best, val, idx, arr) => (val > arr[best] ? idx : best), 0),
  };
}

/**
 * Browser helper: downscales an HTMLImageElement onto an offscreen 64x48 canvas and extracts its visual vector.
 */
export function extractVisualVectorFromImage(img) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, 64, 48);
  const imgData = ctx.getImageData(0, 0, 64, 48);
  return extractVisualVector(imgData.data, 64, 48);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 1e-12 ? dot / den : 0;
}

/**
 * Circular horizontal correlation between two 16-bin column strips; returns best azimuth offset in [-180, +180) deg.
 */
export function estimateHorizontalShiftDeg(stripA, stripB) {
  if (!Array.isArray(stripA) || !Array.isArray(stripB) || stripA.length < 4 || stripA.length !== stripB.length) {
    return { shiftDeg: 0, correlation: 0 };
  }
  const n = stripA.length;
  const feat = (s) => [s.luma || 0, (s.edge || 0) * 1.3, (s.green || 0) * 0.9, (s.sky || 0) * 0.9];
  let bestShift = 0;
  let bestCorr = -Infinity;
  for (let s = 0; s < n; s++) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const va = feat(stripA[i]);
      const vb = feat(stripB[(i + s) % n]);
      for (let k = 0; k < va.length; k++) {
        dot += va[k] * vb[k];
        na += va[k] * va[k];
        nb += vb[k] * vb[k];
      }
    }
    const corr = Math.sqrt(na) * Math.sqrt(nb) > 1e-12 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestShift = s;
    }
  }
  let deg = (bestShift / n) * 360;
  if (deg >= 180) deg -= 360;
  return { shiftDeg: Math.round(deg * 10) / 10, correlation: Math.round(bestCorr * 1000) / 1000 };
}

/**
 * Matches an incoming photo's visual vector + metadata against known world anchors
 * and proposes a 3D world pose (lat, lon, heading, altOff, eraTag).
 */
export function correlatePhotoToAnchors(photoVec, photoMeta, anchors = []) {
  const hasGps = Number.isFinite(photoMeta?.gpsLat) && Number.isFinite(photoMeta?.gpsLon);
  const scored = (anchors || []).map((anc) => {
    const vecSim = photoVec?.vector && anc?.vector ? cosineSimilarity(photoVec.vector, anc.vector) : 0;
    const shift =
      photoVec?.colStrip && anc?.colStrip
        ? estimateHorizontalShiftDeg(photoVec.colStrip, anc.colStrip)
        : { shiftDeg: 0, correlation: vecSim };
    const distM = hasGps
      ? Math.hypot(
          (photoMeta.gpsLat - anc.lat) * 111320,
          (photoMeta.gpsLon - anc.lon) * 111320 * Math.cos((anc.lat * Math.PI) / 180),
        )
      : null;
    const gpsBonus = distM != null ? Math.max(0, 1 - distM / 80) * 0.35 : 0;
    const score = (anc.vector ? vecSim * 0.65 + shift.correlation * 0.35 : 0.4) + gpsBonus;
    return { anchor: anc, score, vecSim, shift };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0] || null;
  const fallbackLat = top?.anchor?.lat ?? 29.247585;
  const fallbackLon = top?.anchor?.lon ?? -95.231378;
  const rawHeading =
    photoMeta?.headingDeg ??
    (top ? (Number(top.anchor.heading || 0) - Number(top.shift?.shiftDeg || 0) + 360) % 360 : 104);

  return {
    lat: hasGps ? photoMeta.gpsLat : fallbackLat,
    lon: hasGps ? photoMeta.gpsLon : fallbackLon,
    heading: Math.round(((rawHeading % 360) + 360) % 360),
    altOff: Number(photoMeta?.gpsAltM) || Number(top?.anchor?.altOff) || 1.8,
    matchedAnchorId: top?.anchor?.id || null,
    matchedAnchorLabel: top?.anchor?.label || 'Property Center',
    confidence: Math.round(Math.max(0, Math.min(1, top?.score ?? (hasGps ? 0.92 : 0.45))) * 100) / 100,
    usedGps: hasGps,
    capturedAt: photoMeta?.dateTimeOriginal || null,
  };
}
