import { errorFromResponse, GreenApiError } from './errors'
import type {
  CheckAccountResponse,
  Credentials,
  DeleteNotificationResponse,
  InstanceSettings,
  ReceivedNotification,
  SendMessageRequest,
  SendMessageResponse,
  SetSettingsResponse,
  StateInstanceResponse,
} from './types'

/** Адрес API для инстансов MAX по умолчанию (как в официальных SDK GREEN-API для MAX). */
export const DEFAULT_API_URL = 'https://api.green-api.com/v3'

/** Таймаут обычного запроса, мс. */
const REQUEST_TIMEOUT_MS = 15_000
/** Запас сверх receiveTimeout для long polling, мс. */
const LONG_POLL_EXTRA_MS = 15_000

type HttpMethod = 'GET' | 'POST' | 'DELETE'

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number>
  pathSuffix?: string
  signal?: AbortSignal | undefined
  timeoutMs?: number
}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>

/** Убирает пробелы и завершающие слэши: `https://api.green-api.com/v3/` → `.../v3`. */
export function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

/** Объединяет внешний сигнал отмены с таймаутом запроса. */
function withTimeout(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onExternalAbort = () => {
    controller.abort()
  }
  if (external?.aborted) controller.abort()
  else external?.addEventListener('abort', onExternalAbort, { once: true })

  return {
    signal: controller.signal,
    isTimedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invalidResponse(method: string): GreenApiError {
  return new GreenApiError('unknown', `Некорректный ответ GREEN-API на ${method}.`)
}

function yesNo(value: unknown): 'yes' | 'no' | undefined {
  return value === 'yes' || value === 'no' ? value : undefined
}

/** Берёт из ответа GetSettings только нужные поля, проверяя их типы. */
function parseSettings(data: Record<string, unknown>): InstanceSettings {
  const settings: InstanceSettings = {}
  if (typeof data.wid === 'string') settings.wid = data.wid
  if (typeof data.webhookUrl === 'string') settings.webhookUrl = data.webhookUrl
  const flags = [
    'incomingWebhook',
    'outgoingWebhook',
    'outgoingMessageWebhook',
    'outgoingAPIMessageWebhook',
    'stateWebhook',
  ] as const
  for (const flag of flags) {
    const value = yesNo(data[flag])
    if (value) settings[flag] = value
  }
  return settings
}

/**
 * Минимальный клиент GREEN-API: только методы, нужные чату.
 * URL метода: `{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}`.
 */
export class GreenApiClient {
  readonly idInstance: string
  private readonly baseUrl: string
  private readonly token: string
  private readonly fetchFn: FetchFn

  constructor(credentials: Credentials, fetchFn?: FetchFn) {
    this.baseUrl = normalizeApiUrl(credentials.apiUrl)
    this.idInstance = credentials.idInstance.trim()
    this.token = credentials.apiTokenInstance.trim()
    // Поздняя привязка к глобальному fetch: подмена fetch (например, MSW в тестах) подхватывается.
    this.fetchFn = fetchFn ?? ((input, init) => globalThis.fetch(input, init))
  }

  /** https://green-api.com/v3/docs/api/account/GetStateInstance/ */
  async getStateInstance(signal?: AbortSignal): Promise<StateInstanceResponse> {
    const data = await this.request('GET', 'getStateInstance', { signal })
    if (!isRecord(data) || typeof data.stateInstance !== 'string') {
      throw invalidResponse('getStateInstance')
    }
    return { stateInstance: data.stateInstance }
  }

  /** https://green-api.com/v3/docs/api/account/GetSettings/ */
  async getSettings(signal?: AbortSignal): Promise<InstanceSettings> {
    const data = await this.request('GET', 'getSettings', { signal })
    if (!isRecord(data)) throw invalidResponse('getSettings')
    return parseSettings(data)
  }

  /** https://green-api.com/v3/docs/api/account/SetSettings/ */
  async setSettings(
    settings: InstanceSettings,
    signal?: AbortSignal,
  ): Promise<SetSettingsResponse> {
    const data = await this.request('POST', 'setSettings', { body: settings, signal })
    if (!isRecord(data)) throw invalidResponse('setSettings')
    return { saveSettings: data.saveSettings === true }
  }

  /** https://green-api.com/v3/docs/api/sending/SendMessage/ */
  async sendMessage(
    payload: SendMessageRequest,
    signal?: AbortSignal,
  ): Promise<SendMessageResponse> {
    const data = await this.request('POST', 'sendMessage', { body: payload, signal })
    if (!isRecord(data) || typeof data.idMessage !== 'string' || !data.idMessage) {
      throw invalidResponse('sendMessage')
    }
    return { idMessage: data.idMessage }
  }

  /** https://green-api.com/v3/docs/api/service/CheckAccount/ */
  async checkAccount(phoneNumber: string, signal?: AbortSignal): Promise<CheckAccountResponse> {
    const data = await this.request('POST', 'checkAccount', {
      body: { phoneNumber: Number(phoneNumber) },
      signal,
    })
    if (!isRecord(data) || typeof data.exist !== 'boolean') throw invalidResponse('checkAccount')
    return { exist: data.exist, chatId: typeof data.chatId === 'string' ? data.chatId : '' }
  }

  /**
   * Long polling одного уведомления из очереди.
   * https://green-api.com/v3/docs/api/receiving/technology-http-api/ReceiveNotification/
   * @returns `null`, если за receiveTimeout уведомлений не появилось.
   */
  async receiveNotification(
    receiveTimeoutS: number,
    signal?: AbortSignal,
  ): Promise<ReceivedNotification | null> {
    const data = await this.request('GET', 'receiveNotification', {
      query: { receiveTimeout: receiveTimeoutS },
      signal,
      timeoutMs: receiveTimeoutS * 1000 + LONG_POLL_EXTRA_MS,
    })
    if (data === null) return null
    if (!isRecord(data) || typeof data.receiptId !== 'number') {
      throw invalidResponse('receiveNotification')
    }
    return { receiptId: data.receiptId, body: data.body }
  }

  /** https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/ */
  async deleteNotification(
    receiptId: number,
    signal?: AbortSignal,
  ): Promise<DeleteNotificationResponse> {
    const data = await this.request('DELETE', 'deleteNotification', {
      pathSuffix: `/${String(receiptId)}`,
      signal,
    })
    return { result: isRecord(data) && data.result === true }
  }

  private buildUrl(method: string, options: RequestOptions): string {
    const url = `${this.baseUrl}/waInstance${encodeURIComponent(this.idInstance)}/${method}/${encodeURIComponent(this.token)}${options.pathSuffix ?? ''}`
    if (!options.query) return url
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(options.query)) params.set(key, String(value))
    return `${url}?${params.toString()}`
  }

  private async request(
    httpMethod: HttpMethod,
    method: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const { signal, isTimedOut, dispose } = withTimeout(
      options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      options.signal,
    )
    try {
      let status: number
      let text: string
      try {
        const response = await this.fetchFn(this.buildUrl(method, options), {
          method: httpMethod,
          headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          cache: 'no-store',
          signal,
        })
        status = response.status
        text = await response.text()
      } catch (error) {
        if (options.signal?.aborted) throw error
        if (isTimedOut()) {
          throw new GreenApiError('timeout', 'GREEN-API не ответил вовремя. Повторите попытку.')
        }
        throw new GreenApiError(
          'network',
          'Не удалось связаться с GREEN-API. Проверьте подключение к интернету.',
        )
      }

      if (status < 200 || status >= 300) throw errorFromResponse(status, text, this.token)

      const trimmed = text.trim()
      if (trimmed === '' || trimmed === 'null') return null
      try {
        return JSON.parse(trimmed) as unknown
      } catch {
        throw invalidResponse(method)
      }
    } finally {
      dispose()
    }
  }
}
