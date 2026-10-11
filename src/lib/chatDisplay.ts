import type { Chat, Message } from '../model'
import { formatPhone, phoneFromChatId } from './phone'

/** Название чата: имя из MAX, иначе номер телефона, иначе chatId. */
export function chatTitle(chat: Chat): string {
  if (chat.name) return chat.name
  const phone = chat.phone ?? phoneFromChatId(chat.id)
  return phone ? formatPhone(phone) : chat.id
}

/** Подзаголовок чата: номер, если в заголовке имя. */
export function chatSubtitle(chat: Chat): string | undefined {
  const phone = chat.phone ?? phoneFromChatId(chat.id)
  return chat.name && phone ? formatPhone(phone) : undefined
}

/** Инициалы для аватара: «Иван Петров» → «ИП». Для чатов без имени — пусто. */
export function initials(name: string | undefined): string {
  if (!name) return ''
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
  return /\p{L}/u.test(letters) ? letters.toLocaleUpperCase('ru-RU') : ''
}

/** Палитра аватаров MAX (градиенты). Цвет закрепляется за чатом по хэшу id. */
const AVATAR_GRADIENTS = [
  ['#ff48b6', '#ff8a35'],
  ['#ffc93d', '#ff832a'],
  ['#14e1d5', '#03c722'],
  ['#08d7f3', '#5398ff'],
  ['#bf97ff', '#526eff'],
] as const

/** FNV-1a: равномерно раскладывает по цветам даже id, отличающиеся одной цифрой. */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function avatarGradient(id: string): string {
  const [from, to] =
    AVATAR_GRADIENTS[hashString(id) % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0]
  return `linear-gradient(135deg, ${from}, ${to})`
}

/** Текст превью последнего сообщения в списке чатов. */
export function messagePreview(message: Message | undefined): string {
  if (!message) return 'Нет сообщений'
  if (message.deleted) return 'Сообщение удалено'
  const body = message.unsupportedLabel
    ? [message.unsupportedLabel, message.text].filter(Boolean).join(': ')
    : message.text
  return message.direction === 'out' ? `Вы: ${body}` : body
}
