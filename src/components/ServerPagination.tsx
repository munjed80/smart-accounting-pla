import { Button } from './ui/button'
export function ServerPagination({ page, pageSize, total, setPage, loading }: {
  page: number; pageSize: number; total: number; setPage: (page: number) => void; loading: boolean
}) {
  if (total <= pageSize && page === 1) return null
  return <nav aria-label="Paginering" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border p-3">
    <span className="text-sm text-muted-foreground">{total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} van {total}</span>
    <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Vorige pagina</Button><Button variant="outline" size="sm" disabled={loading || page * pageSize >= total} onClick={() => setPage(page + 1)}>Volgende pagina</Button></div>
  </nav>
}
