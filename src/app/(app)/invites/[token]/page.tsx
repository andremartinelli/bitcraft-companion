import { Link, Text } from '@chakra-ui/react'
import type { Metadata } from 'next'
import NextLink from 'next/link'
import { GroupInvites } from '@/components/account/group_invites'
import { EmptyNotice } from '@/components/layout/empty_notice'
import { PageHeader } from '@/components/layout/page_header'
import { requireUser } from '@/lib/session'
import { findInvite } from '@/models/group'
import { authorName } from '@/models/plan'
import { inviteTokenSchema } from '@/validators/group'

export const metadata: Metadata = { title: 'Convite' }

const toAccount = (
  <Link asChild textDecoration="underline">
    <NextLink href="/account">Conta</NextLink>
  </Link>
)

/**
 * GET /invites/[token]: the link an owner sent. Whoever opens it (logged in;
 * the login and the sign-up come back here) accepts or declines.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser()
  const token = inviteTokenSchema.safeParse((await params).token)
  const invite = token.success ? await findInvite(token.data, user.id) : null

  return (
    <>
      <PageHeader title="Convite para um grupo" />
      {!invite ? (
        <EmptyNotice>
          Este convite não existe mais: já foi aceito, recusado ou cancelado. Peça um novo link a
          quem convidou.
        </EmptyNotice>
      ) : invite.group.members.length > 0 ? (
        <EmptyNotice>
          Você já está no grupo {invite.group.name}. Veja os seus grupos em {toAccount}.
        </EmptyNotice>
      ) : (
        <GroupInvites
          title={invite.group.name}
          invites={[
            {
              token: invite.token,
              groupName: invite.group.name,
              ownerName: authorName(invite.group.owner)!,
            },
          ]}
        >
          <Text textStyle="sm" color="fg.muted">
            No grupo, vocês compartilham planos: quem está nele vê e edita os planos que o dono
            compartilhar com o grupo.
          </Text>
        </GroupInvites>
      )}
    </>
  )
}
