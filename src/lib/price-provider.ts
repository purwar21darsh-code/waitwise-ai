import type { PriceObservation } from './models'

/** A replaceable boundary for product price history sources. */
export interface PriceDataProvider {
  getHistory(product: string): Promise<PriceObservation[]>
}

/** Reads only user-entered observations; it never fetches or invents prices. */
export class ManualPriceProvider implements PriceDataProvider {
  constructor(private readonly observations: readonly PriceObservation[]) {}

  async getHistory(product: string): Promise<PriceObservation[]> {
    const key = product.trim().toLocaleLowerCase()
    if (!key) return []
    return this.observations
      .filter((item) => item.product.trim().toLocaleLowerCase() === key)
      .slice()
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  }
}
