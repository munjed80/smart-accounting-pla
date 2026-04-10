import { CheckCircle, FileText, Users, Clock, Receipt, TrendingUp } from 'lucide-react'

/**
 * HeroProductMockup — inline SVG/JSX laptop mockup
 * Shows a realistic ZZPers Hub invoice interface to make the landing page
 * feel like a real product rather than a generic SaaS template.
 */
export function HeroProductMockup() {
  return (
    <div className="hero-mockup-wrapper relative flex items-center justify-center">
      {/* Ambient glow behind the laptop */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 60%, oklch(0.65 0.25 265 / 0.18) 0%, oklch(0.72 0.20 200 / 0.10) 45%, transparent 75%)',
          filter: 'blur(8px)',
        }}
      />

      {/* Laptop frame */}
      <div className="relative w-full max-w-[520px] select-none">
        {/* Screen bezel */}
        <div
          className="relative rounded-t-xl overflow-hidden"
          style={{
            background: 'oklch(0.13 0.01 260)',
            border: '2px solid oklch(0.25 0.04 260)',
            boxShadow:
              '0 0 0 1px oklch(0.35 0.06 260 / 0.4), 0 20px 60px oklch(0 0 0 / 0.6), 0 0 40px oklch(0.65 0.25 265 / 0.12)',
            paddingTop: '10px',
            paddingLeft: '10px',
            paddingRight: '10px',
            paddingBottom: '0',
          }}
        >
          {/* Webcam dot */}
          <div className="flex justify-center mb-1.5">
            <div
              className="rounded-full"
              style={{ width: 6, height: 6, background: 'oklch(0.22 0.02 260)' }}
            />
          </div>

          {/* Screen content — product UI */}
          <div
            className="rounded-t-md overflow-hidden"
            style={{
              background: 'oklch(0.10 0.01 260)',
              border: '1px solid oklch(0.22 0.03 260)',
              minHeight: 280,
            }}
          >
            {/* App top bar */}
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: 'oklch(0.12 0.015 260)',
                borderBottom: '1px solid oklch(0.20 0.03 260)',
              }}
            >
              <div className="flex items-center gap-2">
                {/* Logo mark */}
                <div
                  className="flex items-center justify-center rounded-md"
                  style={{
                    width: 20,
                    height: 20,
                    background: 'linear-gradient(135deg, oklch(0.65 0.25 265), oklch(0.75 0.22 150))',
                  }}
                >
                  <FileText style={{ width: 11, height: 11, color: 'white' }} />
                </div>
                <span
                  className="text-xs font-bold tracking-tight"
                  style={{
                    background: 'linear-gradient(100deg, oklch(0.65 0.25 265), oklch(0.75 0.22 150))',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  ZZPers Hub
                </span>
              </div>
              {/* Window controls placeholder */}
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: 'oklch(0.25 0.02 260)' }}
                  />
                ))}
              </div>
            </div>

            {/* Main layout: sidebar + content */}
            <div className="flex" style={{ minHeight: 240 }}>
              {/* Sidebar */}
              <div
                className="flex flex-col gap-0.5 py-3 px-2"
                style={{
                  width: 110,
                  background: 'oklch(0.11 0.015 260)',
                  borderRight: '1px solid oklch(0.20 0.03 260)',
                  flexShrink: 0,
                }}
              >
                {[
                  { label: 'Facturen', icon: FileText, active: true },
                  { label: 'Klanten', icon: Users, active: false },
                  { label: 'Uren', icon: Clock, active: false },
                  { label: 'Uitgaven', icon: Receipt, active: false },
                  { label: 'Overzicht', icon: TrendingUp, active: false },
                ].map(({ label, icon: Icon, active }) => (
                  <div
                    key={label}
                    className="flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-medium"
                    style={{
                      background: active
                        ? 'linear-gradient(90deg, oklch(0.65 0.25 265 / 0.18), oklch(0.72 0.20 200 / 0.10))'
                        : 'transparent',
                      color: active ? 'oklch(0.75 0.18 200)' : 'oklch(0.55 0.02 260)',
                      borderLeft: active ? '2px solid oklch(0.65 0.25 265)' : '2px solid transparent',
                    }}
                  >
                    <Icon style={{ width: 10, height: 10, flexShrink: 0 }} />
                    {label}
                  </div>
                ))}
              </div>

              {/* Content area: Invoice list + preview */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Content header */}
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: '1px solid oklch(0.18 0.02 260)' }}
                >
                  <span className="text-[10px] font-semibold" style={{ color: 'oklch(0.78 0.02 260)' }}>
                    Facturen
                  </span>
                  <div
                    className="rounded px-2 py-0.5 text-[9px] font-semibold"
                    style={{
                      background: 'linear-gradient(135deg, oklch(0.65 0.25 265), oklch(0.72 0.20 200))',
                      color: 'white',
                    }}
                  >
                    + Nieuw
                  </div>
                </div>

                {/* Invoice rows */}
                <div className="flex-1 px-2 py-1.5 space-y-1 overflow-hidden">
                  {[
                    { num: '#2026-047', client: 'De Vries B.V.', amount: '€ 1.250,00', status: 'Betaald', paid: true },
                    { num: '#2026-046', client: 'Bakker & Zn', amount: '€ 875,50', status: 'Verzonden', paid: false },
                    { num: '#2026-045', client: 'Hofman ICT', amount: '€ 2.100,00', status: 'Betaald', paid: true },
                    { num: '#2026-044', client: 'Studio Noord', amount: '€ 490,00', status: 'Concept', paid: false },
                  ].map((inv) => (
                    <div
                      key={inv.num}
                      className="flex items-center justify-between rounded px-2 py-1.5"
                      style={{ background: 'oklch(0.14 0.015 260)' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="rounded"
                          style={{
                            width: 4,
                            height: 4,
                            background: inv.paid
                              ? 'oklch(0.72 0.18 150)'
                              : inv.status === 'Verzonden'
                              ? 'oklch(0.72 0.20 200)'
                              : 'oklch(0.55 0.02 260)',
                            flexShrink: 0,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="text-[9px] font-semibold truncate" style={{ color: 'oklch(0.78 0.02 260)' }}>
                            {inv.client}
                          </p>
                          <p className="text-[8px]" style={{ color: 'oklch(0.45 0.01 260)' }}>
                            {inv.num}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p
                          className="text-[9px] font-bold"
                          style={{ color: inv.paid ? 'oklch(0.72 0.18 150)' : 'oklch(0.65 0.02 260)' }}
                        >
                          {inv.amount}
                        </p>
                        <p
                          className="text-[8px]"
                          style={{
                            color: inv.paid
                              ? 'oklch(0.62 0.14 150)'
                              : inv.status === 'Verzonden'
                              ? 'oklch(0.60 0.15 200)'
                              : 'oklch(0.45 0.01 260)',
                          }}
                        >
                          {inv.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mini stats bar */}
                <div
                  className="flex items-center justify-around px-2 py-2 text-[9px]"
                  style={{
                    borderTop: '1px solid oklch(0.18 0.02 260)',
                    background: 'oklch(0.11 0.01 260)',
                  }}
                >
                  <div className="text-center">
                    <p className="font-bold" style={{ color: 'oklch(0.72 0.18 150)' }}>
                      €4.715
                    </p>
                    <p style={{ color: 'oklch(0.45 0.01 260)' }}>ontvangen</p>
                  </div>
                  <div
                    className="rounded-full"
                    style={{ width: 1, height: 24, background: 'oklch(0.22 0.02 260)' }}
                  />
                  <div className="text-center">
                    <p className="font-bold" style={{ color: 'oklch(0.65 0.25 265)' }}>
                      3 open
                    </p>
                    <p style={{ color: 'oklch(0.45 0.01 260)' }}>facturen</p>
                  </div>
                  <div
                    className="rounded-full"
                    style={{ width: 1, height: 24, background: 'oklch(0.22 0.02 260)' }}
                  />
                  <div className="text-center">
                    <p className="font-bold" style={{ color: 'oklch(0.72 0.20 200)' }}>
                      Q4 2024
                    </p>
                    <p style={{ color: 'oklch(0.45 0.01 260)' }}>BTW-kwartaal</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Laptop base / hinge */}
        <div
          style={{
            height: 12,
            background: 'linear-gradient(180deg, oklch(0.18 0.02 260) 0%, oklch(0.15 0.02 260) 100%)',
            border: '2px solid oklch(0.25 0.04 260)',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
          }}
        />
        {/* Laptop base bottom */}
        <div
          style={{
            height: 8,
            background: 'linear-gradient(180deg, oklch(0.16 0.02 260) 0%, oklch(0.13 0.015 260) 100%)',
            borderRadius: '0 0 12px 12px',
            margin: '0 12px',
            boxShadow: '0 8px 32px oklch(0 0 0 / 0.5)',
          }}
        />
      </div>

      {/* Floating feature chips */}
      <div
        className="absolute -top-3 -left-4 sm:-left-8 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg pointer-events-none"
        style={{
          background: 'oklch(0.14 0.02 260)',
          border: '1px solid oklch(0.65 0.25 265 / 0.35)',
          color: 'oklch(0.70 0.20 265)',
          boxShadow: '0 4px 16px oklch(0.65 0.25 265 / 0.15)',
        }}
      >
        <FileText style={{ width: 12, height: 12 }} />
        Facturen
      </div>

      <div
        className="absolute top-1/4 -right-3 sm:-right-8 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg pointer-events-none"
        style={{
          background: 'oklch(0.14 0.02 260)',
          border: '1px solid oklch(0.72 0.18 150 / 0.35)',
          color: 'oklch(0.70 0.18 150)',
          boxShadow: '0 4px 16px oklch(0.72 0.18 150 / 0.15)',
        }}
      >
        <CheckCircle style={{ width: 12, height: 12 }} />
        Betaald
      </div>

      <div
        className="absolute bottom-16 -left-4 sm:-left-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg pointer-events-none"
        style={{
          background: 'oklch(0.14 0.02 260)',
          border: '1px solid oklch(0.72 0.20 200 / 0.35)',
          color: 'oklch(0.68 0.18 200)',
          boxShadow: '0 4px 16px oklch(0.72 0.20 200 / 0.12)',
        }}
      >
        <Clock style={{ width: 12, height: 12 }} />
        Uren
      </div>

      <div
        className="absolute -bottom-2 right-8 sm:right-12 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-lg pointer-events-none"
        style={{
          background: 'oklch(0.14 0.02 260)',
          border: '1px solid oklch(0.68 0.22 45 / 0.35)',
          color: 'oklch(0.72 0.18 55)',
          boxShadow: '0 4px 16px oklch(0.68 0.22 45 / 0.12)',
        }}
      >
        <Receipt style={{ width: 12, height: 12 }} />
        Uitgaven
      </div>
    </div>
  )
}
