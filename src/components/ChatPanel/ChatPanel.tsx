import { chatSubtitle, chatTitle } from '../../lib/chatDisplay'
import type { Chat } from '../../model'
import { useChatStore } from '../../store/chatStore'
import { Avatar } from '../ui/Avatar'
import { IconButton } from '../ui/Button'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import styles from './ChatPanel.module.css'

function ChatHeader({ chat }: { chat: Chat }) {
  const openChat = useChatStore((state) => state.openChat)
  const subtitle = chatSubtitle(chat)
  return (
    <header className={styles.header}>
      <IconButton
        icon="back"
        label="Назад к списку чатов"
        className={styles.backButton}
        onClick={() => {
          openChat(null)
        }}
      />
      <Avatar id={chat.id} name={chat.name} size={40} />
      <div className={styles.headerText}>
        <h2 className={styles.headerTitle}>{chatTitle(chat)}</h2>
        {subtitle && <p className={styles.headerSubtitle}>{subtitle}</p>}
      </div>
    </header>
  )
}

export function ChatPanel({ chatId }: { chatId: string }) {
  const chat = useChatStore((state) => state.chats[chatId])
  if (!chat) return <EmptyPanel />
  return (
    <main className={styles.panel} aria-label={`Чат: ${chatTitle(chat)}`}>
      <ChatHeader chat={chat} />
      <div className={styles.history}>
        <MessageList chatId={chat.id} />
        <Composer key={chat.id} chatId={chat.id} />
      </div>
    </main>
  )
}

export function EmptyPanel() {
  return (
    <main className={`${styles.panel} ${styles.emptyPanel}`} aria-label="Чат не выбран">
      <div className={styles.history}>
        <p className={styles.chip}>Выберите чат или начните новый</p>
      </div>
    </main>
  )
}
