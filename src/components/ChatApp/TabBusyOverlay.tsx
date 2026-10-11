import { useId } from 'react'
import { Button } from '../ui/Button'
import styles from './ChatApp.module.css'

/** Показывается, когда чат этого инстанса уже открыт в другой вкладке. */
export function TabBusyOverlay({ onTakeOver }: { onTakeOver: () => void }) {
  const titleId = useId()
  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={styles.overlayCard}>
        <h2 id={titleId}>Чат открыт в другой вкладке</h2>
        <p>
          Сообщения из очереди GREEN-API получает только одна вкладка — так ни одно сообщение не
          потеряется.
        </p>
        {/* Модальное окно: фокус сразу на единственном действии. */}
        <Button onClick={onTakeOver} block autoFocus>
          Использовать здесь
        </Button>
      </div>
    </div>
  )
}
