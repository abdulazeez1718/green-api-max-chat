import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_TOKEN, API_URL, ID_INSTANCE } from '../test/fakeGreenApi'
import { server } from '../test/server'
import { GreenApiError } from './errors'
import { GreenApiClient, normalizeApiUrl } from './greenApi'

const client = new GreenApiClient({
  apiUrl: `${API_URL}/`,
  idInstance: ID_INSTANCE,
  apiTokenInstance: API_TOKEN,
})
const base = `${API_URL}/waInstance${ID_INSTANCE}`

async function catchError(promise: Promise<unknown>): Promise<GreenApiError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof GreenApiError) return error
    throw error
  }
  throw new Error('Ожидалась ошибка')
}

describe('GreenApiClient', () => {
  it('отправляет SendMessage по адресу {apiUrl}/waInstance{id}/sendMessage/{token} с JSON-телом', async () => {
    let received: { url: string; body: unknown; contentType: string | null } | undefined
    server.use(
      http.post(`${base}/sendMessage/${API_TOKEN}`, async ({ request }) => {
        received = {
          url: request.url,
          body: await request.json(),
          contentType: request.headers.get('content-type'),
        }
        return HttpResponse.json({ idMessage: 'BAE5F4886F6F2D05' })
      }),
    )

    const result = await client.sendMessage({ chatId: '10000000', message: 'Привет 👋' })

    expect(result).toEqual({ idMessage: 'BAE5F4886F6F2D05' })
    expect(received?.url).toBe(`${base}/sendMessage/${API_TOKEN}`)
    expect(received?.body).toEqual({ chatId: '10000000', message: 'Привет 👋' })
    expect(received?.contentType).toBe('application/json')
  })

  it('ReceiveNotification передаёт receiveTimeout и возвращает null для пустой очереди', async () => {
    let timeout: string | null = null
    server.use(
      http.get(`${base}/receiveNotification/${API_TOKEN}`, ({ request }) => {
        timeout = new URL(request.url).searchParams.get('receiveTimeout')
        return HttpResponse.json(null)
      }),
    )

    await expect(client.receiveNotification(20)).resolves.toBeNull()
    expect(timeout).toBe('20')
  })

  it('ReceiveNotification возвращает receiptId и тело уведомления', async () => {
    server.use(
      http.get(`${base}/receiveNotification/${API_TOKEN}`, () =>
        HttpResponse.json({ receiptId: 7, body: { typeWebhook: 'stateInstanceChanged' } }),
      ),
    )
    await expect(client.receiveNotification(5)).resolves.toEqual({
      receiptId: 7,
      body: { typeWebhook: 'stateInstanceChanged' },
    })
  })

  it('DeleteNotification вызывается методом DELETE с receiptId в пути', async () => {
    let method = ''
    server.use(
      http.delete(`${base}/deleteNotification/${API_TOKEN}/42`, ({ request }) => {
        method = request.method
        return HttpResponse.json({ result: true })
      }),
    )
    await expect(client.deleteNotification(42)).resolves.toEqual({ result: true })
    expect(method).toBe('DELETE')
  })

  it('CheckAccount отправляет номер числом', async () => {
    let body: unknown
    server.use(
      http.post(`${base}/checkAccount/${API_TOKEN}`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ exist: true, chatId: '1000000001' })
      }),
    )
    await expect(client.checkAccount('70000000001')).resolves.toEqual({
      exist: true,
      chatId: '1000000001',
    })
    expect(body).toEqual({ phoneNumber: 70000000001 })
  })

  it('401 → понятная ошибка авторизации', async () => {
    server.use(
      http.get(
        `${base}/getStateInstance/${API_TOKEN}`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    )
    const error = await catchError(client.getStateInstance())
    expect(error.kind).toBe('auth')
    expect(error.message).toBe('Неверный idInstance или apiTokenInstance.')
  })

  it('400 из-за webhookUrl распознаётся отдельно', async () => {
    server.use(
      http.get(`${base}/receiveNotification/${API_TOKEN}`, () =>
        HttpResponse.text(
          'Message cannot be received because custom webhook url is set. Go to cabinet, clear webhook url for instance: 3100000001 and wait for about 1 minute for another attempt',
          { status: 400 },
        ),
      ),
    )
    const error = await catchError(client.receiveNotification(5))
    expect(error.kind).toBe('webhookUrlSet')
  })

  it('466 → лимит тарифа, текст из ответа сервера', async () => {
    server.use(
      http.post(`${base}/sendMessage/${API_TOKEN}`, () =>
        HttpResponse.json(
          {
            invokeStatus: {
              status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
              description: 'Monthly quota has been exceeded.',
            },
          },
          { status: 466 },
        ),
      ),
    )
    const error = await catchError(client.sendMessage({ chatId: '1', message: 'x' }))
    expect(error.kind).toBe('quota')
    expect(error.message).toContain('Monthly quota has been exceeded.')
  })

  it('никогда не показывает токен из поля path ответа об ошибке', async () => {
    server.use(
      http.post(`${base}/sendMessage/${API_TOKEN}`, () =>
        HttpResponse.json(
          {
            statusCode: 400,
            path: `/waInstance${ID_INSTANCE}/sendMessage/${API_TOKEN}`,
            message: `Validation failed. Details: bad request to ${API_TOKEN}`,
          },
          { status: 400 },
        ),
      ),
    )
    const error = await catchError(client.sendMessage({ chatId: '1', message: 'x' }))
    expect(error.kind).toBe('validation')
    expect(error.message).not.toContain(API_TOKEN)
    expect(error.message).toContain('Validation failed')
  })

  it('сетевой сбой → kind=network', async () => {
    server.use(http.get(`${base}/getStateInstance/${API_TOKEN}`, () => HttpResponse.error()))
    const error = await catchError(client.getStateInstance())
    expect(error.kind).toBe('network')
  })

  it('5xx → kind=server', async () => {
    server.use(
      http.get(`${base}/getSettings/${API_TOKEN}`, () => new HttpResponse(null, { status: 502 })),
    )
    const error = await catchError(client.getSettings())
    expect(error.kind).toBe('server')
    expect(error.message).toContain('502')
  })

  it('отмена через AbortSignal пробрасывается как AbortError', async () => {
    server.use(
      http.get(`${base}/receiveNotification/${API_TOKEN}`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return HttpResponse.json(null)
      }),
    )
    const controller = new AbortController()
    const request = client.receiveNotification(5, controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('normalizeApiUrl', () => {
  it('убирает пробелы и завершающие слэши', () => {
    expect(normalizeApiUrl(' https://api.green-api.com/v3/ ')).toBe('https://api.green-api.com/v3')
  })
})
