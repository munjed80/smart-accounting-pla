import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

export async function buildSocialPreview(output) {
  const vector = await readFile(new URL('../src/assets/brand/social-preview.svg', import.meta.url))
  const png = await sharp(vector).resize(1200, 630).png().toBuffer()
  const social = new URL('social/', output)
  await mkdir(social, { recursive: true })
  await writeFile(new URL('zzpershub-preview-v2.png', social), png)
  // Keep the legacy URL useful when old previews are eventually fetched again.
  await writeFile(new URL('og-image.png', output), png)
}
