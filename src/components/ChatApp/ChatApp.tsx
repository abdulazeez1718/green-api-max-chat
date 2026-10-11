import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react'
import { GreenApiClient } from '../../api/greenApi'
import { GreenApiProvider } from '../../api/GreenApiContext'
import type { Credentials } from '../../api/types'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useInstanceCheck } from '../../hooks/useInstanceCheck'
import { useNotificationPolling } from '../../notifications/useNotificationPolling'
import { useTabLock } from '../../notifications/useTabLock'
import { bindChatPersistence, clearChatData } from '../../store/chatPersistence'
import { useChatStore } from '../../store/chatStore'
import { useSessionStore } from '../../store/sessionStore'
import { ChatPanel, EmptyPanel } from '../ChatPanel/ChatPanel'
import { Sidebar } from '../Sidebar/Sidebar'
import { TabBusyOverlay } from './TabBusyOverlay'
import styles from './ChatApp.module.css'

/** Вернувшись во вкладку, отмечаем открытый чат прочитанным. */
function useMarkReadOnVisible(): void {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const { activeChatId, markRead } = useChatStore.getState()
      if (activeChatId) markRead(activeChatId)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}

/** Чат после входа: список чатов, переписка и получение уведомлений. */
export function ChatApp({ credentials }: { credentials: Credentials }) {
  const client = useMemo(() => new GreenApiClient(credentials), [credentials])
  const activeChatId = useChatStore((state) => state.activeChatId)
  const tabLock = useTabLock(`max-chat:${credentials.idInstance}`)

  // История этого инстанса: загрузка из localStorage и сохранение изменений.
  useLayoutEffect(() => bindChatPersistence(credentials.idInstance), [credentials.idInstance])

  useInstanceCheck(client)
  useNotificationPolling(client, tabLock.state === 'active')
  useDocumentTitle()
  useMarkReadOnVisible()

  useEffect(() => {
    if (tabLock.state === 'busy') useSessionStore.getState().setConnection('paused')
  }, [tabLock.state])

  const handleLogout = useCallback(() => {
    // Выход — это «забыть устройство»: убираем историю и учётные данные.
    useChatStore.getState().reset()
    clearChatData(credentials.idInstance)
    useSessionStore.getState().logout()
  }, [credentials.idInstance])

  return (
    <GreenApiProvider client={client}>
      <div className={styles.layout} data-chat-open={activeChatId ? 'true' : 'false'}>
        <Sidebar onLogout={handleLogout} />
        {activeChatId ? <ChatPanel chatId={activeChatId} /> : <EmptyPanel />}
      </div>
      {tabLock.state === 'busy' && <TabBusyOverlay onTakeOver={tabLock.takeOver} />}
    </GreenApiProvider>
  )
}
