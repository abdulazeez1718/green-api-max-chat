import { useEffect } from 'react'
import { useChatStore } from '../store/chatStore'

export const APP_TITLE = 'MAX Chat · GREEN-API'

/** Счётчик непрочитанных во вкладке браузера: «(3) MAX Chat». */
export function useDocumentTitle(): void {
  const unread = useChatStore((state) =>
    Object.values(state.chats).reduce((sum, chat) => sum + chat.unread, 0),
  )

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ${APP_TITLE}` : APP_TITLE
    return () => {
      document.title = APP_TITLE
    }
  }, [unread])
}
