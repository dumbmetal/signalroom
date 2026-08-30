import { TopicRow } from './TopicRow'
import { groupBriefingTopics } from '../briefing-view'
import type { PriceObservation, Topic } from '../types'

interface BriefingSectionsProps {
  topics: Topic[]
  openTopic: string | null
  onToggle: (topicId: string) => void
  priceSnapshots: PriceObservation[]
}

export function BriefingSections({ topics, openTopic, onToggle, priceSnapshots }: BriefingSectionsProps) {
  const cryptoTopics = topics.filter((topic) => topic.section === 'crypto')
  const aiGroups = groupBriefingTopics(topics.filter((topic) => topic.section === 'ai'))

  return <>
    {cryptoTopics.length > 0 && <section className="topic-group" aria-labelledby="crypto-conversations-heading">
      <h2 className="group-heading crypto" id="crypto-conversations-heading"><span className="group-dot" aria-hidden="true" /> Crypto conversations<span className="group-line" aria-hidden="true" /></h2>
      {cryptoTopics.map((topic) => <TopicRow topic={topic} open={openTopic === topic.id} onToggle={() => onToggle(topic.id)} priceSnapshots={priceSnapshots} key={topic.id} />)}
    </section>}

    {aiGroups.map((group) => <section className={`topic-group briefing-lane ${group.id}`} aria-labelledby={`${group.id}-heading`} key={group.id}>
      <header className="lane-heading">
        <h2 className="group-heading ai" id={`${group.id}-heading`}><span className="group-dot" aria-hidden="true" /> {group.title}<span className="group-line" aria-hidden="true" /></h2>
        <p>{group.description}</p>
      </header>
      {group.topics.map((topic) => <TopicRow topic={topic} open={openTopic === topic.id} onToggle={() => onToggle(topic.id)} priceSnapshots={priceSnapshots} key={topic.id} />)}
    </section>)}
  </>
}
