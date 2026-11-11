import { ManifestService } from '../manifest/manifest.service'

describe('ManifestService', () => {
	it('returns pagination metadata and hides the internal cursor', async () => {
		const repository = {
			count: jest.fn().mockResolvedValue(1),
			page: jest.fn().mockResolvedValue([{ cursor_id: 25, po: 'PO123' }])
		}
		const service = new ManifestService(repository as never)
		const filter = { page: 1, pageSize: 20 }
		await expect(service.getList('VA1', filter)).resolves.toEqual({
			items: [{ po: 'PO123' }],
			total: 1,
			page: 1,
			pageSize: 20
		})
	})
})
