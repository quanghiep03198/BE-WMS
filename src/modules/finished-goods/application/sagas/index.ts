import { ExchangeMoSaga } from './exchange-mo.saga'
import { InoutboundSaga } from './inoutbound.saga'
import { EpcMatchSaga } from './upsert-epcs-match.saga'

export const FinishedGoodsSagas = [InoutboundSaga, ExchangeMoSaga, EpcMatchSaga]
