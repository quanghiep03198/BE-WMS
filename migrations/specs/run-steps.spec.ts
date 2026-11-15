import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runSteps } from '../commands/run-steps'

describe('runSteps', () => {
	it('continues after an accepted failure but still reports the failure at the end', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-sync-log-'))
		const filename = path.join(directory, 'sync.log')
		const executed: string[] = []
		const shouldContinue = jest.fn(async () => true)
		try {
			await expect(
				runSteps(
					[
						{
							name: 'users',
							run: async () => {
								throw new Error('users failed')
							}
						},
						{ name: 'warehouses', run: async () => void executed.push('warehouses') }
					],
					filename,
					() => {},
					shouldContinue
				)
			).rejects.toThrow('users failed')
			expect(shouldContinue).toHaveBeenCalledTimes(1)
			expect(executed).toEqual(['warehouses'])
			const log = await readFile(filename, 'utf8')
			expect(log).toContain('FAIL users: users failed')
			expect(log).toContain('DONE warehouses')
			expect(log).not.toContain('NOT RUN warehouses')
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})

	it('stops and marks remaining steps when continuation is declined', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-sync-log-'))
		const filename = path.join(directory, 'sync.log')
		const executed: string[] = []
		const shouldContinue = jest.fn(async () => false)
		try {
			await expect(
				runSteps(
					[
						{
							name: 'users',
							run: async () => {
								throw new Error('users failed')
							}
						},
						{ name: 'warehouses', run: async () => void executed.push('warehouses') }
					],
					filename,
					() => {},
					shouldContinue
				)
			).rejects.toThrow('users failed')
			expect(shouldContinue).toHaveBeenCalledTimes(1)
			expect(executed).toEqual([])
			expect(await readFile(filename, 'utf8')).toContain('NOT RUN warehouses')
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})

	it('does not ask to continue when the last step fails', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-sync-log-'))
		const filename = path.join(directory, 'sync.log')
		try {
			await expect(
				runSteps(
					[
						{
							name: 'users',
							run: async () => {
								throw new Error('users failed')
							}
						}
					],
					filename,
					() => {}
				)
			).rejects.toThrow('users failed')
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})

	it('logs completed and failed steps to terminal and file, then stops', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'warehouse-sync-log-'))
		const filename = path.join(directory, 'sync.log')
		const terminal: string[] = []
		const executed: string[] = []
		try {
			await expect(
				runSteps(
					[
						{ name: 'users', run: async () => void executed.push('users') },
						{
							name: 'warehouses',
							run: async () => {
								throw new Error('test failure')
							}
						},
						{ name: 'departments', run: async () => void executed.push('departments') }
					],
					filename,
					(line) => terminal.push(line)
				)
			).rejects.toThrow('test failure')
			expect(executed).toEqual(['users'])
			const log = await readFile(filename, 'utf8')
			expect(log).toContain('START users')
			expect(log).toContain('DONE users')
			expect(log).toContain('FAIL warehouses')
			expect(log).toContain('test failure')
			expect(log).toContain('NOT RUN departments')
			expect(terminal.join('\n')).toBe(log.trimEnd())
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})
})
