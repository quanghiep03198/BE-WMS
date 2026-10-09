export interface LicensePlateSnapshot {
	plate_name: string
	snap_time: Date
	images: string
}

export interface ICarLicensePlateRepository {
	/** Latest camera snapshot of the plate within [from, to]. */
	findLatestSnapshot(licensePlate: string, from: Date, to: Date): Promise<LicensePlateSnapshot | null>
}

export const CAR_LICENSE_PLATE_REPOSITORY = Symbol('ICarLicensePlateRepository')
