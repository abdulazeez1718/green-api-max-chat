import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { useChatStore } from './store/chatStore'
import { useSessionStore } from './store/sessionStore'
import { API_TOKEN, FakeGreenApi, ID_INSTANCE } from './test/fakeGreenApi'
import { server } from './test/server'

let fake: FakeGreenApi

beforeEach(() => {
  fake = new FakeGreenApi()
  server.use(...fake.handlers())
})

afterEach(() => {
  // Сторы — синглтоны модуля: сбрасываем между тестами.
  useSessionStore.getState().logout()
  useChatStore.getState().reset()
})

async function login(user: ReturnType<typeof userEvent.setup>, token = API_TOKEN) {
  render(<App />)
  await user.type(screen.getByLabelText('idInstance'), ID_INSTANCE)
  await user.type(screen.getByLabelText('apiTokenInstance'), token)
  await user.click(screen.getByRole('button', { name: 'Войти' }))
}

async function startChat(user: ReturnType<typeof userEvent.setup>, phone: string) {
  const [newChatButton] = screen.getAllByRole('button', { name: 'Новый чат' })
  await user.click(newChatButton!)
  const dialog = await screen.findByRole('dialog', { name: 'Новый чат' })
  await user.type(within(dialog).getByLabelText('Номер телефона собеседника'), phone)
  await user.click(within(dialog).getByRole('button', { name: 'Начать чат' }))
}

describe('Вход', () => {
  it('проверяет формат полей до запроса к API', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('idInstance'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Войти' }))
    expect(screen.getByText('idInstance состоит только из цифр')).toBeVisible()
    expect(screen.getByText('Укажите apiTokenInstance')).toBeVisible()
  })

  it('сообщает о неверном токене', async () => {
    const user = userEvent.setup()
    await login(user, 'wrong-token')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный idInstance или apiTokenInstance.',
    )
    expect(useSessionStore.getState().credentials).toBeNull()
  })

  it('не пускает с неавторизованным инстансом и объясняет, что сделать', async () => {
    fake.stateInstance = 'notAuthorized'
    const user = userEvent.setup()
    await login(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Инстанс не авторизован')
  })
})

describe('Переписка', () => {
  it('создаёт чат по номеру, отправляет сообщение и показывает ответ собеседника', async () => {
    fake.accounts.set('70000000001', '10000000')
    const user = userEvent.setup()
    await login(user)

    // Подключились к очереди уведомлений: в шапке — номер аккаунта инстанса.
    expect(await screen.findByText('Вы: +7 000 000-00-00', {}, { timeout: 3000 })).toBeVisible()

    await startChat(user, '+7 (000) 000-00-01')
    expect(await screen.findByRole('heading', { level: 2, name: '+7 000 000-00-01' })).toBeVisible()

    await user.type(screen.getByLabelText('Сообщение'), 'Здравствуйте!{Enter}')

    await waitFor(() => {
      expect(fake.sent).toEqual([
        { chatId: '10000000', message: 'Здравствуйте!', idMessage: 'out-1' },
      ])
    })
    const log = screen.getByRole('log', { name: 'Сообщения' })
    expect(within(log).getByText('Здравствуйте!')).toBeVisible()
    expect(await within(log).findByRole('img', { name: 'Отправлено' })).toBeVisible()
    expect(screen.getByLabelText('Сообщение')).toHaveValue('')

    // Получатель прочитал и ответил в MAX.
    fake.outgoingStatus('10000000', 'out-1', 'read')
    expect(await within(log).findByRole('img', { name: 'Прочитано' })).toBeVisible()

    fake.incomingText('10000000', 'Добрый день! Чем помочь?', {
      phone: '70000000001',
      name: 'Анна',
    })
    expect(await within(log).findByText('Добрый день! Чем помочь?')).toBeVisible()

    // Имя собеседника из MAX подставилось в заголовок, номер — в подзаголовок.
    expect(await screen.findByRole('heading', { level: 2, name: 'Анна' })).toBeVisible()
    // Чат открыт — сообщение сразу прочитано, а уведомления удалены из очереди.
    expect(useChatStore.getState().chats['10000000']?.unread).toBe(0)
    await waitFor(() => {
      expect(fake.pending).toBe(0)
    })
  })

  it('сообщение из нового чата появляется в списке с непрочитанным', async () => {
    const user = userEvent.setup()
    await login(user)
    await screen.findByText('Вы: +7 000 000-00-00', {}, { timeout: 3000 })

    fake.incomingText('20000000', 'Вы здесь?', { phone: '70000000002', name: 'Борис' })

    const list = await screen.findByRole('list', { name: 'Список чатов' })
    const item = await within(list).findByRole('button', { name: /Борис/ })
    expect(within(item).getByText('Вы здесь?')).toBeVisible()
    expect(within(item).getByLabelText('Непрочитанных: 1')).toBeVisible()

    await user.click(item)
    expect(await screen.findByRole('heading', { level: 2, name: 'Борис' })).toBeVisible()
    expect(within(item).queryByLabelText(/Непрочитанных/)).toBeNull()
  })

  it('сообщает, если у номера нет MAX', async () => {
    const user = userEvent.setup()
    await login(user)
    await startChat(user, '+7 000 000-00-09')
    expect(await screen.findByText(/Этот номер не найден в MAX/)).toBeVisible()
  })

  it('показывает ошибку отправки и позволяет повторить', async () => {
    fake.accounts.set('70000000001', '10000000')
    fake.sendMessageResponse = () => new HttpResponse(null, { status: 502 })
    const user = userEvent.setup()
    await login(user)
    await startChat(user, '70000000001')
    await user.type(await screen.findByLabelText('Сообщение'), 'Тест{Enter}')

    expect(await screen.findByText(/Сервис GREEN-API временно недоступен/)).toBeVisible()

    fake.sendMessageResponse = null
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => {
      expect(fake.sent.map((m) => m.message)).toEqual(['Тест'])
    })
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
  })

  it('предлагает включить уведомления, если они выключены в настройках инстанса', async () => {
    fake.settings.incomingWebhook = 'no'
    const user = userEvent.setup()
    await login(user)

    expect(await screen.findByText(/выключены уведомления о входящих сообщениях/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Исправить настройки' }))

    expect(await screen.findByText(/Настройки сохранены/)).toBeVisible()
    expect(fake.settings.incomingWebhook).toBe('yes')
    // webhookUrl не был задан — его не трогаем.
    expect(fake.settings.webhookUrl).toBe('')
  })
})
