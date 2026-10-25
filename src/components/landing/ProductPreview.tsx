import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  FileText,
  LayoutDashboard,
  Receipt,
  Users,
  Clock3,
} from 'lucide-react'

export type PreviewTab = 'invoices' | 'expenses' | 'hours'

export function DashboardPreview() {
  return (
    <figure
      className="lp-dashboard"
      aria-label="Voorbeeld van een administratie met fictieve bedragen"
    >
      <div className="lp-browser-bar">
        <span className="lp-browser-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Jouw werkplek</span>
        <span className="lp-example-label">Voorbeeld</span>
      </div>
      <div className="lp-dashboard-body">
        <div className="lp-preview-sidebar" aria-hidden="true">
          <span className="lp-mini-brand">
            z<span>.</span>
          </span>
          <LayoutDashboard />
          <FileText />
          <Receipt />
          <Clock3 />
          <Users />
          <span className="lp-sidebar-avatar">JD</span>
        </div>
        <div className="lp-dashboard-content">
          <div className="lp-preview-heading">
            <div>
              <span className="lp-preview-overline">MIJN ADMINISTRATIE</span>
              <h3>Goed overzicht. Lekker werken.</h3>
            </div>
            <span className="lp-period">Dit kwartaal</span>
          </div>
          <div className="lp-metrics">
            <div>
              <span>Omzet excl. btw</span>
              <strong>
                € 8.450<span>,00</span>
              </strong>
              <small>
                <ArrowUpRight size={12} /> Gefactureerd
              </small>
            </div>
            <div>
              <span>Openstaand incl. btw</span>
              <strong>
                € 1.512<span>,50</span>
              </strong>
              <small className="lp-muted">1 factuur te ontvangen</small>
            </div>
          </div>
          <div className="lp-chart-header">
            <strong>Omzet per maand</strong>
            <span>Excl. btw</span>
          </div>
          <div
            className="lp-chart"
            role="img"
            aria-label="Voorbeeldomzet: januari 2.000 euro, februari 2.750 euro, maart 3.700 euro"
          >
            <div>
              <span style={{ height: '54%' }} />
              <small>Jan</small>
            </div>
            <div>
              <span style={{ height: '74%' }} />
              <small>Feb</small>
            </div>
            <div>
              <span style={{ height: '100%' }} />
              <small>Mrt</small>
            </div>
          </div>
          <div className="lp-invoice-row">
            <span className="lp-file-icon">
              <FileText size={18} />
            </span>
            <div>
              <strong>Studio Noord</strong>
              <small>Factuur 2026-014</small>
            </div>
            <span className="lp-status">Verzonden</span>
            <strong>€ 1.512,50</strong>
          </div>
        </div>
      </div>
      <figcaption>Illustratie met voorbeeldgegevens</figcaption>
    </figure>
  )
}

export function ProductPreview({ tab }: { tab: PreviewTab }) {
  if (tab === 'expenses')
    return (
      <div className="lp-detail-preview lp-expense-preview">
        <div className="lp-preview-heading">
          <h3>Uitgaven</h3>
          <span className="lp-example-label">Voorbeeld</span>
        </div>
        <div className="lp-receipt">
          <Receipt size={26} />
          <strong>Kantoorbenodigdheden</strong>
          <span>12 maart 2026</span>
          <dl>
            <div>
              <dt>Excl. btw</dt>
              <dd>€ 80,00</dd>
            </div>
            <div>
              <dt>Btw 21%</dt>
              <dd>€ 16,80</dd>
            </div>
            <div>
              <dt>Totaal</dt>
              <dd>€ 96,80</dd>
            </div>
          </dl>
          <span className="lp-receipt-saved">
            <Check size={14} /> Bonnetje bij de uitgave
          </span>
        </div>
        <p className="lp-preview-note">
          <ArrowDownLeft size={16} /> Bedrag, categorie en bijlage bij elkaar.
        </p>
      </div>
    )
  if (tab === 'hours')
    return (
      <div className="lp-detail-preview lp-hours-preview">
        <div className="lp-preview-heading">
          <h3>Urenregistratie</h3>
          <span className="lp-example-label">Voorbeeld</span>
        </div>
        <div className="lp-hours-total">
          <span>Deze week</span>
          <strong>
            24<span> uur</span>
          </strong>
          <small>Opdracht · Studio Noord</small>
        </div>
        <div
          className="lp-week"
          aria-label="Maandag 6 uur, dinsdag 8 uur, woensdag 4 uur, donderdag 6 uur, vrijdag 0 uur"
        >
          {[
            ['Ma', 6],
            ['Di', 8],
            ['Wo', 4],
            ['Do', 6],
            ['Vr', 0],
          ].map(([day, hours]) => (
            <div key={day}>
              <span style={{ height: `${Number(hours) * 12 + 4}px` }} />
              <small>{day}</small>
              <strong>{hours} u</strong>
            </div>
          ))}
        </div>
        <p className="lp-preview-note">
          <Clock3 size={16} /> Van gewerkte uren naar een factuur.
        </p>
      </div>
    )
  return (
    <div className="lp-detail-preview lp-invoice-preview">
      <div className="lp-preview-heading">
        <span className="lp-invoice-brand">
          Jouw bedrijf<span>.</span>
        </span>
        <span className="lp-example-label">Voorbeeld</span>
      </div>
      <div className="lp-document-title">
        <h3>Factuur</h3>
        <span>2026-014</span>
      </div>
      <div className="lp-document-meta">
        <div>
          <small>FACTUUR AAN</small>
          <strong>Studio Noord</strong>
          <span>Amsterdam</span>
        </div>
        <div>
          <small>FACTUURDATUM</small>
          <span>12 maart 2026</span>
        </div>
      </div>
      <div className="lp-document-line">
        <span>
          Ontwerp & advies<small>20 uur × € 62,50</small>
        </span>
        <strong>€ 1.250,00</strong>
      </div>
      <dl className="lp-document-totals">
        <div>
          <dt>Subtotaal</dt>
          <dd>€ 1.250,00</dd>
        </div>
        <div>
          <dt>Btw 21%</dt>
          <dd>€ 262,50</dd>
        </div>
        <div>
          <dt>Totaal te betalen</dt>
          <dd>€ 1.512,50</dd>
        </div>
      </dl>
      <p className="lp-document-footer">
        Helder voor je klant. Netjes voor je administratie.
      </p>
    </div>
  )
}
