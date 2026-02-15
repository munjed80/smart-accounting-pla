export const pathToTab = (path: string, isAccountant: boolean, isSuperAdmin = false): string => {
  const normalizedPath = path.toLowerCase().replace(/\/$/, '') || '/'

  switch (normalizedPath) {
    case '/dashboard':
      return 'dashboard'
    case '/transactions':
      return 'transactions'
    case '/accountant/review':
    case '/accountant/review-queue':
      return 'reviewqueue'
    case '/accountant':
    case '/accountant/overview':
    case '/workqueue':
      return 'workqueue'
    case '/clients':
    case '/accountant/clients':
      return 'clients'
    case '/accountant/reminders':
      return 'reminders'
    case '/accountant/acties':
    case '/accountant/activity':
      return 'acties'
    case '/accountant/bank':
      return 'bank'
    case '/accountant/crediteuren':
      return 'crediteuren'
    case '/accountant/winst-verlies':
      return 'profitloss'
    case '/accountant/grootboek':
      return 'grootboek'
    case '/ai-upload':
    case '/upload':
      return 'upload'
    case '/settings':
      return 'settings'
    case '/support':
      return 'support'
    case '/admin':
      return 'admin'
    case '/dashboard/boekhouder':
    case '/zzp/boekhouder':
      return 'boekhouder'
    case '/zzp/customers':
      return 'customers'
    case '/zzp/invoices':
      return 'invoices'
    case '/zzp/expenses':
      return 'expenses'
    case '/zzp/time':
      return 'time'
    case '/zzp/agenda':
      return 'agenda'
    case '/zzp/verplichtingen/overzicht':
      return 'obligations-overview'
    case '/zzp/verplichtingen/lease-leningen':
      return 'lease-loans'
    case '/zzp/verplichtingen/abonnementen':
      return 'subscriptions'
    case '/':
    default:
      return isSuperAdmin ? 'admin' : isAccountant ? 'workqueue' : 'dashboard'
  }
}

export const tabToPath = (tab: string, isAccountant: boolean, isSuperAdmin = false): string => {
  switch (tab) {
    case 'dashboard':
      return '/dashboard'
    case 'transactions':
      return '/transactions'
    case 'workqueue':
      return isSuperAdmin ? '/admin' : isAccountant ? '/accountant' : '/dashboard'
    case 'reviewqueue':
      return '/accountant/review-queue'
    case 'reminders':
      return '/accountant/reminders'
    case 'acties':
      return '/accountant/acties'
    case 'bank':
      return '/accountant/bank'
    case 'crediteuren':
      return '/accountant/crediteuren'
    case 'profitloss':
      return '/accountant/winst-verlies'
    case 'grootboek':
      return '/accountant/grootboek'
    case 'clients':
      return isAccountant ? '/accountant/clients' : '/clients'
    case 'upload':
      return '/ai-upload'
    case 'settings':
      return '/settings'
    case 'support':
      return '/support'
    case 'admin':
      return '/admin'
    case 'boekhouder':
      return '/dashboard/boekhouder'
    case 'customers':
      return '/zzp/customers'
    case 'invoices':
      return '/zzp/invoices'
    case 'expenses':
      return '/zzp/expenses'
    case 'time':
      return '/zzp/time'
    case 'agenda':
      return '/zzp/agenda'
    case 'obligations-overview':
      return '/zzp/verplichtingen/overzicht'
    case 'lease-loans':
      return '/zzp/verplichtingen/lease-leningen'
    case 'subscriptions':
      return '/zzp/verplichtingen/abonnementen'
    default:
      return isSuperAdmin ? '/admin' : isAccountant ? '/accountant' : '/dashboard'
  }
}
