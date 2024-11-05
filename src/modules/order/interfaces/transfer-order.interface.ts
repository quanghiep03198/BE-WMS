export interface ITransferOrderDatalistParams {
	time_range: { from: Date; to: Date }
	customer_brand: string
	brand?: string
	factory_code: string
}
