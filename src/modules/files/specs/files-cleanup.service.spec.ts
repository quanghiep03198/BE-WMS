import { cleanupEligibility } from '../files-cleanup.service'

describe('cleanupEligibility', () => {
	it('requires no refs and applies configured pending and orphan thresholds', () => {
		const now = new Date('2026-01-10T12:00:00Z')
		expect(cleanupEligibility(now, 24, 7)).toEqual({
			refs: { $size: 0 },
			$or: [
				{ status: 'pending', created_at: { $lt: new Date('2026-01-09T12:00:00Z') } },
				{ orphaned_at: { $lt: new Date('2026-01-03T12:00:00Z') } }
			]
		})
	})
})
