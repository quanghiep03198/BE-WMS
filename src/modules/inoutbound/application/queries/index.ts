import { GetInternalEpcsExistsHandler } from './get-internal-epcs-exists/get-internal-epcs-exist.handler'
import { GetScanningEpcsBySizeHandler } from './get-scanning-epcs-by-size/get-scanning-epcs-by-size.handler'
import { GetScanningEpcsHandler } from './get-scanning-epcs/get-scanning-ecps.handler'
import { GetScanningMosHandler } from './get-scanning-mo/get-scanning-mo.handler'
import { SearchExchangableMoHandler } from './search-exchangable-mo/search-exchangable-mo.handler'

export const InoutboundQueryHandlers = [
	GetScanningEpcsHandler,
	GetScanningEpcsBySizeHandler,
	GetScanningMosHandler,
	GetInternalEpcsExistsHandler,
	SearchExchangableMoHandler
]
