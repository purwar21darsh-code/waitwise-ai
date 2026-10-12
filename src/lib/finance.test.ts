import { describe, expect, it } from 'vitest'
import { calculateDecision, calculateEmi, calculateSafetyScore, compareScenarios } from './finance'

const healthyProfile = { liquidSavings: 150_000, incomeMonthly: 60_000, essentialExpensesMonthly: 24_000, debtMonthly: 2_000, upcomingExpenses: 5_000, reserveTarget: 30_000, monthlySavingsTarget: 8_000, nextIncomeInDays: 15 }

describe('purchase decision engine', () => {
  it('accounts for upcoming obligations and protects the reserve', () => {
    const result = calculateDecision(healthyProfile, { name: 'Laptop', category: 'Laptop', price: 50_000, urgency: 'normal' }, new Date('2026-01-01T00:00:00Z'))
    expect(result.recommendation).toBe('BUY NOW')
    expect(result.obligationsBeforeNextIncome).toBe(18_000)
    expect(result.cashAfterPurchaseAndObligations).toBe(82_000)
  })

  it('does not use money reserved for listed upcoming expenses', () => {
    const result = calculateDecision({ ...healthyProfile, liquidSavings: 25_000, upcomingExpenses: 12_000 }, { name: 'Phone', category: 'Phone', price: 20_000, urgency: 'normal' })
    expect(result.recommendation).toBe("DON'T BUY YET")
    expect(result.projectedShortfall).toBe(true)
  })

  it('waits when the purchase would dip below reserve and surplus is positive', () => {
    const result = calculateDecision({ ...healthyProfile, liquidSavings: 68_000 }, { name: 'Laptop', category: 'Laptop', price: 50_000, urgency: 'low' })
    expect(result.recommendation).toBe('WAIT')
    expect(result.savingsTargetDate).toBeTruthy()
  })

  it('blocks a purchase with a monthly deficit even if current savings cover the price', () => {
    const result = calculateDecision({ ...healthyProfile, incomeMonthly: 20_000 }, { name: 'Laptop', category: 'Laptop', price: 10_000, urgency: 'high' })
    expect(result.recommendation).toBe("DON'T BUY YET")
    expect(result.projectedMonthlyDeficit).toBe(14_000)
  })

  it('treats zero income as a deficit and missing essential data as uncertain', () => {
    expect(calculateDecision({ ...healthyProfile, incomeMonthly: 0 }, { name: 'Phone', category: 'Phone', price: 1, urgency: 'normal' }).recommendation).toBe("DON'T BUY YET")
    const missing = calculateDecision({ liquidSavings: 5_000 }, { name: 'Phone', category: 'Phone', price: 1, urgency: 'normal' })
    expect(missing.recommendation).toBe('WAIT')
    expect(missing.missing).toContain('Monthly income')
    const noReserve = calculateDecision({ ...healthyProfile, reserveTarget: 0 }, { name: 'Phone', category: 'Phone', price: 1, urgency: 'normal' })
    expect(noReserve.recommendation).toBe('WAIT')
    expect(noReserve.missing).toContain('Emergency reserve target')
  })

  it('handles invalid negative inputs safely and adjusts obligations by income timing', () => {
    const short = calculateDecision({ ...healthyProfile, liquidSavings: -2_000, nextIncomeInDays: 0 }, { name: 'Device', category: 'Other', price: -100, urgency: 'normal' })
    const long = calculateDecision({ ...healthyProfile, nextIncomeInDays: 30 }, { name: 'Device', category: 'Other', price: 1, urgency: 'normal' })
    expect(short.availableSavings).toBe(0)
    expect(short.missing).toContain('A valid purchase price')
    expect(long.obligationsBeforeNextIncome).toBeGreaterThan(calculateDecision({ ...healthyProfile, nextIncomeInDays: 0 }, { name: 'Device', category: 'Other', price: 1, urgency: 'normal' }).obligationsBeforeNextIncome)
  })
})

describe('financial safety score', () => {
  it('reaches the maximum component scores with fully funded inputs', () => {
    const score = calculateSafetyScore({ ...healthyProfile, liquidSavings: 500_000 }, 10_000, [{ target: 100_000, current: 100_000 }])
    expect(score.total).toBe(100)
    expect(score.components.map((part) => part.score)).toEqual([30, 25, 25, 20])
  })

  it('stays in range and reports missing goal data', () => {
    const score = calculateSafetyScore({ liquidSavings: 0, incomeMonthly: 0, essentialExpensesMonthly: 0 }, 99_999)
    expect(score.total).toBeGreaterThanOrEqual(0)
    expect(score.total).toBeLessThanOrEqual(100)
    expect(score.missing).toContain('At least one savings goal')
  })

  it('updates when the profile changes', () => {
    const before = calculateSafetyScore({ ...healthyProfile, liquidSavings: 5_000 }, 30_000, [{ target: 10_000, current: 1_000 }])
    const after = calculateSafetyScore({ ...healthyProfile, liquidSavings: 100_000 }, 30_000, [{ target: 10_000, current: 8_000 }])
    expect(after.total).toBeGreaterThan(before.total)
  })
})

describe('EMI calculator', () => {
  it('calculates zero-interest repayment and fees exactly', () => {
    const result = calculateEmi({ principal: 120_000, annualRate: 0, tenureMonths: 12, processingFee: 500, otherFees: 250 })
    expect(result.emi).toBe(10_000)
    expect(result.totalRepayment).toBe(120_000)
    expect(result.totalInterest).toBe(0)
    expect(result.totalFinancingCost).toBe(120_750)
  })

  it('calculates positive-interest EMI and remaining budget', () => {
    const result = calculateEmi({ principal: 100_000, annualRate: 12, tenureMonths: 12, processingFee: 0, otherFees: 0, income: 50_000, essentials: 20_000, debt: 2_000, savingsTarget: 5_000 })
    expect(result.emi).toBeCloseTo(8884.88, 1)
    expect(result.totalInterest).toBeGreaterThan(0)
    expect(result.remainingMonthlySurplus).toBeCloseTo(14115.12, 1)
  })

  it.each([
    { principal: 0, annualRate: 0, tenureMonths: 12, processingFee: 0, otherFees: 0 },
    { principal: 1000, annualRate: -1, tenureMonths: 12, processingFee: 0, otherFees: 0 },
    { principal: 1000, annualRate: 0, tenureMonths: 0, processingFee: 0, otherFees: 0 },
  ])('rejects invalid loan inputs', (input) => expect(() => calculateEmi(input)).toThrow())
})

describe('what-if scenarios', () => {
  it('compares buy now and waiting using explicit contributions, without price forecasts', () => {
    const results = compareScenarios(healthyProfile, [
      { id: 'now', label: 'Buy today', waitDays: 0, price: 50_000, contribution: 0, type: 'cash' },
      { id: 'wait', label: 'Wait 30 days', waitDays: 30, price: 50_000, contribution: 8_000, type: 'cash' },
      { id: 'alt', label: 'Cheaper option', waitDays: 7, price: 35_000, contribution: 8_000, type: 'cash' },
    ], new Date('2026-01-01T00:00:00Z'))
    expect(results[0].cashAtPurchase).toBe(150_000)
    expect(results[1].cashAtPurchase).toBe(184_000)
    expect(results[2].price).toBe(35_000)
    expect(results[2].estimatedDate).toBe('2026-01-08')
  })
})
