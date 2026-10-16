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

/** Parâmetros das câmeras (pool `Camera`), leitura. */
export const cameraParamsResource = wgslResource({
    name: 'camera_params',
    binding: { storage: 'read' },
    type: { schema: Camera.schema, array: true },
    frequency: 'stage',
    provider: { pool: Camera.schema.name },
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
export const lightsResource = wgslResource({
    name: 'lights',
    binding: { storage: 'read' },
    type: { schema: Light.schema, array: true },
    frequency: 'frame',
    provider: { pool: Light.schema.name },
});

/** Matrizes luz-vista-projeção (pool `ShadowMatrix`), escrita — o estágio das matrizes de sombra. */
export const shadowMatricesWriteResource = wgslResource({
    name: 'shadow_matrices',
    binding: { storage: 'read_write' },
    type: { schema: ShadowMap.matrixSchema, array: true },
    frequency: 'stage',
    provider: { pool: ShadowMap.matrixSchema.name },
});

/** Matrizes luz-vista-projeção (pool `ShadowMatrix`), leitura. */
export const shadowMatricesResource = wgslResource({
    name: 'shadow_matrices',
    binding: { storage: 'read' },
    type: { schema: ShadowMap.matrixSchema, array: true },
    frequency: 'frame',
    provider: { pool: ShadowMap.matrixSchema.name },
});

/** Mapas de sombra (pool `ShadowMap`), leitura. */
export const shadowMapsResource = wgslResource({
    name: 'shadow_maps',
    binding: { storage: 'read' },
    type: { schema: ShadowMap.schema, array: true },
    frequency: 'frame',
    provider: { pool: ShadowMap.schema.name },
});

/** Registros de desenho por entidade (pool `Renderable`, mantido pela C2), leitura. */
export const renderablesResource = wgslResource({
    name: 'renderables',
    binding: { storage: 'read' },
    type: { schema: RenderableSchema, array: true },
    frequency: 'stage',
    provider: { pool: RenderableSchema.name },
});

/** Lista de instâncias dos grupos de desenho (pool `RenderInstance`), leitura. */
export const instancesResource = wgslResource({
    name: 'instances',
    binding: { storage: 'read' },
    type: { schema: RenderInstanceSchema, array: true },
    frequency: 'stage',
    provider: { pool: RenderInstanceSchema.name },
});

/**
 * Profundidade do mapa de sombra da luz que projeta (resolver `ShadowCaster.depth`, registrado pelos elementos). Lido só
 * pela contribuição de sombra (`light_visibility`).
 */
export const shadowCasterDepthResource = wgslResource({
    name: 'shadow_map',
    binding: { texture: { sample: 'depth' } },
    frequency: 'frame',
    provider: { consumer: 'ShadowCaster.depth' },
});

/** Amostrador de comparação do mapa de sombra da luz que projeta (resolver `ShadowCaster.sampler`). */
export const shadowCasterSamplerResource = wgslResource({
    name: 'shadow_sampler',
    binding: { sampler: 'comparison' },
    frequency: 'frame',
    provider: { consumer: 'ShadowCaster.sampler' },
});
