import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth/auth-form'
import { auth } from '@/lib/auth'

export const metadata: Metadata = { title: 'Sign up — StratChart' }

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/charts')
  return <AuthForm mode="sign-up" />
}
