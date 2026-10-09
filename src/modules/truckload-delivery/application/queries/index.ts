import { ExportDispatchOrdersHandler } from './export-dispatch-orders/export-dispatch-orders.handler'
import { GetDispatchOrderSignatureHandler } from './get-dispatch-order-signature/get-dispatch-order-signature.handler'
import { GetDispatchOrdersHandler } from './get-dispatch-orders/get-dispatch-orders.handler'
import { SearchDispatchPurchaseOrdersHandler } from './search-dispatch-purchase-orders/search-dispatch-purchase-orders.handler'

export const TruckloadDeliveryQueryHandlers = [
	GetDispatchOrdersHandler,
	SearchDispatchPurchaseOrdersHandler,
	ExportDispatchOrdersHandler,
	GetDispatchOrderSignatureHandler
]
