import 'dotenv/config'
import mssql from 'mssql'
import { Logger } from '../../../../.tmp/utils/logger'
import { SuperJson } from '../../../common/utils/json.util'

export class MssqlManager {
	public pool: mssql.ConnectionPool | undefined
	private readonly logger: Logger = new Logger('MSSQL')

	constructor(private readonly host?: string) {}

	public async connect() {
		this.logger.info('Connecting to MSSQL ...')
		this.pool = await mssql.connect({
			user: process.env.DB_USERNAME,
			password: process.env.DB_PASSWORD,
			server: this.host ?? process.env.DB_HOST,
			port: Number(process.env.DB_PORT) || 1433,
			database: 'DV_DATA_LAKE',
			connectionTimeout: 30000,
			requestTimeout: 2 * 60000,
			options: {
				encrypt: true, // for azure
				trustServerCertificate: true // change to true for local dev / self-signed certs
			},
			pool: {
				max: 24,
				min: 5,
				idleTimeoutMillis: 30000
			}
		})
		this.logger.info('Connected to MSSQL')
	}

	public async disconnect() {
		if (this.pool) {
			this.logger.info('Disconnecting from MSSQL ...')
			await this.pool.close()
			this.logger.info('Disconnected from MSSQL')
		}
	}

	public async query<T>(
		query: string,
		params: Record<
			string,
			{
				type: (() => mssql.ISqlType) | mssql.ISqlType
				value: any
			}
		> = {}
	) {
		if (!this.pool?.connected) {
			this.logger.error('MSSQL is not connected. Please call connect() first.')
			process.exit(1)
		}

		const request = this.pool.request()

		for (const [key, { type, value }] of Object.entries(params)) {
			request.input(key, type, value)
		}

		const recordset: Array<T> = []
		const rowsAffected: number[] = []

		request.stream = true
		request.on('error', (err) => {
			this.logger.error(err)
		})

		request.on('row', (row) => {
			for (const [key, value] of Object.entries(row)) {
				if (!SuperJson.isValid(value)) {
					continue
				} else {
					row[key] = SuperJson.parse(value)
				}
			}
			recordset.push(row)
		})

		request.on('done', (result) => {
			this.logger.info(
				`Query executed successfully. ${result.rowsAffected} records affected, ${recordset.length} rows returned`
			)
		})

		await request.query<T>(query)

		return {
			getRawOne: () => recordset[0] || null,
			getRawMany: () => recordset,
			getRawCount: () => recordset.length,
			getRowsAffected: () => rowsAffected
		}
	}

	public async stream<T>(query) {}
}
