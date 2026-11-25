import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignupForm } from '@/components/auth/signup_form'
import { getCurrentUser, localPath } from '@/lib/session'
import type { SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Criar conta' }

/**
 * GET /signup: open to anyone; whoever is logged in goes to their plans.
 * `next`: the page to go to afterwards (an invite's link), as in /login
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  if (await getCurrentUser()) redirect('/plans')
  const { next } = await searchParams
  return <SignupForm next={localPath(Array.isArray(next) ? next[0] : next) ?? ''} />
}
