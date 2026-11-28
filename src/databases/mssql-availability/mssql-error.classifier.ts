import { QueryFailedError } from 'typeorm'

export type MssqlErrorKind = 'outage' | 'suspect' | 'transient' | 'permanent' | 'unknown'

const OUTAGE: ReadonlySet<number> = new Set([
	921, 922, 923, 924, 927, 942, 945, 946, 948, 952, 976, 983, 1105, 3906, 4060, 4064, 6005, 9001, 9002, 17142
])
const TRANSIENT: ReadonlySet<number> = new Set([701, 1204, 1205, 1222, 3960, 3961, 8645, 8651])
const PERMANENT: ReadonlySet<number> = new Set([
	102, 105, 137, 156, 201, 207, 208, 229, 230, 241, 242, 245, 515, 2628, 2812, 8114, 8115, 8134, 8152, 13609
])

export function classifyMssqlError(error: unknown): MssqlErrorKind {
	if (
		error instanceof TypeError ||
		error instanceof ReferenceError ||
		error instanceof RangeError ||
		error instanceof SyntaxError
	) {
		return 'permanent'
	}

	const wrapped = error instanceof QueryFailedError
	const driver: unknown = wrapped ? error.driverError : error
	if (typeof driver !== 'object' || driver === null) return 'unknown'
	const details = driver as { name?: unknown; code?: unknown; number?: unknown }
	if (details.name === 'ConnectionError' || details.name === 'TransactionError') return 'suspect'
	if (details.name === 'TimeoutError' && wrapped) return 'suspect'
	if (details.name !== 'RequestError') return 'unknown'
	if (['ETIMEOUT', 'ECANCEL', 'ENOCONN', 'ECLOSE', 'EINVALIDSTATE'].includes(String(details.code))) return 'suspect'
	if (['EARGS', 'EINJECT', 'EPARAM', 'EDUPEPARAM', 'ENAME', 'EJSON'].includes(String(details.code))) return 'permanent'
	if (details.code !== 'EREQUEST') return 'unknown'

	const number = Number(details.number)
	if (OUTAGE.has(number)) return 'outage'
	if (TRANSIENT.has(number)) return 'transient'
	if (PERMANENT.has(number)) return 'permanent'
	return 'unknown'
}
