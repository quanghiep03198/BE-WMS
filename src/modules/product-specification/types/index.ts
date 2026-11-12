export type ProductVariant = {
	color_sn: string
	sizes: Array<string>
}

export type ProductSpecification = {
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	product_variants: ProductVariant[]
}
