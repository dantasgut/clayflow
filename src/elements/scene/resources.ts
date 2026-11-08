import { poolArenaReader, poolArenaWriter } from '../../scene/shaders/poolArena';
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

/** Matrizes de mundo (pool `WorldTransform`, arena da GPU), leitura e escrita — o estágio de transformação. */
export const worldsWriteResource = poolArenaWriter({
    name: 'worlds',
    pool: Transform.worldSchema.name,
    schema: Transform.worldSchema,
});

/** Matrizes de mundo (pool `WorldTransform`, arena da GPU), leitura. */
export const worldsResource = poolArenaReader({
    name: 'worlds',
    pool: Transform.worldSchema.name,
    schema: Transform.worldSchema,
    arena: 'gpu',
});

/**
 * Inversas das matrizes de mundo (pool `WorldInverse`, spec 037, sob demanda; arena da GPU), leitura e escrita — o
 * estágio de transformação.
 */
export const worldInversesWriteResource = poolArenaWriter({
    name: 'world_inverses',
    pool: Transform.worldInverseSchema.name,
    schema: Transform.worldInverseSchema,
});

/**
 * Inversas das matrizes de mundo (pool `WorldInverse`, arena da GPU), leitura. Quem lê pede o pool
 * (`ensurePoolAllocated`) numa transição; o estágio de transformação passa a escrevê-lo.
 */
export const worldInversesResource = poolArenaReader({
    name: 'world_inverses',
    pool: Transform.worldInverseSchema.name,
    schema: Transform.worldInverseSchema,
    arena: 'gpu',
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
 * Matrizes de mundo do quadro anterior (pool `PreviousWorldTransform`, spec 034; arena da GPU), leitura — os vetores de
 * movimento do desenho.
 */
export const previousWorldsResource = poolArenaReader({
    name: 'previous_worlds',
    pool: Transform.previousWorldSchema.name,
    schema: Transform.previousWorldSchema,
    arena: 'gpu',
});

/** Matrizes de mundo do quadro anterior, leitura e escrita — o histórico de movimento as copia das de agora. */
export const previousWorldsWriteResource = poolArenaWriter({
    name: 'previous_worlds',
    pool: Transform.previousWorldSchema.name,
    schema: Transform.previousWorldSchema,
});

/** Matrizes das câmeras (pool `CameraMatrices`, arena da GPU), leitura e escrita — o estágio de câmera. */
export const cameraMatricesWriteResource = poolArenaWriter({
    name: 'camera_matrices',
    pool: Camera.matricesSchema.name,
    schema: Camera.matricesSchema,
});

/** Matrizes das câmeras (pool `CameraMatrices`, arena da GPU), leitura no desenho. */
export const camerasResource = poolArenaReader({
    name: 'cameras',
    pool: Camera.matricesSchema.name,
    schema: Camera.matricesSchema,
    arena: 'gpu',
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
