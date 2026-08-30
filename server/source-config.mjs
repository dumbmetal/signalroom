import { TRUST_TIERS, normalizeIdentityKey } from '../shared/briefing-contract.mjs'
import { OFFICIAL_SOURCE_KINDS, getOfficialSource } from '../shared/official-source-catalog.mjs'

const ALLOWED_SOURCE_CONFIG_KEYS = new Set(['subreddit', 'query', 'userId', 'chatId', 'limit', 'publisherId', 'independenceKey', 'trustTier'])
const IDENTITY_CONFIG_KEYS = new Set(['publisherId', 'independenceKey'])

export function safeSourceConfig(config, kind) {
  const officialKind = OFFICIAL_SOURCE_KINDS.includes(kind)
  if (officialKind || config?.catalogId !== undefined) {
    if (typeof config?.catalogId !== 'string' || !config.catalogId.trim()) throw new Error('Official source catalogId is required')
    const source = getOfficialSource(config.catalogId)
    if (kind && source.kind !== kind) throw new Error(`Official source kind does not match catalog: expected ${source.kind}`)
    return { catalogId: source.id }
  }
  return Object.fromEntries(Object.entries(config || {}).flatMap(([key, value]) => {
    if (!ALLOWED_SOURCE_CONFIG_KEYS.has(key)) return []
    if (IDENTITY_CONFIG_KEYS.has(key)) return typeof value === 'string' && value.trim() ? [[key, value.trim()]] : []
    if (key === 'trustTier') {
      const trustTier = normalizeIdentityKey(value)
      return TRUST_TIERS.includes(trustTier) ? [[key, trustTier]] : []
    }
    return [[key, value]]
  }))
}
