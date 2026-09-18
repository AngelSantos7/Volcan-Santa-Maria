export type Period = 'today' | 'week' | 'month' | 'custom'

export interface DateRange {
  fromDate: string
  toDate: string
  from: string
  to: string
}

const GUATEMALA_OFFSET = '-06:00'

function dateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function formatDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

export function addDays(value: string, days: number) {
  const { year, month, day } = dateParts(value)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

export function guatemalaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function rangeForPeriod(period: Exclude<Period, 'custom'>): DateRange {
  const today = guatemalaToday()
  const { year, month, day } = dateParts(today)
  let fromDate = today
  let toDate = today
  if (period === 'week') {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    fromDate = addDays(today, -(weekday === 0 ? 6 : weekday - 1))
    toDate = addDays(fromDate, 6)
  }
  if (period === 'month') {
    fromDate = formatDate(year, month, 1)
    const lastDay = new Date(Date.UTC(year, month, 0))
    toDate = formatDate(lastDay.getUTCFullYear(), lastDay.getUTCMonth() + 1, lastDay.getUTCDate())
  }
  return toHalfOpenRange(fromDate, toDate)
}

export function toHalfOpenRange(fromDate: string, inclusiveToDate: string): DateRange {
  return {
    fromDate,
    toDate: inclusiveToDate,
    from: `${fromDate}T00:00:00${GUATEMALA_OFFSET}`,
    to: `${addDays(inclusiveToDate, 1)}T00:00:00${GUATEMALA_OFFSET}`,
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('es-GT', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00Z`))
}
