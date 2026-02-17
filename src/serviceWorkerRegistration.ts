const SW_URL = '/service-worker.js'

const isProduction = import.meta.env.PROD
const pwaEnabled = import.meta.env.VITE_ENABLE_PWA === 'true'

export const registerServiceWorker = async (): Promise<void> => {
  if (!isProduction || !pwaEnabled) {
    return
  }

  if (!('serviceWorker' in navigator)) {
    return
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const hasTargetRegistration = registrations.some((registration) => registration.active?.scriptURL.endsWith(SW_URL))

    if (hasTargetRegistration) {
      return
    }

    await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  } catch (error) {
    console.error('Service worker registration failed:', error)
  }
}
