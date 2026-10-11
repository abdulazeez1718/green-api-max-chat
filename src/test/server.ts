import { setupServer } from 'msw/node'

/** MSW-сервер для тестов: обработчики добавляются в каждом тесте через server.use(). */
export const server = setupServer()
