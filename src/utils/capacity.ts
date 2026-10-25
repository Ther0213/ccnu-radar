export function normalizeCapacity(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100000 ? value : null
}

export function formatCapacity(value: unknown): string {
  const capacity = normalizeCapacity(value)
  return capacity === null ? '未注明' : `${capacity} 人`
}
