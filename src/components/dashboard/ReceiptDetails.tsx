import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ServerPagination } from '@/components/ServerPagination'
import { useServerPagination } from '@/hooks/useServerPagination'
import { zzpApi, getErrorMessage } from '@/lib/api'
import { OverviewLink } from './OverviewLink'
import { formatMoney, monthLabel } from './ActivityChart'

export function ReceiptDetails({
  month,
  userId,
  administrationId,
  onClose,
}: {
  month: string | null
  userId?: string
  administrationId?: string
  onClose: () => void
}) {
  const pagination = useServerPagination(
    `${userId}:${administrationId}:${month}`,
    20,
  )
  const query = useQuery({
    queryKey: [
      'zzp-dashboard-receipts',
      userId,
      administrationId,
      month,
      pagination.page,
    ],
    queryFn: async () => {
      const [year, selectedMonth] = month!.split('-').map(Number)
      const result = await zzpApi.dashboard.receipts(
        year,
        selectedMonth,
        pagination.pageSize,
        pagination.offset,
      )
      if (result.administration_id !== administrationId)
        throw new Error(
          'Je administratie is gewijzigd. Vernieuw het overzicht.',
        )
      return result
    },
    enabled: !!month && !!userId && !!administrationId,
    retry: 1,
    staleTime: 0,
  })
  return (
    <Dialog
      open={!!month}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Ontvangsten · {month ? monthLabel(month) : ''}
          </DialogTitle>
          <DialogDescription>
            Geregistreerde betalingen op betaaldatum, inclusief btw. Dit is geen
            live banksaldo.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <p role="status">Ontvangsten laden…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{getErrorMessage(query.error)}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Opnieuw proberen
            </Button>
          </div>
        ) : (
          query.data && (
            <>
              <p className="text-lg font-semibold">
                {formatMoney(query.data.total_amount_cents)}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  · {query.data.total} ontvangsten
                </span>
              </p>
              <ServerPagination
                {...pagination}
                total={query.data.total}
                loading={query.isFetching}
              />
              {query.data.receipts.length === 0 ? (
                <p>Geen ontvangsten in deze maand geregistreerd.</p>
              ) : (
                <ul className="ov-receipt-list">
                  {query.data.receipts.map((receipt) => (
                    <li key={`${receipt.source}:${receipt.id}`}>
                      <div>
                        <strong>{receipt.reference || 'Betaling'}</strong>
                        <small>
                          {new Intl.DateTimeFormat('nl-NL', {
                            day: 'numeric',
                            month: 'short',
                          }).format(
                            new Date(`${receipt.payment_date}T12:00:00`),
                          )}
                        </small>
                        {receipt.invoices.length ? (
                          receipt.invoices.map((invoice) => (
                            <OverviewLink
                              key={invoice.id}
                              href={`/zzp/invoices/${invoice.id}`}
                            >
                              {invoice.invoice_number}
                              <ArrowUpRight size={12} />
                            </OverviewLink>
                          ))
                        ) : (
                          <small>Nog niet aan een factuur gekoppeld</small>
                        )}
                      </div>
                      <strong>{formatMoney(receipt.amount_cents)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
