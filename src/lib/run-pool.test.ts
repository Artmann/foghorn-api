import { describe, expect, it } from 'vitest'

import { runPool } from './run-pool'

describe('runPool', () => {
  it('runs every item', async () => {
    const handled: number[] = []

    await runPool([1, 2, 3, 4, 5], { concurrency: 2 }, async (item) => {
      handled.push(item)
    })

    expect(handled.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('never runs more than `concurrency` items at once', async () => {
    let running = 0
    let maxRunning = 0

    await runPool([1, 2, 3, 4, 5, 6], { concurrency: 3 }, async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
    })

    expect(maxRunning).toEqual(3)
  })

  it('stops picking up new items once the signal aborts', async () => {
    const controller = new AbortController()
    const handled: number[] = []

    await runPool(
      [1, 2, 3, 4],
      { concurrency: 1, signal: controller.signal },
      async (item) => {
        handled.push(item)

        if (item === 2) {
          controller.abort()
        }
      }
    )

    expect(handled).toEqual([1, 2])
  })

  it('handles an empty list', async () => {
    const handled: number[] = []

    await runPool([], { concurrency: 5 }, async (item: number) => {
      handled.push(item)
    })

    expect(handled).toEqual([])
  })
})
