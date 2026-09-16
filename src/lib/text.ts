export function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').normalize('NFC');
}
