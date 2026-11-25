'use client'

import {
  Badge,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Code,
  Dialog,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  Portal,
  Stack,
  Tag,
  Text,
  Wrap,
} from '@chakra-ui/react'
import { useActionState, useOptimistic, useState, useTransition } from 'react'
import {
  createGroupInvite,
  destroyGroup,
  destroyGroupInvite,
  destroyGroupMember,
  updateGroupMember,
  type GroupFormState,
} from '@/app/(app)/account/actions'
import { CopyInviteLink, inviteUrl } from '@/components/account/copy_invite_link'

export interface GroupCardData {
  id: number
  name: string
  /** The account viewing it created it */
  owned: boolean
  ownerName: string
  autoSharePlans: boolean
  members: { userId: number; name: string; you: boolean; owner: boolean }[]
  /** Only for the owner */
  invites: { id: number; email: string; token: string }[]
  maxPeople: number
}

/** What the confirmation dialog asks, and what "confirm" does */
interface Confirmation {
  title: string
  body: string
  label: string
  run: () => Promise<void>
}

const INITIAL: GroupFormState = { error: null, notice: null, token: null, value: '' }

/** The owner invites an e-mail */
function InviteForm({ groupId, usage }: { groupId: number; usage: string }) {
  const [state, action, pending] = useActionState(createGroupInvite.bind(null, groupId), INITIAL)
  return (
    <form action={action}>
      <Field.Root invalid={state.error !== null}>
        <Field.Label>Convidar</Field.Label>
        <HStack gap="2" width="full" maxW="lg">
          <Input
            name="email"
            type="email"
            size="sm"
            required
            autoComplete="off"
            placeholder="E-mail da pessoa"
            defaultValue={state.value}
          />
          <Button type="submit" size="sm" variant="outline" loading={pending}>
            Convidar
          </Button>
        </HStack>
        {state.error ? (
          <Field.ErrorText>{state.error}</Field.ErrorText>
        ) : (
          <Field.HelperText>{usage}</Field.HelperText>
        )}
      </Field.Root>
      {state.notice && state.token && (
        <Stack gap="1" mt="2" role="status">
          <Text textStyle="sm" color="fg.success">
            {state.notice}
          </Text>
          <HStack gap="2" wrap="wrap">
            <Code wordBreak="break-all">{inviteUrl(state.token)}</Code>
            <CopyInviteLink token={state.token} variant="outline" />
          </HStack>
          <Text textStyle="xs" color="fg.muted">
            Quem abrir o link entra no grupo, então mande só para essa pessoa. Se ela já tiver conta
            com esse e-mail, o convite também aparece na página Conta dela.
          </Text>
        </Stack>
      )}
    </form>
  )
}

/**
 * One group on the Conta page: its people and pending invites, "Compartilhar
 * com o grupo automaticamente" and, for the owner, inviting, removing and
 * deleting; for the others, leaving.
 */
export function GroupCard({ group }: { group: GroupCardData }) {
  const [pending, startTransition] = useTransition()
  const [autoShare, setAutoShare] = useOptimistic(group.autoSharePlans)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const people = group.members.length + group.invites.length

  const confirm = () =>
    startTransition(async () => {
      await confirmation?.run()
      setConfirmation(null)
    })

  return (
    <Box p="4" borderWidth="1px" rounded="l2" bg="bg">
      <Stack gap="3">
        <Flex gap="3" align="center" wrap="wrap">
          <Heading as="h2" size="md">
            {group.name}
          </Heading>
          <Text textStyle="sm" color="fg.muted" flex="1">
            {group.owned ? 'você criou' : `de ${group.ownerName}`}
          </Text>
          {group.owned ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                setConfirmation({
                  title: 'Apagar o grupo?',
                  body: `Apagar o grupo "${group.name}"? Os planos compartilhados por ele deixam de ser. Isso não pode ser desfeito.`,
                  label: 'Apagar grupo',
                  run: () => destroyGroup(group.id),
                })
              }
            >
              Apagar grupo
            </Button>
          ) : (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                setConfirmation({
                  title: 'Sair do grupo?',
                  body: `Sair do grupo "${group.name}"? Você deixa de ver os planos do grupo, e o grupo deixa de ver os seus. Para voltar, ${group.ownerName} precisa convidar você de novo.`,
                  label: 'Sair do grupo',
                  run: () => destroyGroupMember(group.id, group.members.find((m) => m.you)!.userId),
                })
              }
            >
              Sair do grupo
            </Button>
          )}
        </Flex>

        <Checkbox.Root
          size="sm"
          checked={autoShare}
          onCheckedChange={({ checked }) =>
            startTransition(async () => {
              setAutoShare(checked === true)
              await updateGroupMember(group.id, checked === true)
            })
          }
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>Compartilhar com o grupo automaticamente</Checkbox.Label>
        </Checkbox.Root>
        <Text textStyle="xs" color="fg.muted" mt="-2">
          Cada plano novo seu já nasce com &quot;Todos do grupo&quot; marcado.
        </Text>

        <Wrap gap="2" align="center">
          <Text textStyle="sm" color="fg.muted">
            Pessoas:
          </Text>
          {group.members.map((member) => (
            <Tag.Root key={member.userId} size="lg">
              <Tag.Label>
                {member.name}
                {member.you && ' (você)'}
              </Tag.Label>
              {member.owner && (
                <Badge size="xs" ml="1">
                  dono
                </Badge>
              )}
              {group.owned && !member.you && (
                <Tag.EndElement>
                  <Tag.CloseTrigger
                    aria-label={`Remover ${member.name} do grupo`}
                    onClick={() =>
                      setConfirmation({
                        title: 'Remover do grupo?',
                        body: `Remover ${member.name} do grupo "${group.name}"? A pessoa deixa de ver os planos do grupo, e o grupo deixa de ver os dela.`,
                        label: 'Remover',
                        run: () => destroyGroupMember(group.id, member.userId),
                      })
                    }
                  />
                </Tag.EndElement>
              )}
            </Tag.Root>
          ))}
        </Wrap>

        {group.invites.length > 0 && (
          <Wrap gap="2" align="center">
            <Text textStyle="sm" color="fg.muted">
              Convites esperando resposta:
            </Text>
            {group.invites.map((invite) => (
              <Tag.Root key={invite.id} size="lg" variant="outline">
                <Tag.Label>{invite.email}</Tag.Label>
                <CopyInviteLink token={invite.token} size="2xs" ml="1" />
                <Tag.EndElement>
                  <Tag.CloseTrigger
                    aria-label={`Cancelar o convite de ${invite.email}`}
                    disabled={pending}
                    onClick={() => startTransition(() => destroyGroupInvite(invite.id))}
                  />
                </Tag.EndElement>
              </Tag.Root>
            ))}
          </Wrap>
        )}

        {group.owned &&
          (people < group.maxPeople ? (
            <InviteForm
              groupId={group.id}
              usage={`${people} de ${group.maxPeople} lugares usados, contando os convites.`}
            />
          ) : (
            <Text textStyle="sm" color="fg.muted">
              O grupo chegou ao limite de {group.maxPeople} pessoas, contando os convites.
            </Text>
          ))}
      </Stack>

      <Dialog.Root
        role="alertdialog"
        size="sm"
        open={confirmation !== null}
        onOpenChange={({ open }) => !open && setConfirmation(null)}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>{confirmation?.title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Text>{confirmation?.body}</Text>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button variant="outline" size="sm">
                    Cancelar
                  </Button>
                </Dialog.ActionTrigger>
                <Button colorPalette="red" size="sm" loading={pending} onClick={confirm}>
                  {confirmation?.label}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  )
}
