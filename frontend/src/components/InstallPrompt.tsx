import { useEffect, useState } from 'react'

const DISMISS_KEY = 'install-prompt-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

function readStandalone(): boolean {
  const displayStandalone = window.matchMedia('(display-mode: standalone)').matches
  const navigatorStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return displayStandalone || navigatorStandalone
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [standalone, setStandalone] = useState(readStandalone)

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)')

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    function handleInstalled() {
      setDeferredPrompt(null)
      setStandalone(true)
    }

    function handleDisplayModeChange(event: MediaQueryListEvent) {
      setStandalone(event.matches)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    media.addEventListener('change', handleDisplayModeChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      media.removeEventListener('change', handleDisplayModeChange)
    }
  }, [])

  if (standalone || dismissed || deferredPrompt === null) {
    return null
  }

  const installEvent = deferredPrompt

  async function handleInstall() {
    await installEvent.prompt()
    await installEvent.userChoice
    setDeferredPrompt(null)
  }

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // Storage unavailable; the banner still hides for this session.
    }
    setDismissed(true)
  }

  return (
    <section
      aria-label="Install app"
      className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-raised p-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install Fitness Tracker</p>
        <p className="text-xs text-content-muted">
          Add it to your home screen for a full-screen experience.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="min-h-11 shrink-0 rounded-lg bg-accent-strong px-4 text-sm font-semibold text-surface transition-colors hover:bg-accent"
      >
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss install prompt"
        onClick={handleDismiss}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xl text-content-muted transition-colors hover:text-content"
      >
        ×
      </button>
    </section>
  )
}
