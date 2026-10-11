import { createContext, useContext, type ReactNode } from 'react'
import type { GreenApiClient } from './greenApi'

const GreenApiContext = createContext<GreenApiClient | null>(null)

export function GreenApiProvider({
  client,
  children,
}: {
  client: GreenApiClient
  children: ReactNode
}) {
  return <GreenApiContext value={client}>{children}</GreenApiContext>
}

/** Клиент GREEN-API текущей сессии (доступен внутри чата после входа). */
// eslint-disable-next-line react-refresh/only-export-components
export function useGreenApi(): GreenApiClient {
  const client = useContext(GreenApiContext)
  if (!client) throw new Error('useGreenApi вызван вне GreenApiProvider')
  return client
}
