import { Alert, AlertTitle, Button, Snackbar } from '@mui/material'
import { useRegisterSW } from 'virtual:pwa-register/react'

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
              Close
            </Button>
          }
        >
          <AlertTitle>Ready for offline</AlertTitle>
          App is ready to work offline.
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
                Reload
              </Button>
              <Button color="inherit" size="small" onClick={() => setNeedRefresh(false)}>
                Close
              </Button>
            </>
          }
        >
          <AlertTitle>Update available</AlertTitle>
          New content is available, click on reload button to update.
        </Alert>
      </Snackbar>
    </>
  )
}
