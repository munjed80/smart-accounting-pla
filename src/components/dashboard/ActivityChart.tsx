import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { MonthlyInvoiceSummary } from '@/lib/api'
import { OverviewLink } from './OverviewLink'

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  )
export const monthLabel = (key: string) =>
  new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(
    new Date(`${key}-01T12:00:00`),
  )
export function invoiceMonthRoute(key: string) {
  const [year, month] = key.split('-').map(Number)
  const last = new Date(year, month, 0).getDate()
  return `/zzp/invoices?from=${key}-01&to=${key}-${last}`
}

export function ActivityChart({
  months,
  onReceipts,
}: {
  months: MonthlyInvoiceSummary[]
  onReceipts: (month: string) => void
}) {
  const [chosen, setChosen] = useState<string | null>(null)
  const current =
    months.find((month) => month.month_key === chosen) ||
    months[months.length - 1]
  const maximum = Math.max(
    1,
    ...months.flatMap((month) => [month.sent_total, month.received_total || 0]),
  )
  if (!current)
    return <p className="ov-empty">Nog geen maandoverzicht beschikbaar.</p>
  return (
    <>
      <div className="ov-chart-inspector" aria-live="polite">
        <span>{monthLabel(current.month_key)}</span>
        <div>
          <span>
            <i className="ov-legend-billed" /> Gefactureerd{' '}
            <strong>{formatMoney(current.sent_total)}</strong>
          </span>
          <button onClick={() => onReceipts(current.month_key)}>
            <i className="ov-legend-received" /> Ontvangen{' '}
            <strong>{formatMoney(current.received_total || 0)}</strong>
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      <div
        className="ov-chart"
        role="group"
        aria-label="Gefactureerde bedragen en ontvangsten per maand, inclusief btw"
      >
        {months.map((month) => (
          <button
            key={month.month_key}
            className={
              current.month_key === month.month_key ? 'is-selected' : ''
            }
            onClick={() => setChosen(month.month_key)}
            onFocus={() => setChosen(month.month_key)}
            aria-label={`${monthLabel(month.month_key)}: gefactureerd ${formatMoney(month.sent_total)}, ontvangen ${formatMoney(month.received_total || 0)}`}
            aria-pressed={current.month_key === month.month_key}
          >
            <span className="ov-chart-columns" aria-hidden="true">
              <span
                className="ov-bar-billed"
                style={{ height: `${(month.sent_total / maximum) * 100}%` }}
              />
              <span
                className="ov-bar-received"
                style={{
                  height: `${((month.received_total || 0) / maximum) * 100}%`,
                }}
              />
            </span>
            <span className="ov-chart-month">
              {new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(
                new Date(`${month.month_key}-01T12:00:00`),
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="ov-chart-footer">
        <p>Facturen op factuurdatum. Ontvangsten op betaaldatum.</p>
        <OverviewLink href={invoiceMonthRoute(current.month_key)}>
          Facturen bekijken <ArrowUpRight size={14} />
        </OverviewLink>
      </div>
      <details className="ov-chart-data">
        <summary>Bedragen per maand bekijken</summary>
        <div className="ov-table-scroll">
          <table>
            <caption className="sr-only">Maandbedragen inclusief btw</caption>
            <thead>
              <tr>
                <th>Maand</th>
                <th>Gefactureerd</th>
                <th>Ontvangen</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month_key}>
                  <th scope="row">{monthLabel(month.month_key)}</th>
                  <td>
                    <OverviewLink href={invoiceMonthRoute(month.month_key)}>
                      {formatMoney(month.sent_total)}
                    </OverviewLink>
                  </td>
                  <td>
                    <button onClick={() => onReceipts(month.month_key)}>
                      {formatMoney(month.received_total || 0)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}
