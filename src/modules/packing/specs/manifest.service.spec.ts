import { ManifestService } from '../services/manifest.service'

describe('ManifestService', () => {
	it('returns the shared pagination shape and hides the internal cursor', async () => {
		const repository = {
			count: jest.fn().mockResolvedValue(1),
			page: jest.fn().mockResolvedValue([{ cursor_id: 25, po: 'PO123' }])
		}
		const service = new ManifestService(repository as never)
		const filter = { page: 1, pageSize: 20 }
		await expect(service.getList('VA1', filter)).resolves.toEqual({
			data: [{ po: 'PO123' }],
			totalDocs: 1,
			totalPages: 1,
			hasNextPage: false,
			hasPrevPage: false,
			nextPage: null,
			prevPage: null,
			page: 1,
			limit: 20
		})
	})

	it('starts the page query without waiting for count', async () => {
		let resolveCount!: (value: number) => void
		const repository = {
			count: jest.fn().mockReturnValue(new Promise<number>((resolve) => (resolveCount = resolve))),
			page: jest.fn().mockResolvedValue([])
		}
		const result = new ManifestService(repository as never).getList('VA1', { page: 1, pageSize: 20 })
		expect(repository.page).toHaveBeenCalledTimes(1)
		resolveCount(0)
		await result
	})
})
