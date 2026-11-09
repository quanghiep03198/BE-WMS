import { BadRequestException } from '@nestjs/common'
import { FilesService } from './files.service'

jest.mock('file-type/node', () => ({ fileTypeStream: jest.fn() }))

describe('syncImageRefs', () => {
	const id1 = '0123456789abcdef01234567'
	const id2 = '0123456789abcdef01234568'
	const session = {} as never
	const model = { updateMany: jest.fn() }
	const service = new FilesService(null, model as never)

	beforeEach(() => {
		model.updateMany.mockReset()
		model.updateMany.mockResolvedValue({ matchedCount: 1 })
	})

	it('adds only new refs and orphans removed refs only if empty', async () => {
		await service.syncImageRefs('defective-goods:owner', [id1, id1], [id2, id2], session)
		expect(model.updateMany).toHaveBeenCalledTimes(3)
		expect(model.updateMany.mock.calls[0][1]).toEqual({
			$addToSet: { refs: 'defective-goods:owner' },
			$set: { status: 'attached' },
			$unset: { orphaned_at: 1 }
		})
		expect(model.updateMany.mock.calls[1][1]).toEqual({ $pull: { refs: 'defective-goods:owner' } })
		expect(model.updateMany.mock.calls[2][0]).toMatchObject({ refs: { $size: 0 } })
	})

	it('rejects missing or claimed files', async () => {
		model.updateMany.mockResolvedValueOnce({ matchedCount: 0 })
		await expect(service.syncImageRefs('owner', [], [id1], session)).rejects.toBeInstanceOf(BadRequestException)
		expect(model.updateMany).toHaveBeenCalledTimes(1)
	})

	it('does nothing for unchanged refs', async () => {
		await service.syncImageRefs('owner', [id1], [id1], session)
		expect(model.updateMany).not.toHaveBeenCalled()
	})
})
