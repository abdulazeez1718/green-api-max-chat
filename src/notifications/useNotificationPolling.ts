import { useEffect } from 'react'
import type { GreenApiClient } from '../api/greenApi'
import { useChatStore } from '../store/chatStore'
import { useSessionStore, type ConnectionStatus } from '../store/sessionStore'
import { parseNotification } from './parseNotification'
import { runNotificationLoop } from './poller'

function handleNotification(body: unknown): void {
  const event = parseNotification(body)
  if (!event) return
  const session = useSessionStore.getState()
  switch (event.type) {
    case 'state':
      session.setInstanceState(event.state)
      return
    case 'quota':
      session.setQuotaMessage(event.description)
      return
    default:
      useChatStore.getState().applyEvent(event)
  }
}

function setConnection(
  status: ConnectionStatus,
  details?: { retryAt?: number | null; error?: string | null },
): void {
  const session = useSessionStore.getState()
  // Не дёргаем подписчиков на каждом успешном long polling-запросе.
  if (status === session.connection && !details) return
  session.setConnection(status, details)
}

/**
 * Пока `enabled`, получает уведомления из очереди инстанса и раскладывает их по чатам.
 * При размонтировании или выключении цикл отменяется вместе с текущим запросом.
 */
export function useNotificationPolling(client: GreenApiClient | null, enabled: boolean): void {
  useEffect(() => {
    if (!client || !enabled) return
    const controller = new AbortController()
    setConnection('connecting')

    void runNotificationLoop(client, controller.signal, {
      onNotification: handleNotification,
      onOnline: () => {
        setConnection('online')
      },
      onRetry: (error, retryAt) => {
        setConnection('reconnecting', { error, retryAt })
      },
      onFatal: (error) => {
        setConnection('stopped', { error: error.message })
      },
    })

    return () => {
      controller.abort()
    }
  }, [client, enabled])
}
