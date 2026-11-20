import type { SizeNumber } from '../value-objects/size-number.vo'

export type MoSizeProgress = {
	size_numcode: SizeNumber
	order_qty: number
	instock_qty: number
	shipped_out_qty: number
}

export function isValidMoSizeProgress(
	progress: MoSizeProgress | undefined,
	intakeDelta: number,
	shipmentDelta = 0
): boolean {
	if (!progress || !Number.isFinite(progress.order_qty)) return false

	const effectiveIntake = progress.instock_qty + progress.shipped_out_qty + intakeDelta
	const shippedOut = progress.shipped_out_qty + shipmentDelta
	return shippedOut >= 0 && shippedOut <= effectiveIntake && effectiveIntake <= progress.order_qty
}
