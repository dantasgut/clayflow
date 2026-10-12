import type { StorageBufferSpec, UniformBufferSpec } from '../../core/contracts/index';
import type { Schema } from '../descriptors/Schema';
import type { EntityId } from '../world/EntityId';
import type { Resource } from './Resource';

/** Buffer de um pool: storage, ou uniform nos pools de uniforms (lidos com offset dinâmico). */
export type PoolBufferSpec = StorageBufferSpec | UniformBufferSpec;

/** Estado de um pool num instante (cópia; não acompanha mudanças posteriores). */
export interface PoolInfo {
    /** Chave do pool (`schema.name`, ou `schema.name:algoritmo`). */
    readonly poolKey: string;
    /** Schema dos registros. */
    readonly schema: Schema;
    /** Buffer atual. */
    readonly buffer: PoolBufferSpec;
    /** `uniform`: pool de uniforms, um registro por offset dinâmico; `storage`: `array<T>` no shader. */
    readonly addressSpace: 'storage' | 'uniform';
    /** Bytes por registro (alinhado a 16, ou a `minUniformBufferOffsetAlignment` no pool uniforme). */
    readonly stride: number;
    /** Slots ocupáveis (maior slot já usado + 1). */
    readonly count: number;
    /** Registros que cabem no buffer atual. */
    readonly capacity: number;
    /** Incrementa a cada recriação do buffer (crescimento). */
    readonly generation: number;
}

/**
 * Consulta de leitura aos pools do `ResourceSystem` — o contrato que estágios (Flows) de
 * C3/C4 usam para ligar buffers coalescidos e indexar entidades, sem depender da classe
 * `ResourceSystem`.
 *
 * Um recurso que declara vários descritores em pool ocupa o **mesmo slot** em todos eles
 * (ex.: `Transform[i]` e `WorldTransform[i]` são sempre a mesma entidade).
 */
export interface PoolDirectory {
    /** Buffer do pool, para bind groups de estágios. `undefined` se o pool não existe. */
    poolBufferSpec(poolKey: string): PoolBufferSpec | undefined;
    /** Buffer, stride, contagem, capacidade e geração do pool, ou `undefined` se não existe. */
    poolInfo(poolKey: string): PoolInfo | undefined;
    /** Número de slots ocupáveis (maior slot já usado + 1). 0 se o pool não existe. */
    poolCount(poolKey: string): number;
    /** Slot da entidade no pool; igual em todos os pools de um mesmo recurso. */
    poolSlotOf(poolKey: string, entityId: EntityId): number | undefined;
    /** Pool key do primeiro descritor em pool do recurso, ou `undefined`. */
    poolKeyForResource(resource: Resource): string | undefined;
}
