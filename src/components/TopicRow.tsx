import { ArrowRight, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { priceChangeView, topicDisclosureIds } from '../briefing-view'
import type { BriefingContentType, PriceObservation, Topic } from '../types'

const CONTENT_LABELS: Record<BriefingContentType, string> = {
  product_update: 'Product update',
  price_change: 'Price change',
  discount_offer: 'Discount offer',
  setup_tip: 'Setup tip',
  community_opinion: 'Community pattern',
}

interface TopicRowProps {
  topic: Topic
  open: boolean
  onToggle: () => void
  priceSnapshots: PriceObservation[]
}

export function TopicRow({ topic, open, onToggle, priceSnapshots }: TopicRowProps) {
  const ids = topicDisclosureIds(topic.id)
  const prices = priceChangeView(topic, priceSnapshots)
  const recurrence = topic.recurrence

  return <article className={`topic-row ${open ? 'open' : ''}`}>
    <button
      id={ids.buttonId}
      type="button"
      className="topic-summary"
      aria-expanded={open}
      aria-controls={ids.panelId}
      onClick={onToggle}
    >
      <span className="topic-rank">{String(topic.rank).padStart(2, '0')}</span>
      <span className={`topic-index ${topic.section}`}>{topic.section === 'crypto' ? 'C' : 'A'}</span>
      <span className="topic-title-wrap">
        <strong>{topic.title}</strong>
        <span>{topic.summary}</span>
        <span className="topic-meta" aria-label="Topic metadata">
          {topic.contentType && <span className="meta-chip">{CONTENT_LABELS[topic.contentType]}</span>}
          {topic.status && <span className={`meta-chip status-${topic.status}`}>{topic.status}</span>}
          {topic.freshness && <span className={`meta-chip freshness-${topic.freshness}`}>{topic.freshness}</span>}
          {topic.lastVerifiedAt && <span className="meta-chip" title={topic.lastVerifiedAt}>Verified {formatTime(topic.lastVerifiedAt)}</span>}
          <span className="meta-chip">{topic.confidence}</span>
          {topic.independentSourceCount !== undefined && <span className="meta-chip">{topic.independentSourceCount} independent</span>}
        </span>
      </span>
      <span className="topic-signal">{topic.signal}</span>
      <span className="topic-chevron" aria-hidden="true">{open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</span>
    </button>

    {open && <div className="evidence-panel" id={ids.panelId} role="region" aria-labelledby={ids.buttonId}>
      <div className="topic-detail">
        <span className="confidence">{topic.confidence}</span>
        <span>·</span>
        <span>{topic.independentSourceCount === undefined ? `${topic.sources.length} listed sources` : `${topic.independentSourceCount} independent sources`}</span>
        {topic.lastVerifiedAt && <><span>·</span><span title={topic.lastVerifiedAt}>Verified {formatTime(topic.lastVerifiedAt)}</span></>}
      </div>

      {prices.length > 0 && <section className="price-list" aria-label="Price observations">
        {prices.map((price) => <div className="price-comparison" key={price.key}>
          <div className="price-heading">
            <strong>{price.current.vendor} · {price.current.product} {price.current.plan}</strong>
            <span>{price.current.region} · {price.current.billingPeriod.replace('_', ' ')} · {price.current.unit}</span>
          </div>
          {price.kind === 'change' && price.previous
            ? <div className="price-values">
                <span><small>Before</small><del>{formatPrice(price.previous)}</del>{price.previous.promotion && <em className="offer-label">{price.previous.promotion.label}</em>}</span>
                <ArrowRight size={15} aria-hidden="true" />
                <span><small>Now</small><strong>{formatPrice(price.current)}</strong>{price.current.promotion && <em className="offer-label">{price.current.promotion.label}</em>}</span>
                {price.percentChange !== undefined && <span className="price-delta">{price.percentChange > 0 ? '+' : ''}{price.percentChange}%</span>}
              </div>
            : <div className="price-values first-price"><span><small>First observed</small><strong>{formatPrice(price.current)}</strong></span></div>}
          {price.current.promotion && <p className="promotion-copy">{price.current.promotion.label}{price.current.promotion.endsAt ? ` · ends ${formatDate(price.current.promotion.endsAt)}` : ''}</p>}
          <a className="price-source" href={price.current.sourceUrl} target="_blank" rel="noopener noreferrer">
            Official price source <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>)}
      </section>}

      {recurrence && <dl className="recurrence-stats" aria-label="Community recurrence">
        <div><dt>Authors</dt><dd>{recurrence.authorCount}</dd></div>
        <div><dt>Publishers</dt><dd>{recurrence.publisherCount}</dd></div>
        <div><dt>Mentions</dt><dd>{recurrence.mentionCount}</dd></div>
        <div><dt>Window</dt><dd>{formatWindow(recurrence.windowHours)}</dd></div>
      </dl>}

      <div className="evidence-list">
        {topic.evidence.map((item, index) => <a href={item.url} target="_blank" rel="noopener noreferrer" className="evidence-item" key={`${item.url}-${index}`}>
          <div className="evidence-top">
            <span className={`source-type ${cssToken(item.source)}`}>{item.source}</span>
            <span>{item.label} · {item.time}</span>
            {item.trustTier && <span className="trust-tier">{item.trustTier}</span>}
            <ExternalLink size={13} aria-hidden="true" />
          </div>
          {item.excerpt && <p>“{item.excerpt}”</p>}
          <span className="evidence-author">{item.author}</span>
        </a>)}
      </div>
    </div>}
  </article>
}

function formatPrice(observation: PriceObservation) {
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: observation.currency })
    const minorDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return `${formatter.format(observation.amountMinor / (10 ** minorDigits))} / ${periodLabel(observation.billingPeriod)}`
  } catch {
    return `${observation.currency} ${observation.amountMinor.toLocaleString()} / ${periodLabel(observation.billingPeriod)}`
  }
}

function periodLabel(period: PriceObservation['billingPeriod']) {
  if (period === 'one_time') return 'one time'
  if (period === 'usage') return 'usage'
  return period
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function formatWindow(hours: number) {
  return hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`
}

function cssToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
