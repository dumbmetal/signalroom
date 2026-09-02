export interface PriceObservation {
  key: string
  vendor: string
  product: string
  plan: string
  region: string
  currency: string
  amountMinor: number
  billingPeriod: 'month' | 'year' | 'one_time' | 'usage'
  unit: string
  taxMode: 'included' | 'excluded' | 'unknown'
  observedAt: string
  lastVerifiedAt: string
  sourceUrl: string
  sourceKey: string
  publisherId: string
  trustTier: 'primary' | 'maintainer'
  contentHash: string
  promotion?: { kind: 'discount' | 'trial' | 'introductory'; label: string; originalAmountMinor?: number; endsAt?: string }
}

export declare function amountToMinorUnits(value: unknown, currency: string): number
export declare function normalizePriceObservation(input: unknown): PriceObservation
export declare function priceObservationSignature(observation: PriceObservation): string
export declare function mergePriceSnapshots(
  previous: readonly PriceObservation[],
  observed: readonly PriceObservation[],
): PriceObservation[]
