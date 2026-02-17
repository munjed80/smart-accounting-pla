export const isStandalone = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  )
}

export const isIosSafari = () => {
  if (typeof window === 'undefined') {
    return false
  }

  const userAgent = window.navigator.userAgent.toLowerCase()
  const isIosDevice = /iphone|ipad|ipod/.test(userAgent)
  const isSafariEngine = /safari/.test(userAgent)
  const isOtherIosBrowser = /crios|fxios|edgios|opios|mercury/.test(userAgent)

  return isIosDevice && isSafariEngine && !isOtherIosBrowser
}
