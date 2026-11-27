import { Stack } from '@chakra-ui/react'
import type { Metadata } from 'next'
import { MyProfessions } from '@/components/account/my_professions'
import { CreateGroupForm } from '@/components/account/create_group_form'
import { GroupCard } from '@/components/account/group_card'
import { GroupInvites } from '@/components/account/group_invites'
import { PageHeader } from '@/components/layout/page_header'
import { requireUser } from '@/lib/session'
import { listGroups, listInvites, MAX_GROUP_PEOPLE } from '@/models/group'
import { authorName } from '@/models/plan'
import { professionChoices, professionIdsOf, stepsSettingOf } from '@/models/user_profession'

export const metadata: Metadata = { title: 'Conta' }

/**
 * GET /account: "Minhas profissões", the invites waiting for the account,
 * its groups and "Criar grupo"
 */
export default async function AccountPage() {
  const user = await requireUser()
  const [groups, invites, professions, mine, stepsSetting] = await Promise.all([
    listGroups(user.id),
    listInvites(user.id),
    professionChoices(),
    professionIdsOf(user.id),
    stepsSettingOf(user.id),
  ])

  return (
    <>
      <PageHeader
        title="Conta"
        description={`Suas profissões e seus grupos. Num plano seu, "Compartilhar com o grupo" mostra as pessoas de cada grupo em que você está.`}
      />
      <MyProfessions
        professions={professions.map((p) => ({ ...p, mine: mine.includes(p.id) }))}
        otherSteps={stepsSetting.otherSteps}
      />
      {invites.length > 0 && (
        <GroupInvites
          invites={invites.map((invite) => ({
            token: invite.token,
            groupName: invite.group.name,
            ownerName: authorName(invite.group.owner)!,
          }))}
        />
      )}
      <Stack gap="4">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={{
              id: group.id,
              name: group.name,
              owned: group.ownerId === user.id,
              ownerName: authorName(group.owner)!,
              autoSharePlans: group.members.some((m) => m.userId === user.id && m.autoSharePlans),
              members: group.members.map((member) => ({
                userId: member.userId,
                name: authorName(member.user)!,
                you: member.userId === user.id,
                owner: member.userId === group.ownerId,
              })),
              invites: group.invites,
              maxPeople: MAX_GROUP_PEOPLE,
            }}
          />
        ))}
        <CreateGroupForm />
      </Stack>
    </>
  )
}
