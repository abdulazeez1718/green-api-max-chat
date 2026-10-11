import { useId, useRef, useState, type SubmitEvent } from 'react'
import { toUserMessage } from '../../api/errors'
import { DEFAULT_API_URL, GreenApiClient, normalizeApiUrl } from '../../api/greenApi'
import type { Credentials } from '../../api/types'
import {
  describeInstanceState,
  validateCredentials,
  type CredentialErrors,
} from '../../lib/credentials'
import { useSessionStore } from '../../store/sessionStore'
import { Icon } from '../Icon'
import { Logo } from '../Logo'
import { Button, IconButton } from '../ui/Button'
import styles from './LoginScreen.module.css'

const CONSOLE_URL = 'https://console.green-api.com/'
const DOCS_URL = 'https://green-api.com/v3/docs/before-start/'

export function LoginScreen() {
  const login = useSessionStore((state) => state.login)
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL)
  const [showToken, setShowToken] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const idRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLInputElement>(null)
  const apiUrlRef = useRef<HTMLInputElement>(null)
  const advancedRef = useRef<HTMLDetailsElement>(null)
  const ids = { id: useId(), token: useId(), apiUrl: useId(), error: useId() }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return

    const credentials: Credentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
      apiUrl: normalizeApiUrl(apiUrl) || DEFAULT_API_URL,
    }
    const errors = validateCredentials(credentials)
    setFieldErrors(errors)
    setFormError(null)
    if (errors.idInstance) {
      idRef.current?.focus()
      return
    }
    if (errors.apiTokenInstance) {
      tokenRef.current?.focus()
      return
    }
    if (errors.apiUrl) {
      if (advancedRef.current) advancedRef.current.open = true
      apiUrlRef.current?.focus()
      return
    }

    setLoading(true)
    try {
      // Проверяем учётные данные и состояние инстанса до входа в чат.
      const { stateInstance } = await new GreenApiClient(credentials).getStateInstance()
      const info = describeInstanceState(stateInstance)
      if (!info.usable) {
        setFormError(info.message ?? 'Инстанс недоступен.')
        return
      }
      login(credentials)
    } catch (error) {
      setFormError(toUserMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <Logo size={64} className={styles.logo} />
        <h1 className={styles.title}>Вход в MAX Chat</h1>
        <p className={styles.subtitle}>
          Введите данные инстанса из{' '}
          <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer">
            личного кабинета GREEN-API
          </a>
        </p>

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className={styles.field}>
            <label htmlFor={ids.id}>idInstance</label>
            <input
              ref={idRef}
              id={ids.id}
              name="idInstance"
              inputMode="numeric"
              autoComplete="username"
              value={idInstance}
              onChange={(event) => {
                setIdInstance(event.target.value)
              }}
              aria-invalid={Boolean(fieldErrors.idInstance)}
              aria-describedby={fieldErrors.idInstance ? `${ids.id}-error` : undefined}
              disabled={loading}
            />
            {fieldErrors.idInstance && (
              <p id={`${ids.id}-error`} className={styles.fieldError}>
                {fieldErrors.idInstance}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={ids.token}>apiTokenInstance</label>
            <div className={styles.withAction}>
              <input
                ref={tokenRef}
                id={ids.token}
                name="apiTokenInstance"
                type={showToken ? 'text' : 'password'}
                autoComplete="current-password"
                spellCheck={false}
                value={apiTokenInstance}
                onChange={(event) => {
                  setApiTokenInstance(event.target.value)
                }}
                aria-invalid={Boolean(fieldErrors.apiTokenInstance)}
                aria-describedby={fieldErrors.apiTokenInstance ? `${ids.token}-error` : undefined}
                disabled={loading}
              />
              <IconButton
                icon={showToken ? 'eyeOff' : 'eye'}
                label={showToken ? 'Скрыть токен' : 'Показать токен'}
                className={styles.fieldAction}
                onClick={() => {
                  setShowToken((value) => !value)
                }}
              />
            </div>
            {fieldErrors.apiTokenInstance && (
              <p id={`${ids.token}-error`} className={styles.fieldError}>
                {fieldErrors.apiTokenInstance}
              </p>
            )}
          </div>

          <details className={styles.advanced} ref={advancedRef}>
            <summary>Дополнительно</summary>
            <div className={styles.field}>
              <label htmlFor={ids.apiUrl}>apiUrl</label>
              <input
                ref={apiUrlRef}
                id={ids.apiUrl}
                name="apiUrl"
                inputMode="url"
                spellCheck={false}
                value={apiUrl}
                onChange={(event) => {
                  setApiUrl(event.target.value)
                }}
                aria-invalid={Boolean(fieldErrors.apiUrl)}
                aria-describedby={`${ids.apiUrl}-hint`}
                disabled={loading}
              />
              <p
                id={`${ids.apiUrl}-hint`}
                className={fieldErrors.apiUrl ? styles.fieldError : styles.hint}
              >
                {fieldErrors.apiUrl ??
                  'Адрес API из личного кабинета. Для MAX подходит значение по умолчанию.'}
              </p>
            </div>
          </details>

          {formError && (
            <p id={ids.error} className={styles.formError} role="alert">
              <Icon name="alert" size={20} />
              <span>{formError}</span>
            </p>
          )}

          <Button type="submit" block loading={loading}>
            {loading ? 'Проверяем…' : 'Войти'}
          </Button>
        </form>

        <p className={styles.footnote}>
          <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
            Где взять idInstance и apiTokenInstance?
          </a>
          <br />
          Данные хранятся только в этой вкладке браузера.
        </p>
      </div>
    </main>
  )
}
