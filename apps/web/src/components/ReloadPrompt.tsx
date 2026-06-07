import { Alert, AlertTitle, Button, Snackbar } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function ReloadPrompt() {
  const { t } = useTranslation()
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  return (
    <>
      <Snackbar
        open={offlineReady}
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
