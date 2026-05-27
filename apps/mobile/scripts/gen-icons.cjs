/**
 * 外部依存なしで Cmail の PWA アイコンを生成するスクリプト。
 * Node.js 組み込みの zlib のみ使用。
 *
 * デザイン: #7C3AED (violet-600) のフルブリード正方形 + 白い "C" 文字（弧）
 *
 * iOS の apple-touch-icon は「キャンバス全面に色を塗り、外側の角丸は OS が自動で付ける」のが正解。
 * 透明な余白を含むと iOS ホーム画面（特にダークモード）で黒い淵として見えるため、
 * パディング・角丸を一切付けず縁いっぱいまで紫で塗りつぶす。
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

  // ── 背景: 縁いっぱいの紫 (#7C3AED) フルブリード ──
  // 透明な余白を作らない（iOS の黒い淵を防ぐため）。
  // 外側の角丸は iOS / Android ランチャー側が自動でクリップしてくれる。
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba[i]     = 0x7c;
      rgba[i + 1] = 0x3a;
      rgba[i + 2] = 0xed;
      rgba[i + 3] = 0xff;
    }
  }

  // ── 白い "C" 文字（弧） ──
  // maskable セーフゾーン (内側 80%) に収まるよう一回り大きく描画。
  const arcCx = cx + size * 0.04; // 中心より少し右オフセット
  const arcCy = cy;
  const outerR = size * 0.34;
  const innerR = size * 0.20;
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
