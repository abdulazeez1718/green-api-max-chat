import { memo } from 'react'
import { chatTitle, messagePreview } from '../../lib/chatDisplay'
import { formatChatListTime } from '../../lib/datetime'
import type { Chat, Message } from '../../model'
import { MessageStatusIcon } from '../MessageStatusIcon'
import { Avatar } from '../ui/Avatar'
import styles from './Sidebar.module.css'

interface ChatListItemProps {
  chat: Chat
  lastMessage: Message | undefined
  active: boolean
  onOpen: (chatId: string) => void
}

export const ChatListItem = memo(function ChatListItem({
  chat,
  lastMessage,
  active,
  onOpen,
}: ChatListItemProps) {
  const title = chatTitle(chat)
  const time = lastMessage?.timestamp ?? chat.updatedAt
  return (
    <li>
      <button
        type="button"
        className={styles.chatItem}
        aria-current={active ? 'true' : undefined}
        onClick={() => {
          onOpen(chat.id)
        }}
      >
        <Avatar id={chat.id} name={chat.name} size={54} />
        <span className={styles.chatTitle}>{title}</span>
        <span className={styles.chatMeta}>
          {lastMessage?.direction === 'out' && lastMessage.status && (
            <MessageStatusIcon status={lastMessage.status} className={styles.chatStatus} />
          )}
          <time dateTime={new Date(time).toISOString()}>{formatChatListTime(time)}</time>
        </span>
        <span className={styles.chatPreview}>{messagePreview(lastMessage)}</span>
        {chat.unread > 0 && (
          <span className={styles.unread} aria-label={`Непрочитанных: ${chat.unread}`}>
            {chat.unread > 99 ? '99+' : chat.unread}
          </span>
        )}
      </button>
    </li>
  )
})
