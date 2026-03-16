import { FileText, Users, Clock, Receipt, TrendingUp, ArrowRight } from 'lucide-react'
import { navigateTo } from '@/lib/navigation'

/**
 * ProductShowcaseSection — premium product gallery / showcase
 * Replaces the FAQ section on the landing page.
 * Shows 5 core use cases with inline product-frame mockups and Dutch copy.
 * Alternating layout (mockup left / right) on desktop, stacked on mobile.
 */

interface ShowcaseItem {
  id: string
  icon: React.ElementType
  title: string
  tagline: string
  description: string
  /** Full oklch color for text/icons */
  accent: string
  /** Diluted background version (with alpha) */
  accentBg: string
  /** Border version (with alpha) */
  accentBorder: string
  /** Glow for ambient effect */
  accentGlow: string
  mockup: React.ReactNode
}

// ─── Micro mockup helpers ──────────────────────────────────────────────────────

function MockupShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-full rounded-xl overflow-hidden select-none"
      style={{
        background: 'oklch(0.10 0.012 260)',
        border: '1.5px solid oklch(0.22 0.03 260)',
        boxShadow:
          '0 0 0 1px oklch(0.30 0.05 260 / 0.3), 0 16px 48px oklch(0 0 0 / 0.55)',
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-1.5 px-3 py-2.5"
        style={{ borderBottom: '1px solid oklch(0.18 0.025 260)', background: 'oklch(0.12 0.015 260)' }}
      >
        {['#ff5f56', '#ffbd2e', '#27c93f'].map((c) => (
          <div key={c} className="rounded-full" style={{ width: 8, height: 8, background: c }} />
        ))}
      </div>
      {children}
    </div>
  )
}

// Facturen mockup
function FacturenMockup() {
  return (
    <MockupShell>
      <div className="p-3 space-y-2">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: 'oklch(0.75 0.02 260)' }}>
            Facturen
          </span>
          <div
            className="rounded-md px-2 py-0.5 text-[9px] font-bold"
            style={{ background: 'oklch(0.65 0.25 265)', color: 'white' }}
          >
            + Nieuwe factuur
          </div>
        </div>
        {/* Rows */}
        {[
          { client: 'De Vries B.V.', nr: '#2024-047', amount: '€ 1.250,00', status: 'Betaald', paid: true },
          { client: 'Bakker & Zn', nr: '#2024-046', amount: '€ 875,50', status: 'Verzonden', paid: false },
          { client: 'Studio Noord', nr: '#2024-045', amount: '€ 490,00', status: 'Concept', paid: false },
        ].map((r) => (
          <div
            key={r.nr}
            className="flex items-center justify-between rounded-lg px-2.5 py-2"
            style={{ background: 'oklch(0.13 0.015 260)' }}
          >
            <div>
              <p className="text-[10px] font-semibold" style={{ color: 'oklch(0.80 0.02 260)' }}>{r.client}</p>
              <p className="text-[8.5px]" style={{ color: 'oklch(0.45 0.01 260)' }}>{r.nr}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold" style={{ color: r.paid ? 'oklch(0.72 0.18 150)' : 'oklch(0.65 0.02 260)' }}>{r.amount}</p>
              <p
                className="text-[8.5px]"
                style={{
                  color: r.paid
                    ? 'oklch(0.60 0.14 150)'
                    : r.status === 'Verzonden'
                    ? 'oklch(0.62 0.15 200)'
                    : 'oklch(0.45 0.01 260)',
                }}
              >
                {r.status}
              </p>
            </div>
          </div>
        ))}
        {/* Summary bar */}
        <div
          className="flex items-center justify-around rounded-lg py-2"
          style={{ background: 'oklch(0.12 0.012 260)', border: '1px solid oklch(0.20 0.025 260)' }}
        >
          <div className="text-center">
            <p className="text-[10px] font-bold" style={{ color: 'oklch(0.72 0.18 150)' }}>€ 4.715</p>
            <p className="text-[8px]" style={{ color: 'oklch(0.45 0.01 260)' }}>ontvangen</p>
          </div>
          <div style={{ width: 1, height: 24, background: 'oklch(0.22 0.02 260)' }} />
          <div className="text-center">
            <p className="text-[10px] font-bold" style={{ color: 'oklch(0.65 0.25 265)' }}>2 open</p>
            <p className="text-[8px]" style={{ color: 'oklch(0.45 0.01 260)' }}>facturen</p>
          </div>
        </div>
      </div>
    </MockupShell>
  )
}

// Klanten mockup
function KlantenMockup() {
  return (
    <MockupShell>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: 'oklch(0.75 0.02 260)' }}>
            Klanten
          </span>
          <div className="text-[9px] rounded-full px-2 py-0.5" style={{ background: 'oklch(0.16 0.02 260)', color: 'oklch(0.55 0.01 260)' }}>
            12 klanten
          </div>
        </div>
        {[
          { name: 'De Vries B.V.', contact: 'info@devries.nl', invoices: 6 },
          { name: 'Bakker & Zn', contact: 'bakker@zn.nl', invoices: 4 },
          { name: 'Hofman ICT', contact: 'info@hofmanict.nl', invoices: 9 },
        ].map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-lg px-2.5 py-2"
            style={{ background: 'oklch(0.13 0.015 260)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                style={{ width: 24, height: 24, background: 'oklch(0.65 0.25 265 / 0.2)', color: 'oklch(0.72 0.20 265)' }}
              >
                {c.name.charAt(0)}
              </div>
              <div>
                <p className="text-[10px] font-semibold" style={{ color: 'oklch(0.80 0.02 260)' }}>{c.name}</p>
                <p className="text-[8.5px]" style={{ color: 'oklch(0.45 0.01 260)' }}>{c.contact}</p>
              </div>
            </div>
            <div
              className="rounded text-[8.5px] px-1.5 py-0.5 font-semibold"
              style={{ background: 'oklch(0.65 0.25 265 / 0.15)', color: 'oklch(0.72 0.20 265)' }}
            >
              {c.invoices} facturen
            </div>
          </div>
        ))}
      </div>
    </MockupShell>
  )
}

// Uren mockup
function UrenMockup() {
  const days = ['ma', 'di', 'wo', 'do', 'vr']
  const hours = [6, 8, 5, 7, 4]
  const maxH = Math.max(...hours)
  return (
    <MockupShell>
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: 'oklch(0.75 0.02 260)' }}>
            Urenregistratie — week 14
          </span>
          <p className="text-[9px] font-bold" style={{ color: 'oklch(0.72 0.20 200)' }}>30 uur</p>
        </div>
        {/* Bar chart */}
        <div className="flex items-end gap-1.5" style={{ height: 64 }}>
          {days.map((d, i) => (
            <div key={d} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t"
                style={{
                  height: `${(hours[i] / maxH) * 52}px`,
                  background:
                    i === 1
                      ? 'linear-gradient(180deg, oklch(0.72 0.20 200), oklch(0.60 0.18 200 / 0.7))'
                      : 'oklch(0.22 0.03 260)',
                }}
              />
              <span className="text-[8px]" style={{ color: 'oklch(0.45 0.01 260)' }}>{d}</span>
            </div>
          ))}
        </div>
        {/* Recent entries */}
        {[
          { project: 'Website redesign', client: 'De Vries B.V.', time: '4u 30m' },
          { project: 'Consultatie', client: 'Hofman ICT', time: '2u 15m' },
        ].map((e) => (
          <div
            key={e.project}
            className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
            style={{ background: 'oklch(0.13 0.015 260)' }}
          >
            <div>
              <p className="text-[10px] font-semibold" style={{ color: 'oklch(0.80 0.02 260)' }}>{e.project}</p>
              <p className="text-[8.5px]" style={{ color: 'oklch(0.45 0.01 260)' }}>{e.client}</p>
            </div>
            <p className="text-[10px] font-bold" style={{ color: 'oklch(0.72 0.20 200)' }}>{e.time}</p>
          </div>
        ))}
      </div>
    </MockupShell>
  )
}

// Bonnen & uitgaven mockup
function UitgavenMockup() {
  return (
    <MockupShell>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: 'oklch(0.75 0.02 260)' }}>
            Bonnen &amp; uitgaven
          </span>
          <div
            className="rounded-md px-2 py-0.5 text-[9px] font-bold"
            style={{ background: 'oklch(0.68 0.22 45 / 0.25)', color: 'oklch(0.72 0.18 55)' }}
          >
            + Bon uploaden
          </div>
        </div>
        {[
          { desc: 'Kantoorbenodigdheden', cat: 'Kantoor', amount: '€ 48,95', vat: true },
          { desc: 'Treinreis Amsterdam', cat: 'Reiskosten', amount: '€ 24,50', vat: false },
          { desc: 'Adobe CC abonnement', cat: 'Software', amount: '€ 59,99', vat: true },
        ].map((e) => (
          <div
            key={e.desc}
            className="flex items-center justify-between rounded-lg px-2.5 py-2"
            style={{ background: 'oklch(0.13 0.015 260)' }}
          >
            <div>
              <p className="text-[10px] font-semibold" style={{ color: 'oklch(0.80 0.02 260)' }}>{e.desc}</p>
              <p className="text-[8.5px]" style={{ color: 'oklch(0.45 0.01 260)' }}>{e.cat}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold" style={{ color: 'oklch(0.72 0.18 55)' }}>{e.amount}</p>
              {e.vat && (
                <p className="text-[8px]" style={{ color: 'oklch(0.60 0.14 150)' }}>BTW aftrekbaar</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </MockupShell>
  )
}

// BTW-overzicht mockup
function BtwMockup() {
  return (
    <MockupShell>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold" style={{ color: 'oklch(0.75 0.02 260)' }}>
            BTW-overzicht Q1 2025
          </span>
          <div
            className="rounded text-[8.5px] px-2 py-0.5 font-semibold"
            style={{ background: 'oklch(0.72 0.18 150 / 0.18)', color: 'oklch(0.72 0.18 150)' }}
          >
            Klaar voor aangifte
          </div>
        </div>
        {/* Stats */}
        <div
          className="grid grid-cols-2 gap-1.5 rounded-lg p-2.5"
          style={{ background: 'oklch(0.13 0.015 260)', border: '1px solid oklch(0.20 0.025 260)' }}
        >
          {[
            { label: 'Omzet (excl. BTW)', value: '€ 8.420', color: 'oklch(0.65 0.25 265)' },
            { label: 'BTW ontvangen', value: '€ 1.768', color: 'oklch(0.72 0.18 150)' },
            { label: 'BTW betaald', value: '€ 289', color: 'oklch(0.72 0.18 55)' },
            { label: 'Te betalen', value: '€ 1.479', color: 'oklch(0.72 0.20 200)' },
          ].map((s) => (
            <div key={s.label} className="text-center py-1">
              <p className="text-[11px] font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[7.5px] mt-0.5" style={{ color: 'oklch(0.45 0.01 260)' }}>{s.label}</p>
            </div>
          ))}
        </div>
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-[8.5px] mb-1" style={{ color: 'oklch(0.50 0.01 260)' }}>
            <span>Voortgang kwartaal</span>
            <span style={{ color: 'oklch(0.72 0.18 150)' }}>78%</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'oklch(0.18 0.02 260)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: '78%', background: 'linear-gradient(90deg, oklch(0.65 0.25 265), oklch(0.72 0.18 150))' }}
            />
          </div>
        </div>
      </div>
    </MockupShell>
  )
}

// ─── Showcase items data ───────────────────────────────────────────────────────

const showcaseItems: ShowcaseItem[] = [
  {
    id: 'facturen',
    icon: FileText,
    title: 'Facturen maken in seconden',
    tagline: "Gratis factuur maken voor zzp'ers",
    description:
      'Maak professionele facturen met automatische BTW-berekening. Verstuur ze direct per e-mail naar uw klant en volg de betalingsstatus op één plek. Nooit meer een factuur kwijt.',
    accent: 'oklch(0.65 0.25 265)',
    accentBg: 'oklch(0.65 0.25 265 / 0.12)',
    accentBorder: 'oklch(0.65 0.25 265 / 0.30)',
    accentGlow: 'oklch(0.65 0.25 265 / 0.15)',
    mockup: <FacturenMockup />,
  },
  {
    id: 'klanten',
    icon: Users,
    title: 'Alle klanten overzichtelijk',
    tagline: 'Klantenbeheer voor zzp',
    description:
      'Sla klantgegevens eenmalig op en gebruik ze direct bij elke nieuwe factuur. Zie per klant hoeveel facturen u hebt verstuurd en wat de status is.',
    accent: 'oklch(0.65 0.25 265)',
    accentBg: 'oklch(0.65 0.25 265 / 0.12)',
    accentBorder: 'oklch(0.65 0.25 265 / 0.30)',
    accentGlow: 'oklch(0.65 0.25 265 / 0.15)',
    mockup: <KlantenMockup />,
  },
  {
    id: 'uren',
    icon: Clock,
    title: 'Uren registreren zonder gedoe',
    tagline: 'Urenregistratie zzp eenvoudig',
    description:
      'Registreer uren per project en klant. Gebruik de weekoverzichten als basis voor uw facturen en houd grip op uw beschikbaarheid en productiviteit.',
    accent: 'oklch(0.72 0.20 200)',
    accentBg: 'oklch(0.72 0.20 200 / 0.12)',
    accentBorder: 'oklch(0.72 0.20 200 / 0.30)',
    accentGlow: 'oklch(0.72 0.20 200 / 0.15)',
    mockup: <UrenMockup />,
  },
  {
    id: 'uitgaven',
    icon: Receipt,
    title: 'Bonnen & uitgaven bijhouden',
    tagline: 'Uitgaven bijhouden voor zzp',
    description:
      'Upload bonnetjes eenvoudig via uw telefoon of desktop. Kosten worden automatisch gecategoriseerd en toegevoegd aan uw BTW-overzicht.',
    accent: 'oklch(0.72 0.18 55)',
    accentBg: 'oklch(0.72 0.18 55 / 0.12)',
    accentBorder: 'oklch(0.72 0.18 55 / 0.30)',
    accentGlow: 'oklch(0.72 0.18 55 / 0.15)',
    mockup: <UitgavenMockup />,
  },
  {
    id: 'btw',
    icon: TrendingUp,
    title: 'BTW-overzicht altijd actueel',
    tagline: 'BTW-overzicht zzp factuursoftware',
    description:
      'Zie precies hoeveel BTW u hebt ontvangen en betaald per kwartaal. Uw aangifte is altijd klaar — geen verrassingen, geen handmatig optellen.',
    accent: 'oklch(0.72 0.18 150)',
    accentBg: 'oklch(0.72 0.18 150 / 0.12)',
    accentBorder: 'oklch(0.72 0.18 150 / 0.30)',
    accentGlow: 'oklch(0.72 0.18 150 / 0.15)',
    mockup: <BtwMockup />,
  },
]

// ─── Section component ─────────────────────────────────────────────────────────

export function ProductShowcaseSection() {
  return (
    <section
      id="product-showcase"
      className="py-16 sm:py-20 lg:py-28 border-t border-border/60"
      aria-labelledby="showcase-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center mb-14 sm:mb-20">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'oklch(0.65 0.25 265)' }}>
            Product in de praktijk
          </p>
          <h2
            id="showcase-heading"
            className="text-2xl font-bold sm:text-4xl lg:text-5xl leading-tight mb-4"
          >
            Zie hoe ZZPers Hub uw administratie eenvoudiger maakt
          </h2>
          <p className="text-muted-foreground lg:text-lg">
            Alles wat u nodig hebt als zzp'er — van factuur tot BTW-overzicht — op één plek, zonder gedoe.
          </p>
        </div>

        {/* Alternating showcase rows */}
        <div className="space-y-16 sm:space-y-24">
          {showcaseItems.map((item, index) => {
            const isEven = index % 2 === 0
            const Icon = item.icon
            return (
              <article
                key={item.id}
                className={`flex flex-col gap-8 lg:gap-16 lg:items-center ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}
              >
                {/* Mockup column */}
                <div className="flex-1 relative">
                  {/* Ambient glow */}
                  <div
                    className="absolute inset-0 -z-10 pointer-events-none"
                    style={{
                      background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${item.accentGlow}, transparent 70%)`,
                      filter: 'blur(32px)',
                    }}
                  />
                  {item.mockup}
                </div>

                {/* Text column */}
                <div className="flex-1 lg:max-w-md">
                  <div
                    className="inline-flex items-center justify-center rounded-xl mb-4"
                    style={{
                      width: 48,
                      height: 48,
                      background: item.accentBg,
                      border: `1.5px solid ${item.accentBorder}`,
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: item.accent }}
                    />
                  </div>

                  {/* SEO-friendly hidden keyword */}
                  <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: item.accent }}>
                    {item.tagline}
                  </p>

                  <h3 className="text-xl font-bold sm:text-2xl lg:text-3xl mb-3 leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-muted-foreground leading-relaxed lg:text-lg">
                    {item.description}
                  </p>
                </div>
              </article>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 sm:mt-20 text-center">
          <p className="text-muted-foreground mb-4">
            Werk professioneel zonder gedoe — start vandaag gratis.
          </p>
          <button
            onClick={() => navigateTo('/login')}
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, oklch(0.65 0.25 265), oklch(0.72 0.20 200))',
              boxShadow: '0 4px 20px oklch(0.65 0.25 265 / 0.30)',
            }}
          >
            Start gratis
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
