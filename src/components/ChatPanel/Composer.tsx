import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SubmitEvent,
} from 'react'
import { MAX_MESSAGE_LENGTH, useSendMessage } from '../../hooks/useSendMessage'
import { IconButton } from '../ui/Button'
import styles from './ChatPanel.module.css'

/** Черновики по чатам живут, пока открыта вкладка. */
const drafts = new Map<string, string>()
const MAX_TEXTAREA_HEIGHT = 160
const COUNTER_FROM = MAX_MESSAGE_LENGTH - 500

export function Composer({ chatId }: { chatId: string }) {
  const sendMessage = useSendMessage()
  const [text, setText] = useState(() => drafts.get(chatId) ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0

  // На устройствах с мышью сразу ставим курсор в поле ввода (на телефоне не открываем клавиатуру).
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) textareaRef.current?.focus()
  }, [])

  // Поле растёт вместе с текстом до MAX_TEXTAREA_HEIGHT.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${String(Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT))}px`
  }, [text])

  function updateText(value: string) {
    setText(value)
    if (value) drafts.set(chatId, value)
    else drafts.delete(chatId)
  }

  function submit() {
    const message = text.trim()
    if (!message) return
    void sendMessage(chatId, message)
    updateText('')
    textareaRef.current?.focus()
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter — отправить, Shift+Enter — новая строка. Не мешаем вводу через IME.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className={styles.composerArea}>
      <form className={styles.composer} onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          name="message"
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Сообщение"
          aria-label="Сообщение"
          onChange={(event) => {
            updateText(event.target.value)
          }}
          onKeyDown={handleKeyDown}
        />
        {text.length >= COUNTER_FROM && (
          <span className={styles.counter} aria-live="polite">
            {text.length} / {MAX_MESSAGE_LENGTH}
          </span>
        )}
        <IconButton
          type="submit"
          icon="send"
          label="Отправить"
          variant="accent"
          iconSize={22}
          className={styles.sendButton}
          disabled={!canSend}
        />
      </form>
    </div>
  )
}
