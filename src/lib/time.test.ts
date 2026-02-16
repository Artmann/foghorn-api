import { describe, expect, it } from 'vitest'

import { timestampToDateTime } from './time'

describe('timestampToDateTime', () => {
  it('converts a known timestamp to correct ISO 8601 string', () => {
    expect(timestampToDateTime(1705320600000)).toEqual(
      '2024-01-15T12:10:00.000Z'
    )
  })

  it('handles epoch zero', () => {
    expect(timestampToDateTime(0)).toEqual('1970-01-01T00:00:00.000Z')
  })

  it('preserves millisecond precision', () => {
    expect(timestampToDateTime(1705320600123)).toEqual(
      '2024-01-15T12:10:00.123Z'
    )
  })
})
