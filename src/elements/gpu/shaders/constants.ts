import { sharedConstant } from '../../../scene/shaders/SharedConstant';

/** Elementos por grupo da soma de prefixos e da varredura local (`scan_local.wgsl`). */
export const SCAN_GROUP = sharedConstant('SCAN_GROUP', 256, 'u32');

/** Máximo de colisores de superfície no conjunto de colisores (`ColliderSet`, `collider_set.wgsl`). */
export const MAX_SURFACE_COLLIDERS = sharedConstant('MAX_SURFACE_COLLIDERS', 16, 'u32');

/** Campo de força pronto: gravidade de fonte pontual (`kind` do registro de campo). */
export const FIELD_GRAVITY_POINT = sharedConstant('FIELD_GRAVITY_POINT', 1, 'u32');
/** Campo de força pronto: vento. */
export const FIELD_WIND = sharedConstant('FIELD_WIND', 2, 'u32');
/** Campo de força pronto: vórtice. */
export const FIELD_VORTEX = sharedConstant('FIELD_VORTEX', 3, 'u32');
/** Campo de força pronto: arrasto. */
export const FIELD_DRAG = sharedConstant('FIELD_DRAG', 4, 'u32');
/** Campo de força pronto: empuxo. */
export const FIELD_BUOYANCY = sharedConstant('FIELD_BUOYANCY', 5, 'u32');

/** Operação do nó `condition.compare` (spec 031): `a < b`. */
export const NODE_COMPARE_LESS = sharedConstant('NODE_COMPARE_LESS', 0, 'u32');
/** Operação do nó `condition.compare`: `a ≤ b`. */
export const NODE_COMPARE_LESS_EQUAL = sharedConstant('NODE_COMPARE_LESS_EQUAL', 1, 'u32');
/** Operação do nó `condition.compare`: `a > b`. */
export const NODE_COMPARE_GREATER = sharedConstant('NODE_COMPARE_GREATER', 2, 'u32');
/** Operação do nó `condition.compare`: `a ≥ b`. */
export const NODE_COMPARE_GREATER_EQUAL = sharedConstant('NODE_COMPARE_GREATER_EQUAL', 3, 'u32');
/** Operação do nó `condition.compare`: `|a − b| ≤ epsilon`. */
export const NODE_COMPARE_EQUAL = sharedConstant('NODE_COMPARE_EQUAL', 4, 'u32');
/** Operação do nó `condition.compare`: `|a − b| > epsilon`. */
export const NODE_COMPARE_NOT_EQUAL = sharedConstant('NODE_COMPARE_NOT_EQUAL', 5, 'u32');
