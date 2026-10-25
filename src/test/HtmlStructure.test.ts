import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import entry from '../main.tsx?raw'

describe('HTML bootstrap structure', () => {
  it('keeps style elements in head and element IDs unique', () => {
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(document.querySelectorAll('body style')).toHaveLength(0)
    expect(document.querySelectorAll('head style')).toHaveLength(1)
    const ids = Array.from(document.querySelectorAll('[id]'), element => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(document.querySelector('#root > main#seo-fallback')).not.toBeNull()
  })
  it('preserves parseable structured data and a single application/CSS entry', () => {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const metadata = document.querySelectorAll('script[type="application/ld+json"]')
    expect(metadata.length).toBeGreaterThan(0)
    for (const script of metadata) expect(() => JSON.parse(script.textContent || '')).not.toThrow()
    expect(document.querySelectorAll('script[type="module"][src="/src/main.tsx"]')).toHaveLength(1)
    expect(document.querySelector('link[href="/src/main.css"]')).toBeNull()
    expect(entry.match(/import ['"]\.\/main\.css['"]/g)).toHaveLength(1)
  })
})
