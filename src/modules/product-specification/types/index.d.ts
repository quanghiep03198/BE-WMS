export type ProductVariant = ProductSpecification['product_variants'] extends Array<infer U> ? U : never

export type ProductSpecification = {
	brand_name: string
	shoes_style: string
	product_variants: ProductVariant
}
