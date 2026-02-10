import { Component, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { WarningCircle, ArrowsClockwise } from '@phosphor-icons/react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary specifically for dashboard content.
 * Catches runtime errors and shows a user-friendly fallback UI.
 * Prevents the entire app from going blank when a component crashes.
 */
export class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging
    console.error('Dashboard Error Boundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    // Reload the page to reset state
    window.location.reload()
  }

  handleReset = () => {
    // Reset error boundary state to try rendering again
    this.setState({ hasError: false, error: null })
  }

  handleCopyError = () => {
    const errorText = this.state.error?.message || 'Unknown error'
    const errorStack = this.state.error?.stack || ''
    const fullError = `Error: ${errorText}\n\nStack Trace:\n${errorStack}`
    
    navigator.clipboard.writeText(fullError).then(() => {
      alert('Foutmelding gekopieerd naar klembord')
    }).catch(() => {
      alert('Kon foutmelding niet kopiëren')
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
          
          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-destructive/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-destructive">
                  <WarningCircle size={32} weight="fill" />
                  Er ging iets mis
                </CardTitle>
                <CardDescription>
                  De pagina kon niet worden geladen door een onverwachte fout.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Error Details (development only) */}
                {import.meta.env.DEV && this.state.error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>
                      <div className="font-mono text-xs">
                        <div className="font-semibold mb-1">Foutmelding:</div>
                        <div className="bg-muted/50 p-2 rounded overflow-auto max-h-32">
                          {this.state.error.message}
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button 
                    onClick={this.handleReload} 
                    variant="default"
                    className="flex-1"
                  >
                    <ArrowsClockwise size={18} className="mr-2" />
                    Herladen
                  </Button>
                  <Button 
                    onClick={this.handleReset} 
                    variant="outline"
                    className="flex-1"
                  >
                    Opnieuw proberen
                  </Button>
                  {import.meta.env.DEV && this.state.error && (
                    <Button 
                      onClick={this.handleCopyError} 
                      variant="ghost"
                      size="sm"
                    >
                      Kopieer fout
                    </Button>
                  )}
                </div>

                {/* Helpful Information */}
                <div className="text-sm text-muted-foreground mt-4 p-4 bg-muted/30 rounded-lg">
                  <p className="font-medium mb-2">Wat kun je doen?</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Klik op "Herladen" om de pagina opnieuw te laden</li>
                    <li>Controleer je internetverbinding</li>
                    <li>Probeer uit te loggen en opnieuw in te loggen</li>
                    <li>Neem contact op met support als het probleem aanhoudt</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
