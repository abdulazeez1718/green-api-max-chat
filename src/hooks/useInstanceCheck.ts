import { useEffect } from 'react'
import type { GreenApiClient } from '../api/greenApi'
import { useSessionStore } from '../store/sessionStore'

/**
 * При открытии чата запрашивает состояние инстанса и его настройки:
 * по ним показываются предупреждения (не авторизован, задан webhookUrl,
 * выключены уведомления о входящих).
 */
export function useInstanceCheck(client: GreenApiClient): void {
  useEffect(() => {
    const controller = new AbortController()
    const session = useSessionStore.getState()

    void Promise.allSettled([
      client.getStateInstance(controller.signal),
      client.getSettings(controller.signal),
    ]).then(([state, settings]) => {
      if (controller.signal.aborted) return
      if (state.status === 'fulfilled') session.setInstanceState(state.value.stateInstance)
      if (settings.status === 'fulfilled') session.setSettings(settings.value)
    })

    return () => {
      controller.abort()
    }
  }, [client])
}
