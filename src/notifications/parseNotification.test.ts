import { describe, expect, it } from 'vitest'
import { parseNotification } from './parseNotification'

// Примеры уведомлений — из официальной Postman-коллекции GREEN-API для MAX (v3).
const instanceData = { idInstance: 3100000000, wid: '70000000000@c.us', typeInstance: 'v3' }
const senderData = {
  chatId: '10000000',
  sender: '10000000',
  chatName: 'Ходабрыш Пробешёлов',
  senderName: 'Ходабрыш Пробешёлов',
  senderContactName: 'Ходабрыш Пробешёлов',
  senderPhoneNumber: 70000000002,
}

function incoming(messageData: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    typeWebhook: 'incomingMessageReceived',
    instanceData,
    timestamp: 1588091580,
    idMessage: '2755232962562',
    senderData,
    messageData,
    ...extra,
  }
}

describe('parseNotification: входящие сообщения', () => {
  it('textMessage', () => {
    expect(
      parseNotification(
        incoming({
          typeMessage: 'textMessage',
          textMessageData: { textMessage: 'Я использую GREEN-API!' },
        }),
      ),
    ).toEqual({
      type: 'message',
      direction: 'in',
      fromApi: false,
      chatId: '10000000',
      idMessage: '2755232962562',
      timestamp: 1588091580_000,
      text: 'Я использую GREEN-API!',
      chatName: 'Ходабрыш Пробешёлов',
      senderPhone: '70000000002',
    })
  })

  it('extendedTextMessage (текст со ссылкой)', () => {
    const event = parseNotification(
      incoming({
        typeMessage: 'extendedTextMessage',
        extendedTextMessageData: {
          text: 'Документация https://green-api.com/',
          title: 'GREEN-API',
        },
      }),
    )
    expect(event).toMatchObject({ type: 'message', text: 'Документация https://green-api.com/' })
  })

  it('quotedMessage — берём текст ответа', () => {
    const event = parseNotification(
      incoming({
        typeMessage: 'quotedMessage',
        extendedTextMessageData: { text: 'Ответ', stanzaId: '1151', participant: '10000001' },
        quotedMessage: { stanzaId: '1151', typeMessage: 'textMessage', textMessage: 'Вопрос' },
      }),
    )
    expect(event).toMatchObject({ type: 'message', text: 'Ответ' })
  })

  it('медиа показывается заглушкой с подписью', () => {
    const event = parseNotification(
      incoming({
        typeMessage: 'imageMessage',
        fileMessageData: { downloadUrl: 'https://example.com/a.webp', caption: 'Смотри' },
      }),
    )
    expect(event).toMatchObject({ type: 'message', text: 'Смотри', unsupportedLabel: 'Фото' })
  })

  it('реакции не превращаются в сообщения', () => {
    expect(
      parseNotification(
        incoming({
          typeMessage: 'reactionMessage',
          extendedTextMessageData: { text: '👍' },
          quotedMessage: { stanzaId: '1151', participant: '10000001' },
        }),
      ),
    ).toBeNull()
  })

  it('editedMessage и deletedMessage ссылаются на исходное сообщение', () => {
    expect(
      parseNotification(
        incoming({
          typeMessage: 'editedMessage',
          editedMessageData: { textMessage: 'Исправлено', stanzaId: '1152' },
        }),
      ),
    ).toEqual({ type: 'edited', chatId: '10000000', targetId: '1152', text: 'Исправлено' })

    expect(
      parseNotification(
        incoming({ typeMessage: 'deletedMessage', deletedMessageData: { stanzaId: '1152' } }),
      ),
    ).toEqual({ type: 'deleted', chatId: '10000000', targetId: '1152' })
  })

  it('номер отправителя не берём в групповых чатах', () => {
    const event = parseNotification(
      incoming(
        { typeMessage: 'textMessage', textMessageData: { textMessage: 'В группе' } },
        { senderData: { ...senderData, chatId: '-10000000000000' } },
      ),
    )
    expect(event).toMatchObject({ chatId: '-10000000000000' })
    expect(event).not.toHaveProperty('senderPhone')
  })
})

describe('parseNotification: исходящие и служебные', () => {
  it('outgoingAPIMessageReceived', () => {
    const event = parseNotification({
      typeWebhook: 'outgoingAPIMessageReceived',
      instanceData,
      timestamp: 1588091580,
      idMessage: '2755232962562',
      senderData: { chatId: '10000000', sender: '10000000', chatName: 'Ходабрыш' },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
    })
    expect(event).toMatchObject({
      type: 'message',
      direction: 'out',
      fromApi: true,
      text: 'Привет',
      chatName: 'Ходабрыш',
    })
  })

  it('outgoingMessageReceived (с телефона)', () => {
    const event = parseNotification({
      typeWebhook: 'outgoingMessageReceived',
      instanceData,
      timestamp: 1588091580,
      idMessage: 'X1',
      senderData,
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'С телефона' } },
    })
    expect(event).toMatchObject({ type: 'message', direction: 'out', fromApi: false })
    // Номер у исходящих — не номер собеседника, поэтому не используется.
    expect(event).not.toHaveProperty('senderPhone')
  })

  it.each([
    ['delivered', { status: 'delivered' }],
    ['read', { status: 'read' }],
    ['noAccount', { status: 'failed', error: 'У получателя нет аккаунта MAX' }],
    ['failed', { status: 'failed', error: 'Не удалось доставить сообщение' }],
  ])('outgoingMessageStatus %s', (status, expected) => {
    expect(
      parseNotification({
        typeWebhook: 'outgoingMessageStatus',
        chatId: '10000000',
        instanceData,
        timestamp: 1755591519,
        idMessage: '115054445839974415',
        status,
        sendByApi: true,
      }),
    ).toEqual({ type: 'status', chatId: '10000000', idMessage: '115054445839974415', ...expected })
  })

  it('stateInstanceChanged и quotaExceeded', () => {
    expect(
      parseNotification({ typeWebhook: 'stateInstanceChanged', stateInstance: 'notAuthorized' }),
    ).toEqual({ type: 'state', state: 'notAuthorized' })

    expect(
      parseNotification({
        typeWebhook: 'quotaExceeded',
        quotaData: { status: 'CORRESPONDENTS_QUOTA_EXCEEDED', description: 'Monthly quota' },
      }),
    ).toEqual({ type: 'quota', description: 'Monthly quota' })
  })

  it.each([
    null,
    'строка',
    {},
    { typeWebhook: 'deviceInfo' },
    { typeWebhook: 'incomingMessageReceived' },
  ])('игнорирует ненужные и некорректные уведомления: %j', (body) => {
    expect(parseNotification(body)).toBeNull()
  })
})
