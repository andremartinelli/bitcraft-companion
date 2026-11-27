'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'
import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  deleteGroup,
  insertGroup,
  inviteToGroup,
  removeMember,
  setAutoShare,
} from '@/models/group'
import { saveOtherSteps, saveProfession } from '@/models/user_profession'
import { otherStepsSchema, professionChoiceSchema } from '@/validators/profession'
import { groupInviteSchema, groupNameSchema, idSchema, inviteTokenSchema } from '@/validators/group'

export interface GroupFormState {
  error: string | null
  notice?: string | null
  /** The token of the invite just made, for its link */
  token?: string | null
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
 * POST /groups/[id]/invites: the owner invites an e-mail and gets the link
 * to send. The app sends no e-mail.
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
    notice: `Convite criado. Mande este link para ${parsed.data.email}:`,
    token: result.token,
    value: '',
  }
}

/** POST /invites/[token]/accept: whoever has the link joins the group; then the Conta page */
export async function acceptGroupInvite(token: string) {
  const user = await requireUser()
  const parsed = inviteTokenSchema.safeParse(token)
  if (parsed.success) await acceptInvite(parsed.data, user.id)
  redirect('/account')
}

/** POST /invites/[token]/decline: whoever has the link declines it; then the Conta page */
export async function declineGroupInvite(token: string) {
  await requireUser()
  const parsed = inviteTokenSchema.safeParse(token)
  if (parsed.success) await declineInvite(parsed.data)
  redirect('/account')
}

/** DELETE /invites/[id]: the owner cancels an invite of its group */
export async function destroyGroupInvite(id: number) {
  const user = await requireUser()
  const inviteId = idSchema.safeParse(id)
  if (inviteId.success) await cancelInvite(inviteId.data, user.id)
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

/** PATCH /account/professions: marks or unmarks one of "Minhas profissões" */
export async function updateProfession(input: unknown) {
  const user = await requireUser()
  const choice = professionChoiceSchema.safeParse(input)
  if (choice.success) await saveProfession(user.id, choice.data.skillId, choice.data.on)
  refresh()
}

/** PATCH /account/other_steps: the account's default for the steps of other professions */
export async function updateOtherSteps(input: unknown) {
  const user = await requireUser()
  const mode = otherStepsSchema.safeParse(input)
  if (mode.success) await saveOtherSteps(user.id, mode.data)
  refresh()
}
