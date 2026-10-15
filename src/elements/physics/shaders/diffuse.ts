import { wgslModule } from '../../../scene/shaders/WgslModule';
import { poolLive } from '../../gpu/compute/shaders';
import { colliderSet } from '../../gpu/shaders/math';
import diffuseCommonSource from '../../gpu/wgsl/diffuse/diffuse_common.wgsl?raw';
import diffuseSpawnSource from '../../gpu/wgsl/diffuse/diffuse_spawn.wgsl?raw';
import diffuseUpdateSource from '../../gpu/wgsl/diffuse/diffuse_update.wgsl?raw';
import diffuseCollideSource from '../../gpu/wgsl/diffuse/diffuse_collide.wgsl?raw';
import { DiffuseParamsSchema, DiffuseParticleSchema } from '../../particles/DiffuseSchemas';

// Partículas secundárias de um fluido (spec 010; Ihmsen et al. 2012): spray, espuma e bolhas.

/** Leitura do fluido no pool, peso radial, aleatórios determinísticos e potencial normalizado. */
export const diffuseCommon = wgslModule({
    name: 'diffuse_common',
    source: diffuseCommonSource,
    structs: [DiffuseParamsSchema],
});

/** Geração: normais de superfície, potenciais, criação no anel e avanço do topo. */
export const diffuseSpawn = wgslModule({
    name: 'diffuse_spawn',
    source: diffuseSpawnSource,
    requires: [poolLive, diffuseCommon],
    structs: [DiffuseParamsSchema, DiffuseParticleSchema],
});

/** Um passo: vizinhança do fluido pela grade, classificação e dinâmica de spray, espuma e bolha. */
export const diffuseUpdate = wgslModule({
    name: 'diffuse_update',
    source: diffuseUpdateSource,
    requires: [diffuseCommon],
    structs: [DiffuseParamsSchema, DiffuseParticleSchema],
});

/** Colisão com os colliders e vértices da nuvem de pontos do desenho. */
export const diffuseCollide = wgslModule({
    name: 'diffuse_collide',
    source: diffuseCollideSource,
    requires: [colliderSet],
    structs: [DiffuseParamsSchema, DiffuseParticleSchema],
});
