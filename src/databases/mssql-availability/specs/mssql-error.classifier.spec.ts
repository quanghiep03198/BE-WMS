import { QueryFailedError } from 'typeorm'
import { classifyMssqlError, MssqlErrorKind } from '../mssql-error.classifier'

const mssqlError = (name: string, code?: string, number?: number): Error =>
	Object.assign(new Error(name), { name, code, number })
const queryFailed = (driverError: Error): QueryFailedError => new QueryFailedError('SELECT 1', [], driverError)

describe('classifyMssqlError', () => {
	it.each<[string, unknown, MssqlErrorKind]>([
		['connection reset', queryFailed(mssqlError('ConnectionError', 'ESOCKET')), 'suspect'],
		['connection ended', mssqlError('ConnectionError'), 'suspect'],
		['request timeout', queryFailed(mssqlError('RequestError', 'ETIMEOUT')), 'suspect'],
		['transaction aborted', mssqlError('TransactionError', 'EABORT'), 'suspect'],
		['pool acquire timeout', queryFailed(mssqlError('TimeoutError')), 'suspect'],
		['database offline', queryFailed(mssqlError('RequestError', 'EREQUEST', 942)), 'outage'],
		['transaction log full', queryFailed(mssqlError('RequestError', 'EREQUEST', 9002)), 'outage'],
		['deadlock victim', queryFailed(mssqlError('RequestError', 'EREQUEST', 1205)), 'transient'],
		['snapshot conflict', queryFailed(mssqlError('RequestError', 'EREQUEST', 3960)), 'transient'],
		['invalid object', queryFailed(mssqlError('RequestError', 'EREQUEST', 208)), 'permanent'],
		['invalid parameter', mssqlError('RequestError', 'EARGS'), 'permanent'],
		['programming error', new TypeError('invalid property'), 'permanent'],
		['duplicate key', queryFailed(mssqlError('RequestError', 'EREQUEST', 2627)), 'unknown'],
		['MongoDB network error', mssqlError('MongoNetworkError', 'ECONNRESET'), 'unknown'],
		['timeout outside TypeORM', mssqlError('TimeoutError'), 'unknown'],
		['bare socket error', Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }), 'unknown'],
		['non-error value', 'boom', 'unknown']
	])('%s', (_label, error, expected) => {
		expect(classifyMssqlError(error)).toBe(expected)
	})
})
