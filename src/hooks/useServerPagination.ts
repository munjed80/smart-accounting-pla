import { useState, useRef, useEffect, useCallback } from 'react'

export function useServerPagination(key: string, pageSize = 50) {
  const [position, setPosition] = useState({ key, page: 1 })
  const [total, setTotal] = useState(0)
  const page = position.key === key ? position.page : 1
  const version = useRef(0)
  useEffect(() => () => { version.current += 1 }, [key, page])
  const beginRequest = useCallback(() => {
    const request = ++version.current
    return () => request === version.current
  }, [])
  return { beginRequest, page, pageSize, offset: (page - 1) * pageSize, total, setTotal,
    setPage: (page: number) => setPosition({ key, page: Math.max(1, page) }) }
}
