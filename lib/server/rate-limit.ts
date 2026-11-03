import 'server-only'

interface BudgetState {
  minute: number[]
  dayKey: string
  dayCount: number
}

const globalStore = globalThis as unknown as { __tdBudget?: BudgetState }

function state(): BudgetState {
  if (!globalStore.__tdBudget) {
    globalStore.__tdBudget = { minute: [], dayKey: '', dayCount: 0 }
  }
  return globalStore.__tdBudget
}

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function budgetLimits() {
  return {
    perMinute: positiveInt(process.env.TWELVE_DATA_CREDITS_PER_MINUTE, 8),
    perDay: positiveInt(process.env.TWELVE_DATA_CREDITS_PER_DAY, 800),
  }
}

function prune(s: BudgetState, now: number) {
  s.minute = s.minute.filter((t) => now - t < 60_000)
  const dayKey = new Date(now).toISOString().slice(0, 10)
  if (s.dayKey !== dayKey) {
    s.dayKey = dayKey
    s.dayCount = 0
  }
}

export function budgetSnapshot() {
  const s = state()
  prune(s, Date.now())
  const limits = budgetLimits()
  return { ...limits, usedThisMinute: s.minute.length, usedToday: s.dayCount }
}

export function hasBudget(cost: number) {
  const snap = budgetSnapshot()
  return snap.usedThisMinute + cost <= snap.perMinute && snap.usedToday + cost <= snap.perDay
}

export type ConsumeResult = { ok: true } | { ok: false; message: string; retryAfterSeconds: number }

export function consumeCredits(cost: number): ConsumeResult {
  if (cost <= 0) return { ok: true }
  const s = state()
  const now = Date.now()
  prune(s, now)
  const { perMinute, perDay } = budgetLimits()

  if (s.dayCount + cost > perDay) {
    return {
      ok: false,
      message: `Daily safeguard reached (${perDay} credits). Requests resume at 00:00 UTC.`,
      retryAfterSeconds: 3600,
    }
  }
  if (s.minute.length + cost > perMinute) {
    const oldest = s.minute[0] ?? now
    const retryAfterSeconds = Math.max(1, Math.ceil((60_000 - (now - oldest)) / 1000))
    return {
      ok: false,
      message: `Per-minute safeguard reached (${perMinute} credits/min). Retrying in about ${retryAfterSeconds}s.`,
      retryAfterSeconds,
    }
  }
  for (let i = 0; i < cost; i++) s.minute.push(now)
  s.dayCount += cost
  return { ok: true }
}
