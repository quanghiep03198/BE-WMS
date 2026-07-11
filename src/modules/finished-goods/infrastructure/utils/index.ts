type StationPrefix = 'CUS'
export type StationSuffix = 'WH101' | 'WH103'
export type StationNO = `${StationPrefix}_${string}_${StationSuffix}`

export const generateStation = (factory: string, code: StationSuffix): StationNO => {
	return `CUS_${factory}_${code}`
}
