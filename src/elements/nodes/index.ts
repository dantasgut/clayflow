import type { NodeDefinition } from '../../scene/graph/NodeDefinition';
import { NodeRegistry } from '../../scene/graph/NodeRegistry';
import { condition } from './condition';
import { field } from './field';
import { input } from './input';
import { map } from './map';
import { color } from './color';
import { bsdf } from './bsdf';
import { closure } from './closure';
import { geometry } from './geometry';
import { material } from './material';
import { math } from './math';
import { noise } from './noise';
import { output } from './output';
import {
    compact,
    displace,
    distributeOnMesh,
    grid,
    meshOutput,
    pointsOutput,
    prefixSum,
    realizeInstances,
    recomputeNormals,
    reduce,
    sequence,
    sort,
} from './set';
import { space } from './space';
import { surface } from './surface';

export { compareOps } from './condition';
export type { CameraArgument, ParticleArgument } from './input';

/** Nós de conjunto (spec 031, US3): malha, pontos, as primitivas paralelas sobre conjuntos u32 (FR-027) e as saídas. */
const set = {
    grid,
    displace,
    recomputeNormals,
    distributeOnMesh,
    realizeInstances,
    sequence,
    prefixSum,
    sort,
    compact,
    reduce,
    meshOutput,
    pointsOutput,
} as const;

/**
 * Biblioteca base de nós da C3 (spec 031, R12): entradas de contexto (`input`: argumentos do ponto alvo, sem código),
 * matemática, mapeamentos, rampas de cor, ruídos, condições, conversões de espaço, campo da cena, geometria diferencial e
 * saídas — nós de ponto, cada um com a referência da CPU em `reference/` e a tolerância documentada em
 * `reference/library.ts` —; e os nós de conjunto (`set`). Os de ponto valem em todos os estágios, salvo os que dizem o
 * contrário (`output.surfaceParams`, só `fragment`).
 */
export const nodes = {
    input,
    math,
    map,
    color,
    noise,
    condition,
    space,
    field,
    surface,
    geometry,
    bsdf,
    closure,
    output,
    material,
    set,
} as const;

/** Os nós de ponto da biblioteca (os de `nodes`, menos as entradas e os de conjunto). */
export const pointNodes: readonly NodeDefinition[] = Object.freeze(
    [
        math,
        map,
        color,
        noise,
        condition,
        space,
        field,
        surface,
        geometry,
        bsdf,
        closure,
        output,
    ].flatMap((group) => Object.values(group)),
);

/** Registro com os nós da C3 — de ponto e de conjunto (serialização: `fromJSON`). */
export const defaultNodeRegistry = new NodeRegistry([
    ...pointNodes,
    ...Object.values(set),
    ...Object.values(material),
]);
