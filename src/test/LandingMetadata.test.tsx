import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '@/pages/LandingPage'
import html from '../../index.html?raw'

const parse = (markup: string) =>
  new DOMParser().parseFromString(markup, 'text/html')

describe('homepage content and search fallback', () => {
  it('keeps visible FAQ answers consistent with structured search data', () => {
    const document = parse(html)
    const schema = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    )
      .map((script) => JSON.parse(script.textContent!))
      .find((item) => item['@type'] === 'FAQPage')
    const page = parse(renderToStaticMarkup(<LandingPage />))
    const questions = Array.from(page.querySelectorAll('details'))
    expect(questions).toHaveLength(schema.mainEntity.length)
    questions.forEach((detail, index) => {
      expect(detail.querySelector('summary')?.textContent).toBe(
        schema.mainEntity[index].name,
      )
      expect(detail.querySelector('p')?.textContent).toBe(
        schema.mainEntity[index].acceptedAnswer.text,
      )
    })
  })

  it('preserves the main heading and useful destinations without JavaScript', () => {
    const fallback = parse(html)
    const page = parse(renderToStaticMarkup(<LandingPage />))
    expect(fallback.querySelector('h1')?.textContent).toBe(
      page.querySelector('h1')?.textContent,
    )
    expect(page.querySelectorAll('h1')).toHaveLength(1)
    for (const path of [
      '/register',
      '/login',
      '/prijzen',
      '/contact',
      '/privacy',
      '/cookies',
      '/terms',
    ]) {
      expect(fallback.querySelector(`a[href="${path}"]`)).not.toBeNull()
      expect(page.querySelector(`a[href="${path}"]`)).not.toBeNull()
    }
    expect(page.querySelectorAll('img')).toHaveLength(0)
  })
})
