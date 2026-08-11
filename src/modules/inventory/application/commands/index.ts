import { CheckoutInventoryAuditHandler } from './checkout-inventory-audit/checkout-inventory-audit.handler'
import { UpdateInventorySupplementalQtyHandler } from './update-inventory-supplemental-qty/update-inventory-supplemental-qty.handler'

export const InventoryAuditCommandHandlers = [UpdateInventorySupplementalQtyHandler, CheckoutInventoryAuditHandler]
