import { fingerprintText } from './briefing-contract.mjs'

const BILLING_PERIODS = new Set(['month', 'year', 'one_time', 'usage'])
const TAX_MODES = new Set(['included', 'excluded', 'unknown'])
const PRICE_TRUST_TIERS = new Set(['primary', 'maintainer'])
const ZERO_DECIMAL_CURRENCIES = new Set(['KRW', 'JPY'])

export function amountToMinorUnits(value, currency) {
  const normalizedCurrency = String(currency || '').trim().toUpperCase()
  if (!normalizedCurrency) throw new Error('Price currency is required')
  const raw = typeof value === 'number' ? String(value) : String(value || '')
  const cleaned = raw.normalize('NFKC').replace(/[,$₩\s]/g, '').replace(/(?:원|usd|krw)$/i, '')
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) throw new Error(`Invalid ${normalizedCurrency} amount`)
  const [whole, fraction = ''] = cleaned.split('.')
  const decimals = ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) ? 0 : 2
  if (decimals === 0 && Number(fraction || 0) !== 0) throw new Error(`${normalizedCurrency} requires a whole amount`)
  if (fraction.length > decimals && Number(fraction.slice(decimals)) !== 0) throw new Error(`${normalizedCurrency} amount has too many decimal places`)
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
  const sign = whole.startsWith('-') ? -1 : 1
  const absoluteWhole = whole.replace(/^-/, '')
  const minor = Number(absoluteWhole) * (10 ** decimals) + Number(paddedFraction || 0)
  if (!Number.isSafeInteger(minor)) throw new Error('Price amount is outside the safe integer range')
  return sign * minor
}

export function normalizePriceObservation(input) {
  const vendor = requiredText(input?.vendor, 'vendor')
  const product = requiredText(input?.product, 'product')
  const plan = requiredText(input?.plan, 'plan')
  const region = requiredText(input?.region, 'region').toUpperCase()
  const currency = requiredText(input?.currency, 'currency').toUpperCase()
  const billingPeriod = requiredText(input?.billingPeriod, 'billingPeriod').toLowerCase()
  const unit = requiredText(input?.unit, 'unit')
  const taxMode = requiredText(input?.taxMode, 'taxMode').toLowerCase()
  const amountMinor = Number(input?.amountMinor)
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Price amountMinor must be a non-negative safe integer')
  if (!BILLING_PERIODS.has(billingPeriod)) throw new Error(`Unsupported billing period: ${billingPeriod}`)
  if (!TAX_MODES.has(taxMode)) throw new Error(`Unsupported tax mode: ${taxMode}`)
  const observedAt = isoDate(input?.observedAt, 'observedAt')
  const lastVerifiedAt = isoDate(input?.lastVerifiedAt || observedAt, 'lastVerifiedAt')
  const sourceUrl = requiredHttpsUrl(input?.sourceUrl)
  const sourceKey = identityPart(input?.sourceKey, 'sourceKey')
  const publisherId = identityPart(input?.publisherId, 'publisherId')
  const trustTier = requiredText(input?.trustTier, 'trustTier').toLowerCase()
  if (!PRICE_TRUST_TIERS.has(trustTier)) throw new Error(`Unsupported price trust tier: ${trustTier}`)
  const promotion = normalizePromotion(input?.promotion)
  const key = [vendor, product, plan, region, currency, billingPeriod, unit].map(keyPart).join(':')
  const normalized = {
    key, vendor: vendor.trim(), product: product.trim(), plan: plan.trim(), region, currency, amountMinor,
    billingPeriod, unit: unit.trim(), taxMode, observedAt, lastVerifiedAt, sourceUrl,
    sourceKey, publisherId, trustTier,
    ...(promotion ? { promotion } : {}),
  }
  return { ...normalized, contentHash: fingerprintText(priceObservationSignature(normalized)) }
}

export function priceObservationSignature(observation) {
  const promotion = observation?.promotion
    ? {
        kind: String(observation.promotion.kind || ''),
        label: String(observation.promotion.label || ''),
        originalAmountMinor: observation.promotion.originalAmountMinor ?? null,
        endsAt: observation.promotion.endsAt || null,
      }
    : null
  return JSON.stringify({
    key: observation?.key,
    amountMinor: observation?.amountMinor,
    taxMode: observation?.taxMode,
    promotion,
  })
}

export function mergePriceSnapshots(previous = [], observed = []) {
  const byKey = new Map()
  const put = (value) => {
    const item = normalizePriceObservation(value)
    const signature = priceObservationSignature(item)
    const signatures = byKey.get(item.key) || new Map()
    const existing = signatures.get(signature)
    if (!existing) signatures.set(signature, item)
    else {
      const currentIsNewer = Date.parse(item.lastVerifiedAt) >= Date.parse(existing.lastVerifiedAt)
      const newest = currentIsNewer ? item : existing
      signatures.set(signature, {
        ...existing,
        ...newest,
        observedAt: Date.parse(item.observedAt) < Date.parse(existing.observedAt) ? item.observedAt : existing.observedAt,
        lastVerifiedAt: Date.parse(item.lastVerifiedAt) > Date.parse(existing.lastVerifiedAt) ? item.lastVerifiedAt : existing.lastVerifiedAt,
      })
    }
    byKey.set(item.key, signatures)
  }
  for (const item of Array.isArray(previous) ? previous : []) put(item)
  for (const item of Array.isArray(observed) ? observed : []) put(item)
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, signatures]) =>
    [...signatures.values()].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || priceObservationSignature(a).localeCompare(priceObservationSignature(b))).slice(0, 2),
  )
}

function normalizePromotion(value) {
  if (value === undefined || value === null) return undefined
  if (!['discount', 'trial', 'introductory'].includes(value.kind)) throw new Error('Unsupported promotion kind')
  const promotion = { kind: value.kind, label: requiredText(value.label, 'promotion label') }
  if (value.originalAmountMinor !== undefined) {
    const originalAmountMinor = Number(value.originalAmountMinor)
    if (!Number.isSafeInteger(originalAmountMinor) || originalAmountMinor < 0) throw new Error('Promotion originalAmountMinor must be a non-negative safe integer')
    promotion.originalAmountMinor = originalAmountMinor
  }
  if (value.endsAt !== undefined) promotion.endsAt = isoDate(value.endsAt, 'promotion endsAt')
  return promotion
}

function keyPart(value) {
  return String(value).normalize('NFKC').trim().toLowerCase().replace(/[^a-z0-9가-힣]+/gu, '-').replace(/^-|-$/g, '')
}
function identityPart(value, name) {
  const normalized = keyPart(requiredText(value, name))
  if (!normalized) throw new Error(`Price ${name} is required`)
  return normalized
}
function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Price ${name} is required`)
  return value.normalize('NFKC').trim()
}
function isoDate(value, name) {
  const timestamp = Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp)) throw new Error(`Price ${name} must be an ISO date`)
  return new Date(timestamp).toISOString()
}
function requiredHttpsUrl(value) {
  try {
    const url = new URL(requiredText(value, 'sourceUrl'))
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
    url.hash = ''
    return url.href
  } catch {
    throw new Error('Price sourceUrl must be an HTTPS URL')
  }
}
