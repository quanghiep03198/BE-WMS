export type ProductVariant = {
	color: string
	sizes: Array<Record<'size', string>>
}

export type ProductSpecification = {
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	product_variants: ProductVariant[]
}
