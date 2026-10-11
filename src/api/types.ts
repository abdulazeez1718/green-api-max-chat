/**
 * Типы GREEN-API для мессенджера MAX (API v3).
 * Документация: https://green-api.com/v3/docs/api/
 *
 * Тела уведомлений приходят из сети, поэтому типы здесь описывают ожидаемую форму,
 * а реальная проверка полей выполняется в `parseNotification`.
 */

/** Учётные данные инстанса из личного кабинета GREEN-API. */
export interface Credentials {
  /** Адрес API, например `https://api.green-api.com/v3`. */
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

/** Состояние инстанса: GetStateInstance и уведомление stateInstanceChanged. */
export type InstanceState =
  'notAuthorized' | 'authorized' | 'blocked' | 'starting' | 'suspended' | 'sleepMode' | 'yellowCard'

export interface StateInstanceResponse {
  stateInstance: InstanceState | (string & {})
}

type YesNo = 'yes' | 'no'

/** Настройки инстанса (GetSettings / SetSettings). Перечислены только используемые поля. */
export interface InstanceSettings {
  wid?: string
  webhookUrl?: string
  incomingWebhook?: YesNo
  outgoingWebhook?: YesNo
  outgoingMessageWebhook?: YesNo
  outgoingAPIMessageWebhook?: YesNo
  stateWebhook?: YesNo
}

export interface SetSettingsResponse {
  saveSettings: boolean
}

export interface SendMessageRequest {
  chatId: string
  message: string
}

export interface SendMessageResponse {
  idMessage: string
}

export interface CheckAccountResponse {
  exist: boolean
  /** Идентификатор пользователя MAX; пустая строка, если аккаунта нет. */
  chatId: string
}

export interface DeleteNotificationResponse {
  result: boolean
}

/** Ответ ReceiveNotification. `null` — очередь пуста (истёк receiveTimeout). */
export interface ReceivedNotification {
  receiptId: number
  body: unknown
}
