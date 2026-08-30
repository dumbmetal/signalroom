import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const EMPTY_STORE = {
  settings: { reportTime: '08:00', timezone: 'Europe/London', telegramEnabled: true },
  sources: [
    { id: 'telegram-jeje', kind: 'Telegram', name: 'JeJe Crypto Diary', detail: '@JeJeCryptoDiary', section: 'crypto', enabled: true, config: { chatId: '@JeJeCryptoDiary' } },
    { id: 'telegram-mage', kind: 'Telegram', name: 'Cryptocurrency Mage', detail: '@cryptocurrencymage', section: 'crypto', enabled: true, config: { chatId: '@cryptocurrencymage' } },
    { id: 'telegram-pgyinfo', kind: 'Telegram', name: 'PGY Info', detail: '@pgyinfo', section: 'crypto', enabled: true, config: { chatId: '@pgyinfo' } },
    { id: 'telegram-degen', kind: 'Telegram', name: 'Just Degen Guy', detail: '@justdegenguy', section: 'crypto', enabled: true, config: { chatId: '@justdegenguy' } },
    { id: 'telegram-mujammin', kind: 'Telegram', name: 'Mujammin123', detail: '@mujammin123', section: 'crypto', enabled: true, config: { chatId: '@mujammin123' } },
    { id: 'reddit-localllama', kind: 'Reddit', name: 'r/LocalLLaMA', detail: 'LocalLLaMA', section: 'ai', enabled: true, config: { subreddit: 'LocalLLaMA', limit: 50 } },
    { id: 'threads-founders', kind: 'Threads', name: 'Founder signals', detail: 'Configure a Threads user ID', section: 'ai', enabled: false, config: {} },
  ],
  reports: [], lastScheduledDate: null,
}

export class JsonStore {
  constructor(file) { this.file = file; this.queue = Promise.resolve() }
  async read() {
    try { return { ...structuredClone(EMPTY_STORE), ...JSON.parse(await readFile(this.file, 'utf8')) } }
    catch (error) { if (error.code !== 'ENOENT') throw error; await this.write(EMPTY_STORE); return structuredClone(EMPTY_STORE) }
  }
  async write(data) {
    this.queue = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.tmp`
      await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
      await rename(temp, this.file)
    })
    return this.queue
  }
  async update(mutator) { const data = await this.read(); const next = await mutator(data) || data; await this.write(next); return next }
}
