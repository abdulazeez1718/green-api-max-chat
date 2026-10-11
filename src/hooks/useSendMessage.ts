import { useCallback } from 'react'
import { GreenApiError, toUserMessage } from '../api/errors'
import { useGreenApi } from '../api/GreenApiContext'
import { useChatStore } from '../store/chatStore'
import { useSessionStore } from '../store/sessionStore'

/** Максимальная длина текста по документации SendMessage. */
export const MAX_MESSAGE_LENGTH = 4000

/**
 * Отправка текста методом SendMessage с оптимистичным отображением:
 * сообщение сразу появляется в чате со статусом «отправляется».
 * Для повторной отправки передайте `retryKey` неотправленного сообщения.
 */
export function useSendMessage() {
  const client = useGreenApi()

  return useCallback(
    async (chatId: string, text: string, retryKey?: string) => {
      const store = useChatStore.getState()
      const chat = store.chats[chatId]
      if (!chat || !text.trim()) return

      let key: string
      if (retryKey) {
        key = retryKey
        store.retryOutgoing(chatId, key)
      } else {
        key = store.addOutgoing(chatId, text)
      }

      try {
        const { idMessage } = await client.sendMessage({ chatId: chat.id, message: text })
        useChatStore.getState().confirmOutgoing(chatId, key, idMessage)
      } catch (error) {
        useChatStore.getState().failOutgoing(chatId, key, toUserMessage(error))
        if (error instanceof GreenApiError && error.kind === 'quota') {
          useSessionStore.getState().setQuotaMessage(error.message)
        }
      }
    },
    [client],
  )
}
