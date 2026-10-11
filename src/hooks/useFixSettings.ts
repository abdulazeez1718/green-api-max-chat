import { useCallback, useState } from 'react'
import { toUserMessage } from '../api/errors'
import { useGreenApi } from '../api/GreenApiContext'
import type { InstanceSettings } from '../api/types'
import { getSettingsIssues, RECOMMENDED_SETTINGS, useSessionStore } from '../store/sessionStore'

export interface FixSettingsState {
  busy: boolean
  error: string | null
  done: boolean
  fix: () => Promise<void>
}

/**
 * Включает уведомления, нужные чату (SetSettings). webhookUrl очищается
 * только если он задан — именно он мешает получать сообщения через HTTP API.
 */
export function useFixSettings(): FixSettingsState {
  const client = useGreenApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const fix = useCallback(async () => {
    const { settings, setSettings } = useSessionStore.getState()
    const patch: InstanceSettings = { ...RECOMMENDED_SETTINGS }
    if (!getSettingsIssues(settings).webhookUrlSet) delete patch.webhookUrl

    setBusy(true)
    setError(null)
    try {
      const { saveSettings } = await client.setSettings(patch)
      if (!saveSettings) {
        setError(
          'GREEN-API не сохранил настройки. Попробуйте позже или измените их в личном кабинете.',
        )
        return
      }
      setSettings({ ...settings, ...patch })
      setDone(true)
    } catch (fixError) {
      setError(toUserMessage(fixError))
    } finally {
      setBusy(false)
    }
  }, [client])

  return { busy, error, done, fix }
}
