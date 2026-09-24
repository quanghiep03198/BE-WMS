import { CreatedStorageLocationsListener } from './created-storage-location.listener'
import { CreatedWarehouseListener } from './created-warehouse.listener'
import { DeletedStorageLocationsListener } from './deleted-storage-locations.listener'
import { DeletedWarehouseListener } from './deleted-warehouse.listener'
import { UpdatedStorageLocationListener } from './updated-storage-location.listener'
import { UpdatedWarehouseListener } from './updated-warehouse.listener'

export const WarehouseListeners = [
	CreatedWarehouseListener,
	UpdatedWarehouseListener,
	DeletedWarehouseListener,
	CreatedStorageLocationsListener,
	UpdatedStorageLocationListener,
	DeletedStorageLocationsListener
]
