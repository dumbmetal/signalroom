import { TRUST_TIERS, normalizeIdentityKey } from '../shared/briefing-contract.mjs'
import { OFFICIAL_SOURCE_KINDS, getOfficialSource } from '../shared/official-source-catalog.mjs'

const COMMUNITY_SOURCE_KINDS = Object.freeze(['Telegram', 'Reddit', 'X', 'Threads'])
export const SOURCE_KINDS = Object.freeze([...COMMUNITY_SOURCE_KINDS, ...OFFICIAL_SOURCE_KINDS])
const ALLOWED_SOURCE_CONFIG_KEYS = new Set(['subreddit', 'query', 'userId', 'chatId', 'limit', 'publisherId', 'independenceKey', 'trustTier'])
const IDENTITY_CONFIG_KEYS = new Set(['publisherId', 'independenceKey'])

export class SourceConfigError extends Error {
  constructor(message) { super(message); this.name = 'SourceConfigError' }
}

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

export function createSourceRecord(body, id) {
  if (!body || typeof body !== 'object' || !SOURCE_KINDS.includes(body.kind)) throw new SourceConfigError('kind and name are required')
  if (OFFICIAL_SOURCE_KINDS.includes(body.kind)) return officialSourceRecord(id, body.kind, body.config, body.enabled)
  if (!body.name) throw new SourceConfigError('kind and name are required')
  return {
    id,
    kind: body.kind,
    name: String(body.name),
    detail: String(body.detail || ''),
    section: body.section === 'crypto' ? 'crypto' : 'ai',
    enabled: body.enabled !== false,
    config: safeSourceConfigForApi(body.config, body.kind),
  }
}

export function patchSourceRecord(existing, body) {
  if (!existing || typeof existing !== 'object' || !SOURCE_KINDS.includes(existing.kind)) throw new SourceConfigError('Source kind is invalid')
  const patch = body && typeof body === 'object' ? body : {}
  if (OFFICIAL_SOURCE_KINDS.includes(existing.kind)) {
    return officialSourceRecord(existing.id, existing.kind, patch.config === undefined ? existing.config : patch.config, patch.enabled === undefined ? existing.enabled : patch.enabled)
  }
  return {
    ...existing,
    ...pick(patch, ['name', 'detail', 'section', 'enabled']),
    ...(patch.config === undefined ? {} : { config: safeSourceConfigForApi(patch.config, existing.kind) }),
  }
}

function officialSourceRecord(id, kind, config, enabled) {
  try {
    const safeConfig = safeSourceConfigForApi(config, kind)
    const catalog = getOfficialSource(safeConfig.catalogId)
    return {
      id,
      kind: catalog.kind,
      name: catalog.name,
      detail: catalog.publisher,
      section: 'ai',
      enabled: enabled !== false,
      config: safeConfig,
    }
  } catch (error) {
    if (error instanceof SourceConfigError) throw error
    throw new SourceConfigError(safeOfficialConfigError(error))
  }
}

function safeSourceConfigForApi(config, kind) {
  try { return safeSourceConfig(config, kind) }
  catch (error) { throw new SourceConfigError(safeOfficialConfigError(error)) }
}

function safeOfficialConfigError(error) {
  const message = error instanceof Error ? error.message : ''
  if (/kind does not match/i.test(message)) return 'Official source kind does not match catalog'
  if (/catalogId is required/i.test(message)) return 'Official source catalogId is required'
  return 'Unknown official source catalog id'
}

function pick(value, keys) {
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]))
}
