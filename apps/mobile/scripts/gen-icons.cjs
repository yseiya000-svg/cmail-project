/**
 * 外部依存なしで Cmail の PWA アイコンを生成するスクリプト。
 * Node.js 組み込みの zlib のみ使用。
 *
 * デザイン: #7C3AED (violet-600) の角丸正方形 + 白い "C" 文字（弧）
 * デスクトップアプリのブランドカラーに統一。
 *
 * NOTE: 通常はデスクトップロゴ (apps/desktop/public/icons/cmail-256.png) を直接コピーする。
 * このスクリプトはコピー元が無い場合のフォールバックとして残してある。
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG 書き込みヘルパー ────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(d.length);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crcBuf]);
}

// ── ピクセル描画ユーティリティ ─────────────────────────────────────────────
function setPixel(rgba, w, x, y, r, g, b, a) {
  if (x < 0 || x >= w || y < 0 || y >= w) return;
  const i = (y * w + x) * 4;
  // アルファブレンド
  const srcA = a / 255;
  const dstA = rgba[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  rgba[i]     = Math.round((r * srcA + rgba[i]     * dstA * (1 - srcA)) / outA);
  rgba[i + 1] = Math.round((g * srcA + rgba[i + 1] * dstA * (1 - srcA)) / outA);
  rgba[i + 2] = Math.round((b * srcA + rgba[i + 2] * dstA * (1 - srcA)) / outA);
  rgba[i + 3] = Math.round(outA * 255);
}

// ── アイコン描画 ──────────────────────────────────────────────────────────
function generateIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const pad = size * 0.08;
  const cornerR = size * 0.22;
  const hw = size / 2 - pad; // 角丸矩形の半幅（コーナー除く）

  // ── 背景: 角丸正方形 (#007AFF) ──
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const qx = Math.max(dx - (hw - cornerR), 0);
      const qy = Math.max(dy - (hw - cornerR), 0);
      const sdf = Math.sqrt(qx * qx + qy * qy) - cornerR;

      let alpha = 0;
      if (sdf <= 0) {
        alpha = 255;
      } else if (sdf < 1.5) {
        alpha = Math.round(255 * (1 - sdf / 1.5)); // アンチエイリアス
      }
      if (alpha > 0) {
        const i = (y * size + x) * 4;
        rgba[i]     = 0x7c; // R (violet-600)
        rgba[i + 1] = 0x3a; // G
        rgba[i + 2] = 0xed; // B
        rgba[i + 3] = alpha;
      }
    }
  }

  // ── 白い "C" 文字（弧） ──
  const arcCx = cx + size * 0.04; // 中心より少し右オフセット
  const arcCy = cy;
  const outerR = size * 0.28;
  const innerR = size * 0.16;
  const strokeWidth = outerR - innerR;
  const openingDeg = 62; // C の開口部（右側、±62度）

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - arcCx;
      const dy = y - arcCy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 弧のリング範囲内か
      if (dist < innerR - 1.5 || dist > outerR + 1.5) continue;

      // 角度（0度=右、反時計回り）
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      // 右側の開口部 (±openingDeg 度) を除外
      if (angleDeg >= -openingDeg && angleDeg <= openingDeg) continue;

      // アルファ: リング境界でアンチエイリアス
      const distFromOuter = outerR - dist;
      const distFromInner = dist - innerR;
      const aa = Math.min(
        Math.min(distFromOuter, distFromInner, strokeWidth / 4) / 1.5,
        1
      );
      const alpha = Math.max(0, Math.round(255 * Math.min(aa, 1)));
      if (alpha > 0) setPixel(rgba, size, x, y, 255, 255, 255, alpha);
    }
  }

  // ── RGBA バッファ → PNG バイナリ ──
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 4);
    row[0] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      row[1 + x * 4]     = rgba[src];
      row[1 + x * 4 + 1] = rgba[src + 1];
      row[1 + x * 4 + 2] = rgba[src + 2];
      row[1 + x * 4 + 3] = rgba[src + 3];
    }
    rows.push(row);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0; // RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── 出力 ─────────────────────────────────────────────────────────────────
const outDir = path.resolve(__dirname, "../public/icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const buf = generateIcon(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ icon-${size}.png  (${buf.length} bytes)`);
}

const touchBuf = generateIcon(180);
const touchPath = path.join(outDir, "apple-touch-icon.png");
fs.writeFileSync(touchPath, touchBuf);
console.log(`✓ apple-touch-icon.png  (${touchBuf.length} bytes)`);

console.log("\nAll icons generated in apps/mobile/public/icons/");
