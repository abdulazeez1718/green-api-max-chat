/** Статус исходящего сообщения (в порядке «продвижения»). */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface Message {
  /** Стабильный ключ в пределах чата: idMessage или локальный `local:…` для отправляемых. */
  key: string
  /** Идентификатор сообщения в MAX/GREEN-API (у локальных — после ответа SendMessage). */
  idMessage?: string
  direction: 'in' | 'out'
  text: string
  /** Время, мс. */
  timestamp: number
  /** Только для исходящих. */
  status?: MessageStatus
  /** Причина ошибки отправки/доставки. */
  error?: string
  /** Для нетекстовых сообщений (фото, файл…): что именно пришло. Текст тогда — подпись. */
  unsupportedLabel?: string
  edited?: boolean
  deleted?: boolean
}

export interface Chat {
  /** chatId, по которому отправляем: ID пользователя MAX или `<номер>@c.us`. */
  id: string
  /** Другие chatId того же собеседника (номер `…@c.us` и ID MAX указывают на один чат). */
  aliases: string[]
  /** Номер телефона собеседника (только цифры), если известен. */
  phone?: string
  /** Имя собеседника из MAX, если известно. */
  name?: string
  unread: number
  createdAt: number
  /** Время последнего события — для сортировки списка чатов. */
  updatedAt: number
}
