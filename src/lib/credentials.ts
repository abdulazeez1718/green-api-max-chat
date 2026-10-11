import type { Credentials } from '../api/types'

export type CredentialErrors = Partial<Record<keyof Credentials, string>>

function isAllowedApiUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    // http — только для локального мок-сервера при разработке.
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

/** Проверяет учётные данные до запроса к API. Пустой объект — ошибок нет. */
export function validateCredentials(credentials: Credentials): CredentialErrors {
  const errors: CredentialErrors = {}
  if (!credentials.idInstance) {
    errors.idInstance = 'Укажите idInstance'
  } else if (!/^\d{4,20}$/.test(credentials.idInstance)) {
    errors.idInstance = 'idInstance состоит только из цифр'
  }
  if (!credentials.apiTokenInstance) {
    errors.apiTokenInstance = 'Укажите apiTokenInstance'
  } else if (/\s/.test(credentials.apiTokenInstance)) {
    errors.apiTokenInstance = 'В apiTokenInstance не должно быть пробелов'
  }
  if (!isAllowedApiUrl(credentials.apiUrl)) {
    errors.apiUrl = 'Адрес API должен начинаться с https://'
  }
  return errors
}

export interface InstanceStateInfo {
  /** Можно ли работать с чатом в этом состоянии. */
  usable: boolean
  /** Пояснение для пользователя (для authorized — нет). */
  message?: string
}

/** Состояния инстанса: https://green-api.com/v3/docs/api/account/GetStateInstance/ */
export function describeInstanceState(state: string): InstanceStateInfo {
  switch (state) {
    case 'authorized':
      return { usable: true }
    case 'notAuthorized':
      return {
        usable: false,
        message:
          'Инстанс не авторизован: привяжите аккаунт MAX в личном кабинете GREEN-API (по QR-коду или номеру телефона).',
      }
    case 'starting':
      return {
        usable: false,
        message: 'Инстанс запускается. Подождите пару минут и попробуйте снова.',
      }
    case 'blocked':
      return { usable: false, message: 'Аккаунт MAX на этом инстансе заблокирован.' }
    case 'suspended':
      return {
        usable: true,
        message:
          'Аккаунт MAX временно ограничен: отправка возможна только тем, кто сохранил ваш номер в контактах.',
      }
    case 'yellowCard':
      return {
        usable: true,
        message: 'Отправка сообщений частично ограничена мессенджером.',
      }
    default:
      return { usable: false, message: `Инстанс недоступен (состояние «${state}»).` }
  }
}
