import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '../notifications/parseNotification'
import {
  addOutgoing,
  applyEvent,
  confirmOutgoing,
  emptyChatData,
  failOutgoing,
  mergeStatus,
  retryOutgoing,
  upsertChat,
  type ChatData,
} from './chatLogic'

const NOW = Date.UTC(2026, 9, 11, 12, 0, 0)
const ctx = { now: NOW, viewingChatId: null }

type MessageEvent = Extract<ChatEvent, { type: 'message' }>

function incoming(overrides: Partial<MessageEvent> = {}): MessageEvent {
  return {
    type: 'message',
    direction: 'in',
    fromApi: false,
    chatId: '10000000',
    idMessage: 'in-1',
    timestamp: NOW,
    text: 'Привет!',
    ...overrides,
  }
}

function chatWithPhone(): ChatData {
  return upsertChat(emptyChatData(), { id: '70000000001@c.us', phone: '70000000001' }, NOW).data
}

describe('входящие сообщения', () => {
  it('создают чат для нового собеседника и увеличивают счётчик непрочитанных', () => {
    const data = applyEvent(
      emptyChatData(),
      incoming({ chatName: 'Анна', senderPhone: '70000000001' }),
      ctx,
    )
    expect(data.chats['10000000']).toMatchObject({
      id: '10000000',
      name: 'Анна',
      phone: '70000000001',
      unread: 1,
    })
    expect(data.messages['10000000']).toHaveLength(1)
  })

  it('ответ на чат, созданный по номеру, попадает в тот же чат (сопоставление по номеру)', () => {
    const data = applyEvent(chatWithPhone(), incoming({ senderPhone: '70000000001' }), ctx)
    expect(Object.keys(data.chats)).toEqual(['70000000001@c.us'])
    expect(data.chats['70000000001@c.us']?.aliases).toEqual(['10000000'])
    expect(data.messages['70000000001@c.us']?.[0]?.text).toBe('Привет!')

    // Следующее сообщение находится уже по псевдониму, даже без номера.
    const next = applyEvent(data, incoming({ idMessage: 'in-2', text: 'Ещё' }), ctx)
    expect(next.messages['70000000001@c.us']).toHaveLength(2)
  })

  it('повторная доставка того же уведомления не дублирует сообщение', () => {
    const once = applyEvent(emptyChatData(), incoming(), ctx)
    const twice = applyEvent(once, incoming(), ctx)
    expect(twice.messages['10000000']).toHaveLength(1)
    expect(twice.chats['10000000']?.unread).toBe(1)
  })

  it('в открытом чате непрочитанные не копятся', () => {
    const data = applyEvent(emptyChatData(), incoming(), { now: NOW, viewingChatId: '10000000' })
    expect(data.chats['10000000']?.unread).toBe(0)
  })

  it('сообщения упорядочены по времени, даже если пришли не по порядку', () => {
    let data = applyEvent(emptyChatData(), incoming({ idMessage: 'b', timestamp: NOW + 1000 }), ctx)
    data = applyEvent(data, incoming({ idMessage: 'a', timestamp: NOW }), ctx)
    expect(data.messages['10000000']?.map((m) => m.idMessage)).toEqual(['a', 'b'])
  })

  it('редактирование и удаление меняют исходное сообщение', () => {
    let data = applyEvent(emptyChatData(), incoming({ idMessage: 'm1' }), ctx)
    data = applyEvent(
      data,
      { type: 'edited', chatId: '10000000', targetId: 'm1', text: 'Исправлено' },
      ctx,
    )
    expect(data.messages['10000000']?.[0]).toMatchObject({ text: 'Исправлено', edited: true })
    data = applyEvent(data, { type: 'deleted', chatId: '10000000', targetId: 'm1' }, ctx)
    expect(data.messages['10000000']?.[0]?.deleted).toBe(true)
  })
})

describe('исходящие сообщения', () => {
  function sent(): ChatData {
    let data = upsertChat(emptyChatData(), { id: '10000000', phone: '70000000001' }, NOW).data
    data = addOutgoing(data, '10000000', 'local:1', 'Здравствуйте', NOW)
    return data
  }

  it('pending → sent → delivered → read', () => {
    let data = sent()
    expect(data.messages['10000000']?.[0]?.status).toBe('pending')
    data = confirmOutgoing(data, '10000000', 'local:1', 'out-1')
    expect(data.messages['10000000']?.[0]).toMatchObject({ idMessage: 'out-1', status: 'sent' })
    for (const status of ['delivered', 'read'] as const) {
      data = applyEvent(
        data,
        { type: 'status', chatId: '10000000', idMessage: 'out-1', status },
        ctx,
      )
    }
    expect(data.messages['10000000']?.[0]?.status).toBe('read')
  })

  it('статус не откатывается назад', () => {
    expect(mergeStatus('read', 'delivered')).toBe('read')
    expect(mergeStatus('delivered', 'failed')).toBe('delivered')
    expect(mergeStatus('sent', 'failed')).toBe('failed')
    expect(mergeStatus('failed', 'delivered')).toBe('delivered')
  })

  it('эхо outgoingAPIMessageReceived раньше ответа SendMessage не создаёт дубль', () => {
    let data = sent()
    data = applyEvent(
      data,
      {
        ...incoming({ idMessage: 'out-1', text: 'Здравствуйте' }),
        direction: 'out',
        fromApi: true,
      },
      ctx,
    )
    data = confirmOutgoing(data, '10000000', 'local:1', 'out-1')
    expect(data.messages['10000000']).toHaveLength(1)
    expect(data.messages['10000000']?.[0]).toMatchObject({ key: 'local:1', idMessage: 'out-1' })
  })

  it('эхо с ID MAX находит чат, созданный по номеру (до подтверждения отправки)', () => {
    let data = chatWithPhone()
    data = addOutgoing(data, '70000000001@c.us', 'local:1', 'Здравствуйте', NOW)
    data = applyEvent(
      data,
      {
        ...incoming({ idMessage: 'out-1', text: 'Здравствуйте', chatId: '10000000' }),
        direction: 'out',
        fromApi: true,
      },
      ctx,
    )
    expect(Object.keys(data.chats)).toEqual(['70000000001@c.us'])
    expect(data.chats['70000000001@c.us']?.aliases).toContain('10000000')
    expect(data.messages['70000000001@c.us']?.[0]?.idMessage).toBe('out-1')
  })

  it('статус, пришедший раньше ответа SendMessage, применяется после подтверждения', () => {
    let data = sent()
    data = applyEvent(
      data,
      { type: 'status', chatId: '10000000', idMessage: 'out-1', status: 'delivered' },
      ctx,
    )
    expect(data.orphanStatuses['out-1']).toEqual({ status: 'delivered' })
    data = confirmOutgoing(data, '10000000', 'local:1', 'out-1')
    expect(data.messages['10000000']?.[0]?.status).toBe('delivered')
    expect(data.orphanStatuses).toEqual({})
  })

  it('ошибка отправки и повтор', () => {
    let data = failOutgoing(sent(), '10000000', 'local:1', 'Нет сети')
    expect(data.messages['10000000']?.[0]).toMatchObject({ status: 'failed', error: 'Нет сети' })
    data = retryOutgoing(data, '10000000', 'local:1')
    expect(data.messages['10000000']?.[0]?.status).toBe('pending')
    expect(data.messages['10000000']?.[0]).not.toHaveProperty('error')
  })
})

describe('upsertChat', () => {
  it('не создаёт второй чат для того же номера', () => {
    const first = upsertChat(emptyChatData(), { id: '10000000', phone: '70000000001' }, NOW)
    const second = upsertChat(first.data, { id: '70000000001@c.us', phone: '70000000001' }, NOW)
    expect(second.chatId).toBe('10000000')
    expect(Object.keys(second.data.chats)).toHaveLength(1)
    expect(second.data.chats['10000000']?.aliases).toEqual(['70000000001@c.us'])
  })
})
