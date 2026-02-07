/**
 * ZZP Expenses Page (Uitgaven)
 * 
 * Premium empty-state shell page for upcoming expense management feature.
 */

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Receipt, 
  Camera,
  Tag,
  SplitHorizontal,
  ChartPie,
  Export,
  Sparkle,
} from '@phosphor-icons/react'
import { t } from '@/i18n'

const FeatureItem = ({ icon: Icon, text }: { icon: React.ElementType; text: string }) => (
  <div className="flex items-center gap-3 py-2">
    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
      <Icon size={16} className="text-primary" weight="duotone" />
    </div>
    <span className="text-sm text-muted-foreground">{text}</span>
  </div>
)

export const ZZPExpensesPage = () => {
  const features = [
    { icon: Camera, text: t('zzpExpenses.feature1') },
    { icon: Tag, text: t('zzpExpenses.feature2') },
    { icon: SplitHorizontal, text: t('zzpExpenses.feature3') },
    { icon: ChartPie, text: t('zzpExpenses.feature4') },
    { icon: Export, text: t('zzpExpenses.feature5') },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
              <Receipt size={28} className="text-primary sm:hidden" weight="duotone" />
              <Receipt size={40} className="text-primary hidden sm:block" weight="duotone" />
              {t('zzpExpenses.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('zzpExpenses.pageDescription')}
            </p>
          </div>
          <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40 gap-1.5">
            <Sparkle size={14} weight="fill" />
            {t('zzpExpenses.comingSoon')}
          </Badge>
        </div>

        {/* Coming Soon Card */}
        <Card className="bg-card/80 backdrop-blur-sm border-2 border-dashed border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center px-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6 relative">
              <Receipt size={40} weight="duotone" className="text-primary" />
              <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Sparkle size={16} className="text-amber-600 dark:text-amber-400" weight="fill" />
              </div>
            </div>
            
            <h3 className="text-xl font-semibold mb-2">{t('zzpExpenses.comingSoon')}</h3>
            <p className="text-muted-foreground mb-8 max-w-md">
              {t('zzpExpenses.comingSoonDescription')}
            </p>

            {/* Planned features */}
            <div className="w-full max-w-sm bg-secondary/30 rounded-xl p-4 border border-border/50">
              <h4 className="text-sm font-semibold mb-3 text-left">
                {t('zzpExpenses.plannedFeatures')}
              </h4>
              <div className="divide-y divide-border/50">
                {features.map((feature, index) => (
                  <FeatureItem key={index} icon={feature.icon} text={feature.text} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default ZZPExpensesPage
