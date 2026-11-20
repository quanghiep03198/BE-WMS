import { RFIDDeviceType } from '../constants'

export interface IRFIDDevice {
	_id: TObjectId
	device_name: {
		vi?: string
		en?: string
		cn?: string
	}
	station_no: string
	tcp_ip: string
	tcp_port: string
	device_sn: string
	device_type: RFIDDeviceType
	last_used_at?: Date
	created_by: TObjectId
	updated_by?: TObjectId
	created_at: Date
	updated_at?: Date
}
