'use server'

import { refresh } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  acceptInvite,
  deleteGroup,
  insertGroup,
  inviteToGroup,
  removeInvite,
  removeMember,
  setAutoShare,
} from '@/models/group'
import { groupInviteSchema, groupNameSchema, idSchema } from '@/validators/group'

export interface GroupFormState {
  error: string | null
  notice?: string | null
  /** Typed back into the field after an error */
  value: string
}

/** POST /groups: a new group, with the account in it as the owner */
export async function createGroup(
  _previous: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  const user = await requireUser()
  const typed = String(formData.get('name') ?? '')
  const name = groupNameSchema.safeParse(typed)
  if (!name.success) return { error: name.error.issues[0].message, value: typed }
  const { error } = await insertGroup(user.id, name.data)
  if (error) return { error, value: typed }
  refresh()
  return { error: null, value: '' }
}

/** DELETE /groups/[id]: only the owner's */
export async function destroyGroup(id: number) {
  const user = await requireUser()
  const groupId = idSchema.safeParse(id)
  if (groupId.success) await deleteGroup(groupId.data, user.id)
  refresh()
}

/**
 * POST /groups/[id]/invites: the owner invites an e-mail. The app sends no
 * e-mail: the invite shows up on the person's Conta page.
 */
export async function createGroupInvite(
  id: number,
  _previous: GroupFormState,
  formData: FormData
): Promise<GroupFormState> {
  const user = await requireUser()
  const typed = String(formData.get('email') ?? '')
  const groupId = idSchema.safeParse(id)
  const parsed = groupInviteSchema.safeParse({ email: typed })
  if (!groupId.success) return { error: 'Esse grupo não existe.', value: typed }
  if (!parsed.success) return { error: parsed.error.issues[0].message, value: typed }

  const result = await inviteToGroup(groupId.data, user.id, parsed.data.email)
  if (!result.ok) return { error: result.error, value: typed }
  refresh()
  return {
    error: null,
    notice: `Convite feito para ${parsed.data.email}. Avise a pessoa: ela aceita na página Conta.`,
    value: '',
  }
}

/** POST /invites/[id]/accept: the account joins the group */
export async function acceptGroupInvite(id: number) {
  const user = await requireUser()
  const inviteId = idSchema.safeParse(id)
  if (inviteId.success) await acceptInvite(inviteId.data, user)
  refresh()
}

/** DELETE /invites/[id]: the account declines it, or the owner cancels it */
export async function destroyGroupInvite(id: number) {
  const user = await requireUser()
  const inviteId = idSchema.safeParse(id)
  if (inviteId.success) await removeInvite(inviteId.data, user)
  refresh()
}

/** PATCH /groups/[id]/membership: "Compartilhar com o grupo automaticamente" */
export async function updateGroupMember(id: number, autoSharePlans: boolean) {
  const user = await requireUser()
  const groupId = idSchema.safeParse(id)
  if (groupId.success) await setAutoShare(groupId.data, user.id, autoSharePlans === true)
  refresh()
}

/**
 * DELETE /groups/[id]/members/[userId]: the owner removes someone, or the
 * account leaves the group
 */
export async function destroyGroupMember(id: number, userId: number) {
  const user = await requireUser()
  const groupId = idSchema.safeParse(id)
  const memberId = idSchema.safeParse(userId)
  if (groupId.success && memberId.success) {
    await removeMember(groupId.data, user.id, memberId.data)
  }
  refresh()
}
