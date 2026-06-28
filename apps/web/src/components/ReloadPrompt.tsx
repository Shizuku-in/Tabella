/**
 * Service worker prompt notifying users when a new app version is available or ready for offline use. (PWA)
 */

import { Alert, AlertTitle, Button, Snackbar } from '@mui/material'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function ReloadPrompt() {
  const { t } = useTranslation()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(
          () => {
            r.update()
          },
          60 * 60 * 1000,
        ) // Check for updates every hour
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <>
      <Snackbar
        open={offlineReady}
        autoHideDuration={5000}
        onClose={() => setOfflineReady(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ mb: 2, ml: 2 }}
      >
        <Alert
          severity="info"
          sx={{ width: '100%' }}
          action={
            <Button color="inherit" size="small" onClick={() => setOfflineReady(false)}>
              {t('common.close')}
            </Button>
          }
        >
          <AlertTitle>{t('common.pwa.ready')}</AlertTitle>
          {t('common.pwa.readyDesc')}
        </Alert>
      </Snackbar>

      <Snackbar
        open={needRefresh}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ mb: 2, ml: 2 }}
      >
        <Alert
          severity="info"
          sx={{ width: '100%' }}
          action={
            <>
              <Button color="inherit" size="small" onClick={() => updateServiceWorker(true)}>
                {t('common.pwa.reload')}
              </Button>
              <Button color="inherit" size="small" onClick={() => setNeedRefresh(false)}>
                {t('common.close')}
              </Button>
            </>
          }
        >
          <AlertTitle>{t('common.pwa.update')}</AlertTitle>
          {t('common.pwa.updateDesc')}
        </Alert>
      </Snackbar>
    </>
  )
}
