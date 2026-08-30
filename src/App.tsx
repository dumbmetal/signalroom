import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Bell, Check, CircleHelp, Filter, Menu, Plus, Search, Settings, SlidersHorizontal, Sparkles, TriangleAlert, X } from 'lucide-react'
import { sources } from './data'
import type { BriefingReport, Section, Source } from './types'
import { addSource, loadLiveReport, loadSettings, loadSources, saveSettings, type SettingsState } from './api'
import { readCachedReport, topicDisclosureIds, writeCachedReport } from './briefing-view'
import { BriefingSections } from './components/BriefingSections'
import { SourceHealth } from './components/SourceHealth'

type View = 'today' | 'archive' | 'sources'

function App() {
  const [view, setView] = useState<View>('today')
  const [section, setSection] = useState<'all' | Section>('all')
  const [query, setQuery] = useState('')
  const [openTopic, setOpenTopic] = useState<string | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAddSource, setShowAddSource] = useState(false)
  const [sourceRows, setSourceRows] = useState<Source[]>(sources)
  const [settings, setSettings] = useState<SettingsState>({ reportTime: '08:00', timezone: 'Europe/London', telegramEnabled: true })
  const [report, setReport] = useState<BriefingReport | null>(null)
  const [reportMode, setReportMode] = useState<'loading' | 'live' | 'saved' | 'unavailable'>('loading')
  useEffect(() => {
    let active = true
    loadSources().then((rows) => { if (active) setSourceRows(rows) }).catch(() => undefined)
    loadSettings().then((next) => { if (active) setSettings(next) }).catch(() => undefined)
    loadLiveReport().then((liveReport) => {
      if (!active) return
      setReport(liveReport)
      setReportMode('live')
      const storage = browserStorage()
      if (storage) writeCachedReport(storage, liveReport)
    }).catch(() => {
      if (!active) return
      const storage = browserStorage()
      const savedReport = storage ? readCachedReport(storage) : null
      setReport(savedReport)
      setReportMode(savedReport ? 'saved' : 'unavailable')
    })
    return () => { active = false }
  }, [])
  const reportTopics = report?.topics ?? []
  const leadTopic = reportTopics[0]
  const filteredTopics = useMemo(() => reportTopics.filter((topic) => (section === 'all' || topic.section === section) && `${topic.title} ${topic.summary} ${topic.sources.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [query, reportTopics, section])
  const crawlStatus = reportMode === 'loading'
    ? 'Loading live report…'
    : reportMode === 'unavailable'
      ? 'Live report unavailable · no saved report'
      : `${reportMode === 'saved' ? 'Saved report' : 'Live report'} · generated ${formatReportTime(report?.generatedAt)}`

  return <div className="app-shell">
    <header className="masthead">
      <a className="wordmark" href="#top"><span className="wordmark-mark">S</span><span>signalroom</span></a>
      <nav className={mobileMenu ? 'nav-links is-open' : 'nav-links'} aria-label="Primary navigation">
        {(['today', 'archive', 'sources'] as View[]).map((item) => <button className={view === item ? 'nav-link active' : 'nav-link'} onClick={() => { setView(item); setMobileMenu(false) }} key={item}>{item === 'today' ? 'Today' : item === 'archive' ? 'Archive' : 'Sources'}</button>)}
      </nav>
      <div className="header-actions"><button className="icon-button" aria-label="Search"><Search size={18} /></button><button className="icon-button" aria-label="Notifications"><Bell size={18} /></button><button className="settings-button" onClick={() => setShowSettings(true)}><Settings size={16} /> Settings</button><button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={22} /></button></div>
    </header>

    {view === 'today' && <main id="top">
      <div className="topic-toolbar">
        <div className="section-tabs">
          <button type="button" className={section === 'all' ? 'tab active' : 'tab'} onClick={() => setSection('all')}>All signals <span>{reportTopics.length.toString().padStart(2, '0')}</span></button>
          <button type="button" className={section === 'crypto' ? 'tab active crypto-tab' : 'tab crypto-tab'} onClick={() => setSection('crypto')}>Crypto <span>{reportTopics.filter((topic) => topic.section === 'crypto').length.toString().padStart(2, '0')}</span></button>
          <button type="button" className={section === 'ai' ? 'tab active ai-tab' : 'tab ai-tab'} onClick={() => setSection('ai')}>AI <span>{reportTopics.filter((topic) => topic.section === 'ai').length.toString().padStart(2, '0')}</span></button>
          <span className={`crawl-status ${reportMode}`} role="status" aria-live="polite">{crawlStatus}</span>
        </div>
        <div className="toolbar-right">
          <label className="search-field"><Search size={16} aria-hidden="true" /><input aria-label="Search signals" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search signals" /></label>
          <button type="button" className="filter-button"><Filter size={15} aria-hidden="true" /> Filters</button>
        </div>
      </div>

      {reportMode === 'loading'
        ? <section className="lead-story loading-report" aria-live="polite"><div className="lead-kicker"><span>LIVE REPORT</span></div><div className="lead-grid"><h2>Gathering today’s<br /><span>verified signals.</span></h2><div><p>The briefing remains quiet until the current report has been validated.</p></div></div></section>
        : leadTopic
          ? <section className="lead-story" aria-labelledby="lead-story-heading"><div className="lead-kicker"><span className={`section-chip ${leadTopic.section}`}>{leadTopic.section.toUpperCase()}</span><span>TOP SIGNAL / 01</span></div><div className="lead-grid"><h2 id="lead-story-heading">{leadTopic.title}</h2><div><p>{leadTopic.summary}</p><a className="text-link" href={`#${topicDisclosureIds(leadTopic.id).buttonId}`}>Read the signal <ArrowUpRight size={16} aria-hidden="true" /></a></div></div><div className="lead-footer"><span>{leadTopic.signal}</span><span>{leadTopic.independentSourceCount === undefined ? `Across ${leadTopic.sources.length} listed sources` : `Across ${leadTopic.independentSourceCount} independent sources`}</span><span>{leadTopic.confidence}</span></div></section>
          : <section className="lead-story"><div className="lead-kicker"><span>{reportMode === 'unavailable' ? 'OFFLINE' : 'LIVE REPORT'}</span></div><div className="lead-grid"><h2>{reportMode === 'unavailable' ? <>No report is<br /><span>available yet.</span></> : <>No cross-channel topics<br /><span>in the last 24 hours.</span></>}</h2><div><p>{reportMode === 'unavailable' ? 'The live request failed and there is no valid saved report on this device.' : 'A topic appears only when its evidence meets the report’s source and trust requirements.'}</p></div></div></section>}

      <div className="content-grid">
        <div className="topics-column">
          <div className="list-heading"><span>THE FULL READ</span><span>{filteredTopics.length} SIGNALS</span></div>
          {reportMode !== 'loading' && filteredTopics.length === 0 && <div className="empty-state">{reportMode === 'unavailable' ? 'Connect to load a live report. A valid saved report will appear here automatically after a successful visit.' : 'No signals match this view. Try another section or search term.'}</div>}
          <BriefingSections topics={filteredTopics} openTopic={openTopic} onToggle={(topicId) => setOpenTopic(openTopic === topicId ? null : topicId)} priceSnapshots={report?.priceSnapshots ?? []} />
        </div>
        <aside className="side-rail" aria-label="Report details">
          <div className="rail-card change-card"><div className="rail-label">REPORT WINDOW <Sparkles size={15} aria-hidden="true" /></div><h3>Only the latest 24 hours.</h3><p>Every confirmed topic is corroborated by independent sources. Reported single-publisher items remain explicitly labelled.</p></div>
          <SourceHealth sourceRuns={report?.sourceRuns ?? null} generatedAt={report?.generatedAt ?? null} reportMode={reportMode} />
          <div className="rail-card delivery-card"><div className="rail-label">MORNING DELIVERY</div><div className="delivery-row"><div className="delivery-icon"><Bell size={17} aria-hidden="true" /></div><div><strong>Telegram report</strong><span>Next report tomorrow at {settings.reportTime}</span></div><Check size={16} className="green-check" aria-hidden="true" /></div><button type="button" onClick={() => setShowSettings(true)} className="rail-button">Manage delivery <ArrowUpRight size={15} aria-hidden="true" /></button></div>
        </aside>
      </div>
    </main>}
    {view === 'archive' && <Archive />}
    {view === 'sources' && <Sources sourceRows={sourceRows} onAddSource={() => setShowAddSource(true)} />}
    {showSettings && <SettingsPanel initial={settings} onClose={() => setShowSettings(false)} onSave={(next) => { setSettings(next); saveSettings(next).catch(() => undefined) }} />}
    {showAddSource && <AddSourcePanel onClose={() => setShowAddSource(false)} onAdded={() => loadSources().then(setSourceRows).catch(() => undefined)} />}
    <footer className="footer"><span>signalroom / conversation intelligence</span><span>Private workspace · Europe/London</span></footer>
  </div>
}

function formatReportTime(value: string | undefined) {
  if (!value) return 'unknown time'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function Archive() { return <main className="subpage"><div className="eyebrow">REPORT LIBRARY / 30 DAYS</div><div className="subpage-header"><h1>Past signals.</h1><p>A growing record of what mattered, when it started, and how the conversation changed.</p></div><div className="archive-list">{['Sunday, August 23, 2026', 'Saturday, August 22, 2026', 'Friday, August 21, 2026', 'Thursday, August 20, 2026'].map((date, index) => <button className="archive-item" key={date}><span className="archive-date">{date}</span><strong>{index === 0 ? 'The quiet build-out of agent infrastructure' : index === 1 ? 'Crypto’s new center of gravity is distribution' : index === 2 ? 'When open models became the default starting point' : 'Payments, privacy, and programmable money'}</strong><span className="archive-count">{index + 4} signals <ArrowUpRight size={16} /></span></button>)}</div></main> }
function Sources({ sourceRows, onAddSource }: { sourceRows: Source[]; onAddSource: () => void }) { return <main className="subpage"><div className="eyebrow">YOUR SIGNAL MAP</div><div className="subpage-header sources-header"><div><h1>Sources.</h1><p>Control the rooms, feeds, and communities that shape your morning read.</p></div><button className="primary-button" onClick={onAddSource}><Plus size={16} /> Add source</button></div><div className="sources-list">{sourceRows.map((source) => <SourceRow source={source} key={source.id} />)}{!sourceRows.length && <div className="empty-state">No sources configured yet.</div>}</div></main> }
function SourceRow({ source }: { source: Source }) { const icon = source.kind === 'Telegram' ? 'TG' : source.kind === 'Reddit' ? 'r/' : source.kind === 'Threads' ? 'Th' : '𝕏'; return <div className="source-row"><div className={`source-avatar ${source.kind.toLowerCase()}`}>{icon}</div><div className="source-name"><strong>{source.name}</strong><span>{source.kind} · {source.detail}</span></div><span className={`source-status ${source.status.toLowerCase().replace(' ', '-')}`}>{source.status === 'Connected' ? <Check size={13} /> : <TriangleAlert size={13} />}{source.status}</span><span className="source-count">{source.count}</span><button className="icon-button"><SlidersHorizontal size={17} /></button></div> }
 function SettingsPanel({ initial, onClose, onSave }: { initial: SettingsState; onClose: () => void; onSave: (settings: SettingsState) => void }) { const [draft, setDraft] = useState(initial); return <div className="modal-backdrop" onClick={onClose}><section className="settings-panel" onClick={(event) => event.stopPropagation()}><div className="settings-head"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h2>Make the signal yours.</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button></div><div className="settings-section"><h3>Report schedule</h3><div className="setting-row"><div><strong>Daily report time</strong><span>Your local morning briefing</span></div><input aria-label="Daily report time" type="time" value={draft.reportTime} onChange={(event) => setDraft({ ...draft, reportTime: event.target.value })} /></div><div className="setting-row"><div><strong>Timezone</strong><span>Used to calculate the report window</span></div><select aria-label="Timezone" value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option>Europe/London</option><option>Asia/Taipei</option><option>Asia/Seoul</option><option>UTC</option></select></div></div><div className="settings-section"><h3>Delivery</h3><div className="setting-row"><div><strong>Telegram delivery</strong><span>Send the full report to your private channel</span></div><button aria-label="Toggle Telegram delivery" className={draft.telegramEnabled ? 'toggle on' : 'toggle'} onClick={() => setDraft({ ...draft, telegramEnabled: !draft.telegramEnabled })}><span /></button></div></div><div className="settings-section"><h3>AI summaries</h3><div className="setting-row"><div><strong>Summary style</strong><span>Compact editorial read with evidence</span></div><span className="setting-value">Editorial</span></div></div><div className="settings-note"><CircleHelp size={16} /><span>Live source connections are configured with environment secrets and never displayed here.</span></div><button className="save-button" onClick={() => { onSave(draft); onClose() }}>Save settings</button></section></div> }

function AddSourcePanel({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) { const [kind, setKind] = useState<'Telegram' | 'Reddit' | 'X' | 'Threads'>('Telegram'); const [name, setName] = useState(''); const [detail, setDetail] = useState(''); const [section, setSection] = useState<'crypto' | 'ai'>('crypto'); const [status, setStatus] = useState(''); const submit = async () => { if (!name.trim()) { setStatus('Name is required'); return } try { await addSource({ kind, name: name.trim(), detail: detail.trim(), section, config: kind === 'Reddit' ? { subreddit: detail.replace(/^r\//, '') } : kind === 'X' ? { query: detail } : kind === 'Telegram' ? { chatId: detail } : {} }); onAdded(); onClose() } catch { setStatus('Start the full-stack server to save sources.') } }; return <div className="modal-backdrop" onClick={onClose}><section className="settings-panel" onClick={(event) => event.stopPropagation()}><div className="settings-head"><div><div className="eyebrow">NEW SOURCE</div><h2>Add a room.</h2></div><button className="icon-button" onClick={onClose} aria-label="Close source setup"><X size={20} /></button></div><div className="source-form"><label>Platform<select value={kind} onChange={(event) => { const next = event.target.value as typeof kind; setKind(next); setSection(next === 'Telegram' ? 'crypto' : 'ai') }}><option>Telegram</option><option>Reddit</option><option>X</option><option>Threads</option></select></label><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. The Defiant" /></label><label>{kind === 'Reddit' ? 'Subreddit' : kind === 'X' ? 'Search query' : kind === 'Telegram' ? 'Channel username or chat ID' : 'Threads user ID'}<input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={kind === 'Reddit' ? 'LocalLLaMA' : kind === 'X' ? '(agents OR inference) lang:en' : kind === 'Telegram' ? '@channel' : '123456789'} /></label><label>Report section<select value={section} onChange={(event) => setSection(event.target.value as 'crypto' | 'ai')}><option value="crypto">Crypto</option><option value="ai">AI</option></select></label>{status && <p className="form-status">{status}</p>}<button className="save-button" onClick={submit}>Add source</button></div></section></div> }

export default App
