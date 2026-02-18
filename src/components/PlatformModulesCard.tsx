/**
 * Platform Modules Card - Overview for Accountants
 * 
 * Shows the 5 main platform modules with status badges and links
 * to relevant existing pages. Displayed on accountant home page.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { t } from '@/i18n'
import { navigateTo } from '@/lib/navigation'
import {
  Database,
  Calculator,
  Shield,
  Building2,
  ClipboardList,
  ChevronRight,
} from 'lucide-react'

interface PlatformModule {
  id: string
  icon: React.ReactNode
  title: string
  bullets: string[]
  status: 'live' | 'in-development' | 'coming-soon'
  link?: string
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'live':
      return (
        <Badge className="bg-accent-secondary-3 text-accent-secondary-11 border-accent-secondary-7">
          {t('platform.statusLive')}
        </Badge>
      )
    case 'in-development':
      return (
        <Badge variant="outline" className="bg-accent-secondary-2 text-accent-secondary-11 border-accent-secondary-6">
          {t('platform.statusInDevelopment')}
        </Badge>
      )
    case 'coming-soon':
      return (
        <Badge variant="secondary">
          {t('platform.statusComingSoon')}
        </Badge>
      )
    default:
      return null
  }
}

export const PlatformModulesCard = () => {
  const platformModules: PlatformModule[] = [
    {
      id: 'core-accounting',
      icon: <Database className="h-5 w-5" />,
      title: t('platform.coreAccountingTitle'),
      bullets: [
        t('platform.coreAccountingBullet1'),
        t('platform.coreAccountingBullet2'),
      ],
      status: 'live',
      link: '/accountant/clients',
    },
    {
      id: 'tax-automation',
      icon: <Calculator className="h-5 w-5" />,
      title: t('platform.taxAutomationTitle'),
      bullets: [
        t('platform.taxAutomationBullet1'),
        t('platform.taxAutomationBullet2'),
      ],
      status: 'live',
      // Link would go to BTW page when available
    },
    {
      id: 'compliance-layer',
      icon: <Shield className="h-5 w-5" />,
      title: t('platform.complianceLayerTitle'),
      bullets: [
        t('platform.complianceLayerBullet1'),
        t('platform.complianceLayerBullet2'),
      ],
      status: 'live',
      // Link would go to audit trail when available
    },
    {
      id: 'banking-financing',
      icon: <Building2 className="h-5 w-5" />,
      title: t('platform.bankingFinancingTitle'),
      bullets: [
        t('platform.bankingFinancingBullet1'),
        t('platform.bankingFinancingBullet2'),
      ],
      status: 'coming-soon',
      // No link yet - coming soon
    },
    {
      id: 'annual-reporting',
      icon: <ClipboardList className="h-5 w-5" />,
      title: t('platform.annualReportingTitle'),
      bullets: [
        t('platform.annualReportingBullet1'),
        t('platform.annualReportingBullet2'),
      ],
      status: 'in-development',
      // No link yet - in development
    },
  ]

  const handleModuleClick = (module: PlatformModule) => {
    if (module.link) {
      navigateTo(module.link)
    }
  }

  return (
    <Card className="mb-6 border-accent-secondary-6/30 bg-gradient-to-br from-accent-secondary-2/20 to-background">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <span className="text-accent-secondary-11">{t('platform.platformForAccountants')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {platformModules.map((module) => (
            <div
              key={module.id}
              onClick={() => handleModuleClick(module)}
              className={`
                relative rounded-lg border border-border bg-background p-4 transition-all
                ${module.link ? 'cursor-pointer hover:border-accent-secondary-7 hover:bg-accent-secondary-2/30 hover:shadow-md' : 'opacity-90'}
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="text-accent-secondary-11">
                    {module.icon}
                  </div>
                  <h3 className="font-semibold text-sm">{module.title}</h3>
                </div>
                <div className="flex items-center gap-1">
                  {getStatusBadge(module.status)}
                  {module.link && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              <ul className="space-y-1">
                {module.bullets.map((bullet, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                    <span className="text-accent-secondary-9 mt-0.5">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
