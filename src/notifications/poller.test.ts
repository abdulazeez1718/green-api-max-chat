import { describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '../api/errors'
import type { GreenApiClient } from '../api/greenApi'
import type { ReceivedNotification } from '../api/types'
import { backoffDelay, runNotificationLoop, type PollerHandlers } from './poller'

type Step = ReceivedNotification | null | Error

/** Клиент-заглушка: отдаёт заранее заданные ответы ReceiveNotification, потом отменяет цикл. */
function fakeClient(steps: Step[], controller: AbortController) {
  const deleted: number[] = []
  const client = {
    receiveNotification: vi.fn(() => {
      const step = steps.shift()
      if (step === undefined) {
        controller.abort()
        return Promise.reject(new DOMException('aborted', 'AbortError'))
      }
      return step instanceof Error ? Promise.reject(step) : Promise.resolve(step)
    }),
    deleteNotification: vi.fn((receiptId: number) => {
      deleted.push(receiptId)
      return Promise.resolve({ result: true })
    }),
  }
  return { client: client as unknown as GreenApiClient, deleted, mock: client }
}

function handlers(overrides: Partial<PollerHandlers> = {}): PollerHandlers {
  return {
    onNotification: vi.fn(),
    onOnline: vi.fn(),
    onRetry: vi.fn(),
    onFatal: vi.fn(),
    ...overrides,
  }
}

const fast = { minBackoffMs: 1, maxBackoffMs: 2, minPollIntervalMs: 0, random: () => 0.5 }

describe('runNotificationLoop', () => {
  it('обрабатывает уведомления по порядку и удаляет каждое из очереди', async () => {
    const controller = new AbortController()
    const { client, deleted } = fakeClient(
      [{ receiptId: 1, body: 'a' }, null, { receiptId: 2, body: 'b' }],
      controller,
    )
    const h = handlers()
    await runNotificationLoop(client, controller.signal, h, fast)

    expect(h.onNotification).toHaveBeenNthCalledWith(1, 'a')
    expect(h.onNotification).toHaveBeenNthCalledWith(2, 'b')
    expect(deleted).toEqual([1, 2])
    expect(h.onOnline).toHaveBeenCalled()
  })

  it('ошибка обработчика не блокирует очередь: уведомление всё равно удаляется', async () => {
    const controller = new AbortController()
    const { client, deleted } = fakeClient([{ receiptId: 5, body: 'broken' }], controller)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const h = handlers({
      onNotification: () => {
        throw new Error('boom')
      },
    })
    await runNotificationLoop(client, controller.signal, h, fast)
    expect(deleted).toEqual([5])
    expect(consoleError).toHaveBeenCalled()
  })

  it('при временной ошибке повторяет запрос с задержкой', async () => {
    const controller = new AbortController()
    const { client, mock } = fakeClient(
      [new GreenApiError('network', 'Нет сети'), { receiptId: 3, body: 'ok' }],
      controller,
    )
    const h = handlers()
    await runNotificationLoop(client, controller.signal, h, fast)
    expect(h.onRetry).toHaveBeenCalledWith('Нет сети', expect.any(Number))
    expect(h.onNotification).toHaveBeenCalledWith('ok')
    expect(mock.receiveNotification).toHaveBeenCalledTimes(3)
  })

  it('неверные учётные данные останавливают цикл', async () => {
    const controller = new AbortController()
    const authError = new GreenApiError('auth', 'Неверный токен', 401)
    const { client, mock } = fakeClient([authError, { receiptId: 9, body: 'never' }], controller)
    const h = handlers()
    await runNotificationLoop(client, controller.signal, h, fast)
    expect(h.onFatal).toHaveBeenCalledWith(authError)
    expect(h.onNotification).not.toHaveBeenCalled()
    expect(mock.receiveNotification).toHaveBeenCalledTimes(1)
  })
})

describe('backoffDelay', () => {
  it('растёт экспоненциально и ограничен сверху', () => {
    const noJitter = () => 0.5
    expect(backoffDelay(1, 1000, 30000, noJitter)).toBe(1000)
    expect(backoffDelay(2, 1000, 30000, noJitter)).toBe(2000)
    expect(backoffDelay(4, 1000, 30000, noJitter)).toBe(8000)
    expect(backoffDelay(10, 1000, 30000, noJitter)).toBe(30000)
  })
})
