/** Минимальная и максимальная длина номера в формате E.164 (без «+»). */
const MIN_DIGITS = 10
const MAX_DIGITS = 15

/**
 * Приводит введённый номер к цифрам международного формата.
 * Понимает привычные для РФ варианты записи:
 *   «+7 (9XX) XXX-XX-XX», «8 9XX XXX XX XX» → «79XXXXXXXXX»,
 *   «9XX XXX-XX-XX» (10 цифр, начинается с 9) → «79XXXXXXXXX».
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('89')) return `7${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('9')) return `7${digits}`
  return digits
}

/** Возвращает текст ошибки или `null`, если номер (после normalizePhone) корректен. */
export function validatePhone(digits: string): string | null {
  if (!digits) return 'Введите номер телефона'
  if (digits.length < MIN_DIGITS) return 'Номер слишком короткий — укажите его с кодом страны'
  if (digits.length > MAX_DIGITS) return 'Номер слишком длинный'
  if (digits.startsWith('0')) return 'Код страны не может начинаться с 0'
  return null
}

/** Форматирует номер для отображения: «+7 XXX XXX-XX-XX», иначе «+» и цифры. */
export function formatPhone(digits: string): string {
  const match = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits)
  if (match) return `+7 ${match[1]} ${match[2]}-${match[3]}-${match[4]}`
  return `+${digits}`
}

/** chatId личного чата по номеру телефона: `<номер>@c.us`. */
export function phoneToChatId(digits: string): string {
  return `${digits}@c.us`
}

/** Номер из chatId вида `<номер>@c.us`, иначе `undefined`. */
export function phoneFromChatId(chatId: string): string | undefined {
  const match = /^(\d{10,15})@c\.us$/.exec(chatId)
  return match?.[1]
}
