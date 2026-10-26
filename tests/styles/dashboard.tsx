import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../../src/lib/AuthContext'
import { ActiveClientProvider } from '../../src/lib/ActiveClientContext'
import { AppShell } from '../../src/components/AppShell'
import { SmartDashboard } from '../../src/components/SmartDashboard'
import { ZZPInvoicesPage } from '../../src/components/ZZPInvoicesPage'
import { ZZPExpensesPage } from '../../src/components/ZZPExpensesPage'
import { ZZPTimeTrackingPage } from '../../src/components/ZZPTimeTrackingPage'
import { ZZPDocumentInboxPage } from '../../src/components/ZZPDocumentInboxPage'
import '../../src/main.css'

// Real pages, shell, and providers; only HTTP data is stubbed by Playwright.
function Workspace() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('app:route-change', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('app:route-change', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])
  const page = path.startsWith('/zzp/invoices') ? (
    <ZZPInvoicesPage />
  ) : path.startsWith('/zzp/expenses') ? (
    <ZZPExpensesPage />
  ) : path.startsWith('/zzp/time') ? (
    <ZZPTimeTrackingPage />
  ) : path.startsWith('/zzp/documents') ? (
    <ZZPDocumentInboxPage />
  ) : (
    <SmartDashboard />
  )
  return <AppShell activeTab="dashboard">{page}</AppShell>
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <AuthProvider>
      <ActiveClientProvider>
        <Workspace />
      </ActiveClientProvider>
    </AuthProvider>
  </QueryClientProvider>,
)
