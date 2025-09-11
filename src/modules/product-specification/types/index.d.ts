export type ProductVariant = ProductSpecification['product_variants'] extends Array<infer U> ? U : string

export type ProductSpecification = {
	brand_name: string
	factory_shoes_style: string
	cust_shoes_style: string
	product_variants: ProductVariant
}
