import { createRoot } from 'react-dom/client'
import { Button } from '../../src/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '../../src/components/ui/dialog'
import '../../src/main.css'

// Exercise actual primitives and the production CSS entry point, without API/session fixtures.
createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen overflow-x-clip">
    <header data-testid="header" className="app-shell-header sticky top-0 bg-background p-4">Sticky header</header>
    <main className="p-4">
      <div data-testid="panel" className="w-64 rounded-lg border p-4">Spacing probe</div>
      <div data-testid="gap" className="grid gap-4"><span>First</span><span>Second</span></div>
      <div data-testid="accent" className="bg-accent-secondary-3 text-accent-secondary-11">Accent palette</div>
      <span data-testid="dark" className="block border dark:border-blue-400">Dark utility</span>
      <div data-testid="motion" className="brand-shimmer">Motion preference</div>
      <Dialog>
        <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>Example dialog</DialogTitle><DialogDescription>Short content should not stretch to half the viewport.</DialogDescription></DialogHeader><p>Form content</p></DialogContent>
      </Dialog>
      <div style={{ height: 1600 }}>Scrollable content</div>
    </main>
  </div>,
)
