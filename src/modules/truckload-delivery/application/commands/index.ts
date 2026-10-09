import { CreateDispatchOrderHandler } from './create-dispatch-order/create-dispatch-order.handler'
import { DeleteDispatchOrderHandler } from './delete-dispatch-order/delete-dispatch-order.handler'
import { RemovePurchaseOrderHandler } from './remove-purchase-order/remove-purchase-order.handler'
import { ResolveLicensePlateCaptureHandler } from './resolve-license-plate-capture/resolve-license-plate-capture.handler'
import { SignDispatchOrderHandler } from './sign-dispatch-order/sign-dispatch-order.handler'
import { SyncDispatchOrderToMssqlHandler } from './sync-dispatch-order-to-mssql/sync-dispatch-order-to-mssql.handler'
import { UpdateContainerConditionHandler } from './update-container-condition/update-container-condition.handler'
import { UpdateDispatchOrderHandler } from './update-dispatch-order/update-dispatch-order.handler'
import { UpsertPurchaseOrdersHandler } from './upsert-purchase-orders/upsert-purchase-orders.handler'

export const TruckloadDeliveryCommandHandlers = [
	CreateDispatchOrderHandler,
	UpdateDispatchOrderHandler,
	UpsertPurchaseOrdersHandler,
	RemovePurchaseOrderHandler,
	DeleteDispatchOrderHandler,
	SignDispatchOrderHandler,
	UpdateContainerConditionHandler,
	ResolveLicensePlateCaptureHandler,
	SyncDispatchOrderToMssqlHandler
]
