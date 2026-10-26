export enum DefectiveCategory {
	B_GRADE = 'B',
	C_GRADE = 'C',
	RESEARCH_DEVELOPMENT = 'RD'
}

export enum DefectiveLocation {
	ALL = 'A',
	UPPER = 'B',
	BOTTOM = 'C',
	OTHER = 'D'
}

export enum DefectiveGoodsOutboundPurpose {
	SHIPPING = 'SHIPPING',
	LAB = 'LAB',
	RUIN = 'RUIN',
	DOWNGRADE = 'B_TO_C'
}

export enum DefectiveGoodsSource {
	FINAL_INSPECTION = 'A',
	ASSEMBLY = 'B',
	REPACKING = 'C',
	OVERRUN = 'D'
}

export enum DefectiveGoodsUnit {
	PRS = 'prs',
	PCS = 'pcs'
}

export const FALLBACK_PURCHASE_ORDER = 'PRELOAD'
