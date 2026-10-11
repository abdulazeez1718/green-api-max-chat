import { useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFixSettings } from '../../hooks/useFixSettings'
import { describeInstanceState } from '../../lib/credentials'
import { getSettingsIssues, useSessionStore } from '../../store/sessionStore'
import { Icon } from '../Icon'
import { Button, IconButton } from '../ui/Button'
import styles from './Sidebar.module.css'

type Tone = 'error' | 'warning' | 'info'

function Banner({
  tone,
  children,
  action,
  onDismiss,
}: {
  tone: Tone
  children: ReactNode
  action?: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div className={styles.banner} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name="alert" size={20} className={styles.bannerIcon} />
      <div className={styles.bannerBody}>
        <p>{children}</p>
        {action}
      </div>
      {onDismiss && (
        <IconButton
          icon="close"
          label="Скрыть"
          iconSize={18}
          className={styles.bannerClose}
          onClick={onDismiss}
        />
      )}
    </div>
  )
}

function settingsProblemText(issues: ReturnType<typeof getSettingsIssues>): string | null {
  if (issues.webhookUrlSet) {
    return 'У инстанса задан webhookUrl, поэтому уведомления не попадают в очередь HTTP API — ответы не появятся в чате.'
  }
  if (issues.incomingDisabled) {
    return 'В настройках инстанса выключены уведомления о входящих сообщениях — ответы не появятся в чате.'
  }
  if (issues.outgoingDisabled) {
    return 'Выключены уведомления об исходящих сообщениях — статусы доставки не будут обновляться.'
  }
  return null
}

/** Предупреждения о проблемах инстанса, из-за которых чат работает не полностью. */
export function IssueBanners({ onLogout }: { onLogout: () => void }) {
  const { instanceState, settings, connection, connectionError, quotaMessage, setQuotaMessage } =
    useSessionStore(
      useShallow((state) => ({
        instanceState: state.instanceState,
        settings: state.settings,
        connection: state.connection,
        connectionError: state.connectionError,
        quotaMessage: state.quotaMessage,
        setQuotaMessage: state.setQuotaMessage,
      })),
    )
  const fixSettings = useFixSettings()
  const [fixNoticeHidden, setFixNoticeHidden] = useState(false)

  const stateInfo = instanceState ? describeInstanceState(instanceState) : null
  const settingsProblem = settingsProblemText(getSettingsIssues(settings))

  return (
    <div className={styles.banners}>
      {connection === 'stopped' && (
        <Banner
          tone="error"
          action={
            <Button size="small" variant="secondary" onClick={onLogout}>
              Выйти и войти заново
            </Button>
          }
        >
          {connectionError ?? 'Получение сообщений остановлено.'}
        </Banner>
      )}

      {connection !== 'stopped' && stateInfo?.message && (
        <Banner tone={stateInfo.usable ? 'warning' : 'error'}>{stateInfo.message}</Banner>
      )}

      {settingsProblem && !fixSettings.done && (
        <Banner
          tone="warning"
          action={
            <Button
              size="small"
              variant="secondary"
              loading={fixSettings.busy}
              onClick={() => void fixSettings.fix()}
              title="Включить уведомления о входящих и исходящих сообщениях (SetSettings)"
            >
              Исправить настройки
            </Button>
          }
        >
          {settingsProblem}
          {fixSettings.error && <span className={styles.bannerError}> {fixSettings.error}</span>}
        </Banner>
      )}

      {fixSettings.done && !fixNoticeHidden && (
        <Banner
          tone="info"
          onDismiss={() => {
            setFixNoticeHidden(true)
          }}
        >
          Настройки сохранены. GREEN-API применит их в течение минуты.
        </Banner>
      )}

      {quotaMessage && (
        <Banner
          tone="warning"
          onDismiss={() => {
            setQuotaMessage(null)
          }}
        >
          {quotaMessage}
        </Banner>
      )}
    </div>
  )
}
