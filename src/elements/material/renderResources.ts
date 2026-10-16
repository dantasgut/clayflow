import { wgslResource } from '../../scene/shaders/WgslResource';
import { SurfaceDiffSchema } from '../geometry/SurfaceSchemas';
import { DiffuseMaterialSchema } from './DiffuseMaterialSchema';
import {
    ForwardFrameParamsSchema,
    ParticleDrawParamsSchema,
    ParticleFrameParamsSchema,
} from './forwardSchemas';
import { PointSpriteMaterialSchema } from './PointSpriteMaterialSchema';
import { StandardMaterialSchema } from './StandardMaterialSchema';
import { MeshVertexSchema } from '../geometry/MeshVertexSchema';
import { WireframeMaterialSchema } from './WireframeMaterialSchema';

// Recursos dos desenhos de material (spec 031): câmeras, mundo, registros e instâncias vêm de `scene/resources`; aqui,
// o que é de cada família — parâmetros do estágio (`stage`), o pool do material do shader (`batch`, muda entre grupos
// de desenho) e os vértices da geometria de cada pipeline de sprites e arame (`draw`).

/** Parâmetros do quadro do forward (câmera ativa, tamanho do alvo, função de projeção, tempo). */
export const forwardFrameResource = wgslResource({
    name: 'forward_frame',
    binding: { uniform: true },
    type: { schema: ForwardFrameParamsSchema },
    frequency: 'stage',
    provider: 'private',
});

/** Geometria diferencial das superfícies (spec 010; o estágio liga o pool ou um substituto). */
export const surfaceDiffReadResource = wgslResource({
    name: 'surface_diff',
    binding: { storage: 'read' },
    type: { schema: SurfaceDiffSchema, array: true },
    frequency: 'stage',
    provider: 'private',
});

const materials = (schema: typeof StandardMaterialSchema): ReturnType<typeof wgslResource> =>
    wgslResource({
        name: 'materials',
        binding: { storage: 'read' },
        type: { schema, array: true },
        frequency: 'batch',
        provider: { pool: schema.name },
    });

/** Pool `StandardMaterial` (desenho forward). */
export const standardMaterialsResource = materials(StandardMaterialSchema);
/** Pool `PointSpriteMaterial` (sprites nos vértices e nas partículas). */
export const pointSpriteMaterialsResource = materials(PointSpriteMaterialSchema);
/** Pool `DiffuseMaterial` (partículas secundárias de fluido). */
export const diffuseMaterialsResource = materials(DiffuseMaterialSchema);
/** Pool `WireframeMaterial` (arame). */
export const wireframeMaterialsResource = materials(WireframeMaterialSchema);

const vertices = (name: string): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: 'read' },
        type: { schema: MeshVertexSchema, array: true },
        frequency: 'draw',
        provider: 'private',
    });

/** Vértices da geometria de um pipeline de sprites (`array<MeshVertex>`), lidos como storage. */
export const pointVerticesResource = vertices('point_vertices');
/** Vértices da geometria de um pipeline de arame. */
export const wireVerticesResource = vertices('wire_vertices');
/** Arestas da geometria de um pipeline de arame (índices aos pares). */
export const wireEdgesResource = wgslResource({
    name: 'wire_edges',
    binding: { storage: 'read' },
    type: { wgsl: 'u32', array: true },
    frequency: 'draw',
    provider: 'private',
});

/** Parâmetros do quadro do desenho de partículas (câmera ativa e a primeira luz viva). */
export const particleFrameResource = wgslResource({
    name: 'particle_frame',
    binding: { uniform: true },
    type: { schema: ParticleFrameParamsSchema },
    frequency: 'stage',
    provider: 'private',
});

/** Pool do corpo de partículas desenhado (`array<vec4f>`; um pipeline por pool). */
export const particlePoolResource = wgslResource({
    name: 'particles',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'stage',
    provider: 'private',
});

/** Região do corpo desenhado (offset dinâmico). */
export const particleDrawResource = wgslResource({
    name: 'particle_draw',
    binding: { uniform: true },
    type: { schema: ParticleDrawParamsSchema },
    frequency: 'draw',
    provider: 'private',
});
