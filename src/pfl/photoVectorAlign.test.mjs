import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePhotoMetadata,
  parseExifTimestamp,
  extractVisualVector,
  cosineSimilarity,
  estimateHorizontalShiftDeg,
  correlatePhotoToAnchors,
} from './photoVectorAlign.js';

function buildMinimalJpegWithXmpAndSof(width, height, xmpText) {
  const xmpBytes = Buffer.from(`http://ns.adobe.com/xap/1.0/\x00${xmpText}`, 'ascii');
  const app1Len = 2 + xmpBytes.length;
  const sofPayload = Buffer.from([
    0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff]),
    xmpBytes,
    Buffer.from([0xff, 0xc0, ((sofPayload.length + 2) >> 8) & 0xff, (sofPayload.length + 2) & 0xff]),
    sofPayload,
    Buffer.from([0xff, 0xd9]),
  ]);
}

function buildMinimalExifGpsJpeg({ lat = 29.247585, lon = -95.231378, heading = 104, dtStr = '2018:11:04 14:57:02' }) {
  // Little-endian TIFF header + IFD0 (DateTime, ExifIFDPtr, GPSInfoIFDPtr)
  const buf = Buffer.alloc(512, 0);
  buf.write('Exif\x00\x00II', 0, 'ascii');
  buf.writeUInt16LE(42, 8);
  buf.writeUInt32LE(8, 10); // ifd0 starts at tiff+8 (buf+14)

  const writeIfdEntry = (off, tag, type, num, val) => {
    buf.writeUInt16LE(tag, off);
    buf.writeUInt16LE(type, off + 2);
    buf.writeUInt32LE(num, off + 4);
    buf.writeUInt32LE(val, off + 8);
  };

  // tiff base is index 6 in buf
  buf.writeUInt16LE(2, 14); // 2 entries in IFD0
  writeIfdEntry(16, 0x8769, 4, 1, 40); // ExifIFD at tiff+40
  writeIfdEntry(28, 0x8825, 4, 1, 80); // GPSIFD at tiff+80

  // ExifIFD at buf+46 (tiff+40)
  buf.writeUInt16LE(1, 46);
  writeIfdEntry(48, 0x9003, 2, dtStr.length + 1, 200);
  buf.write(dtStr + '\x00', 206, 'ascii');

  // GPSIFD at buf+86 (tiff+80): 6 tags -> 2 + 72 = 74 bytes
  const absLon = Math.abs(lon);
  const writeDms = (off, degDec) => {
    const d = Math.floor(degDec);
    const m = Math.floor((degDec - d) * 60);
    const sNum = Math.round(((degDec - d) * 60 - m) * 60 * 100);
    buf.writeUInt32LE(d, off); buf.writeUInt32LE(1, off + 4);
    buf.writeUInt32LE(m, off + 8); buf.writeUInt32LE(1, off + 12);
    buf.writeUInt32LE(sNum, off + 16); buf.writeUInt32LE(100, off + 20);
  };
  buf.writeUInt16LE(6, 86);
  // LatRef
  buf.writeUInt16LE(1, 88); buf.writeUInt16LE(2, 90); buf.writeUInt32LE(2, 92);
  buf.write(lat >= 0 ? 'N\x00' : 'S\x00', 96, 'ascii');
  writeIfdEntry(100, 2, 5, 3, 240);
  writeDms(246, Math.abs(lat));
  // LonRef
  buf.writeUInt16LE(3, 112); buf.writeUInt16LE(2, 114); buf.writeUInt32LE(2, 116);
  buf.write(lon < 0 ? 'W\x00' : 'E\x00', 120, 'ascii');
  writeIfdEntry(124, 4, 5, 3, 280);
  writeDms(286, absLon);
  // ImgDirection
  writeIfdEntry(136, 17, 5, 1, 320);
  buf.writeUInt32LE(Math.round(heading * 10), 326); buf.writeUInt32LE(10, 330);
  // Altitude 2.5m
  writeIfdEntry(148, 6, 5, 1, 340);
  buf.writeUInt32LE(25, 346); buf.writeUInt32LE(10, 350);

  const app1Len = 2 + buf.length;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff]),
    buf,
    Buffer.from([0xff, 0xd9]),
  ]);
}

test('parseExifTimestamp extracts 4D capture timestamp cleanly', () => {
  const res = parseExifTimestamp('2018:11:04 14:57:02');
  assert.equal(res.dateTimeOriginal, '2018-11-04 14:57:02');
  assert.equal(res.capturedIso, '2018-11-04T14:57:02');
  assert.ok(Number.isFinite(res.timestampMs));
});

test('parsePhotoMetadata detects GPano 360 equirectangular panorama & stereo metadata', () => {
  const jpg360 = buildMinimalJpegWithXmpAndSof(
    5660,
    2830,
    '<x:xmpmeta><GPano:ProjectionType>equirectangular</GPano:ProjectionType><GPano:PoseHeadingDegrees>194.5</GPano:PoseHeadingDegrees></x:xmpmeta>',
  );
  const m = parsePhotoMetadata(jpg360);
  assert.equal(m.width, 5660);
  assert.equal(m.height, 2830);
  assert.equal(m.is360, true);
  assert.equal(m.mediaKind, '360°');
  assert.equal(m.poseHeadingDegrees, 194.5);

  const jpg3d = buildMinimalJpegWithXmpAndSof(
    3840,
    1080,
    '<x:xmpmeta><GDepth:Data>abc</GDepth:Data><GStereo:Image>def</GStereo:Image></x:xmpmeta>',
  );
  const m3 = parsePhotoMetadata(jpg3d);
  assert.equal(m3.is3dStereo, true);
  assert.equal(m3.mediaKind, '3D');
});

test('parsePhotoMetadata extracts EXIF GPS lat/lon/alt, heading & DateTimeOriginal', () => {
  const buf = buildMinimalExifGpsJpeg({ lat: 29.247585, lon: -95.231378, heading: 104, dtStr: '2018:11:04 14:57:02' });
  const m = parsePhotoMetadata(buf);
  assert.ok(Math.abs(m.gpsLat - 29.247585) < 1e-4);
  assert.ok(Math.abs(m.gpsLon - -95.231378) < 1e-4);
  assert.equal(m.headingDeg, 104);
  assert.equal(m.gpsAltM, 2.5);
  assert.equal(m.dateTimeOriginal, '2018-11-04 14:57:02');
});

test('extractVisualVector & estimateHorizontalShiftDeg recover panoramic rotation offset', () => {
  const W = 64;
  const H = 32;
  const makePattern = (shiftPx) => {
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const sx = (x - shiftPx + W) % W;
        const i = (y * W + x) * 4;
        const brightPeak = sx >= 8 && sx <= 16 ? 235 : 45;
        const greenBand = sx >= 36 && sx <= 44 && y > H / 2 ? 210 : 35;
        rgba[i] = brightPeak;
        rgba[i + 1] = Math.max(brightPeak, greenBand);
        rgba[i + 2] = y < H / 2 ? 200 : 40;
        rgba[i + 3] = 255;
      }
    }
    return extractVisualVector(rgba, W, H);
  };
  const vA = makePattern(0);
  const vB = makePattern(16); // +90° shift in panorama
  assert.ok(cosineSimilarity(vA.vector, vA.vector) > 0.999);
  const shift = estimateHorizontalShiftDeg(vA.colStrip, vB.colStrip);
  assert.ok(Math.abs(shift.shiftDeg - 90) <= 23, `expected ~90deg shift, got ${shift.shiftDeg}`);
  assert.ok(shift.correlation > 0.92);
});

test('correlatePhotoToAnchors prefers GPS when present & falls back to best visual anchor', () => {
  const vecA = { vector: [0.8, 0.2, 0.1, 0.0], colStrip: Array.from({ length: 16 }, () => ({ luma: 0.5, edge: 0.2, green: 0.3, sky: 0.1 })) };
  const anchors = [
    { id: 'dock', label: 'Bayou Dock', lat: 29.24779, lon: -95.23138, heading: 354, vector: [0.8, 0.2, 0.1, 0.0], colStrip: vecA.colStrip },
    { id: 'drive', label: 'Palm Dr Front', lat: 29.24748, lon: -95.23139, heading: 104, vector: [0.1, 0.9, 0.1, 0.0], colStrip: vecA.colStrip },
  ];
  const visualMatch = correlatePhotoToAnchors(vecA, { dateTimeOriginal: '2018-11-04 14:57:02' }, anchors);
  assert.equal(visualMatch.matchedAnchorId, 'dock');
  assert.equal(visualMatch.usedGps, false);
  assert.equal(visualMatch.capturedAt, '2018-11-04 14:57:02');

  const gpsMatch = correlatePhotoToAnchors(vecA, { gpsLat: 29.24751, gpsLon: -95.23126, headingDeg: 194 }, anchors);
  assert.equal(gpsMatch.usedGps, true);
  assert.equal(gpsMatch.lat, 29.24751);
  assert.equal(gpsMatch.heading, 194);
});
