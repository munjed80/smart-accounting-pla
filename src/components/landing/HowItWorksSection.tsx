import { Upload, ShieldCheck, FileCheck } from 'lucide-react'

const stages = [
  {
    icon: Upload,
    step: '01',
    title: 'ZZP invoer',
    bullets: ['Facturen, uitgaven en uren', 'Documenten uploaden'],
  },
  {
    icon: ShieldCheck,
    step: '02',
    title: 'Verwerking & controle',
    bullets: ['Validatie + categorisatie', 'BTW-rubrieken en audit trail'],
  },
  {
    icon: FileCheck,
    step: '03',
    title: 'Boekhouder uitvoer',
    bullets: ['BTW-aangifte en rapporten', 'Exports (PDF/CSV/JSON)'],
  },
]

export const HowItWorksSection = () => {
  return (
    <section id="hoe-werkt-het" className="py-16 md:py-24 border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16 lg:items-center">

          {/* Left: Copy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-3">WERKWIJZE</p>
            <h2 className="text-2xl font-bold sm:text-3xl lg:text-4xl mb-4">Hoe werkt het?</h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-sm">
              Van invoer tot BTW-aangifte — in drie heldere stappen.
            </p>
            <p className="mt-6 text-xs font-medium text-muted-foreground/60">
              Altijd traceerbaar. Altijd controleerbaar.
            </p>
          </div>

          {/* Right: Workflow cards */}
          <div className="flex flex-col gap-3 lg:flex-row lg:gap-0 lg:items-stretch">
            {stages.map((stage, index) => {
              const Icon = stage.icon
              const isLast = index === stages.length - 1
              return (
                <div key={stage.step} className="flex flex-col lg:flex-row lg:flex-1 lg:items-stretch">
                  {/* Card */}
                  <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5 md:p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums text-muted-foreground/50">{stage.step}</span>
                    </div>
                    <p className="text-sm font-semibold mb-2 leading-tight">{stage.title}</p>
                    <ul className="space-y-1">
                      {stage.bullets.map((bullet) => (
                        <li key={bullet} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" />
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Connector */}
                  {!isLast && (
                    <>
                      {/* Desktop: horizontal arrow */}
                      <div className="hidden lg:flex items-center justify-center w-6 shrink-0">
                        <svg width="24" height="12" viewBox="0 0 24 12" fill="none" aria-hidden="true">
                          <defs>
                            <linearGradient id={`hiw-h-${index}`} x1="0" y1="0" x2="24" y2="0" gradientUnits="userSpaceOnUse">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.65" />
                            </linearGradient>
                          </defs>
                          <line x1="0" y1="6" x2="15" y2="6" stroke={`url(#hiw-h-${index})`} strokeWidth="1.5" />
                          <polygon points="15,3 24,6 15,9" fill={`url(#hiw-h-${index})`} />
                        </svg>
                      </div>
                      {/* Mobile: vertical arrow */}
                      <div className="lg:hidden flex justify-start py-1 pl-4">
                        <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
                          <defs>
                            <linearGradient id={`hiw-v-${index}`} x1="0" y1="0" x2="0" y2="20" gradientUnits="userSpaceOnUse">
                              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.65" />
                            </linearGradient>
                          </defs>
                          <line x1="6" y1="0" x2="6" y2="12" stroke={`url(#hiw-v-${index})`} strokeWidth="1.5" />
                          <polygon points="3,12 6,20 9,12" fill={`url(#hiw-v-${index})`} />
                        </svg>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </section>
  )
}
