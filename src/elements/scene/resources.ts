import { poolArenaReader } from '../../scene/shaders/poolArena';
import { wgslResource } from '../../scene/shaders/WgslResource';
import { Camera } from './Camera';
import { Light } from './Light';
import { RenderableSchema, RenderInstanceSchema } from './Renderable';
import { ShadowMap } from './ShadowMap';
import { Transform } from './Transform';

// Recursos de cena compartilhados (spec 031, R1): cada um declarado uma vez e requerido pelos módulos que o usam. O
// fornecedor é o pool da C2 com a chave do schema.

/** Intenções de transformação (pool `Transform`), leitura. */
export const transformsResource = wgslResource({
    name: 'transforms',
    binding: { storage: 'read' },
    type: { schema: Transform.schema, array: true },
    frequency: 'stage',
    provider: { pool: Transform.schema.name },
});

/** Matrizes de mundo (pool `WorldTransform`), escrita — o estágio de transformação. */
export const worldsWriteResource = wgslResource({
    name: 'worlds',
    binding: { storage: 'read_write' },
    type: { schema: Transform.worldSchema, array: true },
    frequency: 'stage',
    provider: { pool: Transform.worldSchema.name },
});

/** Matrizes de mundo (pool `WorldTransform`), leitura. */
export const worldsResource = wgslResource({
    name: 'worlds',
    binding: { storage: 'read' },
    type: { schema: Transform.worldSchema, array: true },
    frequency: 'stage',
    provider: { pool: Transform.worldSchema.name },
});

/** Inversas das matrizes de mundo (pool `WorldInverse`, spec 037, sob demanda), escrita — o estágio de transformação. */
export const worldInversesWriteResource = wgslResource({
    name: 'world_inverses',
    binding: { storage: 'read_write' },
    type: { schema: Transform.worldInverseSchema, array: true },
    frequency: 'stage',
    provider: { pool: Transform.worldInverseSchema.name },
});

/**
 * Inversas das matrizes de mundo (pool `WorldInverse`), leitura. Quem lê pede o pool (`ensurePoolAllocated`) numa
 * transição; o estágio de transformação passa a escrevê-lo.
 */
export const worldInversesResource = wgslResource({
    name: 'world_inverses',
    binding: { storage: 'read' },
    type: { schema: Transform.worldInverseSchema, array: true },
    frequency: 'stage',
    provider: { pool: Transform.worldInverseSchema.name },
});

/** Parâmetros das câmeras (pool `Camera`), leitura. */
export const cameraParamsResource = wgslResource({
    name: 'camera_params',
    binding: { storage: 'read' },
    type: { schema: Camera.schema, array: true },
    frequency: 'stage',
    provider: { pool: Camera.schema.name },
});

/**
 * Matrizes de mundo do quadro anterior (pool `PreviousWorldTransform`, spec 034), leitura — os vetores de movimento do
 * desenho.
 */
export const previousWorldsResource = wgslResource({
    name: 'previous_worlds',
    binding: { storage: 'read' },
    type: { schema: Transform.previousWorldSchema, array: true },
    frequency: 'stage',
    provider: { pool: Transform.previousWorldSchema.name },
});

/** Matrizes das câmeras (pool `CameraMatrices`), escrita — o estágio de câmera. */
export const cameraMatricesWriteResource = wgslResource({
    name: 'camera_matrices',
    binding: { storage: 'read_write' },
    type: { schema: Camera.matricesSchema, array: true },
    frequency: 'stage',
    provider: { pool: Camera.matricesSchema.name },
});

/** Matrizes das câmeras (pool `CameraMatrices`), leitura no desenho. */
export const camerasResource = wgslResource({
    name: 'cameras',
    binding: { storage: 'read' },
    type: { schema: Camera.matricesSchema, array: true },
    frequency: 'frame',
    provider: { pool: Camera.matricesSchema.name },
});

/** Luzes (pool `Light`), leitura. */
export const lightsResource = poolArenaReader({
    name: 'lights',
    pool: Light.schema.name,
    schema: Light.schema,
});

/** Referencial do mapa de sombra virtual no quadro (pool `ShadowMatrix`, a fatia do quadro), leitura. */
export const shadowMatricesResource = wgslResource({
    name: 'shadow_matrices',
    binding: { storage: 'read' },
    type: { schema: ShadowMap.matrixSchema, array: true },
    frequency: 'frame',
    provider: { pool: ShadowMap.matrixSchema.name },
});

/** Mapas de sombra (pool `ShadowMap`), leitura. */
export const shadowMapsResource = poolArenaReader({
    name: 'shadow_maps',
    pool: ShadowMap.schema.name,
    schema: ShadowMap.schema,
});

/** Registros de desenho por entidade (pool `Renderable`, mantido pela C2), leitura. */
export const renderablesResource = poolArenaReader({
    name: 'renderables',
    pool: RenderableSchema.name,
    schema: RenderableSchema,
});

/** Lista de instâncias dos grupos de desenho (pool `RenderInstance`), leitura. */
export const instancesResource = poolArenaReader({
    name: 'instances',
    pool: RenderInstanceSchema.name,
    schema: RenderInstanceSchema,
});

/**
 * O atlas do mapa de sombra virtual da luz que projeta (resolver `ShadowCaster.atlas`, registrado pelos elementos; T060h):
 * a tabela de páginas no começo e as páginas físicas depois (as profundidades em bits de `f32`). Lido só pela
 * contribuição de sombra (`light_visibility`).
 */
export const shadowCasterAtlasResource = wgslResource({
    name: 'shadow_atlas',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'ShadowCaster.atlas' },
});
