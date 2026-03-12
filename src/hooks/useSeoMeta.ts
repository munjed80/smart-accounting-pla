import { useEffect } from 'react'

interface SeoMetaOptions {
  title: string
  description: string
  canonical: string
}

/**
 * Hook that updates document title, meta description, and canonical link per page.
 * Call this at the top of every public-facing page component.
 */
export function useSeoMeta({ title, description, canonical }: SeoMetaOptions) {
  useEffect(() => {
    // Title
    document.title = title

    // Meta description
    let descTag = document.querySelector('meta[name="description"]')
    if (!descTag) {
      descTag = document.createElement('meta')
      descTag.setAttribute('name', 'description')
      document.head.appendChild(descTag)
    }
    descTag.setAttribute('content', description)

    // Canonical link
    let canonicalTag = document.querySelector('link[rel="canonical"]')
    if (!canonicalTag) {
      canonicalTag = document.createElement('link')
      canonicalTag.setAttribute('rel', 'canonical')
      document.head.appendChild(canonicalTag)
    }
    canonicalTag.setAttribute('href', canonical)
  }, [title, description, canonical])
}
