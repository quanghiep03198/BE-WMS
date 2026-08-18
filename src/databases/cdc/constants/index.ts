export const CDC_PROVISION_CONFIGS = Symbol('CDC_PROVISION_CONFIGS')
// Registry set — avoids using KEYS pattern scan in production (blocking on large keyspaces).
// Debug via: SMEMBERS cdc:checkpoint:registry

export const CDC_CHECKPOINT_REGISTRY_KEY = 'cdc:checkpoint:registry'
