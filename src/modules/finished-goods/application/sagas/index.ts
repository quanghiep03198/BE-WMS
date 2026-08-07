import { ExchangeMoSaga } from './exchange-mo.saga'
import { InoutboundSaga } from './inoutbound.saga'
import { UpsertEpcsMatchSaga } from './upsert-epcs-match.saga'

export const FinishedGoodsSagas = [InoutboundSaga, ExchangeMoSaga, UpsertEpcsMatchSaga]
