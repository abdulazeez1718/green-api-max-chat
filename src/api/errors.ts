export type GreenApiErrorKind =
  /** Нет сети / CORS / DNS — запрос не дошёл до сервера. */
  | 'network'
  /** Сервер не ответил за отведённое время. */
  | 'timeout'
  /** Неверный idInstance или apiTokenInstance. */
  | 'auth'
  /** Аккаунт MAX временно ограничен (suspended). */
  | 'suspended'
  /** У инстанса задан webhookUrl — HTTP API очередь уведомлений недоступна. */
  | 'webhookUrlSet'
  /** Превышены лимиты тарифа «Разработчик» (HTTP 466). */
  | 'quota'
  /** Слишком много запросов (HTTP 429). */
  | 'rateLimit'
  /** Ошибка валидации параметров (HTTP 400). */
  | 'validation'
  /** Метод или инстанс не найден (неверный apiUrl). */
  | 'notFound'
  /** Ошибка на стороне GREEN-API (5xx). */
  | 'server'
  | 'unknown'

/**
 * Ошибка вызова GREEN-API с понятным пользователю текстом.
 * Никогда не содержит apiTokenInstance: ответы сервера с полем `path`
 * (в нём есть токен) не показываются целиком — см. `sanitize`.
 */
export class GreenApiError extends Error {
  readonly kind: GreenApiErrorKind
  /** HTTP-статус; 0 — если ответа не было. */
  readonly status: number

  constructor(kind: GreenApiErrorKind, message: string, status = 0) {
    super(message)
    this.name = 'GreenApiError'
    this.kind = kind
    this.status = status
  }
}

const WEBHOOK_URL_SET = /webhook url is set/i
const SUSPENDED = /suspended/i

/** Достаёт из тела ответа человекочитаемое сообщение (JSON `message`/`description` или текст). */
function extractServerMessage(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return ''
  try {
    const data: unknown = JSON.parse(trimmed)
    if (typeof data === 'string') return data
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      for (const key of ['message', 'description', 'error']) {
        const value = record[key]
        if (typeof value === 'string' && value) return value
      }
      // Формат 466: { invokeStatus: { description } } / { correspondentsStatus: { description } }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          const description = (value as Record<string, unknown>).description
          if (typeof description === 'string' && description) return description
        }
      }
    }
    return ''
  } catch {
    // Не JSON — короткий текстовый ответ (например, «File is empty»).
    return trimmed.length <= 300 ? trimmed : ''
  }
}

/** Убирает секреты из текста, пришедшего с сервера. */
export function sanitize(text: string, secret: string): string {
  return secret ? text.split(secret).join('***') : text
}

/** Превращает неуспешный HTTP-ответ GREEN-API в `GreenApiError`. */
export function errorFromResponse(status: number, body: string, secret: string): GreenApiError {
  const serverMessage = sanitize(extractServerMessage(body), secret)

  if (status === 400 && WEBHOOK_URL_SET.test(serverMessage)) {
    return new GreenApiError(
      'webhookUrlSet',
      'В настройках инстанса задан webhookUrl, поэтому уведомления нельзя получать через HTTP API. Очистите webhookUrl.',
      status,
    )
  }
  if (status === 403 && SUSPENDED.test(serverMessage)) {
    return new GreenApiError(
      'suspended',
      'Аккаунт MAX временно ограничен: сообщения можно отправлять только тем, кто сохранил ваш номер в контактах.',
      status,
    )
  }
  if (status === 401 || status === 403) {
    return new GreenApiError('auth', 'Неверный idInstance или apiTokenInstance.', status)
  }
  if (status === 466) {
    return new GreenApiError(
      'quota',
      `Превышен лимит тарифа «Разработчик»${serverMessage ? `: ${serverMessage}` : '.'}`,
      status,
    )
  }
  if (status === 429) {
    return new GreenApiError('rateLimit', 'Слишком много запросов. Подождите немного.', status)
  }
  if (status === 404) {
    return new GreenApiError(
      'notFound',
      'Инстанс или метод не найден. Проверьте idInstance и адрес API.',
      status,
    )
  }
  if (status === 400) {
    return new GreenApiError(
      'validation',
      serverMessage ? `Ошибка запроса: ${serverMessage}` : 'Некорректный запрос.',
      status,
    )
  }
  if (status >= 500) {
    return new GreenApiError(
      'server',
      `Сервис GREEN-API временно недоступен (код ${status}). Попробуйте позже.`,
      status,
    )
  }
  return new GreenApiError(
    'unknown',
    serverMessage || `Неожиданный ответ GREEN-API (код ${status}).`,
    status,
  )
}

/** Текст ошибки для интерфейса: для чужих ошибок — общий текст. */
export function toUserMessage(error: unknown): string {
  if (error instanceof GreenApiError) return error.message
  return 'Что-то пошло не так. Попробуйте ещё раз.'
}
