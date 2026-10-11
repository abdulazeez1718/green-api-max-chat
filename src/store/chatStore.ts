import { create } from 'zustand'
import { createLocalId } from '../lib/id'
import type { ChatEvent } from '../notifications/parseNotification'
import {
  addOutgoing,
  applyEvent,
  confirmOutgoing,
  emptyChatData,
  failOutgoing,
  markChatRead,
  retryOutgoing,
  upsertChat,
  type ChatData,
  type NewChatInput,
} from './chatLogic'

interface ChatStore extends ChatData {
  /** Открытый чат. Не сохраняется: после перезагрузки показываем список. */
  activeChatId: string | null

  /** Подставляет сохранённые данные (при входе в аккаунт). */
  hydrate: (data: ChatData) => void
  reset: () => void
  openChat: (chatId: string | null) => void
  markRead: (chatId: string) => void
  /** Создаёт чат (или находит существующий) и возвращает его id. */
  createChat: (input: NewChatInput) => string
  /** Добавляет исходящее сообщение в статусе pending, возвращает его локальный ключ. */
  addOutgoing: (chatId: string, text: string) => string
  confirmOutgoing: (chatId: string, key: string, idMessage: string) => void
  failOutgoing: (chatId: string, key: string, error: string) => void
  retryOutgoing: (chatId: string, key: string) => void
  applyEvent: (event: ChatEvent) => void
}

function pickData(state: ChatData): ChatData {
  return { chats: state.chats, messages: state.messages, orphanStatuses: state.orphanStatuses }
}

/** Чат «на экране»: открыт и вкладка видима — входящие в нём не считаются непрочитанными. */
function viewingChatId(activeChatId: string | null): string | null {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return null
  return activeChatId
}

export const useChatStore = create<ChatStore>()((set, get) => ({
  ...emptyChatData(),
  activeChatId: null,

  hydrate: (data) => {
    set({ ...data, activeChatId: null })
  },
  reset: () => {
    set({ ...emptyChatData(), activeChatId: null })
  },
  openChat: (chatId) => {
    set((state) => ({
      activeChatId: chatId,
      ...(chatId ? pickData(markChatRead(state, chatId)) : {}),
    }))
  },
  markRead: (chatId) => {
    set((state) => pickData(markChatRead(state, chatId)))
  },
  createChat: (input) => {
    const { data, chatId } = upsertChat(pickData(get()), input, Date.now())
    set(data)
    return chatId
  },
  addOutgoing: (chatId, text) => {
    const key = createLocalId()
    set((state) => addOutgoing(pickData(state), chatId, key, text, Date.now()))
    return key
  },
  confirmOutgoing: (chatId, key, idMessage) => {
    set((state) => confirmOutgoing(pickData(state), chatId, key, idMessage))
  },
  failOutgoing: (chatId, key, error) => {
    set((state) => failOutgoing(pickData(state), chatId, key, error))
  },
  retryOutgoing: (chatId, key) => {
    set((state) => retryOutgoing(pickData(state), chatId, key))
  },
  applyEvent: (event) => {
    set((state) =>
      applyEvent(pickData(state), event, {
        now: Date.now(),
        viewingChatId: viewingChatId(state.activeChatId),
      }),
    )
  },
}))

export { pickData as selectChatData }
