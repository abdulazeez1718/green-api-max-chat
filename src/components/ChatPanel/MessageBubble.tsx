import { memo, type CSSProperties } from 'react'
import { formatTime } from '../../lib/datetime'
import { linkify } from '../../lib/linkify'
import type { Message } from '../../model'
import { Icon } from '../Icon'
import { MessageStatusIcon } from '../MessageStatusIcon'
import styles from './ChatPanel.module.css'

/** Положение сообщения в серии подряд идущих сообщений одного направления. */
export type GroupPosition = 'single' | 'first' | 'middle' | 'last'

interface MessageBubbleProps {
  message: Message
  position: GroupPosition
  onRetry?: (message: Message) => void
}

/** Ширина «невидимого хвоста» в конце текста, чтобы время не наезжало на последнюю строку. */
function metaWidth(message: Message): number {
  let width = 44
  if (message.direction === 'out') width += 20
  if (message.edited) width += 64
  return width
}

export const MessageBubble = memo(function MessageBubble({
  message,
  position,
  onRetry,
}: MessageBubbleProps) {
  const time = formatTime(message.timestamp)
  const failed = message.direction === 'out' && message.status === 'failed'
  const spacer = <span className={styles.metaSpacer} aria-hidden="true" />

  let content
  if (message.deleted) {
    content = (
      <p className={styles.deleted}>
        Сообщение удалено
        {spacer}
      </p>
    )
  } else {
    content = (
      <>
        {message.unsupportedLabel && (
          <p className={styles.unsupported}>
            <Icon name="alert" size={16} />
            {message.unsupportedLabel} — просмотр в этом чате не поддерживается
            {!message.text && spacer}
          </p>
        )}
        {message.text && (
          <p className={styles.text}>
            {linkify(message.text)}
            {spacer}
          </p>
        )}
      </>
    )
  }

  return (
    <div className={styles.messageRow} data-direction={message.direction} data-position={position}>
      <div
        className={styles.bubble}
        style={{ '--meta-width': `${metaWidth(message)}px` } as CSSProperties}
      >
        {content}
        <span className={styles.meta}>
          {message.edited && !message.deleted && <span>изменено</span>}
          <time dateTime={new Date(message.timestamp).toISOString()}>{time}</time>
          {message.direction === 'out' && message.status && (
            <MessageStatusIcon status={message.status} className={styles.status} />
          )}
        </span>
      </div>
      {failed && (
        <p className={styles.failed}>
          <span>{message.error ?? 'Сообщение не отправлено'}</span>
          {onRetry && (
            <button
              type="button"
              onClick={() => {
                onRetry(message)
              }}
            >
              Повторить
            </button>
          )}
        </p>
      )}
    </div>
  )
})
