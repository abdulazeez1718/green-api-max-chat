import { avatarGradient, initials } from '../../lib/chatDisplay'
import { Icon } from '../Icon'
import styles from './Avatar.module.css'

interface AvatarProps {
  /** Стабильный id для цвета (chatId). */
  id: string
  name?: string | undefined
  size?: number
}

export function Avatar({ id, name, size = 48 }: AvatarProps) {
  const letters = initials(name)
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        background: avatarGradient(id),
        fontSize: Math.round(size * 0.38),
      }}
      aria-hidden="true"
    >
      {letters || <Icon name="user" size={Math.round(size * 0.55)} />}
    </span>
  )
}
