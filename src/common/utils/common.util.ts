export const isPrimitive = (value: any): boolean => {
	return (typeof value !== 'object' && typeof value !== 'function') || value === null
}
