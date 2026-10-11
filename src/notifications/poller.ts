import { GreenApiError, toUserMessage } from '../api/errors'
import { isAbortError, type GreenApiClient } from '../api/greenApi'

export interface PollerHandlers {
  /** Обработка тела уведомления. Ошибка обработчика не блокирует очередь. */
  onNotification: (body: unknown) => void
  /** Соединение установлено (запрос к очереди прошёл успешно). */
  onOnline: () => void
  /** Временная ошибка: следующая попытка в `retryAt`. */
  onRetry: (error: string, retryAt: number) => void
  /** Ошибка, которую повтором не исправить (неверные учётные данные). Цикл остановлен. */
  onFatal: (error: GreenApiError) => void
}

export interface PollerOptions {
  /** receiveTimeout для ReceiveNotification, 5–60 с. */
  receiveTimeoutS?: number
  minBackoffMs?: number
  maxBackoffMs?: number
  /** Минимальный интервал между пустыми ответами (защита от «горячего» цикла). */
  minPollIntervalMs?: number
  random?: () => number
}

const DEFAULTS = {
  receiveTimeoutS: 20,
  minBackoffMs: 1_000,
  maxBackoffMs: 30_000,
  minPollIntervalMs: 1_000,
}

/** Пока задан webhookUrl, очередь недоступна; ждём, пока пользователь исправит настройки. */
const WEBHOOK_URL_RETRY_MS = 15_000
/**
 * Long polling при пустой очереди отвечает только через receiveTimeout (20 с).
 * Если сервер держит запрос дольше этого времени без ошибки — соединение есть.
 */
const ONLINE_AFTER_MS = 1_000

/** Пауза, которую прерывают отмена цикла и восстановление сети. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      window.removeEventListener('online', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    window.addEventListener('online', done, { once: true })
  })
}

/**
 * Отменён ли цикл. Функция, а не `signal.aborted` напрямую: после `await`
 * TypeScript ошибочно считает свойство всё ещё сузенным условием цикла.
 */
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted
}

function isFatal(error: unknown): error is GreenApiError {
  return error instanceof GreenApiError && (error.kind === 'auth' || error.kind === 'notFound')
}

/** Экспоненциальная задержка с «джиттером»: 1, 2, 4, 8… с, не больше maxBackoffMs. */
export function backoffDelay(failures: number, min: number, max: number, random: () => number) {
  const base = Math.min(max, min * 2 ** Math.max(0, failures - 1))
  return Math.round(base * (0.8 + random() * 0.4))
}

/**
 * Получение уведомлений по технологии HTTP API:
 * ReceiveNotification (long polling) → обработка → DeleteNotification.
 * https://green-api.com/v3/docs/api/receiving/technology-http-api/
 *
 * Обработка идемпотентна (повторы отсекаются по idMessage), поэтому если
 * DeleteNotification не прошёл, повторная доставка того же уведомления безопасна.
 */
export async function runNotificationLoop(
  client: GreenApiClient,
  signal: AbortSignal,
  handlers: PollerHandlers,
  options: PollerOptions = {},
): Promise<void> {
  const config = { ...DEFAULTS, ...options }
  const random = options.random ?? Math.random
  let failures = 0

  while (!isCancelled(signal)) {
    const startedAt = Date.now()
    const onlineTimer = setTimeout(handlers.onOnline, ONLINE_AFTER_MS)
    try {
      const notification = await client
        .receiveNotification(config.receiveTimeoutS, signal)
        .finally(() => {
          clearTimeout(onlineTimer)
        })
      failures = 0
      handlers.onOnline()

      if (!notification) {
        // Сервер вернул пустой ответ быстрее receiveTimeout — не долбим API.
        const elapsed = Date.now() - startedAt
        if (elapsed < config.minPollIntervalMs) {
          await pause(config.minPollIntervalMs - elapsed, signal)
        }
        continue
      }

      try {
        handlers.onNotification(notification.body)
      } catch (error) {
        // «Ядовитое» уведомление не должно навсегда остановить очередь.
        console.error('Не удалось обработать уведомление', error)
      }
      await client.deleteNotification(notification.receiptId, signal)
    } catch (error) {
      if (isCancelled(signal) || isAbortError(error)) return
      if (isFatal(error)) {
        handlers.onFatal(error)
        return
      }
      failures += 1
      const delay =
        error instanceof GreenApiError && error.kind === 'webhookUrlSet'
          ? WEBHOOK_URL_RETRY_MS
          : backoffDelay(failures, config.minBackoffMs, config.maxBackoffMs, random)
      handlers.onRetry(toUserMessage(error), Date.now() + delay)
      await pause(delay, signal)
    }
  }
}
