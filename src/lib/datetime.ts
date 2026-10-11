const DAY_MS = 24 * 60 * 60 * 1000

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fullDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const shortDateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
})

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

/** «14:05» */
export function formatTime(timestamp: number): string {
  return timeFormat.format(timestamp)
}

/** Метка дня над сообщениями: «Сегодня», «Вчера», «5 октября», «5 октября 2025 г.» */
export function formatDayLabel(timestamp: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear()
  return (sameYear ? dayMonthFormat : fullDateFormat).format(timestamp)
}

/** Время в списке чатов: «14:05», «вчера», «пн», «05.10.25» */
export function formatChatListTime(timestamp: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS)
  if (days <= 0) return formatTime(timestamp)
  if (days === 1) return 'вчера'
  if (days < 7) return weekdayFormat.format(timestamp)
  return shortDateFormat.format(timestamp)
}
