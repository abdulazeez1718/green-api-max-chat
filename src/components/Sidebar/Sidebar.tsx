import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNow } from '../../hooks/useNow'
import { formatPhone } from '../../lib/phone'
import { useChatStore } from '../../store/chatStore'
import { useSessionStore } from '../../store/sessionStore'
import { Logo } from '../Logo'
import { Button, IconButton } from '../ui/Button'
import { ChatListItem } from './ChatListItem'
import { IssueBanners } from './IssueBanners'
import { NewChatDialog } from './NewChatDialog'
import styles from './Sidebar.module.css'

/** Строка состояния под заголовком: подключение к очереди уведомлений. */
function ConnectionStatus() {
  const { connection, retryAt, wid } = useSessionStore(
    useShallow((state) => ({
      connection: state.connection,
      retryAt: state.retryAt,
      wid: state.settings?.wid,
    })),
  )
  const now = useNow(connection === 'reconnecting')

  let text: string
  let tone: 'ok' | 'pending' | 'error' = 'pending'
  switch (connection) {
    case 'online': {
      const phone = wid?.replace(/@c\.us$/, '')
      text = phone && /^\d+$/.test(phone) ? `Вы: ${formatPhone(phone)}` : 'В сети'
      tone = 'ok'
      break
    }
    case 'connecting':
      text = 'Подключение…'
      break
    case 'reconnecting': {
      const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0
      text = seconds > 0 ? `Нет связи. Повтор через ${seconds} с` : 'Переподключение…'
      tone = 'error'
      break
    }
    case 'paused':
      text = 'Открыто в другой вкладке'
      break
    case 'stopped':
      text = 'Получение сообщений остановлено'
      tone = 'error'
      break
  }

  return (
    <p className={styles.status} data-tone={tone} role="status" aria-live="polite">
      <span className={styles.statusDot} aria-hidden="true" />
      {text}
    </p>
  )
}

export function Sidebar({ onLogout }: { onLogout: () => void }) {
  const { chats, messages, activeChatId, openChat } = useChatStore(
    useShallow((state) => ({
      chats: state.chats,
      messages: state.messages,
      activeChatId: state.activeChatId,
      openChat: state.openChat,
    })),
  )
  const [dialogOpen, setDialogOpen] = useState(false)

  const sortedChats = useMemo(
    () => Object.values(chats).sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  )
  const handleOpen = useCallback(
    (chatId: string) => {
      openChat(chatId)
    },
    [openChat],
  )
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
  }, [])

  return (
    <aside className={styles.sidebar} aria-label="Чаты">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Чаты</h1>
          <ConnectionStatus />
        </div>
        <IconButton
          icon="compose"
          label="Новый чат"
          onClick={() => {
            setDialogOpen(true)
          }}
        />
        <IconButton
          icon="logout"
          label="Выйти (история на этом устройстве удалится)"
          onClick={onLogout}
        />
      </header>

      <IssueBanners onLogout={onLogout} />

      {sortedChats.length > 0 ? (
        <ul className={styles.chatList} aria-label="Список чатов">
          {sortedChats.map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              lastMessage={messages[chat.id]?.at(-1)}
              active={chat.id === activeChatId}
              onOpen={handleOpen}
            />
          ))}
        </ul>
      ) : (
        <div className={styles.emptyList}>
          <Logo size={56} className={styles.emptyLogo} />
          <p>Чатов пока нет</p>
          <p className={styles.emptyHint}>Начните переписку по номеру телефона</p>
          <Button
            size="small"
            onClick={() => {
              setDialogOpen(true)
            }}
          >
            Новый чат
          </Button>
        </div>
      )}

      <NewChatDialog open={dialogOpen} onClose={handleCloseDialog} />
    </aside>
  )
}
