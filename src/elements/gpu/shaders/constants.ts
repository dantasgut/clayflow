import { sharedConstant } from '../../../scene/shaders/SharedConstant';

/** Elementos por grupo da soma de prefixos e da varredura local (`scan_local.wgsl`). */
export const SCAN_GROUP = sharedConstant('SCAN_GROUP', 256, 'u32');

/** Máximo de colisores de superfície no conjunto de colisores (`ColliderSet`, `collider_set.wgsl`). */
export const MAX_SURFACE_COLLIDERS = sharedConstant('MAX_SURFACE_COLLIDERS', 16, 'u32');

/** Direção da luz quando a cena não tem luz (normalizada no shader). */
export const DEFAULT_LIGHT_DIRECTION = sharedConstant(
    'DEFAULT_LIGHT_DIRECTION',
    [0.4, -1, 0.6],
    'vec3f',
);

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
