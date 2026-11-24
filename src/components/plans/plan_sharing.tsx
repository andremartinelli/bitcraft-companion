'use client'

import { Box, Button, Field, HStack, Input, Stack, Tag, Text, Wrap } from '@chakra-ui/react'
import { useActionState, useTransition } from 'react'
import { createPlanShare, destroyPlanShare, type ShareFormState } from '@/app/(app)/plans/actions'

interface Member {
  userId: number
  name: string
}

const INITIAL: ShareFormState = { error: null, notice: null, email: '' }

/** One account the plan is shared with, and "Remover" */
function MemberTag({ planId, member }: { planId: number; member: Member }) {
  const [pending, startTransition] = useTransition()
  return (
    <Tag.Root size="lg">
      <Tag.Label>{member.name}</Tag.Label>
      <Tag.EndElement>
        <Tag.CloseTrigger
          aria-label={`Parar de compartilhar com ${member.name}`}
          disabled={pending}
          onClick={() => startTransition(() => destroyPlanShare(planId, member.userId))}
        />
      </Tag.EndElement>
    </Tag.Root>
  )
}

/**
 * The owner shares the plan with other accounts, by e-mail: they see and
 * change it, and only the owner deletes it.
 */
export function PlanSharing({ planId, members }: { planId: number; members: Member[] }) {
  const [state, action, pending] = useActionState(createPlanShare.bind(null, planId), INITIAL)
  return (
    <Box mb="4" p="3" borderWidth="1px" rounded="l2" bg="bg">
      <Stack gap="2">
        <form action={action}>
          <Field.Root invalid={state.error !== null}>
            <Field.Label>Compartilhar com</Field.Label>
            <HStack gap="2" width="full" maxW="lg">
              <Input
                name="email"
                type="email"
                size="sm"
                required
                autoComplete="off"
                placeholder="E-mail da conta"
                defaultValue={state.email}
              />
              <Button type="submit" size="sm" variant="outline" loading={pending}>
                Compartilhar
              </Button>
            </HStack>
            {state.error && <Field.ErrorText>{state.error}</Field.ErrorText>}
          </Field.Root>
        </form>
        {state.notice && (
          <Text textStyle="sm" color="fg.success" role="status">
            {state.notice}
          </Text>
        )}
        {members.length > 0 ? (
          <Wrap gap="2" align="center">
            <Text textStyle="sm" color="fg.muted">
              Quem também vê e edita:
            </Text>
            {members.map((member) => (
              <MemberTag key={member.userId} planId={planId} member={member} />
            ))}
          </Wrap>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            Só você vê este plano.
          </Text>
        )}
      </Stack>
    </Box>
  )
}

/** For an account the plan was shared with: whose it is, and "Sair do plano" */
export function SharedPlanNotice({
  planId,
  userId,
  ownerName,
}: {
  planId: number
  userId: number
  ownerName: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <HStack gap="3" mb="4" wrap="wrap">
      <Text textStyle="sm" color="fg.muted">
        Plano de {ownerName}, compartilhado com você: você vê e edita, e só {ownerName} apaga.
      </Text>
      <Button
        size="xs"
        variant="ghost"
        loading={pending}
        onClick={() => startTransition(() => destroyPlanShare(planId, userId))}
      >
        Sair do plano
      </Button>
    </HStack>
  )
}
