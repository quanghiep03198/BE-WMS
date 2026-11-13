export const warehouseSyncStages = [
	{ name: 'users', collection: 'users' },
	{ name: 'warehouses', collection: 'warehouses' },
	{ name: 'departments', collection: 'departments' },
	{ name: 'product specifications', collection: 'product_specifications' },
	{ name: 'purchase orders', collection: 'purchase_orders' },
	{ name: 'manufacturing orders', collection: 'manufacturing_orders' },
	{ name: 'daily PO progress', collection: 'daily_po_shipping_progress' },
	{ name: 'RFID devices', collection: 'rfid_devices' },
	{ name: 'EPC matches', collection: 'finished_goods_epcs_match' },
	{ name: 'finished goods EPCs', collection: 'finished_goods_epcs' },
	{ name: 'inventory audit', collection: 'mo_inventory_audit' },
	{ name: 'daily MO inventory ledger', collection: 'daily_mo_inventory_ledger' },
	{ name: 'truckload deliveries', collection: 'truckload_delivery' },
	{ name: 'defective goods', collection: 'defective_goods' },
	{ name: 'Excel report', collection: 'excel_report' }
] as const

export type WarehouseSyncStageName = (typeof warehouseSyncStages)[number]['name']

export function selectWarehouseSyncStages(step?: string, fromStep?: string): readonly WarehouseSyncStageName[] {
	if (step !== undefined && fromStep !== undefined) throw new Error('--step and --from-step cannot be combined')
	const selection = step ?? fromStep
	if (selection === undefined) return warehouseSyncStages.map(({ name }) => name)
	const collection = selection === 'storage_locations' ? 'warehouses' : selection
	const index = warehouseSyncStages.findIndex((stage) => stage.collection === collection)
	if (index === -1) throw new Error(`Unknown warehouse sync step: ${selection}`)
	return (step !== undefined ? warehouseSyncStages.slice(index, index + 1) : warehouseSyncStages.slice(index)).map(
		({ name }) => name
	)
}
