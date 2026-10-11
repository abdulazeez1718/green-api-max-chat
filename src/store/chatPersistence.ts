import type { Chat, Message } from '../model'
import { emptyChatData, type ChatData } from './chatLogic'
import { selectChatData, useChatStore } from './chatStore'

/**
 * История чатов хранится в localStorage отдельно для каждого инстанса.
 * Учётные данные сюда не попадают (они живут только в sessionStorage).
 */
const KEY_PREFIX = 'max-chat:v1:chats:'

export function storageKey(idInstance: string): string {
  return `${KEY_PREFIX}${idInstance}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isChat(value: unknown): value is Chat {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    Array.isArray(value.aliases) &&
    typeof value.unread === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    (value.direction === 'in' || value.direction === 'out') &&
    typeof value.text === 'string' &&
    typeof value.timestamp === 'number'
  )
}

/** Разбирает сохранённые данные; повреждённые записи отбрасываются. */
export function parseChatData(raw: string | null): ChatData {
  if (!raw) return emptyChatData()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.chats) || !isRecord(parsed.messages)) {
      return emptyChatData()
    }
    const data = emptyChatData()
    for (const chat of Object.values(parsed.chats)) {
      if (!isChat(chat)) continue
      // Сообщения «в пути» не переживают перезагрузку: запрос уже не завершится.
      const messages = (
        Array.isArray(parsed.messages[chat.id]) ? parsed.messages[chat.id] : []
      ) as unknown[]
      data.chats[chat.id] = chat
      data.messages[chat.id] = messages
        .filter(isMessage)
        .map((message) =>
          message.status === 'pending'
            ? { ...message, status: 'failed', error: 'Отправка прервана — повторите' }
            : message,
        )
    }
    if (isRecord(parsed.orphanStatuses)) {
      data.orphanStatuses = parsed.orphanStatuses as ChatData['orphanStatuses']
    }
    return data
  } catch {
    return emptyChatData()
  }
}

export function loadChatData(idInstance: string): ChatData {
  try {
    return parseChatData(localStorage.getItem(storageKey(idInstance)))
  } catch {
    return emptyChatData()
  }
}

export function saveChatData(idInstance: string, data: ChatData): void {
  try {
    localStorage.setItem(storageKey(idInstance), JSON.stringify(data))
  } catch (error) {
    // Переполнение квоты или запрет хранилища: чат продолжает работать без сохранения.
    console.warn('Не удалось сохранить историю чатов', error)
  }
}

export function clearChatData(idInstance: string): void {
  try {
    localStorage.removeItem(storageKey(idInstance))
  } catch {
    // хранилище недоступно — удалять нечего
  }
}

/**
 * Загружает историю инстанса в стор и сохраняет все последующие изменения.
 * Возвращает функцию отписки.
 */
export function bindChatPersistence(idInstance: string): () => void {
  useChatStore.getState().hydrate(loadChatData(idInstance))
  let saved = selectChatData(useChatStore.getState())

  return useChatStore.subscribe((state) => {
    if (
      state.chats === saved.chats &&
      state.messages === saved.messages &&
      state.orphanStatuses === saved.orphanStatuses
    ) {
      return
    }
    saved = selectChatData(state)
    saveChatData(idInstance, saved)
  })
}
