import { Query } from '@nestjs/cqrs'
import type { Buffer } from 'exceljs'

export class ExportDefectiveGoodsInventoryQuery extends Query<Buffer> {}
