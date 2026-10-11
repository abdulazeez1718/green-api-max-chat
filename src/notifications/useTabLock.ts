import { useCallback, useEffect, useState } from 'react'

export type TabLockState =
  /** Ждём блокировку (первые доли секунды). */
  | 'acquiring'
  /** Эта вкладка — активная: она опрашивает очередь уведомлений. */
  | 'active'
  /** Чат открыт в другой вкладке. */
  | 'busy'

/** Сколько ждать блокировку, прежде чем показать «открыто в другой вкладке». */
const BUSY_DELAY_MS = 400

/**
 * Одна вкладка на инстанс (Web Locks API), как в веб-версиях мессенджеров.
 * Каждое уведомление из очереди GREEN-API получает только один клиент — если бы
 * очередь опрашивали две вкладки, сообщения «разъехались» бы между ними.
 *
 * Вкладка без блокировки ждёт в очереди и сама станет активной, когда другую закроют;
 * `takeOver` забирает блокировку сразу.
 */
export function useTabLock(name: string): { state: TabLockState; takeOver: () => void } {
  const supported = typeof navigator !== 'undefined' && 'locks' in navigator
  const [state, setState] = useState<TabLockState>(supported ? 'acquiring' : 'active')
  const [steal, setSteal] = useState(0)

  useEffect(() => {
    if (!supported) return
    const controller = new AbortController()
    let disposed = false
    let release: (() => void) | undefined
    let granted = false

    const busyTimer = setTimeout(() => {
      if (!granted) setState('busy')
    }, BUSY_DELAY_MS)

    const onGranted = () => {
      // Отмена запроса не гарантирует, что блокировку не выдадут (гонка abort и выдачи,
      // например при двойном запуске эффекта в StrictMode). Тогда сразу отпускаем её.
      if (disposed) return undefined
      granted = true
      clearTimeout(busyTimer)
      setState('active')
      // Держим блокировку, пока вкладка открыта или эффект не очищен.
      return new Promise<void>((resolve) => {
        release = resolve
      })
    }

    const waitInQueue = () => {
      navigator.locks.request(name, { signal: controller.signal }, onGranted).catch(onLost)
    }

    // Блокировку отняла другая вкладка (или запрос отменён при очистке эффекта).
    function onLost() {
      if (disposed) return
      granted = false
      setState('busy')
      waitInQueue()
    }

    if (steal > 0) {
      navigator.locks.request(name, { steal: true }, onGranted).catch(onLost)
    } else {
      waitInQueue()
    }

    return () => {
      disposed = true
      clearTimeout(busyTimer)
      controller.abort()
      release?.()
    }
  }, [name, steal, supported])

  const takeOver = useCallback(() => {
    setSteal((count) => count + 1)
  }, [])

  return { state, takeOver }
}
