import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSendMessage } from '../../hooks/useSendMessage'
import { formatDayLabel, isSameDay } from '../../lib/datetime'
import type { Message } from '../../model'
import { useChatStore } from '../../store/chatStore'
import { IconButton } from '../ui/Button'
import { MessageBubble, type GroupPosition } from './MessageBubble'
import styles from './ChatPanel.module.css'

const EMPTY: Message[] = []
/** Сообщения одного направления ближе этого интервала рисуются «стопкой». */
const GROUP_WINDOW_MS = 5 * 60 * 1000
/** Считаем, что пользователь «внизу», если до конца ленты меньше этого расстояния. */
const BOTTOM_THRESHOLD_PX = 120

function sameGroup(a: Message | undefined, b: Message | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.direction === b.direction &&
    isSameDay(a.timestamp, b.timestamp) &&
    Math.abs(b.timestamp - a.timestamp) < GROUP_WINDOW_MS
  )
}

function groupPosition(prev: Message | undefined, current: Message, next: Message | undefined) {
  const withPrev = sameGroup(prev, current)
  const withNext = sameGroup(current, next)
  const position: GroupPosition =
    withPrev && withNext ? 'middle' : withPrev ? 'last' : withNext ? 'first' : 'single'
  return position
}

export function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((state) => state.messages[chatId] ?? EMPTY)
  const sendMessage = useSendMessage()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const element = scrollRef.current
    if (element) element.scrollTo({ top: element.scrollHeight, behavior })
  }, [])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    stickToBottom.current = distance < BOTTOM_THRESHOLD_PX
    setShowScrollButton(distance > BOTTOM_THRESHOLD_PX * 2)
  }, [])

  // Открыли чат — сразу к последнему сообщению.
  useLayoutEffect(() => {
    stickToBottom.current = true
    scrollToBottom('instant')
  }, [chatId, scrollToBottom])

  // Новое сообщение: прокручиваем, если пользователь был внизу или отправил его сам.
  const last = messages.at(-1)
  useLayoutEffect(() => {
    if (!last) return
    const ownPending = last.direction === 'out' && last.status === 'pending'
    if (stickToBottom.current || ownPending) scrollToBottom('smooth')
  }, [last, scrollToBottom])

  const handleRetry = useCallback(
    (message: Message) => {
      void sendMessage(chatId, message.text, message.key)
    },
    [chatId, sendMessage],
  )

  const items = useMemo(
    () =>
      messages.map((message, index) => ({
        message,
        position: groupPosition(messages[index - 1], message, messages[index + 1]),
        newDay: index === 0 || !isSameDay(messages[index - 1]?.timestamp ?? 0, message.timestamp),
      })),
    [messages],
  )

  return (
    <div className={styles.scroller} ref={scrollRef} onScroll={handleScroll}>
      <div className={styles.messages} role="log" aria-live="polite" aria-label="Сообщения">
        {items.length === 0 && (
          <div className={styles.emptyChat}>
            <p className={styles.chip}>Сообщений пока нет</p>
            <p className={styles.emptyChatHint}>Напишите первое сообщение — оно уйдёт в MAX</p>
          </div>
        )}
        {items.map(({ message, position, newDay }) => (
          <Fragment key={message.key}>
            {newDay && (
              <div className={styles.dayDivider}>
                <span className={styles.chip}>{formatDayLabel(message.timestamp)}</span>
              </div>
            )}
            <MessageBubble message={message} position={position} onRetry={handleRetry} />
          </Fragment>
        ))}
      </div>
      {showScrollButton && (
        <IconButton
          icon="chevronDown"
          label="К последним сообщениям"
          className={styles.scrollButton}
          onClick={() => {
            scrollToBottom('smooth')
          }}
        />
      )}
    </div>
  )
}
