'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export function AccountButton() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const [signingOut, setSigningOut] = useState(false)

  if (isPending) return <span className="h-7 w-16" aria-hidden />

  if (!session?.user) {
    return (
      <Link
        href="/sign-in"
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        Log in
      </Link>
    )
  }

  async function handleSignOut() {
    setSigningOut(true)
    await authClient.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:block" title={session.user.email}>
        {session.user.email}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border disabled:opacity-60"
      >
        {signingOut ? 'Signing out…' : 'Log out'}
      </button>
    </div>
  )
}
