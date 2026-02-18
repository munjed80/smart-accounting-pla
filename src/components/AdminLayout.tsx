import { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export type AdminSection = 'users' | 'companies' | 'subscriptions' | 'revenue' | 'logs'

interface AdminLayoutProps {
  activeSection: AdminSection
  onSectionChange: (section: AdminSection) => void
  children: ReactNode
}

const sections: Array<{ key: AdminSection; label: string }> = [
  { key: 'users', label: 'Users overview' },
  { key: 'companies', label: 'Companies overview' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'revenue', label: 'Revenue metrics' },
  { key: 'logs', label: 'System logs' },
]

export const AdminLayout = ({ activeSection, onSectionChange, children }: AdminLayoutProps) => {
  return (
    <div className="space-y-4 px-4 sm:px-6 lg:px-8">
      {/* Tabs - Mobile-first with proper wrapping */}
      <div className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <Button
            key={section.key}
            variant={activeSection === section.key ? 'default' : 'outline'}
            onClick={() => onSectionChange(section.key)}
            className="min-h-[44px] flex-1 sm:flex-none"
          >
            {section.label}
          </Button>
        ))}
      </div>

      {children}
    </div>
  )
}
