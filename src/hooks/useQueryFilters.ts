import { useCallback, useEffect, useMemo, useState } from 'react'

type Primitive = string | number | boolean
export type QueryFilterRecord = Record<string, Primitive>

const parseValue = (raw: string, defaultValue: Primitive): Primitive => {
  if (typeof defaultValue === 'number') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : defaultValue
  }
  if (typeof defaultValue === 'boolean') {
    return raw === 'true'
  }
  return raw
}

const parseFiltersFromUrl = <T extends QueryFilterRecord>(defaults: T): T => {
  const params = new URLSearchParams(window.location.search)
  const next = { ...defaults }

  Object.entries(defaults).forEach(([key, defaultValue]) => {
    const value = params.get(key)
    if (value !== null) {
      ;(next as Record<string, Primitive>)[key] = parseValue(value, defaultValue)
    }
  })

  return next
}

export const useQueryFilters = <T extends QueryFilterRecord>(defaults: T) => {
  const [filters, setFilters] = useState<T>(() => parseFiltersFromUrl(defaults))

  const reset = useCallback(() => {
    setFilters(defaults)
  }, [defaults])

  const setFilter = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toQueryString = useCallback(
    (value: T = filters) => {
      const params = new URLSearchParams()
      Object.entries(value).forEach(([key, current]) => {
        const defaultValue = defaults[key as keyof T]
        if (current === '' || current === defaultValue) {
          return
        }
        params.set(key, String(current))
      })
      const query = params.toString()
      return query ? `?${query}` : ''
    },
    [defaults, filters],
  )

  useEffect(() => {
    const query = toQueryString(filters)
    const nextUrl = `${window.location.pathname}${query}`
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState({}, '', nextUrl)
    }
  }, [filters, toQueryString])

  useEffect(() => {
    const handlePopState = () => {
      setFilters(parseFiltersFromUrl(defaults))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [defaults])

  return useMemo(
    () => ({
      filters,
      setFilter,
      reset,
      toQueryString,
    }),
    [filters, reset, setFilter, toQueryString],
  )
}
