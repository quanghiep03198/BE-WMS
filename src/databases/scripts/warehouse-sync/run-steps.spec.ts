import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runSteps } from './run-steps'

describe('runSteps', () => {
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
			expect(log).toContain('NOT_RUN departments')
			expect(terminal.join('\n')).toBe(log.trimEnd())
		} finally {
			await rm(filename, { force: true })
			await rmdir(directory)
		}
	})
})
