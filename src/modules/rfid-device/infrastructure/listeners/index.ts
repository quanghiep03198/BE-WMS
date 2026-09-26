import { CreatedRFIDDeviceListener } from './created-rfid-device.listener'
import { DeletedRFIDDevicesListener } from './deleted-rfid-devices.listener'
import { UpdateLastUseTimeListener } from './update-last-use-time.listener'
import { UpdatedRFIDDeviceListener } from './updated-rfid-device.listener'

export const RFIDDeviceListeners = [
	CreatedRFIDDeviceListener,
	UpdatedRFIDDeviceListener,
	DeletedRFIDDevicesListener,
	UpdateLastUseTimeListener
]
