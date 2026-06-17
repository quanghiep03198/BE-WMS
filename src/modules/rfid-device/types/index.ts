import { RFIDDeviceEntity } from '../entities/rfid-device.entity'

export type ExtendedRFIDReaderEntity = RFIDDeviceEntity & { last_used_time: string | null }
