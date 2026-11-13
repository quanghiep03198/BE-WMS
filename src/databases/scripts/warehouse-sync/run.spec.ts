import { runWarehouseSyncCli, type WarehouseSyncManagers } from './run'
import { runWarehouseSync } from './run-warehouse-sync'

jest.mock('./run-warehouse-sync', () => ({
	runWarehouseSync: jest.fn()
}))

describe('runWarehouseSyncCli', () => {
	const previousEnv = {
		DB_HOST: process.env.DB_HOST,
		MONGO_DB_NAME: process.env.MONGO_DB_NAME,
		APP_TENANCY: process.env.APP_TENANCY
	}
	let managers: WarehouseSyncManagers
	let createManagers: jest.Mock
	let errorSpy: jest.SpyInstance
	let logSpy: jest.SpyInstance

	const validArgs = ['--mo-prefix', '15', '--inbound-device-sn', 'in-1', '--outbound-device-sn', 'out-1']

	beforeEach(() => {
		process.env.DB_HOST = 'mssql.local'
		process.env.MONGO_DB_NAME = 'warehouse'
		process.env.APP_TENANCY = 'GL3'
		managers = {
			mssql: {
				connect: jest.fn().mockResolvedValue(undefined),
				disconnect: jest.fn().mockResolvedValue(undefined),
				pool: {}
			},
			mongo: {
				connect: jest.fn().mockResolvedValue(undefined),
				disconnect: jest.fn().mockResolvedValue(undefined),
				getDatabase: jest.fn().mockReturnValue({})
			}
		}
		createManagers = jest.fn().mockReturnValue(managers)
		jest.mocked(runWarehouseSync).mockReset().mockResolvedValue(undefined)
		errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
	})

	afterEach(() => {
		for (const [key, value] of Object.entries(previousEnv)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		errorSpy.mockRestore()
		logSpy.mockRestore()
	})

	it('shows help without constructing or connecting database managers', async () => {
		await expect(runWarehouseSyncCli(['--help'], createManagers)).resolves.toBe(0)
		expect(createManagers).not.toHaveBeenCalled()
		expect(logSpy).toHaveBeenCalled()
	})

	it('validates required input before constructing managers', async () => {
		await expect(runWarehouseSyncCli(['--mo-prefix', '15'], createManagers)).resolves.toBe(1)
		expect(createManagers).not.toHaveBeenCalled()
		expect(errorSpy).toHaveBeenCalled()
	})

	it('returns non-zero and disconnects attempted clients when a connection fails', async () => {
		jest.mocked(managers.mongo.connect).mockRejectedValueOnce(new Error('mongo unavailable'))

		await expect(runWarehouseSyncCli(validArgs, createManagers)).resolves.toBe(1)

		expect(managers.mssql.connect).toHaveBeenCalledTimes(1)
		expect(managers.mongo.connect).toHaveBeenCalledTimes(1)
		expect(managers.mssql.disconnect).toHaveBeenCalledTimes(1)
		expect(managers.mongo.disconnect).toHaveBeenCalledTimes(1)
		expect(runWarehouseSync).not.toHaveBeenCalled()
		expect(errorSpy).toHaveBeenCalled()
	})

	it('returns non-zero and disconnects both managers when the workflow fails', async () => {
		jest.mocked(runWarehouseSync).mockRejectedValueOnce(new Error('sync failed'))

		await expect(runWarehouseSyncCli(validArgs, createManagers)).resolves.toBe(1)

		expect(managers.mssql.connect).toHaveBeenCalledTimes(1)
		expect(managers.mongo.connect).toHaveBeenCalledTimes(1)
		expect(runWarehouseSync).toHaveBeenCalledTimes(1)
		expect(managers.mssql.disconnect).toHaveBeenCalledTimes(1)
		expect(managers.mongo.disconnect).toHaveBeenCalledTimes(1)
		expect(errorSpy).toHaveBeenCalled()
	})
})
