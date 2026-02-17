const SW_URL = '/service-worker.js'

const isProduction = import.meta.env.PROD
const pwaEnabled = import.meta.env.VITE_ENABLE_PWA === 'true'

export const registerServiceWorker = async (): Promise<void> => {
  if (!isProduction || !pwaEnabled || !('serviceWorker' in navigator)) {
    return
  }

  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration('/')

    if (existingRegistration?.active?.scriptURL.endsWith(SW_URL)) {
      await existingRegistration.update()
      return
    }

    await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  } catch (error) {
    console.error('Service worker registration failed:', error)
  }
}
