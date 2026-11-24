import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignupForm } from '@/components/auth/signup_form'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Criar conta' }

/** GET /signup: open to anyone; whoever is logged in goes to their plans */
export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/plans')
  return <SignupForm />
}
