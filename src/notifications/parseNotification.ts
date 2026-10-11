import type { MessageStatus } from '../model'

/**
 * Событие чата, полученное из входящего уведомления GREEN-API.
 * Форматы уведомлений: https://green-api.com/v3/docs/api/receiving/notifications-format/
 */
export type ChatEvent =
  | {
      type: 'message'
      direction: 'in' | 'out'
      /** true — исходящее отправлено через API (в том числе этим приложением). */
      fromApi: boolean
      chatId: string
      idMessage: string
      /** мс */
      timestamp: number
      text: string
      unsupportedLabel?: string
      chatName?: string
      /** Номер собеседника — только для входящих в личном чате. */
      senderPhone?: string
    }
  | { type: 'edited'; chatId: string; targetId: string; text: string }
  | { type: 'deleted'; chatId: string; targetId: string }
  | {
      type: 'status'
      chatId: string
      idMessage: string
      status: MessageStatus
      error?: string
    }
  | { type: 'state'; state: string }
  | { type: 'quota'; description: string }

type Json = Record<string, unknown>

const MESSAGE_WEBHOOKS: Record<string, { direction: 'in' | 'out'; fromApi: boolean }> = {
  incomingMessageReceived: { direction: 'in', fromApi: false },
  outgoingMessageReceived: { direction: 'out', fromApi: false },
  outgoingAPIMessageReceived: { direction: 'out', fromApi: true },
}

/** Нетекстовые типы: в чате показываем подпись-заглушку. */
const UNSUPPORTED_LABELS: Record<string, string> = {
  imageMessage: 'Фото',
  videoMessage: 'Видео',
  documentMessage: 'Файл',
  audioMessage: 'Аудио',
  stickerMessage: 'Стикер',
  locationMessage: 'Геолокация',
  contactMessage: 'Контакт',
  pollMessage: 'Опрос',
}

const FAILED_STATUS_TEXT: Record<string, string> = {
  failed: 'Не удалось доставить сообщение',
  noAccount: 'У получателя нет аккаунта MAX',
  notInGroup: 'Вы не участник этой группы',
  yellowCard: 'Отправка сообщений временно ограничена',
}

function asRecord(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null ? (value as Json) : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function asTimestamp(value: unknown): number {
  // В уведомлениях timestamp — Unix-время в секундах.
  return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : Date.now()
}

function textOf(messageData: Json): string | undefined {
  const text =
    asRecord(messageData.textMessageData)?.textMessage ??
    asRecord(messageData.extendedTextMessageData)?.text
  return typeof text === 'string' ? text : undefined
}

function parseMessage(
  body: Json,
  kind: { direction: 'in' | 'out'; fromApi: boolean },
): ChatEvent | null {
  const sender = asRecord(body.senderData)
  const messageData = asRecord(body.messageData)
  const chatId = asString(sender?.chatId)
  const idMessage = asString(body.idMessage)
  const typeMessage = asString(messageData?.typeMessage)
  if (!sender || !messageData || !chatId || !idMessage || !typeMessage) return null

  switch (typeMessage) {
    case 'reactionMessage':
      // Реакции не являются сообщениями — минимальный интерфейс их не показывает.
      return null
    case 'editedMessage': {
      const edited = asRecord(messageData.editedMessageData)
      const targetId = asString(edited?.stanzaId)
      const text = edited?.textMessage
      if (!targetId || typeof text !== 'string') return null
      return { type: 'edited', chatId, targetId, text }
    }
    case 'deletedMessage': {
      const targetId = asString(asRecord(messageData.deletedMessageData)?.stanzaId)
      return targetId ? { type: 'deleted', chatId, targetId } : null
    }
  }

  const text = textOf(messageData)
  const unsupportedLabel =
    text === undefined ? (UNSUPPORTED_LABELS[typeMessage] ?? 'Сообщение') : undefined
  const caption = asString(asRecord(messageData.fileMessageData)?.caption)

  const isPrivateChat = !chatId.startsWith('-')
  const phoneNumber = sender.senderPhoneNumber
  const senderPhone =
    kind.direction === 'in' &&
    isPrivateChat &&
    (typeof phoneNumber === 'number' || typeof phoneNumber === 'string')
      ? String(phoneNumber).replace(/\D/g, '') || undefined
      : undefined

  const chatName =
    kind.direction === 'in'
      ? (asString(sender.senderContactName) ??
        asString(sender.chatName) ??
        asString(sender.senderName))
      : asString(sender.chatName)

  return {
    type: 'message',
    direction: kind.direction,
    fromApi: kind.fromApi,
    chatId,
    idMessage,
    timestamp: asTimestamp(body.timestamp),
    text: text ?? caption ?? '',
    ...(unsupportedLabel ? { unsupportedLabel } : {}),
    ...(chatName ? { chatName } : {}),
    ...(senderPhone ? { senderPhone } : {}),
  }
}

function parseStatus(body: Json): ChatEvent | null {
  const chatId = asString(body.chatId)
  const idMessage = asString(body.idMessage)
  const raw = asString(body.status)
  if (!chatId || !idMessage || !raw) return null

  if (raw === 'sent' || raw === 'delivered' || raw === 'read') {
    return { type: 'status', chatId, idMessage, status: raw }
  }
  if (raw === 'pending') return { type: 'status', chatId, idMessage, status: 'pending' }

  const error = FAILED_STATUS_TEXT[raw] ?? asString(body.description) ?? `Статус: ${raw}`
  return { type: 'status', chatId, idMessage, status: 'failed', error }
}

/** Превращает тело уведомления в событие чата; `null` — уведомление интерфейсу не нужно. */
export function parseNotification(body: unknown): ChatEvent | null {
  const data = asRecord(body)
  const typeWebhook = asString(data?.typeWebhook)
  if (!data || !typeWebhook) return null

  const messageKind = MESSAGE_WEBHOOKS[typeWebhook]
  if (messageKind) return parseMessage(data, messageKind)

  switch (typeWebhook) {
    case 'outgoingMessageStatus':
      return parseStatus(data)
    case 'stateInstanceChanged': {
      const state = asString(data.stateInstance)
      return state ? { type: 'state', state } : null
    }
    case 'quotaExceeded': {
      const description = asString(asRecord(data.quotaData)?.description)
      return {
        type: 'quota',
        description:
          description ??
          'Превышен месячный лимит тарифа «Разработчик»: переписка возможна только с тремя чатами.',
      }
    }
    default:
      return null
  }
}
