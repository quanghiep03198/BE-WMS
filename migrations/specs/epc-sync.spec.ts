import mssql from 'mssql'
import { parseEpcSyncArgs } from '../commands/epc-sync-args'
import { localEpcMongoUri, openEpcSyncConnections, runEpcSyncCli } from '../epc-sync'

const required = ['--db-host', 'sql.example', '--mongo-db', 'warehouse']
describe('standalone EPC sync', () => {
	let config: Record<string, string | undefined>

	beforeEach(() => {
		config = {
			DB_USERNAME: 'test_user',
			DB_PASSWORD: 'test_password',
			DB_PORT: '1435',
			DB_CONNECTION_TIMEOUT: '45000',
			DB_TRUST_SERVER_CERTIFICATE: 'true',
			MONGO_URI: 'mongodb://127.0.0.1:27017',
			DEVICE_SN_101: 'IN',
			DEVICE_SN_103: 'OUT'
		}
	})

	it('uses the requested host and environment credentials and port for MSSQL', async () => {
		const pool = jest.spyOn(mssql, 'ConnectionPool').mockImplementation(() => {
			throw new Error('connection boundary')
		})
		try {
			await expect(openEpcSyncConnections(parseEpcSyncArgs(required), config)).rejects.toThrow('connection boundary')
			const poolConfig = pool.mock.calls[0][0]
			expect(
				typeof poolConfig !== 'string' &&
					poolConfig.server === 'sql.example' &&
					poolConfig.port === 1435 &&
					poolConfig.connectionTimeout === 45000
			).toBe(true)
			expect(
				typeof poolConfig !== 'string' && poolConfig.user === 'test_user' && poolConfig.password === 'test_password'
			).toBe(true)
		} finally {
			pool.mockRestore()
		}
	})

	it('rejects missing credentials and non-local MongoDB before connecting', async () => {
		const pool = jest.spyOn(mssql, 'ConnectionPool')
		const inheritedPassword = process.env.DB_PASSWORD
		try {
			process.env.DB_PASSWORD = 'inherited-password'
			delete config.DB_PASSWORD
			await expect(openEpcSyncConnections(parseEpcSyncArgs(required), config)).rejects.toThrow(/DB_PASSWORD/)
			config.DB_PASSWORD = 'test_password'
			config.MONGO_URI = 'mongodb://remote.example:27017'
			await expect(openEpcSyncConnections(parseEpcSyncArgs(required), config)).rejects.toThrow(/local/i)
			expect(pool).not.toHaveBeenCalled()
		} finally {
			if (inheritedPassword === undefined) delete process.env.DB_PASSWORD
			else process.env.DB_PASSWORD = inheritedPassword
			pool.mockRestore()
		}
	})

	it.each([
		'mongodb://localhost.evil.example:27017',
		'mongodb+srv://localhost',
		'mongodb://localhost:27017,remote.example:27017',
		'mongodb://127.0.0.1:27017/?directConnection=false'
	])('rejects unsafe MongoDB URI %s', (uri) => {
		config.MONGO_URI = uri
		expect(() => localEpcMongoUri(config)).toThrow(/local/i)
	})

	it('forces a direct local MongoDB connection', () => {
		config.MONGO_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
		const uri = new URL(localEpcMongoUri(config))
		expect(uri.hostname).toBe('127.0.0.1')
		expect(uri.searchParams.get('directConnection')).toBe('true')
	})

	it('runs match before EPC using device serials from the environment', async () => {
		config.DB_HOST = 'file-host'
		config.MONGO_DB_NAME = 'file-db'
		const match = jest.fn(async () => ({ epcMatches: 0 }))
		const epc = jest.fn(async () => ({ epcs: 0 }))
		const close = jest.fn(async () => undefined)
		const connect = jest.fn(async () => ({ pool: {} as never, database: {} as never, close, match, epc }))
		await expect(runEpcSyncCli([], connect, () => config)).resolves.toBe(0)
		expect(connect).toHaveBeenCalledWith(
			expect.objectContaining({ dbHost: 'file-host', mongoDatabase: 'file-db' }),
			config
		)
		expect(match.mock.invocationCallOrder[0]).toBeLessThan(epc.mock.invocationCallOrder[0])
		expect(epc).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ inboundDeviceSn: 'IN', outboundDeviceSn: 'OUT' })
		)
		expect(close).toHaveBeenCalledTimes(1)
	})

	it('does not start either stage when the device serials are missing', async () => {
		delete config.DEVICE_SN_103
		const connect = jest.fn()
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		try {
			await expect(runEpcSyncCli(required, connect, () => config)).resolves.toBe(1)
			expect(connect).not.toHaveBeenCalled()
		} finally {
			error.mockRestore()
		}
	})

	it('reports missing migration configuration before connecting', async () => {
		const connect = jest.fn()
		const error = jest.spyOn(console, 'error').mockImplementation(() => {})
		try {
			await expect(
				runEpcSyncCli(required, connect, () => {
					throw new Error('Missing migrations/.env')
				})
			).resolves.toBe(1)
			expect(connect).not.toHaveBeenCalled()
		} finally {
			error.mockRestore()
		}
	})

	it('prints help without accessing configuration or databases', async () => {
		const connect = jest.fn()
		const output = jest.spyOn(console, 'log').mockImplementation(() => {})
		try {
			await expect(runEpcSyncCli(['--help'], connect)).resolves.toBe(0)
			expect(connect).not.toHaveBeenCalled()
		} finally {
			output.mockRestore()
		}
	})

	it('passes tuning settings to a selected match stage', async () => {
		const match = jest.fn(async () => ({ epcMatches: 0 }))
		const close = jest.fn(async () => undefined)
		const connect = jest.fn(async () => ({ pool: {} as never, database: {} as never, close, match, epc: jest.fn() }))
		await expect(
			runEpcSyncCli(
				[...required, '--stage', 'match', '--batch-size', '1000', '--chunk-size', '4000', '--concurrency', '2'],
				connect,
				() => config
			)
		).resolves.toBe(0)
		expect(match).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
			batchSize: 1000,
			chunkSize: 4000,
			concurrency: 2,
			writeMode: 'upsert'
		})
	})
})
