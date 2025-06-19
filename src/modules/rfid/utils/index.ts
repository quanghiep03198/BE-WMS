export const generateStation = (factory, code: 'WH101' | 'WH103', prefix?: string) => {
	return [(prefix ??= 'CUS'), factory, code].join('_')
}
