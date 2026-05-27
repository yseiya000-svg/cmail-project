/**
 * 外部依存なしで Cmail の PWA アイコンを生成するスクリプト。
 * Node.js 組み込みの zlib のみ使用。
 *
 * デザイン: #7C3AED (violet-600) のフルブリード正方形 + 白い封筒シェイプ。
 *
 * iOS の apple-touch-icon は「キャンバス全面に色を塗り、外側の角丸は OS が自動で付ける」のが正解。
 * 透明な余白を含むと iOS ホーム画面（特にダークモード）で黒い淵として見えるため、
 * パディング・角丸を一切付けず縁いっぱいまで紫で塗りつぶす。
 *
 * 中央グリフ:
 *   ・白い角丸長方形 (封筒のボディ)
 *   ・上半分に紫の V 字 (フラップ) を被せる → 折りたたまれた封筒に見える
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

// ── ライン描画（簡易: 距離ベース、AA 付き） ───────────────────────────────
function drawLine(rgba, size, x1, y1, x2, y2, width, r, g, b) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return;
  const halfW = width / 2;
  const xmin = Math.floor(Math.min(x1, x2) - halfW) - 1;
  const xmax = Math.ceil(Math.max(x1, x2) + halfW) + 1;
  const ymin = Math.floor(Math.min(y1, y2) - halfW) - 1;
  const ymax = Math.ceil(Math.max(y1, y2) + halfW) + 1;
  for (let y = ymin; y <= ymax; y++) {
    for (let x = xmin; x <= xmax; x++) {
      // 線分への最近距離
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      if (dist > halfW + 1) continue;
      const alpha = dist <= halfW ? 255 : Math.round(255 * (1 - (dist - halfW)));
      if (alpha > 0) setPixel(rgba, size, x, y, r, g, b, alpha);
    }
  }
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

  // ── 白い封筒シェイプ ──
  // maskable セーフゾーン (内側約 80%) に収める。
  const bodyX1 = size * 0.22;
  const bodyX2 = size * 0.78;
  const bodyY1 = size * 0.32;
  const bodyY2 = size * 0.70;
  const bodyR = size * 0.05; // 角丸半径
  const stroke = size * 0.06; // 紫の輪郭 / フラップの太さ感

  // (1) 白い角丸長方形を描く (封筒ボディ)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // SDF for rounded rect centered on (bcx, bcy)
      const bcx = (bodyX1 + bodyX2) / 2;
      const bcy = (bodyY1 + bodyY2) / 2;
      const halfW = (bodyX2 - bodyX1) / 2;
      const halfH = (bodyY2 - bodyY1) / 2;
      const dx = Math.abs(x - bcx) - (halfW - bodyR);
      const dy = Math.abs(y - bcy) - (halfH - bodyR);
      const qx = Math.max(dx, 0);
      const qy = Math.max(dy, 0);
      const sdf = Math.sqrt(qx * qx + qy * qy) - bodyR;
      let alpha = 0;
      if (sdf <= 0) alpha = 255;
      else if (sdf < 1.5) alpha = Math.round(255 * (1 - sdf / 1.5));
      if (alpha > 0) setPixel(rgba, size, x, y, 255, 255, 255, alpha);
    }
  }

  // (2) フラップの V 字を紫色で被せて「閉じた封筒」表現
  //     ボディ上辺の (bodyX1, bodyY1) - (bcx, flapBottomY) - (bodyX2, bodyY1) を結ぶ三角形を
  //     塗りつぶす。これにより白い長方形の上半分に紫の V 字が現れ、フラップに見える。
  const flapTopY = bodyY1;
  const flapBottomY = bodyY1 + (bodyY2 - bodyY1) * 0.55; // ボディの 55% 下まで
  const bcx2 = (bodyX1 + bodyX2) / 2;

  function pointInTriangle(px, py, ax, ay, bx, by, cx2v, cy2v) {
    // Barycentric
    const v0x = cx2v - ax, v0y = cy2v - ay;
    const v1x = bx - ax, v1y = by - ay;
    const v2x = px - ax, v2y = py - ay;
    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;
    const inv = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * inv;
    const v = (dot00 * dot12 - dot01 * dot02) * inv;
    return u >= 0 && v >= 0 && u + v <= 1;
  }

  // 三角形をアンチエイリアス付きで塗る（簡易: 4xMSAA）
  for (let y = Math.floor(flapTopY) - 1; y <= Math.ceil(flapBottomY) + 1; y++) {
    for (let x = Math.floor(bodyX1) - 1; x <= Math.ceil(bodyX2) + 1; x++) {
      let hits = 0;
      const samples = [
        [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75],
      ];
      for (const [sx, sy] of samples) {
        if (
          pointInTriangle(
            x + sx, y + sy,
            bodyX1, flapTopY,
            bodyX2, flapTopY,
            bcx2, flapBottomY
          )
        ) hits++;
      }
      if (hits === 0) continue;
      const alpha = Math.round((hits / 4) * 255);
      // ボディの白を上書きするため alpha blend で紫を乗せる
      setPixel(rgba, size, x, y, 0x7c, 0x3a, 0xed, alpha);
    }
  }

  // (3) フラップの2本のエッジ (左→中央底, 右→中央底) を白いストロークで描いて
  //     封筒らしいラインを残す（紫の V の輪郭になる）
  const lineW = Math.max(2, Math.round(size * 0.012));
  drawLine(rgba, size, bodyX1, flapTopY, bcx2, flapBottomY, lineW, 255, 255, 255);
  drawLine(rgba, size, bodyX2, flapTopY, bcx2, flapBottomY, lineW, 255, 255, 255);

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
