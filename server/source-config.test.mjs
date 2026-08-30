import test from 'node:test'
import assert from 'node:assert/strict'
import { safeSourceConfig } from './source-config.mjs'

test('keeps source identity metadata while discarding unapproved source config', () => {
  assert.deepEqual(safeSourceConfig({ subreddit: 'LocalLLaMA', publisherId: 'reddit', independenceKey: 'reddit', trustTier: 'community', apiKey: 'must-not-persist' }), {
    subreddit: 'LocalLLaMA', publisherId: 'reddit', independenceKey: 'reddit', trustTier: 'community',
  })
})

test('rejects blank or non-string identity metadata at the API boundary', () => {
  assert.deepEqual(safeSourceConfig({ publisherId: ' Vendor ', independenceKey: '  ', trustTier: 'PRIMARY', sourceKey: 'not-accepted', apiKey: 'must-not-persist' }), {
    publisherId: 'Vendor', trustTier: 'primary',
  })
})
