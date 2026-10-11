import type { Chat, Message, MessageStatus } from '../model'
import type { ChatEvent } from '../notifications/parseNotification'

/**
 * Чистые функции изменения данных чатов. Все функции иммутабельны:
 * возвращают новый объект или тот же, если ничего не изменилось.
 */

export interface OrphanStatus {
  status: MessageStatus
  error?: string
}

export interface ChatData {
  chats: Record<string, Chat>
  messages: Record<string, Message[]>
  /**
   * Статусы, пришедшие раньше, чем стал известен idMessage (гонка ответа SendMessage
   * и уведомления). Применяются, как только сообщение с таким idMessage появится.
   */
  orphanStatuses: Record<string, OrphanStatus>
}

/** Ограничение истории на чат — чтобы не переполнить localStorage. */
export const MAX_MESSAGES_PER_CHAT = 500
const MAX_ORPHAN_STATUSES = 100
/** Окно, в котором эхо от API сопоставляется с ещё не подтверждённым сообщением по тексту. */
const ECHO_MATCH_WINDOW_MS = 2 * 60 * 1000

export function emptyChatData(): ChatData {
  return { chats: {}, messages: {}, orphanStatuses: {} }
}

// ---------- вспомогательное ----------

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))
}

function withoutError(message: Message): Message {
  if (message.error === undefined) return message
  const copy = { ...message }
  delete copy.error
  return copy
}

function withChat(data: ChatData, chat: Chat): ChatData {
  return { ...data, chats: { ...data.chats, [chat.id]: chat } }
}

function withMessages(data: ChatData, chatId: string, list: Message[]): ChatData {
  return { ...data, messages: { ...data.messages, [chatId]: list } }
}

function insertSorted(list: Message[], message: Message): Message[] {
  let index = list.length
  while (index > 0 && (list[index - 1]?.timestamp ?? 0) > message.timestamp) index--
  const next = [...list.slice(0, index), message, ...list.slice(index)]
  return next.length > MAX_MESSAGES_PER_CHAT
    ? next.slice(next.length - MAX_MESSAGES_PER_CHAT)
    : next
}

function updateMessage(
  data: ChatData,
  chatId: string,
  predicate: (message: Message) => boolean,
  update: (message: Message) => Message,
): ChatData {
  const list = data.messages[chatId]
  if (!list) return data
  const index = list.findIndex(predicate)
  const current = list[index]
  if (index === -1 || !current) return data
  const next = [...list]
  next[index] = update(current)
  return withMessages(data, chatId, next)
}

function isUnconfirmedEcho(message: Message, text: string, timestamp: number): boolean {
  return (
    message.direction === 'out' &&
    !message.idMessage &&
    message.text === text &&
    Math.abs(message.timestamp - timestamp) < ECHO_MATCH_WINDOW_MS
  )
}

// ---------- поиск ----------

/** chatId чата по его chatId или псевдониму. */
export function resolveChatId(data: ChatData, chatId: string): string | undefined {
  if (chatId in data.chats) return chatId
  return Object.values(data.chats).find((chat) => chat.aliases.includes(chatId))?.id
}

export function findChatByPhone(data: ChatData, phone: string): string | undefined {
  return Object.values(data.chats).find((chat) => chat.phone === phone)?.id
}

/** Ищет сообщение по idMessage во всех чатах. */
export function findMessageById(data: ChatData, idMessage: string): string | undefined {
  for (const [chatId, list] of Object.entries(data.messages)) {
    if (list.some((message) => message.idMessage === idMessage)) return chatId
  }
  return undefined
}

// ---------- статусы ----------

const STATUS_RANK: Record<Exclude<MessageStatus, 'failed'>, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

/** Статус только «продвигается»: read не откатится к delivered; failed не затрёт доставленное. */
export function mergeStatus(
  current: MessageStatus | undefined,
  next: MessageStatus,
): MessageStatus {
  if (!current) return next
  if (next === 'failed') return current === 'delivered' || current === 'read' ? current : 'failed'
  if (current === 'failed') return next === 'pending' ? current : next
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current
}

function applyStatusTo(message: Message, status: MessageStatus, error?: string): Message {
  const merged = mergeStatus(message.status, status)
  const base = withoutError(message)
  return merged === 'failed'
    ? { ...base, status: merged, error: error ?? message.error ?? 'Сообщение не доставлено' }
    : { ...base, status: merged }
}

// ---------- чаты ----------

/** Привязывает к чату дополнительные сведения: псевдоним chatId, номер, имя. */
function linkChat(
  data: ChatData,
  chatId: string,
  info: { alias?: string | undefined; phone?: string | undefined; name?: string | undefined },
): ChatData {
  const chat = data.chats[chatId]
  if (!chat) return data
  const alias = info.alias
  const addAlias = alias !== undefined && alias !== chat.id && !chat.aliases.includes(alias)
  const phone = chat.phone ?? info.phone
  const name = chat.name ?? info.name
  if (!addAlias && phone === chat.phone && name === chat.name) return data
  return withChat(data, {
    ...chat,
    aliases: addAlias ? [...chat.aliases, alias] : chat.aliases,
    ...(phone ? { phone } : {}),
    ...(name ? { name } : {}),
  })
}

export interface NewChatInput {
  /** chatId для отправки. */
  id: string
  phone?: string | undefined
  name?: string | undefined
  /** Дополнительные chatId этого собеседника. */
  aliases?: string[]
}

/** Создаёт чат или возвращает существующий (по chatId, псевдониму или номеру). */
export function upsertChat(
  data: ChatData,
  input: NewChatInput,
  now: number,
): { data: ChatData; chatId: string } {
  const candidates = [input.id, ...(input.aliases ?? [])]
  const existing =
    candidates.map((id) => resolveChatId(data, id)).find((id) => id !== undefined) ??
    (input.phone ? findChatByPhone(data, input.phone) : undefined)

  if (existing) {
    let next = data
    for (const alias of candidates) next = linkChat(next, existing, { alias })
    next = linkChat(next, existing, { phone: input.phone, name: input.name })
    return { data: next, chatId: existing }
  }

  const chat: Chat = {
    id: input.id,
    aliases: (input.aliases ?? []).filter((alias) => alias !== input.id),
    unread: 0,
    createdAt: now,
    updatedAt: now,
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.name ? { name: input.name } : {}),
  }
  return { data: withMessages(withChat(data, chat), chat.id, []), chatId: chat.id }
}

export function markChatRead(data: ChatData, chatId: string): ChatData {
  const chat = data.chats[chatId]
  if (!chat || chat.unread === 0) return data
  return withChat(data, { ...chat, unread: 0 })
}

function touchChat(data: ChatData, chatId: string, timestamp: number, unreadDelta = 0): ChatData {
  const chat = data.chats[chatId]
  if (!chat) return data
  return withChat(data, {
    ...chat,
    updatedAt: Math.max(chat.updatedAt, timestamp),
    unread: chat.unread + unreadDelta,
  })
}

// ---------- исходящие из интерфейса ----------

export function addOutgoing(
  data: ChatData,
  chatId: string,
  key: string,
  text: string,
  now: number,
): ChatData {
  if (!(chatId in data.chats)) return data
  const message: Message = { key, direction: 'out', text, timestamp: now, status: 'pending' }
  const next = withMessages(data, chatId, insertSorted(data.messages[chatId] ?? [], message))
  return touchChat(next, chatId, now)
}

/** SendMessage принял сообщение: запоминаем idMessage и применяем статусы, пришедшие раньше. */
export function confirmOutgoing(
  data: ChatData,
  chatId: string,
  key: string,
  idMessage: string,
): ChatData {
  let next = data
  let status: MessageStatus = 'sent'

  // Эхо outgoingAPIMessageReceived могло прийти раньше ответа и не сопоставиться —
  // тогда в чате уже есть копия с этим idMessage: убираем её, сохранив статус.
  const list = next.messages[chatId] ?? []
  const duplicate = list.find((m) => m.idMessage === idMessage && m.key !== key)
  if (duplicate) {
    status = mergeStatus(status, duplicate.status ?? 'sent')
    next = withMessages(
      next,
      chatId,
      list.filter((m) => m !== duplicate),
    )
  }

  const orphan = next.orphanStatuses[idMessage]
  next = updateMessage(
    next,
    chatId,
    (m) => m.key === key,
    (m) => {
      const confirmed = applyStatusTo({ ...m, idMessage }, status)
      return orphan ? applyStatusTo(confirmed, orphan.status, orphan.error) : confirmed
    },
  )
  return orphan ? { ...next, orphanStatuses: omitKey(next.orphanStatuses, idMessage) } : next
}

export function failOutgoing(data: ChatData, chatId: string, key: string, error: string): ChatData {
  return updateMessage(
    data,
    chatId,
    (m) => m.key === key,
    (m) => ({ ...m, status: 'failed', error }),
  )
}

/** Повторная отправка: сообщение снова «в пути». */
export function retryOutgoing(data: ChatData, chatId: string, key: string): ChatData {
  return updateMessage(
    data,
    chatId,
    (m) => m.key === key,
    (m) => ({ ...withoutError(m), status: 'pending' }),
  )
}

// ---------- события из уведомлений ----------

export interface ApplyContext {
  now: number
  /** Чат, который пользователь сейчас видит на экране (для счётчика непрочитанных). */
  viewingChatId: string | null
}

type MessageEvent = Extract<ChatEvent, { type: 'message' }>
type StatusEvent = Extract<ChatEvent, { type: 'status' }>

/** Находит чат для сообщения из уведомления, не создавая новых. */
function locateChat(data: ChatData, event: MessageEvent): string | undefined {
  const byId = resolveChatId(data, event.chatId) ?? findMessageById(data, event.idMessage)
  if (byId) return byId

  if (event.senderPhone) {
    const byPhone = findChatByPhone(data, event.senderPhone)
    if (byPhone) return byPhone
  }

  if (event.direction === 'out' && event.fromApi) {
    // Эхо нашего сообщения, отправленного по номеру (`…@c.us`), может прийти с ID MAX:
    // сопоставляем с ещё не подтверждённым сообщением с тем же текстом.
    for (const [chatId, list] of Object.entries(data.messages)) {
      if (list.some((m) => isUnconfirmedEcho(m, event.text, event.timestamp))) return chatId
    }
  }
  return undefined
}

function applyMessage(data: ChatData, event: MessageEvent, ctx: ApplyContext): ChatData {
  const chatInfo = { phone: event.senderPhone, name: event.chatName }
  let next = data
  let chatId = locateChat(data, event)
  if (chatId) {
    next = linkChat(next, chatId, { alias: event.chatId, ...chatInfo })
  } else {
    const created = upsertChat(next, { id: event.chatId, ...chatInfo }, ctx.now)
    next = created.data
    chatId = created.chatId
  }

  const list = next.messages[chatId] ?? []

  // Повторная доставка того же уведомления (например, DeleteNotification не дошёл).
  if (list.some((m) => m.idMessage === event.idMessage)) return next

  // Эхо нашего сообщения до ответа SendMessage: присваиваем idMessage локальной копии.
  if (event.direction === 'out' && event.fromApi) {
    const local = list.find((m) => isUnconfirmedEcho(m, event.text, event.timestamp))
    if (local) {
      return updateMessage(
        next,
        chatId,
        (m) => m.key === local.key,
        (m) => applyStatusTo({ ...m, idMessage: event.idMessage }, 'sent'),
      )
    }
  }

  const orphan = next.orphanStatuses[event.idMessage]
  let message: Message = {
    key: event.idMessage,
    idMessage: event.idMessage,
    direction: event.direction,
    text: event.text,
    timestamp: event.timestamp,
    ...(event.direction === 'out' ? { status: 'sent' as const } : {}),
    ...(event.unsupportedLabel ? { unsupportedLabel: event.unsupportedLabel } : {}),
  }
  if (orphan && message.direction === 'out') {
    message = applyStatusTo(message, orphan.status, orphan.error)
  }

  next = withMessages(next, chatId, insertSorted(list, message))
  if (orphan) next = { ...next, orphanStatuses: omitKey(next.orphanStatuses, event.idMessage) }

  const unread = event.direction === 'in' && ctx.viewingChatId !== chatId ? 1 : 0
  return touchChat(next, chatId, event.timestamp, unread)
}

function applyStatus(data: ChatData, event: StatusEvent): ChatData {
  const chatId = findMessageById(data, event.idMessage)
  if (!chatId) {
    // Статус обогнал ответ SendMessage — сохраним до появления сообщения.
    const entries = Object.entries(data.orphanStatuses)
    const kept = entries.length >= MAX_ORPHAN_STATUSES ? entries.slice(1) : entries
    const orphan: OrphanStatus = {
      status: event.status,
      ...(event.error ? { error: event.error } : {}),
    }
    return {
      ...data,
      orphanStatuses: { ...Object.fromEntries(kept), [event.idMessage]: orphan },
    }
  }
  const next = linkChat(data, chatId, { alias: event.chatId })
  return updateMessage(
    next,
    chatId,
    (m) => m.idMessage === event.idMessage,
    (m) => applyStatusTo(m, event.status, event.error),
  )
}

function applyToTarget(
  data: ChatData,
  targetId: string,
  update: (message: Message) => Message,
): ChatData {
  const chatId = findMessageById(data, targetId)
  return chatId ? updateMessage(data, chatId, (m) => m.idMessage === targetId, update) : data
}

/** Применяет событие из уведомления к данным чатов. */
export function applyEvent(data: ChatData, event: ChatEvent, ctx: ApplyContext): ChatData {
  switch (event.type) {
    case 'message':
      return applyMessage(data, event, ctx)
    case 'status':
      return applyStatus(data, event)
    case 'edited':
      return applyToTarget(data, event.targetId, (m) => ({ ...m, text: event.text, edited: true }))
    case 'deleted':
      return applyToTarget(data, event.targetId, (m) => ({ ...m, deleted: true }))
    case 'state':
    case 'quota':
      return data
  }
}
