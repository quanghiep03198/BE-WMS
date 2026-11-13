import { getVietnamCutoffSqlDate, getVietnamDayCutoff, getVietnamNoonCutoff } from '../cutoff'

describe('getVietnamDayCutoff', () => {
	it('uses midnight Vietnam time rather than midnight UTC', () => {
		expect(getVietnamDayCutoff(new Date('2026-11-11T16:59:59.999Z')).toISOString()).toBe('2026-11-10T17:00:00.000Z')
		expect(getVietnamDayCutoff(new Date('2026-11-11T17:00:00.000Z')).toISOString()).toBe('2026-11-11T17:00:00.000Z')
	})

	describe('getVietnamCutoffSqlDate', () => {
		it('converts an exclusive Vietnam midnight cutoff to a local SQL date', () => {
			expect(getVietnamCutoffSqlDate(new Date('2026-11-11T17:00:00.000Z'))).toBe('2026-11-12')
		})

		describe('getVietnamNoonCutoff', () => {
			it('chooses 12:00 on the current Vietnam calendar day', () => {
				expect(getVietnamNoonCutoff(new Date('2026-11-11T16:59:59Z')).toISOString()).toBe(
					'2026-11-11T05:00:00.000Z'
				)
				expect(getVietnamNoonCutoff(new Date('2026-11-11T17:00:00Z')).toISOString()).toBe(
					'2026-11-12T05:00:00.000Z'
				)
			})

			it('rejects invalid dates', () => {
				expect(() => getVietnamNoonCutoff(new Date('invalid'))).toThrow()
			})
		})

		it('rejects instants other than Vietnam midnight', () => {
			expect(() => getVietnamCutoffSqlDate(new Date('2026-11-11T17:00:01.000Z'))).toThrow()
			expect(() => getVietnamCutoffSqlDate(new Date('invalid'))).toThrow()
		})
	})

	it('rejects invalid dates', () => {
		expect(() => getVietnamDayCutoff(new Date('invalid'))).toThrow()
	})
})
