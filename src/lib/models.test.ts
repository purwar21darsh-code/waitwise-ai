import { describe, expect, it } from 'vitest'
import { getGoalProjection, type SavingsGoal } from './models'

const makeGoal = (contribution: number, targetDate: string): SavingsGoal => ({ id: 'goal', name: 'Laptop', target: 60_000, current: 10_000, monthlyContribution: contribution, targetDate, createdAt: '2026-01-01T00:00:00.000Z' })

describe('savings goal projection', () => {
  it('estimates completion from current progress and monthly contribution', () => {
    const result = getGoalProjection(makeGoal(10_000, '2027-01-01'), new Date('2026-01-01T00:00:00Z'))
    expect(result.remaining).toBe(50_000)
    expect(result.progress).toBeCloseTo(16.6667, 3)
    expect(result.estimatedDate).toBe('2026-05-31')
    expect(result.isAchievable).toBe(true)
  })

  it('marks zero-capacity and too-soon target dates as not achievable', () => {
    expect(getGoalProjection(makeGoal(0, '2026-01-02')).targetIsImpossible).toBe(true)
    expect(getGoalProjection(makeGoal(1_000, '2026-02-01')).targetIsImpossible).toBe(true)
  })

  it('handles a fully funded goal without requiring future contributions', () => {
    const result = getGoalProjection({ ...makeGoal(0, '2026-01-02'), current: 60_000 })
    expect(result.remaining).toBe(0)
    expect(result.progress).toBe(100)
    expect(result.isAchievable).toBe(true)
  })
})
