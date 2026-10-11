import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone, phoneFromChatId, phoneToChatId, validatePhone } from './phone'

// Номера в тестах заведомо несуществующие: код «000» или нулевая абонентская часть.
describe('normalizePhone', () => {
  it.each([
    ['+7 (000) 000-00-01', '70000000001'],
    ['8 900 000 00 00', '79000000000'],
    ['900 000-00-00', '79000000000'],
    ['+375 00 000-00-00', '375000000000'],
    ['+998 00 000 00 00', '998000000000'],
    ['  70000000001 ', '70000000001'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it('не трогает 11-значные номера на 8, если это не российский мобильный (8 9…)', () => {
    expect(normalizePhone('80000000000')).toBe('80000000000')
  })
})

describe('validatePhone', () => {
  it('принимает номер с кодом страны', () => {
    expect(validatePhone('70000000001')).toBeNull()
  })

  it.each([
    ['', 'Введите номер телефона'],
    ['12345', 'Номер слишком короткий — укажите его с кодом страны'],
    ['1234567890123456', 'Номер слишком длинный'],
    ['0123456789', 'Код страны не может начинаться с 0'],
  ])('отклоняет «%s»', (digits, message) => {
    expect(validatePhone(digits)).toBe(message)
  })
})

describe('formatPhone / chatId', () => {
  it('форматирует российский номер', () => {
    expect(formatPhone('70000000001')).toBe('+7 000 000-00-01')
  })

  it('остальные номера показывает с плюсом', () => {
    expect(formatPhone('375000000000')).toBe('+375000000000')
  })

  it('строит chatId по номеру и разбирает его обратно', () => {
    expect(phoneToChatId('70000000001')).toBe('70000000001@c.us')
    expect(phoneFromChatId('70000000001@c.us')).toBe('70000000001')
    expect(phoneFromChatId('10000000')).toBeUndefined()
  })
})
