import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export function getVietnamDayCutoff(now: Date): Date {
	if (!Number.isFinite(now.getTime())) throw new Error('Invalid cutoff date')
	const timezone = 'Asia/Ho_Chi_Minh'
	const date = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
	return fromZonedTime(`${date}T00:00:00`, timezone)
}

export function getVietnamNoonCutoff(now: Date): Date {
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid cutoff date')
	const timezone = 'Asia/Ho_Chi_Minh'
	const date = formatInTimeZone(now, timezone, 'yyyy-MM-dd')
	return fromZonedTime(`${date}T12:00:00`, timezone)
}

export function getVietnamCutoffSqlDate(cutoff: Date): string {
	if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) throw new Error('Invalid cutoff date')
	if (getVietnamDayCutoff(cutoff).getTime() !== cutoff.getTime()) {
		throw new Error('Cutoff must be midnight in Vietnam')
	}
	return formatInTimeZone(cutoff, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd')
}
