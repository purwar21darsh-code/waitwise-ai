import type { FinancialProfile } from './finance'

export type AppProfile = Required<FinancialProfile>
export type SavingsGoal = {
  id: string
  name: string
  target: number
  current: number
  monthlyContribution: number
  targetDate: string
  createdAt: string
}
export type PriceObservation = { id: string; product: string; price: number; observedAt: string; source: string; productUrl?: string }

export const SAMPLE_PROFILE: AppProfile = {
  liquidSavings: 42_000,
  incomeMonthly: 42_000,
  essentialExpensesMonthly: 20_000,
  debtMonthly: 1_500,
  upcomingExpenses: 4_000,
  reserveTarget: 25_000,
  monthlySavingsTarget: 5_000,
  nextIncomeInDays: 12,
}

export function getGoalProjection(goal: SavingsGoal, now = new Date()) {
  const remaining = Math.max(0, goal.target - goal.current)
  const months = goal.monthlyContribution > 0 ? Math.ceil(remaining / goal.monthlyContribution) : null
  const estimatedDate = months === null ? null : new Date(now.getTime() + months * 30 * 86400000).toISOString().slice(0, 10)
  const targetIsImpossible = remaining > 0 && (estimatedDate === null || Boolean(goal.targetDate && estimatedDate > goal.targetDate))
  return {
    remaining,
    progress: goal.target > 0 ? Math.min(100, goal.current / goal.target * 100) : 0,
    estimatedDate,
    targetIsImpossible,
    isAchievable: remaining === 0 || (months !== null && !targetIsImpossible),
  }
}
