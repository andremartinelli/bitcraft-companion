'use client'

import { Alert, Box, Flex, Stack, Text } from '@chakra-ui/react'
import { SyncControls } from '@/components/inventory/sync_controls'

interface InventoryStatusProps {
  /** "há 5 minutos: concluída"; null before the first sync */
  latest: { ago: string; status: string } | null
  /** When the latest run did not write everything: when the data below is from */
  lastGoodAgo: string | null
  /** The latest run's notes: who could not be read, unknown items */
  notices: string[]
  stale: boolean
  /** Without characters there is nothing to sync: no button */
  hasPlayers: boolean
}

/** How the last sync went, its notes and "Sincronizar agora" */
export function InventoryStatus({
  latest,
  lastGoodAgo,
  notices,
  stale,
  hasPlayers,
}: InventoryStatusProps) {
  return (
    <Stack gap="3" mb="5" aria-live="polite">
      <Flex gap="3" align="center" justify="space-between" wrap="wrap">
        <Box>
          {latest ? (
            <Text>
              Última sincronização {latest.ago}: <strong>{latest.status}</strong>{' '}
              <Text as="span" color="fg.muted">
                · fonte: BitJita
              </Text>
            </Text>
          ) : (
            <Text>Ainda não houve sincronização.</Text>
          )}
          {lastGoodAgo && (
            <Text textStyle="sm" color="fg.muted">
              Os dados abaixo são da última sincronização que funcionou, {lastGoodAgo}.
            </Text>
          )}
        </Box>
        {hasPlayers && <SyncControls stale={stale} />}
      </Flex>
      {notices.length > 0 && (
        <Alert.Root status="warning" size="sm">
          <Alert.Indicator />
          <Alert.Content>
            {notices.map((line) => (
              <Alert.Description key={line}>{line}</Alert.Description>
            ))}
          </Alert.Content>
        </Alert.Root>
      )}
    </Stack>
  )
}
