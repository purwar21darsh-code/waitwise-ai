export type FinancialProfile = {
  liquidSavings?: number
  incomeMonthly?: number
  essentialExpensesMonthly?: number
  debtMonthly?: number
  upcomingExpenses?: number
  reserveTarget?: number
  monthlySavingsTarget?: number
  nextIncomeInDays?: number
}

export type Purchase = {
  name: string
  category: string
  price: number
  urgency: 'low' | 'normal' | 'high'
  plannedDate?: string
}

export type SavingsGoalSummary = { target: number; current: number }

export type DecisionResult = {
  recommendation: 'BUY NOW' | 'WAIT' | "DON'T BUY YET"
  reason: string
  availableSavings: number
  purchaseCost: number
  cashAfterPurchaseAndObligations: number
  obligationsBeforeNextIncome: number
  reserveAfterUpcomingExpenses: number
  reserveTarget: number
  monthlySurplus: number
  projectedMonthlyDeficit: number
  savingsTargetDate: string | null
  projectedShortfall: boolean
  assumptions: string[]
  risks: string[]
  missing: string[]
  alternatives: string[]
}

export type ScoreComponent = { key: string; label: string; score: number; max: number; explanation: string }
export type SafetyScore = { total: number; components: ScoreComponent[]; suggestions: string[]; missing: string[] }

const safeNumber = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value as number) : 0
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatDate = (date: Date) => date.toISOString().slice(0, 10)

export function calculateDecision(profile: FinancialProfile, purchase: Purchase, now = new Date()): DecisionResult {
  const savings = safeNumber(profile.liquidSavings)
  const income = safeNumber(profile.incomeMonthly)
  const essentials = safeNumber(profile.essentialExpensesMonthly)
  const debt = safeNumber(profile.debtMonthly)
  const upcoming = safeNumber(profile.upcomingExpenses)
  const reserve = safeNumber(profile.reserveTarget)
  const monthlySavings = safeNumber(profile.monthlySavingsTarget)
  const nextIncomeDays = clamp(profile.nextIncomeInDays ?? 30, 0, 30)
  const dailyEssentials = essentials / 30
  const dailyDebt = debt / 30
  const obligationsBeforeNextIncome = upcoming + (dailyEssentials + dailyDebt) * nextIncomeDays
  const cashAfter = savings - safeNumber(purchase.price) - obligationsBeforeNextIncome
  const reserveAfterUpcoming = savings - safeNumber(purchase.price) - upcoming
  const monthlySurplus = income - essentials - debt - monthlySavings
  const projectedMonthlyDeficit = Math.max(0, -monthlySurplus)
  const missing: string[] = []
  if (profile.liquidSavings === undefined) missing.push('Current liquid savings')
  if (profile.incomeMonthly === undefined) missing.push('Monthly income')
  if (profile.essentialExpensesMonthly === undefined) missing.push('Essential monthly expenses')
  if (profile.upcomingExpenses === undefined) missing.push('Upcoming expenses')
  if (profile.reserveTarget === undefined || safeNumber(profile.reserveTarget) === 0) missing.push('Emergency reserve target')
  if (safeNumber(purchase.price) <= 0) missing.push('A valid purchase price')

  let recommendation: DecisionResult['recommendation']
  let reason: string
  const safeInputsPresent = missing.length === 0
  if (cashAfter < 0) {
    recommendation = "DON'T BUY YET"
    reason = `This purchase would leave about ${formatINR(Math.abs(cashAfter))} uncovered before your next expected income, after the expenses you listed.`
  } else if (monthlySurplus < 0) {
    recommendation = "DON'T BUY YET"
    reason = `Your listed monthly commitments exceed income by about ${formatINR(Math.abs(monthlySurplus))}. Buying now could make that monthly gap harder to manage.`
  } else if (!safeInputsPresent) {
    recommendation = 'WAIT'
    reason = 'Some key numbers are missing, so there is not enough information to recommend buying now safely.'
  } else if (cashAfter < reserve) {
    if (monthlySurplus <= 0) {
      recommendation = "DON'T BUY YET"
      reason = `After the purchase and near-term obligations, your remaining cash would be below the reserve target, with no monthly surplus to rebuild it.`
    } else {
      recommendation = 'WAIT'
      reason = `The purchase could take your post-obligation cash below your ${formatINR(reserve)} reserve target.`
    }
  } else {
    recommendation = 'BUY NOW'
    reason = `After the purchase and the obligations listed before your next income, about ${formatINR(cashAfter)} remains, above your reserve target.`
  }

  const savingsTargetDate = monthlySavings > 0 && monthlySurplus >= 0 && safeNumber(purchase.price) > 0
    ? formatDate(new Date(now.getTime() + Math.ceil(Math.max(0, safeNumber(purchase.price) + reserve + upcoming - savings) / monthlySavings) * 30 * 86400000))
    : null
  const assumptions = [
    `No investment returns or future price changes are assumed.`,
    `Listed upcoming expenses and a prorated share of monthly essential costs and debt are treated as due before the next income, expected in ${nextIncomeDays} day${nextIncomeDays === 1 ? '' : 's'}.`,
    `Only the monthly savings amount you entered is used to estimate goal progress.`,
  ]
  if (purchase.plannedDate) assumptions.push(`The planned date (${purchase.plannedDate}) is treated as your intended purchase date, not a price forecast.`)
  if (missing.length) assumptions.push('The recommendation is conservative because required profile information is missing.')
  const risks = []
  if (cashAfter < reserve) risks.push('Cash after purchase and near-term obligations would fall below your reserve target.')
  if (projectedMonthlyDeficit > 0) risks.push('Your entered monthly budget has a deficit.')
  if (purchase.urgency === 'low' && recommendation !== 'BUY NOW') risks.push('You marked this purchase as low urgency, so waiting gives more time to build a buffer.')
  if (missing.length) risks.push(`Incomplete information: ${missing.join(', ')}.`)
  const alternatives = [
    'Compare a lower-priced model with the features you need.',
    'Set a monthly contribution and recalculate after your next income arrives.',
    'Record another observed price before drawing conclusions about price history.',
  ]
  return {
    recommendation,
    reason,
    availableSavings: Math.max(0, savings - upcoming),
    purchaseCost: safeNumber(purchase.price),
    cashAfterPurchaseAndObligations: cashAfter,
    obligationsBeforeNextIncome,
    reserveAfterUpcomingExpenses: reserveAfterUpcoming,
    reserveTarget: reserve,
    monthlySurplus,
    projectedMonthlyDeficit,
    savingsTargetDate,
    projectedShortfall: cashAfter < 0 || monthlySurplus < 0,
    assumptions,
    risks,
    missing,
    alternatives,
  }
}

export function calculateSafetyScore(profile: FinancialProfile, purchasePrice: number, goals: SavingsGoalSummary[] = []): SafetyScore {
  const savings = safeNumber(profile.liquidSavings)
  const income = safeNumber(profile.incomeMonthly)
  const expenses = safeNumber(profile.essentialExpensesMonthly)
  const debt = safeNumber(profile.debtMonthly)
  const upcoming = safeNumber(profile.upcomingExpenses)
  const reserveTarget = safeNumber(profile.reserveTarget)
  const contribution = safeNumber(profile.monthlySavingsTarget)
  const monthlySurplus = income - expenses - debt - contribution
  const nextIncome = clamp(profile.nextIncomeInDays ?? 30, 0, 30)
  const headroom = savings - upcoming - (expenses + debt) * nextIncome / 30 - reserveTarget
  const reserveScore = reserveTarget > 0 ? 30 * clamp((savings - upcoming) / reserveTarget, 0, 1) : 0
  const budgetScore = income > 0 ? 25 * clamp(monthlySurplus / income / 0.2, 0, 1) : 0
  const affordabilityScore = purchasePrice > 0 ? 25 * clamp(headroom / purchasePrice, 0, 1) : 0
  const goalTarget = goals.reduce((sum, goal) => sum + safeNumber(goal.target), 0)
  const goalCurrent = goals.reduce((sum, goal) => sum + Math.min(safeNumber(goal.current), safeNumber(goal.target)), 0)
  const goalScore = goalTarget > 0 ? 20 * clamp(goalCurrent / goalTarget, 0, 1) : 0
  const components: ScoreComponent[] = [
    { key: 'reserve', label: 'Emergency reserve', score: reserveScore, max: 30, explanation: reserveTarget > 0 ? `Cash after listed upcoming expenses covers ${Math.round(clamp((savings - upcoming) / reserveTarget, 0, 1) * 100)}% of your reserve target.` : 'Add an emergency reserve target to calculate this part.' },
    { key: 'budget', label: 'Monthly budget', score: budgetScore, max: 25, explanation: income > 0 ? `Monthly income less essentials, debt, and planned savings is ${formatINR(monthlySurplus)}.` : 'Add monthly income to calculate your budget health.' },
    { key: 'purchase', label: 'Purchase affordability', score: affordabilityScore, max: 25, explanation: purchasePrice > 0 ? `Estimated purchase headroom after obligations and reserve is ${formatINR(Math.max(0, headroom))}.` : 'Add a product price to assess this purchase.' },
    { key: 'goals', label: 'Goal progress', score: goalScore, max: 20, explanation: goalTarget > 0 ? `Your goals are ${Math.round(goalCurrent / goalTarget * 100)}% funded in total.` : 'Create a savings goal to calculate this part.' },
  ]
  const missing: string[] = []
  if (profile.liquidSavings === undefined) missing.push('Current liquid savings')
  if (profile.incomeMonthly === undefined) missing.push('Monthly income')
  if (profile.essentialExpensesMonthly === undefined) missing.push('Essential monthly expenses')
  if (profile.reserveTarget === undefined || reserveTarget <= 0) missing.push('Emergency reserve target')
  if (goals.length === 0) missing.push('At least one savings goal')
  const suggestions = []
  if (reserveScore < 30) suggestions.push('Build up your emergency reserve before treating extra cash as purchase money.')
  if (budgetScore < 25) suggestions.push('Review planned savings, recurring costs, and debt payments to improve monthly breathing room.')
  if (affordabilityScore < 25) suggestions.push('Consider a lower-cost option or a later date that preserves your reserve.')
  if (goalScore < 20) suggestions.push('Choose a realistic contribution amount and track progress toward one clear goal.')
  return { total: Math.round(clamp(components.reduce((sum, component) => sum + component.score, 0), 0, 100)), components, suggestions, missing }
}

export type EmiResult = {
  emi: number
  totalRepayment: number
  totalInterest: number
  totalFees: number
  totalFinancingCost: number
  remainingMonthlySurplus: number | null
}

export function calculateEmi(input: { principal: number; annualRate: number; tenureMonths: number; processingFee: number; otherFees: number; income?: number; essentials?: number; debt?: number; savingsTarget?: number }): EmiResult {
  const { principal, annualRate, tenureMonths, processingFee, otherFees } = input
  if (![principal, annualRate, tenureMonths, processingFee, otherFees].every(Number.isFinite)) throw new Error('Enter valid numbers in every EMI field.')
  if (principal <= 0) throw new Error('Loan amount must be greater than zero.')
  if (annualRate < 0 || processingFee < 0 || otherFees < 0) throw new Error('Rate and fees cannot be negative.')
  if (!Number.isInteger(tenureMonths) || tenureMonths <= 0 || tenureMonths > 600) throw new Error('Loan term must be a whole number between 1 and 600 months.')
  const rate = annualRate / 100 / 12
  const emi = rate === 0 ? principal / tenureMonths : principal * rate * (1 + rate) ** tenureMonths / ((1 + rate) ** tenureMonths - 1)
  const totalRepayment = emi * tenureMonths
  const totalFees = processingFee + otherFees
  const remainingMonthlySurplus = input.income === undefined ? null : input.income - safeNumber(input.essentials) - safeNumber(input.debt) - safeNumber(input.savingsTarget) - emi
  return { emi, totalRepayment, totalInterest: totalRepayment - principal, totalFees, totalFinancingCost: totalRepayment + totalFees, remainingMonthlySurplus }
}

export type Scenario = { id: string; label: string; waitDays: number; price: number; contribution: number; monthlyEmi?: number; type: 'cash' | 'emi' }
export type ScenarioResult = Scenario & { cashAtPurchase: number; obligations: number; savingsProgress: number; remainingAfter: number; shortfall: number; monthlySurplusAfter: number; estimatedDate: string }

export function compareScenarios(profile: FinancialProfile, scenarios: Scenario[], now = new Date()): ScenarioResult[] {
  const savings = safeNumber(profile.liquidSavings)
  const essentials = safeNumber(profile.essentialExpensesMonthly)
  const debt = safeNumber(profile.debtMonthly)
  const upcoming = safeNumber(profile.upcomingExpenses)
  const income = safeNumber(profile.incomeMonthly)
  return scenarios.map((scenario) => {
    const days = Math.max(0, scenario.waitDays)
    const months = days / 30
    const monthlyCashflow = income - essentials - debt
    const cashAtPurchase = savings + monthlyCashflow * months
    const obligations = upcoming + (days === 0 ? (essentials + debt) * clamp(profile.nextIncomeInDays ?? 30, 0, 30) / 30 : 0)
    const downPayment = scenario.type === 'emi' ? 0 : scenario.price
    const remainingAfter = cashAtPurchase - obligations - downPayment
    const shortfall = Math.max(0, -remainingAfter)
    const date = new Date(now.getTime() + days * 86400000)
    return {
      ...scenario,
      cashAtPurchase,
      obligations,
      savingsProgress: safeNumber(scenario.contribution) * months,
      remainingAfter,
      shortfall,
      monthlySurplusAfter: income - essentials - debt - safeNumber(scenario.contribution) - (scenario.type === 'emi' ? safeNumber(scenario.monthlyEmi) : 0),
      estimatedDate: formatDate(date),
    }
  })
}

export const formatINR = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0)
export const formatNumber = (value: number, digits = 0) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0)
