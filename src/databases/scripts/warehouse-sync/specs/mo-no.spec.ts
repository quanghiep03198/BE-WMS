import { isEligibleMoNo } from '../mo-no'

describe('isEligibleMoNo', () => {
	it.each([
		['13ABC', false],
		['14ABC', true],
		['99ABC', true],
		['A4ABC', false],
		['1ABC', false],
		['', false]
	])('returns expected eligibility for MO %s', (moNo, eligible) => {
		expect(isEligibleMoNo(moNo)).toBe(eligible)
	})
})
