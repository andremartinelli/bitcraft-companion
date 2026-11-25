'use client'

import {
  Box,
  Button,
  HStack,
  Link,
  Menu,
  Portal,
  Spinner,
  Stack,
  Tag,
  Text,
  Wrap,
} from '@chakra-ui/react'
import NextLink from 'next/link'
import { Fragment, useOptimistic, useTransition } from 'react'
import { LuChevronDown, LuUsers } from 'react-icons/lu'
import {
  createPlanGroupShare,
  createPlanShare,
  destroyPlanGroupShare,
  destroyPlanShare,
} from '@/app/(app)/plans/actions'

interface Person {
  userId: number
  name: string
}

export interface ShareGroup {
  id: number
  name: string
  /** "Todos do grupo" is on */
  shared: boolean
  /** Everyone in the group but the owner */
  members: Person[]
}

interface Shared {
  groups: Set<number>
  users: Set<number>
}

type Change = { kind: 'groups' | 'users'; id: number; on: boolean }

function applyChange(shared: Shared, { kind, id, on }: Change): Shared {
  const next = new Set(shared[kind])
  if (on) next.add(id)
  else next.delete(id)
  return { ...shared, [kind]: next }
}

/** Someone shared with by e-mail, before groups, who is in none of the owner's groups */
function OutsideTag({ planId, person }: { planId: number; person: Person }) {
  const [pending, startTransition] = useTransition()
  return (
    <Tag.Root size="lg" variant="outline">
      <Tag.Label>{person.name}</Tag.Label>
      <Tag.EndElement>
        <Tag.CloseTrigger
          aria-label={`Parar de compartilhar com ${person.name}`}
          disabled={pending}
          onClick={() => startTransition(() => destroyPlanShare(planId, person.userId))}
        />
      </Tag.EndElement>
    </Tag.Root>
  )
}

/**
 * "Compartilhar com o grupo", for the owner: per group, "Todos do grupo"
 * (also whoever joins later) or one person at a time. Each click saves.
 * Who sees it sees and changes it; only the owner deletes it.
 */
export function PlanSharing({
  planId,
  groups,
  sharedWith,
  outside,
}: {
  planId: number
  groups: ShareGroup[]
  /** Accounts the plan is shared with one by one */
  sharedWith: number[]
  outside: Person[]
}) {
  const [pending, startTransition] = useTransition()
  const [shared, change] = useOptimistic<Shared, Change>(
    {
      groups: new Set(groups.filter((group) => group.shared).map((group) => group.id)),
      users: new Set(sharedWith),
    },
    applyChange
  )

  const toggle = (kind: Change['kind'], id: number, on: boolean) =>
    startTransition(async () => {
      change({ kind, id, on })
      if (kind === 'groups') {
        await (on ? createPlanGroupShare : destroyPlanGroupShare)(planId, id)
      } else {
        await (on ? createPlanShare : destroyPlanShare)(planId, id)
      }
    })

  // People who already see it through a whole group: checked and locked everywhere
  const viaGroup = new Set(
    groups
      .filter((group) => shared.groups.has(group.id))
      .flatMap((group) => group.members.map((member) => member.userId))
  )
  const people = new Map(groups.flatMap((group) => group.members.map((m) => [m.userId, m.name])))
  const summary = [
    ...groups
      .filter((group) => shared.groups.has(group.id))
      .map((group) => `todos do ${group.name}`),
    ...[...shared.users]
      .filter((userId) => people.has(userId) && !viaGroup.has(userId))
      .map((userId) => people.get(userId)!),
  ]

  return (
    <Box mb="4" p="3" borderWidth="1px" rounded="l2" bg="bg">
      <Stack gap="2">
        {groups.length > 0 ? (
          <HStack gap="3" wrap="wrap">
            <Menu.Root closeOnSelect={false} positioning={{ placement: 'bottom-start' }}>
              <Menu.Trigger asChild>
                <Button size="sm" variant="outline">
                  <LuUsers aria-hidden />
                  Compartilhar com o grupo
                  <LuChevronDown aria-hidden />
                </Button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content minW="64" maxH="96" overflowY="auto">
                    {groups.map((group, index) => {
                      const all = shared.groups.has(group.id)
                      return (
                        <Fragment key={group.id}>
                          {index > 0 && <Menu.Separator />}
                          <Menu.ItemGroup>
                            <Menu.ItemGroupLabel>{group.name}</Menu.ItemGroupLabel>
                            <Menu.CheckboxItem
                              value={`g${group.id}`}
                              checked={all}
                              onCheckedChange={(on) => toggle('groups', group.id, on)}
                            >
                              <Text flex="1" fontWeight="medium">
                                Todos do grupo
                              </Text>
                              <Menu.ItemIndicator />
                            </Menu.CheckboxItem>
                            {group.members.map((member) => (
                              <Menu.CheckboxItem
                                key={member.userId}
                                value={`u${group.id}:${member.userId}`}
                                checked={
                                  viaGroup.has(member.userId) || shared.users.has(member.userId)
                                }
                                disabled={viaGroup.has(member.userId)}
                                onCheckedChange={(on) => toggle('users', member.userId, on)}
                              >
                                <Text flex="1">{member.name}</Text>
                                <Menu.ItemIndicator />
                              </Menu.CheckboxItem>
                            ))}
                            {group.members.length === 0 && (
                              <Text px="2" py="1.5" textStyle="xs" color="fg.muted">
                                Ninguém mais no grupo ainda.
                              </Text>
                            )}
                          </Menu.ItemGroup>
                        </Fragment>
                      )
                    })}
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
            <Text textStyle="sm" color="fg.muted">
              {summary.length
                ? `Também veem e editam: ${summary.join(', ')}.`
                : 'Só você vê este plano.'}
            </Text>
            {pending && <Spinner size="xs" color="fg.muted" />}
          </HStack>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            Só você vê este plano. Para compartilhar, crie um grupo ou aceite um convite em{' '}
            <Link asChild color="fg" textDecoration="underline">
              <NextLink href="/account">Conta</NextLink>
            </Link>
            .
          </Text>
        )}
        {outside.length > 0 && (
          <Wrap gap="2" align="center">
            <Text textStyle="sm" color="fg.muted">
              Fora dos seus grupos:
            </Text>
            {outside.map((person) => (
              <OutsideTag key={person.userId} planId={planId} person={person} />
            ))}
          </Wrap>
        )}
      </Stack>
    </Box>
  )
}

/**
 * For an account the plan was shared with: whose it is and, when it came one
 * by one, "Sair do plano". Through a group, leaving the group is the way out.
 */
export function SharedPlanNotice({
  planId,
  userId,
  ownerName,
  groupNames,
}: {
  planId: number
  userId: number
  ownerName: string
  /** The account's groups the plan is shared with as a whole */
  groupNames: string[]
}) {
  const [pending, startTransition] = useTransition()
  return (
    <HStack gap="3" mb="4" wrap="wrap">
      <Text textStyle="sm" color="fg.muted">
        Plano de {ownerName}, compartilhado com{' '}
        {groupNames.length ? `o grupo ${groupNames.join(', ')}` : 'você'}: você vê e edita, e só{' '}
        {ownerName} apaga.
      </Text>
      {groupNames.length === 0 && (
        <Button
          size="xs"
          variant="ghost"
          loading={pending}
          onClick={() => startTransition(() => destroyPlanShare(planId, userId))}
        >
          Sair do plano
        </Button>
      )}
    </HStack>
  )
}
