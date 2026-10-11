import { http, HttpResponse } from 'msw'

export const API_URL = 'https://api.green-api.com/v3'
export const ID_INSTANCE = '3100000001'
export const API_TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5'
/** Номера в тестах заведомо несуществующие: код «000» не выдаётся операторам. */
export const OWN_PHONE = '70000000000'

interface QueuedNotification {
  receiptId: number
  body: Record<string, unknown>
}

interface SentMessage {
  chatId: string
  message: string
  idMessage: string
}

const instanceData = {
  idInstance: Number(ID_INSTANCE),
  wid: `${OWN_PHONE}@c.us`,
  typeInstance: 'v3',
}

/**
 * Имитация инстанса GREEN-API для MSW: очередь уведомлений с настоящим long polling,
 * отправка сообщений, CheckAccount, настройки. Форматы — как в документации MAX v3.
 */
export class FakeGreenApi {
  stateInstance = 'authorized'
  settings: Record<string, string> = {
    wid: `${OWN_PHONE}@c.us`,
    webhookUrl: '',
    incomingWebhook: 'yes',
    outgoingWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
  }
  /** Номера с аккаунтом MAX: телефон → chatId. */
  accounts = new Map<string, string>()
  readonly sent: SentMessage[] = []
  readonly deleted: number[] = []
  /** Подменяет ответ sendMessage (например, ошибкой). */
  sendMessageResponse: (() => Response) | null = null

  private queue: QueuedNotification[] = []
  private nextReceiptId = 1
  private nextMessageId = 1
  private waiters = new Set<() => void>()

  get pending(): number {
    return this.queue.length
  }

  enqueue(body: Record<string, unknown>): void {
    this.queue.push({ receiptId: this.nextReceiptId++, body })
    for (const wake of this.waiters) wake()
    this.waiters.clear()
  }

  incomingText(chatId: string, text: string, sender: { phone?: string; name?: string } = {}) {
    const idMessage = `in-${String(this.nextMessageId++)}`
    this.enqueue({
      typeWebhook: 'incomingMessageReceived',
      instanceData,
      timestamp: Math.floor(Date.now() / 1000),
      idMessage,
      senderData: {
        chatId,
        sender: chatId,
        ...(sender.name
          ? { chatName: sender.name, senderName: sender.name, senderContactName: sender.name }
          : {}),
        ...(sender.phone ? { senderPhoneNumber: Number(sender.phone) } : {}),
      },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
    })
    return idMessage
  }

  outgoingStatus(chatId: string, idMessage: string, status: string) {
    this.enqueue({
      typeWebhook: 'outgoingMessageStatus',
      chatId,
      instanceData,
      timestamp: Math.floor(Date.now() / 1000),
      idMessage,
      status,
      sendByApi: true,
    })
  }

  /** Ждёт уведомление в очереди не дольше timeoutMs (как receiveTimeout у настоящего API). */
  private waitForNotification(signal: AbortSignal, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.waiters.delete(done)
        resolve()
      }
      const timer = setTimeout(done, timeoutMs)
      this.waiters.add(done)
      signal.addEventListener('abort', done, { once: true })
    })
  }

  handlers() {
    const base = `${API_URL}/waInstance${ID_INSTANCE}`
    const denied = (token: unknown) =>
      token === API_TOKEN ? null : new HttpResponse('Unauthorized', { status: 401 })

    return [
      http.get(`${base}/getStateInstance/:token`, ({ params }) => {
        return denied(params.token) ?? HttpResponse.json({ stateInstance: this.stateInstance })
      }),
      http.get(`${base}/getSettings/:token`, ({ params }) => {
        return denied(params.token) ?? HttpResponse.json(this.settings)
      }),
      http.post(`${base}/setSettings/:token`, async ({ params, request }) => {
        const error = denied(params.token)
        if (error) return error
        Object.assign(this.settings, (await request.json()) as Record<string, string>)
        return HttpResponse.json({ saveSettings: true })
      }),
      http.post(`${base}/checkAccount/:token`, async ({ params, request }) => {
        const error = denied(params.token)
        if (error) return error
        const { phoneNumber } = (await request.json()) as { phoneNumber: number }
        const chatId = this.accounts.get(String(phoneNumber))
        return HttpResponse.json({ exist: Boolean(chatId), chatId: chatId ?? '' })
      }),
      http.post(`${base}/sendMessage/:token`, async ({ params, request }) => {
        const error = denied(params.token)
        if (error) return error
        if (this.sendMessageResponse) return this.sendMessageResponse()
        const body = (await request.json()) as { chatId: string; message: string }
        const idMessage = `out-${String(this.nextMessageId++)}`
        this.sent.push({ ...body, idMessage })
        return HttpResponse.json({ idMessage })
      }),
      http.get(`${base}/receiveNotification/:token`, async ({ params, request }) => {
        const error = denied(params.token)
        if (error) return error
        if (this.queue.length === 0) await this.waitForNotification(request.signal, 1500)
        const next = this.queue[0]
        return next ? HttpResponse.json(next) : HttpResponse.json(null)
      }),
      http.delete(`${base}/deleteNotification/:token/:receiptId`, ({ params }) => {
        const error = denied(params.token)
        if (error) return error
        const receiptId = Number(params.receiptId)
        this.queue = this.queue.filter((item) => item.receiptId !== receiptId)
        this.deleted.push(receiptId)
        return HttpResponse.json({ result: true })
      }),
    ]
  }
}
