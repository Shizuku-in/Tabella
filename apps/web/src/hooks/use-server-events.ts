import { useEffect } from 'react'

export type EventCallback<T = unknown> = (data: T) => void

// Reconnect delays: 1s, 2s, 4s, 8s, 16s, capped at 30s
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]

class ServerEventsManager {
  private eventSource: EventSource | null = null
  private listeners: Map<string, Set<EventCallback>> = new Map()
  private wrappers = new WeakMap<EventCallback, EventListener>()
  private connectionCount = 0
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isUnauthorized = false

  connect() {
    this.connectionCount++
    if (!this.eventSource) {
      void this.openEventSource()
    }
  }

  private async openEventSource() {
    // Pre-check authentication before opening the EventSource.
    // EventSource does not expose HTTP status codes, so we use fetch to
    // detect 401 Unauthorized explicitly and avoid infinite reconnect loops.
    try {
      const probe = await fetch('/api/events', { method: 'HEAD' })
      if (probe.status === 401) {
        this.isUnauthorized = true
        console.warn('SSE: not connecting, user is not authenticated (401)')
        return
      }
    } catch {
      // Network error during probe — fall through and let EventSource handle it
    }

    this.eventSource = new EventSource('/api/events')

    this.eventSource.onopen = () => {
      this.reconnectAttempt = 0
      this.isUnauthorized = false
    }

    this.eventSource.onerror = () => {
      if (!this.eventSource) return

      // readyState 2 = CLOSED; the browser won't auto-reconnect from this state
      if (this.eventSource.readyState === EventSource.CLOSED) {
        this.eventSource = null

        // Do not reconnect if the server rejected us with 401
        if (this.isUnauthorized) {
          console.warn('SSE: not reconnecting after 401 Unauthorized')
          return
        }

        if (this.connectionCount > 0) {
          this.scheduleReconnect()
        }
      }
      // readyState 0 = CONNECTING: browser is handling reconnect automatically, do nothing
    }

    // Re-attach all existing listeners
    this.listeners.forEach((callbacks, eventName) => {
      callbacks.forEach((callback) => {
        this.attachListener(eventName, callback)
      })
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt++

    console.log(`SSE: reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.connectionCount > 0 && !this.eventSource) {
        void this.openEventSource()
      }
    }, delay)
  }

  disconnect() {
    this.connectionCount--
    if (this.connectionCount <= 0 && this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      this.connectionCount = 0
      if (this.reconnectTimer !== null) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    }
  }

  private attachListener(eventName: string, callback: EventCallback) {
    if (!this.eventSource) return

    const wrapper: EventListener = (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as unknown
        callback(data)
      } catch (err) {
        console.error('SSE: failed to parse event data', err)
      }
    }

    this.wrappers.set(callback, wrapper)
    this.eventSource.addEventListener(eventName, wrapper)
  }

  private detachListener(eventName: string, callback: EventCallback) {
    if (!this.eventSource) return
    const wrapper = this.wrappers.get(callback)
    if (wrapper) {
      this.eventSource.removeEventListener(eventName, wrapper)
      this.wrappers.delete(callback)
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

export function useServerEvents<T = unknown>(eventName: string, callback: EventCallback<T>) {
  useEffect(() => {
    serverEvents.connect()
    const unsubscribe = serverEvents.subscribe(eventName, callback as EventCallback)

    return () => {
      unsubscribe()
      serverEvents.disconnect()
    }
  }, [eventName, callback])
}
