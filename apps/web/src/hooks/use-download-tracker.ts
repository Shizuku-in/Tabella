/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useCallback, useEffect } from 'react'
import { useGallerySessionStore } from '../gallery/gallery-session-store.ts'
import { useServerEvents } from './use-server-events.ts'
import { useShallow } from 'zustand/react/shallow'

export function useDownloadTracker() {
  const [error, setError] = useState<string | null>(null)

  const { activeDownloadJobId, setActiveDownloadJobId } = useGallerySessionStore(
    useShallow((state) => ({
      activeDownloadJobId: state.activeDownloadJobId,
      setActiveDownloadJobId: state.setActiveDownloadJobId,
    }))
  )

  const checkDownloadJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/download-jobs/${jobId}`)
      if (!response.ok) {
        setActiveDownloadJobId(null)
        return
      }

      const statusData = await response.json()
      if (statusData.status === 'completed') {
        setActiveDownloadJobId(null)

        const a = document.createElement('a')
        a.href = `/api/download-jobs/${jobId}/file`
        a.download = ''
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else if (statusData.status === 'failed') {
        setActiveDownloadJobId(null)
        setError(statusData.error_message ?? 'Download job failed.')
      }
    } catch (e) {
      console.error('Failed to check download job:', e)
    }
  }, [setActiveDownloadJobId])

  useServerEvents<{ id: unknown }>('download_job_updated', useCallback(async (data) => {
    if (!activeDownloadJobId || data.id !== activeDownloadJobId) return
    await checkDownloadJobStatus(activeDownloadJobId)
  }, [activeDownloadJobId, checkDownloadJobStatus]))

  // Fallback polling in case SSE events are lost or connection drops
  useEffect(() => {
    if (!activeDownloadJobId) return

    // We must check immediately when the ID is set! 
    // Because if the job finishes extremely fast, the SSE event might be emitted 
    // *before* the POST request returns and activeDownloadJobId is set, causing us to miss the event.
    void checkDownloadJobStatus(activeDownloadJobId)

    const timer = window.setInterval(() => {
      void checkDownloadJobStatus(activeDownloadJobId)
    }, 3000)

    return () => window.clearInterval(timer)
  }, [activeDownloadJobId, checkDownloadJobStatus])

  return {
    isDownloading: activeDownloadJobId !== null,
    error,
    clearError: () => setError(null)
  }
}
