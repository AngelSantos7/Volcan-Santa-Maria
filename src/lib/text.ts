export function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
