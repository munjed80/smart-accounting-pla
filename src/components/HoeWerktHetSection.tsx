import { UserPlus, Building2, FileText, Clock, TrendingUp, Handshake, ArrowRight } from 'lucide-react'

const steps = [
  {
    icon: UserPlus,
    title: 'Aanmelden',
    subline: 'Maak je account aan',
    step: '1',
  },
  {
    icon: Building2,
    title: 'Administratie',
    subline: 'Vul je bedrijf & klanten in',
    step: '2',
  },
  {
    icon: FileText,
    title: 'Facturen & Uren',
    subline: 'Maak facturen en registreer uren',
    step: '3',
    secondIcon: Clock,
  },
  {
    icon: TrendingUp,
    title: 'BTW & Overzicht',
    subline: 'Inzicht in omzet, kosten en BTW',
    step: '4',
  },
  {
    icon: Handshake,
    title: 'Samenwerken',
    subline: 'Deel met je boekhouder (optioneel)',
    step: '5',
  },
]

export const HoeWerktHetSection = () => {
  return (
    <section id="hoe-werkt-het" className="border-b border-border/60 py-14 sm:py-20" style={{ background: 'hsl(var(--background))' }}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-2">Stap voor stap</p>
          <h2 className="text-2xl font-bold sm:text-4xl">Hoe werkt het?</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Van uw eerste aanmelding tot naadloze samenwerking met uw accountant — in vijf doordachte stappen volledig ingericht voor uw administratie.
          </p>
        </div>

        {/* Step cards — horizontal on desktop, vertical on mobile */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-stretch sm:gap-0">
          {steps.map((step, index) => {
            const Icon = step.icon
            const SecondIcon = step.secondIcon
            return (
              <div key={step.step} className="flex flex-row items-center sm:flex-1 sm:flex-col sm:items-stretch">
                {/* Card */}
                <div
                  className="flex flex-1 flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-colors hover:border-primary/50"
                  style={{
                    background: 'color-mix(in oklab, hsl(var(--primary)) 8%, hsl(var(--background)))',
                    borderColor: 'color-mix(in oklab, hsl(var(--primary)) 20%, transparent)',
                  }}
                >
                  {/* Step number badge */}
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
                    style={{ background: 'hsl(var(--primary))' }}
                  >
                    {step.step}
                  </div>

                  {/* Icon(s) */}
                  <div className="flex items-center gap-1.5" style={{ color: 'hsl(var(--accent))' }}>
                    <Icon className="h-7 w-7" strokeWidth={1.5} />
                    {SecondIcon && (
                      <>
                        <span className="text-xs text-muted-foreground">+</span>
                        <SecondIcon className="h-6 w-6" strokeWidth={1.5} />
                      </>
                    )}
                  </div>

                  {/* Text */}
                  <div>
                    <p className="text-sm font-semibold leading-tight">{step.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.subline}</p>
                  </div>
                </div>

                {/* Arrow between cards */}
                {index < steps.length - 1 && (
                  <div className="flex shrink-0 items-center justify-center px-2 sm:w-full sm:py-2 sm:px-0">
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 rotate-90 sm:rotate-0" strokeWidth={1.5} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
