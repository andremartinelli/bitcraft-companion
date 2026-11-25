'use client'

import { Box, Button, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import { useTransition } from 'react'
import { acceptGroupInvite, destroyGroupInvite } from '@/app/(app)/account/actions'

export interface InviteData {
  id: number
  groupName: string
  ownerName: string
}

function InviteRow({ invite }: { invite: InviteData }) {
  const [pending, startTransition] = useTransition()
  return (
    <HStack gap="3" wrap="wrap">
      <Text flex="1" minW="60">
        {invite.ownerName} convidou você para o grupo <strong>{invite.groupName}</strong>.
      </Text>
      <Button
        size="xs"
        loading={pending}
        onClick={() => startTransition(() => acceptGroupInvite(invite.id))}
      >
        Aceitar
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() => startTransition(() => destroyGroupInvite(invite.id))}
      >
        Recusar
      </Button>
    </HStack>
  )
}

/** The invites waiting for the account: accept joins the group, decline drops it */
export function GroupInvites({ invites }: { invites: InviteData[] }) {
  return (
    <Box mb="6" p="4" borderWidth="1px" rounded="l2" bg="bg" borderColor="border.info">
      <Heading as="h2" size="md" mb="3">
        Convites
      </Heading>
      <Stack gap="2">
        {invites.map((invite) => (
          <InviteRow key={invite.id} invite={invite} />
        ))}
      </Stack>
    </Box>
  )
}
