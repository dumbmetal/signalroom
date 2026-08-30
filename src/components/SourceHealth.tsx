import { Check, CircleHelp, TriangleAlert } from 'lucide-react'
import { sourceHealthSummary } from '../briefing-view'
import type { SourceRun } from '../types'

interface SourceHealthProps {
  sourceRuns: SourceRun[] | null
  generatedAt: string | null
  reportMode: 'live' | 'saved' | 'loading' | 'unavailable'
}

export function SourceHealth({ sourceRuns, generatedAt, reportMode }: SourceHealthProps) {
  const summary = sourceHealthSummary(sourceRuns)

  return <section className="rail-card source-health" aria-labelledby="source-health-heading">
    <div className="rail-label">
      <h2 id="source-health-heading">SOURCE HEALTH</h2>
      <span className={`report-origin ${reportMode}`}>{originLabel(reportMode)}</span>
    </div>
    {generatedAt && <p className="report-generated">Generated <time dateTime={generatedAt}>{formatTime(generatedAt)}</time></p>}

    {!summary.available
      ? <div className="health-unavailable"><CircleHelp size={16} aria-hidden="true" /><p>Source health was not included in this report.</p></div>
      : <>
          <dl className="health-summary">
            <div><dt>OK</dt><dd>{summary.ok}</dd></div>
            <div><dt>Partial</dt><dd>{summary.partial}</dd></div>
            <div><dt>Error</dt><dd>{summary.error}</dd></div>
          </dl>
          {summary.checkedAt && <p className="health-checked">Last checked <time dateTime={summary.checkedAt}>{formatTime(summary.checkedAt)}</time></p>}
          {sourceRuns && sourceRuns.length > 0 && <ul className="source-health-list">
            {sourceRuns.map((run, index) => <li className={`source-health-row ${run.status}`} key={`${run.source}-${index}`}>
              <span className="health-icon" aria-hidden="true">{run.status === 'ok' ? <Check size={13} /> : <TriangleAlert size={13} />}</span>
              <span className="health-source"><strong>{run.source}</strong><small>{run.kind ? `${run.kind} · ` : ''}{run.count} item{run.count === 1 ? '' : 's'}</small></span>
              <span className="health-status">{run.status}</span>
              {(run.error || run.warnings.length > 0) && <span className="health-message">{run.error ?? run.warnings[0]}</span>}
              {run.checkedAt && <time dateTime={run.checkedAt}>{formatTime(run.checkedAt)}</time>}
            </li>)}
          </ul>}
        </>}
  </section>
}

function originLabel(mode: SourceHealthProps['reportMode']) {
  if (mode === 'live') return 'LIVE REPORT'
  if (mode === 'saved') return 'SAVED REPORT'
  if (mode === 'loading') return 'LOADING'
  return 'OFFLINE'
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
