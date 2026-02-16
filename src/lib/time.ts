export function timestampToDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString()
}
