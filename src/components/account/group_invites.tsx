'use client'

import { Box, Button, Heading, HStack, Stack, Text } from '@chakra-ui/react'
import { useTransition, type ReactNode } from 'react'
import { acceptGroupInvite, declineGroupInvite } from '@/app/(app)/account/actions'

export interface InviteData {
  token: string
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
        onClick={() => startTransition(() => acceptGroupInvite(invite.token))}
      >
        Aceitar
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() => startTransition(() => declineGroupInvite(invite.token))}
      >
        Recusar
      </Button>
    </HStack>
  )
}

/**
 * Invites with "Aceitar" (joins the group) and "Recusar": on the Conta page,
 * and on the page of an invite's link
 */
export function GroupInvites({
  invites,
  title = 'Convites',
  children,
}: {
  invites: InviteData[]
  title?: string
  children?: ReactNode
}) {
  return (
    <Box mb="6" p="4" borderWidth="1px" rounded="l2" bg="bg" borderColor="border.info">
      <Heading as="h2" size="md" mb="3">
        {title}
      </Heading>
      <Stack gap="2">
        {invites.map((invite) => (
          <InviteRow key={invite.token} invite={invite} />
        ))}
        {children}
      </Stack>
    </Box>
  )
}
