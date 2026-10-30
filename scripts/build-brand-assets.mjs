// Keep install icons derived from the canonical vector; no duplicate binary sources.
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
const vector = await readFile(new URL('../public/icon.svg', import.meta.url))
const output = new URL('../dist/', import.meta.url)
for (const size of [192, 512]) {
  await sharp(vector).resize(size, size).png().toFile(new URL(`icon-${size}x${size}.png`, output).pathname)
  const safeSize = Math.round(size * 0.75)
  const mark = await sharp(vector).resize(safeSize, safeSize).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: '#245c4e' } })
    .composite([{ input: mark, gravity: 'centre' }]).png()
    .toFile(new URL(`icon-${size}x${size}-maskable.png`, output).pathname)
}
const png = await sharp(vector).resize(32, 32).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header[6] = 32
header[7] = 32
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14)
header.writeUInt32LE(22, 18)
await writeFile(new URL('favicon.ico', output), Buffer.concat([header, png]))
console.log('ZZPers Hub install icons generated from public/icon.svg')
