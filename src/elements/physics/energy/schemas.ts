import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';

/**
 * Fatias da série da energia de cada corpo (spec 037, canal temporal): a do passo de agora e as 7 anteriores — a janela
 * da energia dissipada.
 */
export const BODY_ENERGY_HISTORY = 8;

/**
 * A energia de um corpo rígido num passo (J), uma fatia do canal temporal `BodyEnergy` (o pool divide o slot com o
 * corpo): a cinética (translação + rotação), a potencial no campo uniforme, a potência dissipada no passo (W:
 * (E_anterior − E)/dt) e a energia dissipada na janela (E de 7 passos atrás − E). As duas últimas valem 0 enquanto a
 * série não tem a fatia de que precisam.
 */
export const BodyEnergySchema = new StructSchema('BodyEnergy', {
    kinetic: FieldType.f32,
    potential: FieldType.f32,
    power: FieldType.f32,
    window: FieldType.f32,
});

/**
 * Parâmetros do medidor de energia (uniform `EnergyMeter`): a gravidade uniforme (xyz) e o tempo simulado do quadro
 * (w: passos × passo); os corpos, os passos gravados seguidos na série (`frames` do canal) e as fatias dela.
 */
export const EnergyMeterSchema = new StructSchema(
    'EnergyMeter',
    {
        gravity: FieldType.vec4f,
        counts: FieldType.vec4u,
    },
    { addressSpace: 'uniform' },
);

/** Algoritmo de um corpo mole no registro da faixa (`SoftBodyRange.algorithm`); 0 = sem série de energia. */
export const SOFT_ENERGY_ALGORITHM = Object.freeze({ XPBD: 1, FEM: 2, MPM: 3 } as const);

/**
 * Elementos (partículas ou arestas) de um bloco da energia dos corpos moles: um grupo de 64 invocações soma um bloco,
 * 16 por invocação. Um corpo de n partículas e e arestas tem ⌈max(n, e)/1024⌉ blocos, somados em paralelo.
 */
export const SOFT_ENERGY_CHUNK = sharedConstant('SOFT_ENERGY_CHUNK', 1024, 'u32');

/** Blocos de um corpo mole de `count` partículas e `edges` arestas (ao menos um). */
export function softEnergyChunks(count: number, edges: number): number {
    return Math.max(1, Math.ceil(Math.max(count, edges) / SOFT_ENERGY_CHUNK.value));
}

/**
 * A faixa de um corpo mole (spec 037, energia dos corpos moles), enviada na inserção: as partículas (`first`, `count`)
 * no pool do algoritmo, as arestas (`first_edge`, `edge_count`) no pool `DistanceConstraint` (só XPBD), o algoritmo e
 * os blocos (`first_chunk`, `chunk_count`) nos pools `SoftBodyChunk`/`SoftBodyPartial` — os inícios resolvidos pela C2
 * (`slotRefs` `self:`). Ocupa o mesmo slot que a série `SoftBodyEnergy` do corpo.
 */
export const SoftBodyRangeSchema = new StructSchema('SoftBodyRange', {
    first: FieldType.u32,
    count: FieldType.u32,
    first_edge: FieldType.u32,
    edge_count: FieldType.u32,
    algorithm: FieldType.u32,
    first_chunk: FieldType.u32,
    chunk_count: FieldType.u32,
    _pad0: FieldType.u32,
});

/** Um bloco de um corpo mole (enviado na inserção): o slot da faixa do corpo (`slotRefs` `self:range`) e o índice. */
export const SoftBodyChunkSchema = new StructSchema('SoftBodyChunk', {
    range: FieldType.u32,
    chunk: FieldType.u32,
});

/** A soma de um bloco (escrita pela GPU, no slot do bloco): a cinética, a potencial e a elástica dele. */
export const SoftBodyPartialSchema = new StructSchema('SoftBodyPartial', {
    kinetic: FieldType.f32,
    potential: FieldType.f32,
    elastic: FieldType.f32,
    _pad0: FieldType.f32,
});

/**
 * A energia de um corpo mole num passo (J), uma fatia do canal temporal `SoftBodyEnergy`: a cinética (½·m·|v|² das
 * partículas), a potencial no campo uniforme, a elástica pelo modelo do algoritmo (XPBD: ½·C²/α das arestas com α > 0;
 * MPM: V₀·ψ(F), Neo-Hookean; FEM: 0, sem modelo elástico no motor), a potência dissipada no passo (W) e a energia
 * dissipada na janela — as duas últimas 0 enquanto a série não tem a fatia de que precisam.
 */
export const SoftBodyEnergySchema = new StructSchema('SoftBodyEnergy', {
    kinetic: FieldType.f32,
    potential: FieldType.f32,
    elastic: FieldType.f32,
    power: FieldType.f32,
    window: FieldType.f32,
    _pad0: FieldType.f32,
    _pad1: FieldType.f32,
    _pad2: FieldType.f32,
});

/**
 * Parâmetros de um despacho da energia dos corpos moles (uniform, uma região por algoritmo): a gravidade uniforme (xyz)
 * e o tempo simulado do quadro (w); os registros, os passos gravados seguidos na série, as fatias dela e o algoritmo
 * deste despacho; e, no MPM, a massa e o volume de repouso da partícula e os parâmetros de Lamé (μ, λ) do material.
 */
export const SoftEnergyParamsSchema = new StructSchema(
    'SoftEnergyParams',
    {
        gravity: FieldType.vec4f,
        counts: FieldType.vec4u,
        material: FieldType.vec4f,
    },
    { addressSpace: 'uniform' },
);
