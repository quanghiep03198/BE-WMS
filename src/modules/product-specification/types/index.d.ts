export type ProductSpecification = {
	brand_name: string
	product_variants: Array<{
		shoes_styles: string
		colors: Array<{ color_sn: string }>
	}>
}
