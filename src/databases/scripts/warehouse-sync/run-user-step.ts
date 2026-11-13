import { type mongo } from 'mongoose'
import { syncMongoUsers, type UserSource } from './mongo-users'
import { streamMssqlRows, type MssqlStreamRequest } from './mssql-stream'

const USERS_SQL = `
	SELECT a.user_code AS username, a.user_password AS password,
		b.email, b.employee_name AS display_name
	FROM syscloud_vn.dbo.ts_user AS a
	INNER JOIN syscloud_vn.dbo.ts_employee AS b ON a.employee_code = b.employee_code
	WHERE a.isactive = 'Y'
	ORDER BY a.keyid ASC, b.email COLLATE Latin1_General_100_BIN2 ASC,
		b.employee_name COLLATE Latin1_General_100_BIN2 ASC;
`

function nullableText(value: unknown): string | null {
	if (value === null) return null
	if (typeof value !== 'string') throw new Error('Invalid MSSQL user fields')
	return value
}

async function* readUsers(request: MssqlStreamRequest): AsyncGenerator<UserSource> {
	for await (const row of streamMssqlRows(request, USERS_SQL)) {
		if (!row || typeof row !== 'object') throw new Error('Invalid MSSQL user row')
		if (!('username' in row && 'password' in row && 'email' in row && 'display_name' in row)) {
			throw new Error('Incomplete MSSQL user row')
		}
		if (typeof row.username !== 'string' || typeof row.password !== 'string') {
			throw new Error('Invalid MSSQL user fields')
		}
		yield {
			username: row.username,
			password: row.password,
			email: nullableText(row.email),
			display_name: nullableText(row.display_name)
		}
	}
}

export async function runUserStep(pool: { request(): MssqlStreamRequest }, database: mongo.Db, saltRounds: number) {
	return syncMongoUsers(database, readUsers(pool.request()), saltRounds)
}
