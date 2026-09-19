import { describe, expect, it } from 'vitest'
import { backupFilename } from './backup'

describe('backupFilename', () => {
  it('stamps the export with the given local date', () => {
    expect(backupFilename('2026-09-19')).toBe('tracker-export-2026-09-19.json')
  })
})
