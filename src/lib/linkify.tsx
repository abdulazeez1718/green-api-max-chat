import type { ReactNode } from 'react'

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/giu
/** Знаки препинания в конце ссылки обычно относятся к предложению, а не к URL. */
const TRAILING_PUNCTUATION = /[.,!?;:)\]}»"']+$/u

/**
 * Делает http(s)-ссылки в тексте кликабельными. Текст не интерпретируется как HTML:
 * React экранирует строки, а ссылки создаются только для протоколов http/https.
 */
export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index
    const raw = match[0]
    const url = raw.replace(TRAILING_PUNCTUATION, '')
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))
    nodes.push(
      <a key={start} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>,
    )
    lastIndex = start + url.length
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}
