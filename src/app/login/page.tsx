import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/login_form'
import { getCurrentUser, localPath } from '@/lib/session'
import type { SearchParams } from '@/validators/search_params'

export const metadata: Metadata = { title: 'Entrar' }

/** GET /login. There is no sign-up: accounts come from `npm run users:create` */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (await getCurrentUser()) redirect('/plans')
  const { next } = await searchParams
  return <LoginForm next={localPath(Array.isArray(next) ? next[0] : next) ?? ''} />
}
