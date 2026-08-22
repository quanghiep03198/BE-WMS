import { GetArchivedEpcSpecsHandler } from './get-archived-epc-specs/get-archived-epc-specs.handler'
import { GetCurrentStockTxHandler } from './get-current-stock-tx/get-current-stock-tx.handler'
import { GetInternalEpcsExistsHandler } from './get-internal-epcs-exists/get-internal-epcs-exist.handler'
import { GetScanningEpcsBySizeHandler } from './get-scanning-epcs-by-size/get-scanning-epcs-by-size.handler'
import { GetScanningEpcsHandler } from './get-scanning-epcs/get-scanning-ecps.handler'
import { GetScanningMosHandler } from './get-scanning-mo/get-scanning-mo.handler'
import { RetriveArchivedEpcsHandler } from './retrieve-archived-epcs/retrive-archived-epcs.handler'
import { SearchExchangableMoHandler } from './search-exchangable-mo/search-exchangable-mo.handler'

export const FinishedGoodsQueryHandlers = [
	GetArchivedEpcSpecsHandler,
	GetCurrentStockTxHandler,
	GetInternalEpcsExistsHandler,
	GetScanningEpcsHandler,
	GetScanningEpcsBySizeHandler,
	GetScanningMosHandler,
	RetriveArchivedEpcsHandler,
	SearchExchangableMoHandler
]
