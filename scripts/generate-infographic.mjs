// Script to generate the "Hoe werkt het?" infographic PNG
// Run from the project root: node scripts/generate-infographic.mjs
// Outputs to public/hoe-werkt-het.png

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')

const WIDTH = 2400
const HEIGHT = 1350

// Colors matching site theme
const BG = '#0f1018'
const CARD_BG = '#181b2e'
const CARD_BORDER = '#252a4a'
const BLUE = '#5b78f5'       // primary (oklch 0.65 0.25 265 ≈)
const BLUE_DIM = '#1e2a5e'   // card accent bg
const AMBER = '#e8a84c'      // accent2 (oklch 0.78 0.16 70 ≈)
const AMBER_DIM = '#3d2a0a'  // card accent bg amber
const WHITE = '#eef0ff'
const MUTED = '#7d84b0'
const ARROW_COLOR = '#3a3f6e'

// Step data
const steps = [
  {
    num: '01',
    title: 'Aanmelden',
    sub: 'Maak je account aan',
    accent: BLUE,
    accentDim: BLUE_DIM,
  },
  {
    num: '02',
    title: 'Administratie',
    sub: 'Vul je bedrijf &amp;\nklanten in',
    accent: BLUE,
    accentDim: BLUE_DIM,
  },
  {
    num: '03',
    title: 'Facturen &amp; Uren',
    sub: 'Maak facturen en\nregistreer uren',
    accent: AMBER,
    accentDim: AMBER_DIM,
  },
  {
    num: '04',
    title: 'BTW &amp; Overzicht',
    sub: 'Inzicht in omzet,\nkosten en BTW',
    accent: AMBER,
    accentDim: AMBER_DIM,
  },
  {
    num: '05',
    title: 'Samenwerken',
    sub: 'Deel met je boekhouder\n(optioneel)',
    accent: BLUE,
    accentDim: BLUE_DIM,
  },
]

// Icon SVG path groups (Lucide, 24×24 viewBox)
const icons = [
  // 01 - UserPlus
  `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
   <line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
   <line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,

  // 02 - Building2
  `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <line x1="10" y1="6" x2="14" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
   <line x1="10" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
   <line x1="10" y1="14" x2="14" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,

  // 03 - FileText + Clock (two mini icons using translate)
  `<g transform="translate(-5, 0)">
     <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
     <polyline points="14 2 14 8 20 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
     <line x1="8" y1="13" x2="13" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
     <line x1="8" y1="17" x2="11" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
   </g>
   <g transform="translate(8, 8) scale(0.6)">
     <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
     <polyline points="12 6 12 12 16 14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
   </g>`,

  // 04 - TrendingUp (chart-line)
  `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <polyline points="16 7 22 7 22 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,

  // 05 - Users (for Samenwerken)
  `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
   <path d="M23 21v-2a4 4 0 0 0-3-3.87" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
   <path d="M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
]

// Card dimensions
const CARD_W = 330
const CARD_H = 420
const CARD_RX = 20
const ARROW_W = 70
const TOTAL_W = 5 * CARD_W + 4 * ARROW_W
const CARDS_X0 = (WIDTH - TOTAL_W) / 2
const CARDS_Y = 330

// Helper: render one tspan per line
function multiline(text, x, y, lineH, fill, fontSize, anchor = 'middle') {
  const lines = text.split('\n')
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * lineH}" text-anchor="${anchor}" font-size="${fontSize}" fill="${fill}" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">${l}</text>`,
    )
    .join('\n')
}

function renderCard(step, index) {
  const cx = CARDS_X0 + index * (CARD_W + ARROW_W)
  const cy = CARDS_Y

  const iconScale = 2.8
  const iconSize = 24 * iconScale
  const iconX = cx + CARD_W / 2 - iconSize / 2
  const iconY = cy + 140

  const numBadgeX = cx + CARD_W / 2
  const numBadgeY = cy + 58

  const titleY = cy + 280
  const subY = cy + 320

  return `
    <!-- Card ${index + 1} -->
    <rect x="${cx}" y="${cy}" width="${CARD_W}" height="${CARD_H}" rx="${CARD_RX}" 
      fill="${CARD_BG}" stroke="${CARD_BORDER}" stroke-width="1.5"/>
    
    <!-- Top accent bar -->
    <rect x="${cx}" y="${cy}" width="${CARD_W}" height="5" rx="${CARD_RX}" fill="${step.accent}"/>
    <rect x="${cx}" y="${cy + 5}" width="${CARD_W}" height="5" rx="0" fill="${step.accent}"/>

    <!-- Step number badge -->
    <circle cx="${numBadgeX}" cy="${numBadgeY}" r="28" fill="${step.accentDim}" stroke="${step.accent}" stroke-width="1.5"/>
    <text x="${numBadgeX}" y="${numBadgeY + 8}" text-anchor="middle" 
      font-size="22" font-weight="700" fill="${step.accent}"
      font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">${step.num}</text>

    <!-- Icon circle -->
    <circle cx="${cx + CARD_W / 2}" cy="${iconY + iconSize / 2}" r="${iconSize * 0.78}" fill="${step.accentDim}"/>
    
    <!-- Icon -->
    <g transform="translate(${iconX}, ${iconY}) scale(${iconScale})" color="${step.accent}">
      ${icons[index]}
    </g>

    <!-- Title -->
    <text x="${cx + CARD_W / 2}" y="${titleY}" text-anchor="middle"
      font-size="28" font-weight="700" fill="${WHITE}"
      font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">${step.title}</text>

    <!-- Subline (multiline) -->
    ${multiline(step.sub, cx + CARD_W / 2, subY, 34, MUTED, 22)}
  `
}

function renderArrow(index) {
  const x = CARDS_X0 + (index + 1) * CARD_W + index * ARROW_W
  const cy = CARDS_Y + CARD_H / 2
  const x2 = x + ARROW_W

  return `
    <!-- Arrow ${index + 1} -->
    <line x1="${x + 8}" y1="${cy}" x2="${x2 - 8}" y2="${cy}" 
      stroke="${ARROW_COLOR}" stroke-width="2" stroke-dasharray="6,4"/>
    <polygon points="${x2 - 6},${cy - 7} ${x2 + 2},${cy} ${x2 - 6},${cy + 7}" fill="${ARROW_COLOR}"/>
  `
}

const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  
  <!-- Subtle gradient overlay at top -->
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="60%">
      <stop offset="0%" stop-color="${BLUE}" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

  <!-- Section label -->
  <text x="${WIDTH / 2}" y="90" text-anchor="middle"
    font-size="22" font-weight="600" fill="${BLUE}" letter-spacing="4"
    font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">HOE WERKT HET?</text>

  <!-- Main title -->
  <text x="${WIDTH / 2}" y="175" text-anchor="middle"
    font-size="76" font-weight="800" fill="${WHITE}"
    font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">In 5 stappen aan de slag</text>

  <!-- Subtitle -->
  <text x="${WIDTH / 2}" y="240" text-anchor="middle"
    font-size="32" fill="${MUTED}"
    font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">Vanaf aanmelden tot samenwerken met je boekhouder.</text>

  <!-- Cards -->
  ${steps.map((s, i) => renderCard(s, i)).join('\n')}

  <!-- Arrows between cards -->
  ${[0, 1, 2, 3].map(i => renderArrow(i)).join('\n')}

  <!-- Bottom tagline -->
  <text x="${WIDTH / 2}" y="${CARDS_Y + CARD_H + 80}" text-anchor="middle"
    font-size="26" fill="${MUTED}"
    font-family="'Inter', 'Helvetica Neue', Arial, sans-serif">30 dagen gratis — geen creditcard vereist</text>
    
  <!-- Accent dots decoration -->
  <circle cx="${CARDS_X0 - 40}" cy="${CARDS_Y + CARD_H / 2}" r="4" fill="${BLUE}" opacity="0.4"/>
  <circle cx="${CARDS_X0 + TOTAL_W + 40}" cy="${CARDS_Y + CARD_H / 2}" r="4" fill="${BLUE}" opacity="0.4"/>
</svg>`

// Write SVG for inspection
writeFileSync('/tmp/hoe-werkt-het.svg', svgContent, 'utf8')
console.log('SVG written to /tmp/hoe-werkt-het.svg')

// Convert to PNG using sharp
const outputPath = resolve(PROJECT_ROOT, 'public', 'hoe-werkt-het.png')
mkdirSync(resolve(PROJECT_ROOT, 'public'), { recursive: true })

await sharp(Buffer.from(svgContent))
  .png({ compressionLevel: 9 })
  .toFile(outputPath)

console.log(`PNG written to ${outputPath}`)
