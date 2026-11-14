export function isEligibleMoNo(moNo: string): boolean {
	const prefix = moNo.slice(0, 2)
	return /^\d{2}$/.test(prefix) && Number(prefix) >= 14
}
