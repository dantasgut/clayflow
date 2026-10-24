import { basis, colliderSet, finite, noise, sampling } from '../gpu/shaders/math';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { wgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import { POINT_PARAMS, wgslPoint } from '../../scene/shaders/WgslPoint';
import emitPointTypesSource from '../gpu/wgsl/kernels/emit_point_types.wgsl?raw';
import emitFnReadySource from '../gpu/wgsl/kernels/emit_fn_ready.wgsl?raw';
import emitSpawnSource from '../gpu/wgsl/kernels/emit_spawn.wgsl?raw';
import emitUpdateSource from '../gpu/wgsl/kernels/emit_update.wgsl?raw';
import emitCollideSource from '../gpu/wgsl/kernels/emit_collide.wgsl?raw';
import { fieldAccelReady, fieldPointTypes } from '../physics/shaders/fields';
import { ComputeParticleEmitter } from './ComputeParticleEmitter';
import { MeshVertexSchema } from '../geometry/MeshVertexSchema';
import { EmitterParamsSchema } from './EmitterSchemas';

/**
 * Recursos dos emissores (spec 031): privados do `EmitterFlow` (por pipeline: cada emissor tem os seus). Os parâmetros
 * de cada passo (`emit_params`, uma região por passo, offset dinâmico) mudam entre despachos (`draw`). O registro da
 * `EmitFunction` chega com o módulo dela (pool da forma, R8).
 */
export const emitResources = Object.freeze({
    params: wgslResource({
        name: 'emit_params',
        binding: { uniform: true },
        type: { schema: EmitterParamsSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    particles: wgslResource({
        name: 'emit_particles',
        binding: { storage: 'read_write' },
        type: { schema: ComputeParticleEmitter.schema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    vertices: wgslResource({
        name: 'emit_vertices',
        binding: { storage: 'read_write' },
        type: { schema: MeshVertexSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
});
const R = emitResources;

/** Tipos do ponto `emit`: `EmittedParticle` e o sorteio `emit_rand(i, semente, canal)`. */
export const emitPointTypes = wgslModule({
    name: 'emit_point_types',
    source: emitPointTypesSource,
    requires: [noise],
});

/** Função pronta do ponto `emit`: as formas do emissor (ponto, esfera, cone). */
export const emitFnReady = wgslModule({
    name: 'emit_fn_ready',
    source: emitFnReadySource,
    requires: [emitPointTypes, R.params, basis, sampling],
    structs: [EmitterParamsSchema],
});

/** Criação das partículas de um passo pela função `emit_fn`. */
export const emitSpawn = wgslModule({
    name: 'emit_spawn',
    source: emitSpawnSource,
    // `emit_rand` e o ruído ficam à mão da função do usuário.
    requires: [
        emitPointTypes,
        noise,
        emitFnReady,
        finite,
        WORKGROUP_SIZE.module,
        R.params,
        R.particles,
    ],
    structs: [EmitterParamsSchema, ComputeParticleEmitter.schema],
});

/** Um passo das partículas: idade, gravidade e campos, vértices da nuvem. */
export const emitUpdate = wgslModule({
    name: 'emit_update',
    source: emitUpdateSource,
    requires: [
        fieldPointTypes,
        fieldAccelReady,
        WORKGROUP_SIZE.module,
        R.params,
        R.particles,
        R.vertices,
    ],
    structs: [EmitterParamsSchema, ComputeParticleEmitter.schema],
});

/** Colisão das partículas vivas com os colliders, depois do passo (spec 010; só com colliders na cena). */
export const emitCollide = wgslModule({
    name: 'emit_collide',
    source: emitCollideSource,
    requires: [colliderSet, WORKGROUP_SIZE.module, R.params, R.particles, R.vertices],
    structs: [EmitterParamsSchema, ComputeParticleEmitter.schema],
});

/**
 * Ponto `emit` (spec 009): `fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle` — a
 * partícula de índice global `i` (posição, velocidade, vida, cor). Pronta: a forma do emissor (ponto, esfera, cone).
 * Disponíveis para a função: `emit_rand(i, seed, canal)` e `noise`.
 */
export const emitPoint = wgslPoint({
    name: 'emit',
    required: {
        name: 'emit_fn',
        params: ['u32', 'f32', 'u32', POINT_PARAMS],
        returns: 'EmittedParticle',
        names: ['i', 'time', 'seed', 'data'],
    },
    paramsAlias: 'EmitFnParams',
    ready: emitFnReady,
    hosts: () => [emitSpawn],
});
