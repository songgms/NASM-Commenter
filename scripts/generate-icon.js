#!/usr/bin/env node
/**
 * 生成扩展图标 assets/icon.png（128×128）。
 * 零依赖：手写最小 PNG 编码器（zlib + CRC32），signed-distance 抗锯齿绘制。
 * 设计：暗色圆角底 + 绿色分号「;」符号（汇编注释符）。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 128

// ---------- PNG 编码 ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // 原始像素：每行前置 filter 字节 0
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 绘制 ----------

/** 圆的覆盖度（1px 羽化抗锯齿）。 */
function circleCoverage(px, py, cx, cy, r) {
  const d = Math.hypot(px - cx, py - cy)
  return Math.max(0, Math.min(1, r - d + 0.5))
}

/** 圆角矩形的覆盖度。 */
function roundedRectCoverage(px, py, x0, y0, x1, y1, radius) {
  if (px < x0 - 0.5 || px > x1 + 0.5 || py < y0 - 0.5 || py > y1 + 0.5) {
    return 0
  }
  const cx = Math.max(x0 + radius, Math.min(px, x1 - radius))
  const cy = Math.max(y0 + radius, Math.min(py, y1 - radius))
  const inside = px >= x0 && px <= x1 && py >= y0 && py <= y1
  if (inside && (cx === px || cy === py)) {
    return 1
  }
  const d = Math.hypot(px - cx, py - cy)
  return Math.max(0, Math.min(1, radius - d + 0.5))
}

function drawIcon() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const bg = [43, 43, 58] // #2b2b3a 暗色
  const green = [74, 222, 128] // #4ade80
  const dim = [86, 88, 110]

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let r = 0
      let g = 0
      let b = 0

      // 背景：圆角矩形铺满画布（边缘留 2px 透明）
      const bgCov = roundedRectCoverage(px, py, 2, 2, SIZE - 2, SIZE - 2, 26)
      r = bg[0] * bgCov
      g = bg[1] * bgCov
      b = bg[2] * bgCov
      let alpha = bgCov

      // 装饰：两条暗色「代码行」短条
      const bar1 = roundedRectCoverage(px, py, 22, 30, 58, 38, 4)
      const bar2 = roundedRectCoverage(px, py, 22, 88, 58, 96, 4)
      for (const cov of [bar1, bar2]) {
        if (cov > 0) {
          r = r * (1 - cov) + dim[0] * cov
          g = g * (1 - cov) + dim[1] * cov
          b = b * (1 - cov) + dim[2] * cov
          alpha = Math.max(alpha, cov)
        }
      }

      // 分号符号：上点 + 逗号式尾巴（贝塞尔：右凸 → 左下勾，半径递减）
      const dot = circleCoverage(px, py, 72, 35, 9)
      let tail = 0
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const u = 1 - t
        const cx = u * u * 72 + 2 * u * t * 86 + t * t * 60
        const cy = u * u * 53 + 2 * u * t * 76 + t * t * 92
        const rr = 8.5 - 5 * t
        tail = Math.max(tail, circleCoverage(px, py, cx, cy, rr))
      }
      const glyph = Math.max(dot, tail)
      if (glyph > 0) {
        r = r * (1 - glyph) + green[0] * glyph
        g = g * (1 - glyph) + green[1] * glyph
        b = b * (1 - glyph) + green[2] * glyph
        alpha = Math.max(alpha, glyph)
      }

      const i = (y * SIZE + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(alpha * 255)
    }
  }
  return encodePng(SIZE, SIZE, rgba)
}

// ---------- 校验并写出 ----------

const outPath = path.join(__dirname, '..', 'assets', 'icon.png')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
const png = drawIcon()
fs.writeFileSync(outPath, png)

// 自校验：签名 + IHDR 尺寸 + IDAT 可解压且长度正确
const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
if (!png.subarray(0, 8).equals(sig)) {
  throw new Error('PNG 签名错误')
}
const w = png.readUInt32BE(16)
const h = png.readUInt32BE(20)
let idatTotal = 0
let offset = 8
while (offset < png.length) {
  const len = png.readUInt32BE(offset)
  const type = png.toString('ascii', offset + 4, offset + 8)
  if (type === 'IDAT') {
    idatTotal += len
  }
  offset += 12 + len
}
const idatBuffers = []
offset = 8
while (offset < png.length) {
  const len = png.readUInt32BE(offset)
  const type = png.toString('ascii', offset + 4, offset + 8)
  if (type === 'IDAT') {
    idatBuffers.push(png.subarray(offset + 8, offset + 8 + len))
  }
  offset += 12 + len
}
const raw = zlib.inflateSync(Buffer.concat(idatBuffers))
if (raw.length !== h * (w * 4 + 1)) {
  throw new Error(`解压长度不符: ${raw.length}`)
}
console.log(`图标已生成: ${outPath} (${w}x${h}, ${png.length} bytes, 校验通过)`)
