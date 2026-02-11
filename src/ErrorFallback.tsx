import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";

import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { isRecoverableError, requiresReauth, NotFoundError, NetworkError } from "./lib/errors";

export const ErrorFallback = ({ error, resetErrorBoundary }) => {
  // In development mode, we still show our custom UI but with more details
  // We no longer re-throw to avoid the intrusive Vite/Spark overlay for recoverable errors
  const isDev = import.meta.env.DEV;
  const isRecoverable = isRecoverableError(error);
  const needsAuth = requiresReauth(error);

  // For auth errors, redirect to login
  if (needsAuth) {
    window.location.href = '/login';
    return null;
  }

  // Get user-friendly error message based on error type
  const getUserMessage = () => {
    if (error instanceof NotFoundError) {
      return 'De gevraagde pagina of gegevens konden niet worden gevonden.';
    }
    if (error instanceof NetworkError) {
      return 'Er is een probleem met de netwerkverbinding. Controleer je internetverbinding en probeer het opnieuw.';
    }
    if (isRecoverable) {
      return 'Er is een tijdelijk probleem opgetreden. Probeer het opnieuw.';
    }
    return isDev 
      ? 'An error occurred during development. See details below and check the console for more information.'
      : 'Something unexpected happened while running the application. The error details are shown below. Contact the spark author and let them know about this issue.';
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Alert variant={isRecoverable ? "default" : "destructive"} className="mb-6">
          <AlertTriangleIcon />
          <AlertTitle>
            {isRecoverable ? 'Er ging iets mis' : (isDev ? 'Development Error' : 'This spark has encountered a runtime error')}
          </AlertTitle>
          <AlertDescription>
            {getUserMessage()}
          </AlertDescription>
        </Alert>
        
        <div className="bg-card border rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">Error Details:</h3>
          <pre className="text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-32">
            {error.message}
          </pre>
          {isDev && error.stack && (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                Stack Trace
              </summary>
              <pre className="text-xs text-destructive bg-muted/50 p-3 rounded border overflow-auto max-h-64 mt-2">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
        
        <Button 
          onClick={resetErrorBoundary} 
          className="w-full"
          variant="outline"
        >
          <RefreshCwIcon />
          Try Again
        </Button>
      </div>
    </div>
  );
}
