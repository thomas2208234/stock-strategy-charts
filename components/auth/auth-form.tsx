'use client'

import { CandlestickChart } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

type Mode = 'sign-in' | 'sign-up'

const inputClass =
  'h-11 rounded-md border border-border bg-panel px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none'

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const isSignUp = mode === 'sign-up'
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? '').trim()

    setError(null)
    setLoading(true)
    const { error } = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password })
    setLoading(false)

    if (error) {
      setError(
        isSignUp
          ? 'Could not create your account. Check your details and try again.'
          : 'Incorrect email or password.',
      )
      return
    }

    router.push('/charts')
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-splash px-6 py-16 text-foreground">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <CandlestickChart className="size-8 text-primary" aria-hidden="true" />
        <span className="text-4xl font-semibold tracking-tight md:text-5xl">StratChart</span>
      </Link>

      <div className="flex w-full max-w-xs flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-balance">{isSignUp ? 'Create your account' : 'Log in'}</h1>
          <p className="text-sm text-muted-foreground">
            {isSignUp ? 'Save your setup across devices.' : 'Welcome back. Pick up where you left off.'}
          </p>
        </div>

        <form method="post" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input id="name" name="name" required autoComplete="name" className={inputClass} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              aria-describedby={isSignUp ? 'password-hint' : undefined}
              className={inputClass}
            />
            {isSignUp && (
              <p id="password-hint" className="text-xs text-muted-foreground">
                At least 8 characters.
              </p>
            )}
          </div>

          <p role="alert" aria-live="polite" className="min-h-5 text-sm text-down">
            {error}
          </p>

          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignUp ? 'Already have an account? ' : 'New to StratChart? '}
          <Link
            href={isSignUp ? '/sign-in' : '/sign-up'}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {isSignUp ? 'Log in' : 'Sign up'}
          </Link>
        </p>
      </div>
    </main>
  )
}
