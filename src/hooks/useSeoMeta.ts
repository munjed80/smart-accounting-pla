import { useEffect } from 'react'

interface SeoMetaOptions {
  title: string
  description: string
  canonical: string
  image?: string
  robots?: string
  type?: string
}

const upsertMeta = (selector: string, attributes: Record<string, string>) => {
  let tag = document.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    document.head.appendChild(tag)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    tag.setAttribute(key, value)
  })
}

/**
 * Hook that updates SEO metadata per public-facing page.
 * Keeps the rendered SPA document aligned with the initial index.html tags.
 */
export function useSeoMeta({
  title,
  description,
  canonical,
  image = 'https://zzpershub.nl/social/zzpershub-preview-v2.png',
  robots = 'index, follow',
  type = 'website',
}: SeoMetaOptions) {
  useEffect(() => {
    document.documentElement.setAttribute('lang', 'nl')
    document.title = title

    upsertMeta('meta[name="description"]', { name: 'description', content: description })
    upsertMeta('meta[name="robots"]', { name: 'robots', content: robots })

    let canonicalTag = document.querySelector('link[rel="canonical"]')
    if (!canonicalTag) {
      canonicalTag = document.createElement('link')
      canonicalTag.setAttribute('rel', 'canonical')
      document.head.appendChild(canonicalTag)
    }
    canonicalTag.setAttribute('href', canonical)

    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image })
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'nl_NL' })
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'ZZPers Hub' })

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image })
  }, [title, description, canonical, image, robots, type])
}
