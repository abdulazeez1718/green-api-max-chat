import type { MessageStatus } from '../model'
import { Icon } from './Icon'

const STATUS_LABELS: Record<MessageStatus, string> = {
  pending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
}

/** Галочки статуса исходящего сообщения, как в мессенджерах. */
export function MessageStatusIcon({
  status,
  className,
  size = 16,
}: {
  status: MessageStatus
  className?: string | undefined
  size?: number
}) {
  const icon =
    status === 'pending'
      ? 'clock'
      : status === 'sent'
        ? 'check'
        : status === 'failed'
          ? 'alert'
          : 'checks'
  return (
    <span className={className} data-status={status} role="img" aria-label={STATUS_LABELS[status]}>
      <Icon name={icon} size={size} strokeWidth={status === 'pending' ? 2 : 2.2} />
    </span>
  )
}
