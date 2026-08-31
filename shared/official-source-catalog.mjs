export const OFFICIAL_SOURCE_KINDS = Object.freeze(['OfficialFeed', 'OfficialPage', 'OfficialPricing'])

const OFFICIAL_SOURCES = deepFreeze({
  'openai-news': {
    id: 'openai-news',
    kind: 'OfficialFeed',
    name: 'OpenAI News',
    publisher: 'OpenAI',
    url: 'https://openai.com/news/rss.xml',
    allowedRedirectHosts: ['openai.com', 'www.openai.com'],
    publisherId: 'openai',
    independenceKey: 'openai',
    trustTier: 'primary',
    parserKey: 'feed',
  },
  'anthropic-claude-code-releases': {
    id: 'anthropic-claude-code-releases',
    kind: 'OfficialFeed',
    name: 'Claude Code releases',
    publisher: 'Anthropic',
    url: 'https://github.com/anthropics/claude-code/releases.atom',
    allowedRedirectHosts: ['github.com'],
    publisherId: 'anthropic',
    independenceKey: 'anthropic',
    trustTier: 'primary',
    parserKey: 'feed',
  },
  'google-gemini-cli-releases': {
    id: 'google-gemini-cli-releases',
    kind: 'OfficialFeed',
    name: 'Gemini CLI releases',
    publisher: 'Google',
    url: 'https://github.com/google-gemini/gemini-cli/releases.atom',
    allowedRedirectHosts: ['github.com'],
    publisherId: 'google',
    independenceKey: 'google',
    trustTier: 'primary',
    parserKey: 'feed',
  },
  'google-ai-blog': {
    id: 'google-ai-blog',
    kind: 'OfficialFeed',
    name: 'Google AI Blog',
    publisher: 'Google',
    url: 'https://blog.google/technology/ai/rss/',
    allowedRedirectHosts: ['blog.google', 'www.blog.google'],
    publisherId: 'google',
    independenceKey: 'google',
    trustTier: 'primary',
    parserKey: 'feed',
  },
  'ollama-releases': {
    id: 'ollama-releases',
    kind: 'OfficialFeed',
    name: 'Ollama releases',
    publisher: 'Ollama',
    url: 'https://github.com/ollama/ollama/releases.atom',
    allowedRedirectHosts: ['github.com'],
    publisherId: 'ollama',
    independenceKey: 'ollama',
    trustTier: 'maintainer',
    parserKey: 'feed',
  },
  'llama-cpp-releases': {
    id: 'llama-cpp-releases',
    kind: 'OfficialFeed',
    name: 'llama.cpp releases',
    publisher: 'ggml-org',
    url: 'https://github.com/ggml-org/llama.cpp/releases.atom',
    allowedRedirectHosts: ['github.com'],
    publisherId: 'ggml-org',
    independenceKey: 'ggml-org',
    trustTier: 'maintainer',
    parserKey: 'feed',
  },
  'open-webui-releases': {
    id: 'open-webui-releases',
    kind: 'OfficialFeed',
    name: 'Open WebUI releases',
    publisher: 'Open WebUI',
    url: 'https://github.com/open-webui/open-webui/releases.atom',
    allowedRedirectHosts: ['github.com'],
    publisherId: 'open-webui',
    independenceKey: 'open-webui',
    trustTier: 'maintainer',
    parserKey: 'feed',
  },
  'lmstudio-changelog': {
    id: 'lmstudio-changelog',
    kind: 'OfficialPage',
    name: 'LM Studio changelog',
    publisher: 'LM Studio',
    url: 'https://lmstudio.ai/changelog/lmstudio',
    allowedRedirectHosts: ['lmstudio.ai', 'www.lmstudio.ai'],
    publisherId: 'lm-studio',
    independenceKey: 'lm-studio',
    trustTier: 'primary',
    parserKey: 'lmstudio-changelog',
  },
  'openai-chatgpt-release-notes': {
    id: 'openai-chatgpt-release-notes',
    kind: 'OfficialPage',
    name: 'ChatGPT release notes',
    publisher: 'OpenAI',
    url: 'https://help.openai.com/en/articles/6825453-chatgpt-release-notes',
    allowedRedirectHosts: ['help.openai.com'],
    publisherId: 'openai',
    independenceKey: 'openai',
    trustTier: 'primary',
    parserKey: 'json-ld-article',
  },
  'openai-chatgpt-plus-usd': {
    id: 'openai-chatgpt-plus-usd',
    kind: 'OfficialPricing',
    name: 'ChatGPT Plus USD pricing',
    publisher: 'OpenAI',
    url: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus',
    allowedRedirectHosts: ['help.openai.com'],
    publisherId: 'openai',
    independenceKey: 'openai',
    trustTier: 'primary',
    parserKey: 'subscription-pricing',
    pricing: {
      vendor: 'OpenAI', product: 'ChatGPT', region: 'US', currency: 'USD', taxMode: 'unknown',
      plans: [{ plan: 'Plus', aliases: ['ChatGPT Plus', 'Plus'], billingPeriod: 'month', unit: 'user', required: true }],
    },
  },
  'openai-chatgpt-plus-krw': {
    id: 'openai-chatgpt-plus-krw',
    kind: 'OfficialPricing',
    name: 'ChatGPT Plus KRW pricing',
    publisher: 'OpenAI',
    url: 'https://chatgpt.com/ko-KR/pricing/',
    allowedRedirectHosts: ['chatgpt.com', 'www.chatgpt.com'],
    publisherId: 'openai',
    independenceKey: 'openai',
    trustTier: 'primary',
    parserKey: 'subscription-pricing',
    pricing: {
      vendor: 'OpenAI', product: 'ChatGPT', region: 'KR', currency: 'KRW', taxMode: 'unknown',
      plans: [{ plan: 'Plus', aliases: ['ChatGPT Plus', 'Plus'], billingPeriod: 'month', unit: 'user', required: true }],
    },
  },
  'anthropic-claude-pro-usd': {
    id: 'anthropic-claude-pro-usd',
    kind: 'OfficialPricing',
    name: 'Claude Pro USD pricing',
    publisher: 'Anthropic',
    url: 'https://claude.com/pricing',
    allowedRedirectHosts: ['claude.com', 'www.claude.com'],
    publisherId: 'anthropic',
    independenceKey: 'anthropic',
    trustTier: 'primary',
    parserKey: 'subscription-pricing',
    pricing: {
      vendor: 'Anthropic', product: 'Claude', region: 'US', currency: 'USD', taxMode: 'unknown',
      plans: [
        { plan: 'Pro', cardHeading: 'Pro', aliases: ['billed monthly'], amountPosition: 'before', billingPeriod: 'month', unit: 'user', required: true },
        { plan: 'Pro annual', cardHeading: 'Pro', aliases: ['annual subscription discount'], billingPeriod: 'year', unit: 'user', required: true, promotion: { kind: 'discount', label: 'Annual subscription discount', originalAmountMinor: 24_000 } },
      ],
    },
  },
  'ollama-cloud-pricing': {
    id: 'ollama-cloud-pricing',
    kind: 'OfficialPricing',
    name: 'Ollama cloud pricing',
    publisher: 'Ollama',
    url: 'https://ollama.com/pricing',
    allowedRedirectHosts: ['ollama.com', 'www.ollama.com'],
    publisherId: 'ollama',
    independenceKey: 'ollama',
    trustTier: 'primary',
    parserKey: 'subscription-pricing',
    pricing: {
      vendor: 'Ollama', product: 'Ollama Cloud', region: 'US', currency: 'USD', taxMode: 'unknown',
      plans: [
        { plan: 'Pro', cardHeading: 'Pro', aliases: ['Pro'], billingPeriod: 'month', unit: 'user', required: true },
        { plan: 'Pro annual', cardHeading: 'Pro', aliases: ['billed annually'], amountPosition: 'before', billingPeriod: 'year', unit: 'user', required: true, promotion: { kind: 'discount', label: 'Annual billing', originalAmountMinor: 24_000 } },
        { plan: 'Team', cardHeading: 'Team', aliases: ['Introductory pricing'], billingPeriod: 'month', unit: 'seat', unitPattern: 'seat', required: true, promotion: { kind: 'introductory', label: 'Introductory pricing' } },
      ],
    },
  },
})

export function getOfficialSource(id) {
  const key = typeof id === 'string' ? id.trim().toLowerCase() : ''
  const source = Object.hasOwn(OFFICIAL_SOURCES, key) ? OFFICIAL_SOURCES[key] : undefined
  if (!source) throw new Error(`Unknown official source catalog id: ${key || '(missing)'}`)
  return source
}

export function listOfficialSources(ids) {
  if (!Array.isArray(ids)) throw new TypeError('Official source ids must be an array')
  return ids.map(getOfficialSource)
}

export function resolveOfficialSource(configuredSource) {
  const catalogId = configuredSource?.catalogId || configuredSource?.config?.catalogId
  const source = getOfficialSource(catalogId)
  if (configuredSource?.kind && configuredSource.kind !== source.kind) {
    throw new Error(`Official source kind does not match catalog: expected ${source.kind}`)
  }
  return source
}

export function isAllowedOfficialSourceUrl(source, value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    if (url.port && url.port !== '443') return false
    const allowedHosts = new Set((source?.allowedRedirectHosts || []).map((host) => String(host).toLowerCase()))
    return allowedHosts.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
