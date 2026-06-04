import { useEffect } from 'react'

type EventCallback = (data: any) => void

class ServerEventsManager {
  private eventSource: EventSource | null = null
  private listeners: Map<string, Set<EventCallback>> = new Map()
  private connectionCount = 0

  connect() {
    this.connectionCount++
    if (!this.eventSource) {
      console.log('Connecting to SSE...')
      this.eventSource = new EventSource('/api/events')
      
      this.eventSource.onerror = (error) => {
        console.error('SSE Error:', error)
      }

      // Add all existing listeners to the new EventSource
      this.listeners.forEach((callbacks, eventName) => {
        callbacks.forEach((callback) => {
          this.attachListener(eventName, callback)
        })
      })
    }
  }

  disconnect() {
    this.connectionCount--
    if (this.connectionCount <= 0 && this.eventSource) {
      console.log('Disconnecting from SSE...')
      this.eventSource.close()
      this.eventSource = null
      this.connectionCount = 0
    }
  }

  private attachListener(eventName: string, callback: EventCallback) {
    if (!this.eventSource) return

    // We create a wrapper to parse the JSON data automatically
    const wrapper = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data)
        callback(data)
      } catch (err) {
        console.error('Failed to parse SSE data', err)
      }
    }
    
    // Store wrapper on callback for removal later
    ;(callback as any)._wrapper = wrapper
    this.eventSource.addEventListener(eventName, wrapper)
  }

  private detachListener(eventName: string, callback: EventCallback) {
    if (!this.eventSource) return
    const wrapper = (callback as any)._wrapper
    if (wrapper) {
      this.eventSource.removeEventListener(eventName, wrapper)
    }
  }

  subscribe(eventName: string, callback: EventCallback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    this.listeners.get(eventName)!.add(callback)
    
    this.attachListener(eventName, callback)

    return () => {
      const callbacks = this.listeners.get(eventName)
      if (callbacks) {
        callbacks.delete(callback)
        this.detachListener(eventName, callback)
        if (callbacks.size === 0) {
          this.listeners.delete(eventName)
        }
      }
    }
  }
}

export const serverEvents = new ServerEventsManager()

export function useServerEvents(eventName: string, callback: EventCallback) {
  useEffect(() => {
    serverEvents.connect()
    const unsubscribe = serverEvents.subscribe(eventName, callback)
    
    return () => {
      unsubscribe()
      serverEvents.disconnect()
    }
  }, [eventName, callback])
}
