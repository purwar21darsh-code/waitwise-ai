import { describe, expect, it } from 'vitest'
import { ManualPriceProvider } from './price-provider'

describe('manual price provider', () => {
  it('returns matching user-entered observations in date order without mutating input', async () => {
    const observations = [
      { id: 'late', product: 'Laptop', price: 58_000, observedAt: '2026-03-01', source: 'Entered by you' },
      { id: 'other', product: 'Phone', price: 24_000, observedAt: '2026-01-01', source: 'Entered by you' },
      { id: 'early', product: ' laptop ', price: 60_000, observedAt: '2026-01-01', source: 'Entered by you' },
    ]
    const history = await new ManualPriceProvider(observations).getHistory(' LAPTOP ')
    expect(history.map((item) => item.id)).toEqual(['early', 'late'])
    expect(observations.map((item) => item.id)).toEqual(['late', 'other', 'early'])
  })

  it('returns no history for an empty or unknown product', async () => {
    const provider = new ManualPriceProvider([])
    await expect(provider.getHistory('')).resolves.toEqual([])
    await expect(provider.getHistory('Tablet')).resolves.toEqual([])
  })
})
