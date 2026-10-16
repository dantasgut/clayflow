import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { wgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { poolLive } from '../../gpu/compute/shaders';
import { colliderSet } from '../../gpu/shaders/math';
import { neighborResources } from '../../gpu/shaders/neighborSearch';
import diffuseCommonSource from '../../gpu/wgsl/diffuse/diffuse_common.wgsl?raw';
import diffuseSpawnSource from '../../gpu/wgsl/diffuse/diffuse_spawn.wgsl?raw';
import diffuseUpdateSource from '../../gpu/wgsl/diffuse/diffuse_update.wgsl?raw';
import diffuseCollideSource from '../../gpu/wgsl/diffuse/diffuse_collide.wgsl?raw';
import { DiffuseParamsSchema, DiffuseParticleSchema } from '../../particles/DiffuseSchemas';

// Partículas secundárias de um fluido (spec 010; Ihmsen et al. 2012): spray, espuma e bolhas.

const stage = (
    name: string,
    access: 'read' | 'read_write',
    type: WgslResourceType,
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });
const u32s: WgslResourceType = { wgsl: 'u32', array: true };

/**
 * Recursos das partículas secundárias (spec 031): privados do `DiffuseFlow` (por pipeline: cada entidade tem os seus,
 * o pool do fluido de origem incluído). Os parâmetros (`diffuse_params`: geração na região 0, um passo por região
 * seguinte, offset dinâmico) mudam entre despachos (`draw`). A grade lida no passo é a da busca de vizinhos
 * (`cell_start`, `sorted_particles` de `neighborResources`); a contagem por célula e a lista de vizinhos são lidas
 * como `u32` simples (lá são escritas).
 */
export const diffuseResources = Object.freeze({
    params: wgslResource({
        name: 'diffuse_params',
        binding: { uniform: true },
        type: { schema: DiffuseParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    /** Pool das partículas do fluido de origem, lido em floats (passo e deslocamentos nos parâmetros). */
    fluid: stage('fluid', 'read', { wgsl: 'f32', array: true }),
    fluidLive: stage('fluid_live', 'read', u32s),
    neighborList: stage('neighbor_list', 'read', u32s),
    neighborCount: stage('neighbor_count', 'read', u32s),
    cellCount: stage('cell_count', 'read', u32s),
    normals: stage('diffuse_normals', 'read_write', { wgsl: 'vec4f', array: true }),
    counts: stage('diffuse_counts', 'read_write', u32s),
    offsets: stage('diffuse_offsets', 'read', u32s),
    particles: stage('diffuse', 'read_write', { schema: DiffuseParticleSchema, array: true }),
    state: stage('diffuse_state', 'read_write', u32s),
    vertices: stage('diffuse_vertices', 'read_write', { wgsl: 'f32', array: true }),
});
const R = diffuseResources;

/** Leitura do fluido no pool, peso radial, aleatórios determinísticos e potencial normalizado. */
export const diffuseCommon = wgslModule({
    name: 'diffuse_common',
    source: diffuseCommonSource,
    requires: [R.params, R.fluid],
    structs: [DiffuseParamsSchema],
});

/** Geração: normais de superfície, potenciais, criação no anel e avanço do topo. */
export const diffuseSpawn = wgslModule({
    name: 'diffuse_spawn',
    source: diffuseSpawnSource,
    requires: [
        poolLive,
        diffuseCommon,
        WORKGROUP_SIZE.module,
        R.params,
        R.fluid,
        R.fluidLive,
        R.neighborList,
        R.neighborCount,
        R.normals,
        R.counts,
        R.offsets,
        R.particles,
        R.state,
    ],
    structs: [DiffuseParamsSchema, DiffuseParticleSchema],
});

/** Um passo: vizinhança do fluido pela grade, classificação e dinâmica de spray, espuma e bolha. */
export const diffuseUpdate = wgslModule({
    name: 'diffuse_update',
    source: diffuseUpdateSource,
    requires: [
        diffuseCommon,
        WORKGROUP_SIZE.module,
        R.params,
        R.fluid,
        neighborResources.cellStart,
        R.cellCount,
        neighborResources.sortedParticlesRead,
        R.particles,
    ],
    structs: [DiffuseParamsSchema, DiffuseParticleSchema],
});

/** Colisão com os colliders e vértices da nuvem de pontos do desenho. */
export const diffuseCollide = wgslModule({
    name: 'diffuse_collide',
    source: diffuseCollideSource,
    requires: [colliderSet, WORKGROUP_SIZE.module, R.params, R.particles, R.vertices],
    structs: [DiffuseParamsSchema, DiffuseParticleSchema],
});
