import { sleep } from './sleep'

interface RunPoolOptions {
  concurrency: number
  // Pause between items handled by the same worker.
  delayMs?: number
  // Stops workers from picking up new items. Items already started finish.
  signal?: AbortSignal
}

export async function runPool<T>(
  items: T[],
  { concurrency, delayMs = 0, signal }: RunPoolOptions,
  task: (item: T) => Promise<void>
): Promise<void> {
  let index = 0

  async function worker(): Promise<void> {
    let isFirst = true

    while (index < items.length && !signal?.aborted) {
      if (!isFirst && delayMs > 0) {
        await sleep(delayMs, signal)

        if (signal?.aborted) {
          return
        }
      }

      isFirst = false

      const item = items[index++]

      await task(item)
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}
