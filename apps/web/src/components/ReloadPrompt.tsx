import { useRegisterSW } from 'virtual:pwa-register/react'
import { Snackbar, Button, Alert, AlertTitle } from '@mui/material'

export function ReloadPrompt() {
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

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <Snackbar
      open={offlineReady || needRefresh}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      sx={{ mb: 2, ml: 2 }}
    >
      <Alert
        severity="info"
        sx={{ width: '100%' }}
        action={
          <>
            {needRefresh && (
              <Button color="inherit" size="small" onClick={() => updateServiceWorker(true)}>
                Reload
              </Button>
            )}
            <Button color="inherit" size="small" onClick={() => close()}>
              Close
            </Button>
          </>
        }
      >
        <AlertTitle>{offlineReady ? 'Ready for offline' : 'Update available'}</AlertTitle>
        {offlineReady
          ? 'App is ready to work offline.'
          : 'New content is available, click on reload button to update.'}
      </Alert>
    </Snackbar>
  )
}
