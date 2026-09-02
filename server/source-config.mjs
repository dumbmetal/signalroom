import { TRUST_TIERS, normalizeIdentityKey } from '../shared/briefing-contract.mjs'

const ALLOWED_SOURCE_CONFIG_KEYS = new Set(['subreddit', 'query', 'userId', 'chatId', 'limit', 'publisherId', 'independenceKey', 'trustTier'])
const IDENTITY_CONFIG_KEYS = new Set(['publisherId', 'independenceKey'])

export function safeSourceConfig(config) {
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
