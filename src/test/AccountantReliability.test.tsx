import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClientDossierPage } from '@/components/ClientDossierPage'
import { WorkQueueSection } from '@/components/WorkQueueSection'
import { ReviewQueue } from '@/components/ReviewQueue'
import { accountantApi, ledgerApi, workQueueApi, documentReviewApi } from '@/lib/api'
import { t } from '@/i18n'
import { isAccountantRole, isValidRole } from '@/lib/roles'

const context = vi.hoisted(() => ({
  setActiveClient: vi.fn(),
  activeClientId: null as string | null,
  allLinks: [] as any[],
}))
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'accountant', role: 'super_admin' } }) }))
vi.mock('@/lib/ActiveClientContext', () => ({ useActiveClient: () => context }))
vi.mock('@/lib/navigation', () => ({ navigateTo: vi.fn() }))
vi.mock('@/lib/api', () => ({
  accountantApi: { getClientScopes: vi.fn() },
  ledgerApi: { getClientOverview: vi.fn() },
  workQueueApi: { getWorkQueue: vi.fn() },
  documentReviewApi: { listDocuments: vi.fn() },
  ALL_SCOPES: ['invoices', 'documents'],
  getErrorMessage: (e: unknown) => e instanceof Error ? e.message : 'Error',
  getPermissionErrorCode: () => null,
}))
vi.mock('@/components/ClientDossierDataTab', () => ({ ClientDossierDataTab: ({ type }: any) => <div>{type} content</div> }))
vi.mock('@/components/ClientCertificatesTab', () => ({ ClientCertificatesTab: () => <div>certificates content</div> }))
vi.mock('@/components/ClientIssuesTab', () => ({ ClientIssuesTab: () => <div>issues content</div> }))
vi.mock('@/components/ClientPeriodsTab', () => ({ ClientPeriodsTab: () => null }))
vi.mock('@/components/ClientDecisionsTab', () => ({ ClientDecisionsTab: () => null }))
vi.mock('@/components/ClientBookkeepingTab', () => ({ ClientBookkeepingTab: () => null }))
vi.mock('@/components/ClientAuditTab', () => ({ ClientAuditTab: () => null }))
vi.mock('@/components/ClientVatTab', () => ({ ClientVatTab: () => null }))
vi.mock('@/components/ClientCommitmentsTab', () => ({ ClientCommitmentsTab: () => null }))
vi.mock('@/components/BulkOperationModal', () => ({
  BulkOperationModal: ({ isOpen, actionType, selectedClients }: any) => isOpen
    ? <div role="dialog">{actionType}: {selectedClients.map((c: any) => c.name).join(', ')}</div> : null,
}))
vi.mock('@/components/DocumentDetailDialog', () => ({ DocumentDetailDialog: () => null }))
vi.mock('@/components/BookingProposalDialog', () => ({ BookingProposalDialog: () => null }))
vi.mock('@/components/RejectDocumentDialog', () => ({ RejectDocumentDialog: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  context.activeClientId = null
  context.allLinks = []
  vi.mocked(ledgerApi.getClientOverview).mockResolvedValue({ client_name: 'Client A', error_count: 0, warning_count: 0 } as any)
  vi.mocked(accountantApi.getClientScopes).mockResolvedValue({ client_id: 'a', client_name: 'Client A', scopes: ['invoices'], available_scopes: ['invoices', 'documents'] })
})

describe('accountant regressions', () => {
  it('uses the same staff role set in the UI', () => {
    for (const role of ['accountant', 'admin', 'super_admin']) {
      expect(isAccountantRole(role)).toBe(true)
      expect(isValidRole(role)).toBe(true)
    }
    expect(isAccountantRole('zzp')).toBe(false)
  })

  it('opens a direct dossier link without a prior active selection and follows history tabs', async () => {
    const { rerender } = render(<ClientDossierPage clientId="a" initialTab="invoices" />)
    await screen.findByText('Client A')
    expect(screen.getByText('invoices content')).toBeInTheDocument()
    rerender(<ClientDossierPage clientId="a" initialTab="certificates" />)
    expect(await screen.findByText('certificates content')).toBeInTheDocument()
    expect(ledgerApi.getClientOverview).toHaveBeenCalledTimes(1)
  })

  it('does not claim full permissions when loading scopes fails', async () => {
    vi.mocked(accountantApi.getClientScopes).mockRejectedValue(new Error('Scopes unavailable'))
    render(<ClientDossierPage clientId="a" />)
    expect(await screen.findByText('Machtigingen konden niet worden geladen. Probeer opnieuw.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t('permissions.title') }))
    expect(screen.queryByText(t('permissions.allScopesGranted'))).not.toBeInTheDocument()
  })

  it('ignores an old client response after navigating to a different client', async () => {
    let resolveA!: (value: any) => void
    vi.mocked(ledgerApi.getClientOverview)
      .mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve }))
      .mockResolvedValueOnce({ client_name: 'Client B', error_count: 0, warning_count: 0 } as any)
    const { rerender } = render(<ClientDossierPage clientId="a" />)
    rerender(<ClientDossierPage clientId="b" />)
    await screen.findByText('Client B')
    await act(async () => { resolveA({ client_name: 'Old Client A', error_count: 0, warning_count: 0 }) })
    expect(screen.getByText('Client B')).toBeInTheDocument()
    expect(screen.queryByText('Old Client A')).not.toBeInTheDocument()
  })

  it('opens the real bulk workflow instead of reporting a fake review success', async () => {
    vi.mocked(workQueueApi.getWorkQueue).mockResolvedValue({
      items: [{ client_id: 'a', client_name: 'Client A', work_item_type: 'ISSUE', title: 'Review issue', counts: { red: 1, yellow: 0, backlog: 0 } }],
      counts: { red_issues: 1, needs_review: 0, vat_due: 0, stale: 0 },
    } as any)
    render(<WorkQueueSection />)
    await screen.findByText('Review issue')
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Controleer opnieuw' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('recalculate: Client A')
  })

  it('retries the document request after a load failure', async () => {
    vi.mocked(documentReviewApi.listDocuments)
      .mockRejectedValueOnce(new Error('Load failed'))
      .mockResolvedValueOnce({ documents: [], total_count: 0 } as any)
    render(<ReviewQueue clientId="a" clientName="Client A" />)
    await screen.findByText('Load failed')
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }))
    await waitFor(() => expect(documentReviewApi.listDocuments).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Load failed')).not.toBeInTheDocument())
  })
})
