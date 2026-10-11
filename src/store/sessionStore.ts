import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Credentials, InstanceSettings } from '../api/types'

export type ConnectionStatus =
  /** Первое подключение к очереди уведомлений. */
  | 'connecting'
  /** Long polling работает. */
  | 'online'
  /** Ошибка сети/сервера — повтор по таймеру. */
  | 'reconnecting'
  /** Получение остановлено: нужна реакция пользователя (см. stopReason). */
  | 'stopped'
  /** Чат открыт в другой вкладке — эта вкладка не опрашивает очередь. */
  | 'paused'

interface SessionStore {
  credentials: Credentials | null
  /** Состояние инстанса из GetStateInstance / stateInstanceChanged. */
  instanceState: string | null
  settings: InstanceSettings | null
  connection: ConnectionStatus
  /** Когда будет следующая попытка (для статуса «reconnecting»), мс. */
  retryAt: number | null
  /** Почему получение уведомлений остановлено или почему нет связи. */
  connectionError: string | null
  /** Сообщение о превышении лимита тарифа «Разработчик». */
  quotaMessage: string | null

  login: (credentials: Credentials) => void
  logout: () => void
  setInstanceState: (state: string | null) => void
  setSettings: (settings: InstanceSettings | null) => void
  setConnection: (
    status: ConnectionStatus,
    details?: { retryAt?: number | null; error?: string | null },
  ) => void
  setQuotaMessage: (message: string | null) => void
}

const initialStatus = {
  instanceState: null,
  settings: null,
  connection: 'connecting' as ConnectionStatus,
  retryAt: null,
  connectionError: null,
  quotaMessage: null,
}

/**
 * Учётные данные хранятся в sessionStorage: переживают перезагрузку страницы,
 * но удаляются при закрытии вкладки. Остальное состояние сессии не сохраняется.
 */
export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      credentials: null,
      ...initialStatus,

      login: (credentials) => {
        set({ credentials, ...initialStatus })
      },
      logout: () => {
        set({ credentials: null, ...initialStatus })
      },
      setInstanceState: (instanceState) => {
        set({ instanceState })
      },
      setSettings: (settings) => {
        set({ settings })
      },
      setConnection: (connection, details) => {
        set({
          connection,
          retryAt: details?.retryAt ?? null,
          connectionError: details?.error ?? null,
        })
      },
      setQuotaMessage: (quotaMessage) => {
        set({ quotaMessage })
      },
    }),
    {
      name: 'max-chat:v1:session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ credentials: state.credentials }),
    },
  ),
)

/** Проблемы настроек инстанса, из-за которых сообщения не будут видны в чате. */
export interface SettingsIssues {
  /** Задан webhookUrl — очередь HTTP API недоступна (ошибка 400 при ReceiveNotification). */
  webhookUrlSet: boolean
  /** Выключены уведомления о входящих сообщениях. */
  incomingDisabled: boolean
  /** Выключены статусы/копии исходящих — галочки доставки и синхронизация с телефоном. */
  outgoingDisabled: boolean
}

export function getSettingsIssues(settings: InstanceSettings | null): SettingsIssues {
  if (!settings) return { webhookUrlSet: false, incomingDisabled: false, outgoingDisabled: false }
  return {
    webhookUrlSet: Boolean(settings.webhookUrl?.trim()),
    incomingDisabled: settings.incomingWebhook === 'no',
    outgoingDisabled:
      settings.outgoingWebhook === 'no' ||
      settings.outgoingAPIMessageWebhook === 'no' ||
      settings.outgoingMessageWebhook === 'no',
  }
}

/** Настройки, при которых чат получает всё нужное через HTTP API. */
export const RECOMMENDED_SETTINGS: InstanceSettings = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  stateWebhook: 'yes',
}
