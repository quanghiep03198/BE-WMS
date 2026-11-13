import { PassThrough } from 'node:stream'
import { askContinueAfterFailure, runWarehouseSyncCli, type WarehouseSyncManagers } from '../run'
import { runWarehouseSync } from '../run-warehouse-sync'

jest.mock('../run-warehouse-sync', () => ({
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

	it('rejects unknown step names before connecting', async () => {
		await expect(runWarehouseSyncCli([...validArgs, '--step', 'missing'], createManagers)).resolves.toBe(1)
		expect(createManagers).not.toHaveBeenCalled()
	})

	it('enables the continuation prompt only when both streams are terminals', async () => {
		const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
		const stdoutTty = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
		try {
			Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })
			Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
			await expect(runWarehouseSyncCli([...validArgs, '--step', 'users'], createManagers)).resolves.toBe(0)
			expect(jest.mocked(runWarehouseSync).mock.calls[0][2]).toMatchObject({ step: 'users' })
			expect(jest.mocked(runWarehouseSync).mock.calls[0][4]).toEqual(expect.any(Function))

			Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false })
			await expect(runWarehouseSyncCli(validArgs, createManagers)).resolves.toBe(0)
			expect(jest.mocked(runWarehouseSync).mock.calls[1][4]).toBeUndefined()
		} finally {
			if (stdinTty) Object.defineProperty(process.stdin, 'isTTY', stdinTty)
			else Reflect.deleteProperty(process.stdin, 'isTTY')
			if (stdoutTty) Object.defineProperty(process.stdout, 'isTTY', stdoutTty)
			else Reflect.deleteProperty(process.stdout, 'isTTY')
		}
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

	describe('askContinueAfterFailure', () => {
		it('asks again after an invalid answer and accepts y', async () => {
			const input = new PassThrough()
			const output = new PassThrough()
			let text = ''
			output.on('data', (chunk) => { text += chunk.toString() })
			const answer = askContinueAfterFailure(input, output)
			setImmediate(() => {
				input.write('invalid\n')
				setImmediate(() => input.write('Y\n'))
			})
			await expect(answer).resolves.toBe(true)
			expect(text).toMatch(/y\/n/i)
			input.destroy()
			output.destroy()
		})

		it('stops if input closes without an answer', async () => {
			const input = new PassThrough()
			const output = new PassThrough()
			const answer = askContinueAfterFailure(input, output)
			setImmediate(() => input.end())
			await expect(answer).resolves.toBe(false)
			output.destroy()
		})

		it('stops when the user answers n', async () => {
			const input = new PassThrough()
			const output = new PassThrough()
			const answer = askContinueAfterFailure(input, output)
			setImmediate(() => input.write('n\n'))
			await expect(answer).resolves.toBe(false)
			input.destroy()
			output.destroy()
		})
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
