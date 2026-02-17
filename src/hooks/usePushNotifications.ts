/**
 * Push Notifications Hook
 * 
 * Manages Web Push notification subscriptions.
 * Feature flag: VITE_PWA_PUSH=true
 * 
 * SECURITY:
 * - User must grant permission
 * - Subscriptions stored per user/tenant
 * - No sensitive data in push payloads
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

export const isPushEnabled = (): boolean => {
  return import.meta.env.VITE_PWA_PUSH === 'true'
}

export const usePushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'serviceWorker' in navigator && 
                     'PushManager' in window && 
                     'Notification' in window &&
                     isPushEnabled()
    
    setIsSupported(supported)
    
    if (supported) {
      setPermission(Notification.permission)
      checkSubscription()
    }
  }, [])

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return

    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      setSubscription(sub)
      setIsSubscribed(sub !== null)
    } catch (error) {
      console.error('Failed to check subscription:', error)
    }
  }, [])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast.error('Push notifications worden niet ondersteund')
      return false
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result === 'granted'
    } catch (error) {
      console.error('Failed to request permission:', error)
      toast.error('Kan geen toestemming vragen voor meldingen')
      return false
    }
  }, [isSupported])

  const getVAPIDPublicKey = async (): Promise<string> => {
    try {
      const response = await fetch('/api/v1/push/vapid-public-key')
      const data = await response.json()
      return data.publicKey
    } catch (error) {
      console.error('Failed to get VAPID key:', error)
      throw new Error('Kan VAPID key niet ophalen')
    }
  }

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast.error('Push notifications worden niet ondersteund')
      return false
    }

    setIsLoading(true)

    try {
      // Request permission if needed
      if (permission !== 'granted') {
        const granted = await requestPermission()
        if (!granted) {
          setIsLoading(false)
          return false
        }
      }

      // Get VAPID public key
      const vapidPublicKey = await getVAPIDPublicKey()
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)

      // Subscribe to push
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      })

      // Send subscription to backend
      const response = await fetch('/api/v1/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: sub.toJSON(),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save subscription')
      }

      setSubscription(sub)
      setIsSubscribed(true)
      toast.success('Meldingen ingeschakeld')
      return true
    } catch (error) {
      console.error('Failed to subscribe:', error)
      toast.error('Kan meldingen niet inschakelen')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, permission, requestPermission])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) {
      return true
    }

    setIsLoading(true)

    try {
      // Unsubscribe from push
      await subscription.unsubscribe()

      // Notify backend
      const response = await fetch('/api/v1/push/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      })

      if (!response.ok) {
        console.warn('Failed to notify backend of unsubscribe')
      }

      setSubscription(null)
      setIsSubscribed(false)
      toast.success('Meldingen uitgeschakeld')
      return true
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
      toast.error('Kan meldingen niet uitschakelen')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [subscription])

  const toggle = useCallback(async () => {
    if (isSubscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }, [isSubscribed, subscribe, unsubscribe])

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    toggle,
    requestPermission,
  }
}
