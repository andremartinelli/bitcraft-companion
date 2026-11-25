'use client'

import { Button, CloseButton, Dialog, Portal, Table, Text } from '@chakra-ui/react'
import { useState, useTransition } from 'react'
import { destroyGamePlayer } from '@/app/(app)/game_player/actions'

export interface GamePlayerRow {
  id: number
  username: string
  region: string
  claims: string
  /** "há 5 minutos", or "ainda não" */
  lastRead: string
  lastError: string | null
}

/** "Remover", after a confirmation: its items leave the app (nothing changes in the game) */
function RemoveButton({
  player,
  onRemoved,
}: {
  player: GamePlayerRow
  onRemoved: (notice: string) => void
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Dialog.Root role="alertdialog" size="sm">
      <Dialog.Trigger asChild>
        <Button size="xs" variant="ghost">
          Remover
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Remover {player.username}?</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>
                Os itens dele saem do seu inventário e dos planos compartilhados com você. Nada muda
                no jogo, nem para outra conta com o mesmo personagem.
              </Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.ActionTrigger asChild>
                <Button variant="outline" size="sm">
                  Cancelar
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="red"
                size="sm"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const { notice } = await destroyGamePlayer()
                    onRemoved(notice)
                  })
                }
              >
                Remover
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

/** The account's character, with "Remover" */
export function GamePlayerTable({ players }: { players: GamePlayerRow[] }) {
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <>
      {notice && (
        <Text textStyle="sm" color="fg.success" mb="3" role="status">
          {notice}
        </Text>
      )}
      <Table.ScrollArea borderWidth="1px" rounded="l2" bg="bg">
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row bg="bg.muted">
              <Table.ColumnHeader>Personagem</Table.ColumnHeader>
              <Table.ColumnHeader>Região</Table.ColumnHeader>
              <Table.ColumnHeader>Claim</Table.ColumnHeader>
              <Table.ColumnHeader>Última leitura</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {players.map((player) => (
              <Table.Row key={player.id}>
                <Table.Cell fontWeight="medium">{player.username}</Table.Cell>
                <Table.Cell>{player.region}</Table.Cell>
                <Table.Cell>{player.claims}</Table.Cell>
                <Table.Cell color="fg.muted">
                  {player.lastRead}
                  {player.lastError && (
                    <Text textStyle="xs" color="fg.error">
                      Falhou na última vez: {player.lastError}
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <RemoveButton player={player} onRemoved={setNotice} />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </>
  )
}
