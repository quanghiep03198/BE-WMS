import { GetInternalEpcsExistsHandler } from './get-internal-epcs-exists/get-internal-epcs-exist.handler'
import { GetScanningEpcsHandler } from './get-scanning-epcs/get-scanning-ecps.handler'
import { GetScanningMosHandler } from './get-scanning-mo/get-scanning-mo.handler'

export const InoutboundQueryHandlers = [GetScanningEpcsHandler, GetScanningMosHandler, GetInternalEpcsExistsHandler]
