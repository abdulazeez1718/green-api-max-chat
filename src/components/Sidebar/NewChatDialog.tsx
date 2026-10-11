import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import { GreenApiError } from '../../api/errors'
import { useGreenApi } from '../../api/GreenApiContext'
import { normalizePhone, phoneToChatId, validatePhone } from '../../lib/phone'
import { findChatByPhone, resolveChatId } from '../../store/chatLogic'
import { selectChatData, useChatStore } from '../../store/chatStore'
import { Icon } from '../Icon'
import { Button, IconButton } from '../ui/Button'
import styles from './NewChatDialog.module.css'

/** Ошибки, при которых нет смысла открывать чат без проверки номера. */
const BLOCKING_ERRORS = new Set<GreenApiError['kind']>([
  'auth',
  'network',
  'timeout',
  'server',
  'suspended',
])

interface NewChatDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Создание чата по номеру телефона. Номер проверяется методом CheckAccount:
 * он подтверждает, что у собеседника есть MAX, и возвращает его chatId.
 */
export function NewChatDialog({ open, onClose }: NewChatDialogProps) {
  const client = useGreenApi()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const titleId = useId()
  const hintId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      inputRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function close() {
    setPhone('')
    setError(null)
    onClose()
  }

  function openChat(chatId: string, digits: string) {
    const store = useChatStore.getState()
    const id = store.createChat({ id: chatId, phone: digits, aliases: [phoneToChatId(digits)] })
    store.openChat(id)
    close()
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const digits = normalizePhone(phone)
    const validationError = validatePhone(digits)
    if (validationError) {
      setError(validationError)
      inputRef.current?.focus()
      return
    }

    // Чат с этим номером уже есть — просто открываем.
    const data = selectChatData(useChatStore.getState())
    const existing = findChatByPhone(data, digits) ?? resolveChatId(data, phoneToChatId(digits))
    if (existing) {
      useChatStore.getState().openChat(existing)
      close()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const account = await client.checkAccount(digits)
      if (!account.exist) {
        setError(
          'Этот номер не найден в MAX. Проверьте номер — или собеседник запретил поиск по номеру.',
        )
        return
      }
      openChat(account.chatId || phoneToChatId(digits), digits)
    } catch (checkError) {
      if (checkError instanceof GreenApiError && BLOCKING_ERRORS.has(checkError.kind)) {
        setError(checkError.message)
        return
      }
      // CheckAccount недоступен (например, лимит тарифа) — SendMessage принимает и «номер@c.us».
      openChat(phoneToChatId(digits), digits)
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onClose={() => {
        if (open) close()
      }}
      onClick={(event) => {
        // Клик по подложке (вне карточки) закрывает диалог.
        if (event.target === event.currentTarget) close()
      }}
    >
      <form className={styles.card} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className={styles.header}>
          <h2 id={titleId}>Новый чат</h2>
          <IconButton icon="close" label="Закрыть" onClick={close} />
        </div>
        <label className={styles.label} htmlFor={`${titleId}-phone`}>
          Номер телефона собеседника
        </label>
        <input
          ref={inputRef}
          id={`${titleId}-phone`}
          name="phone"
          className={styles.input}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={hintId}
          disabled={loading}
        />
        {error ? (
          <p id={hintId} className={styles.error} role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </p>
        ) : (
          <p id={hintId} className={styles.hint}>
            Номер с кодом страны. У собеседника должен быть аккаунт MAX.
          </p>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={close}>
            Отмена
          </Button>
          <Button type="submit" loading={loading}>
            {loading ? 'Проверяем…' : 'Начать чат'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
