import type { StorageBufferSpec } from '../../core/contracts/index';
import type { Schema } from '../descriptors/Schema';
import type { EntityId } from '../world/EntityId';
import type { Resource } from './Resource';

/** Buffer de um pool: storage, lido como `array<T>` no shader. */
export type PoolBufferSpec = StorageBufferSpec;

/** Estado de um pool num instante (cópia; não acompanha mudanças posteriores). */
export interface PoolInfo {
    /** Chave do pool (`schema.name`, ou `schema.name:algoritmo`). */
    readonly poolKey: string;
    /** Schema dos registros. */
    readonly schema: Schema;
    /** Buffer atual. */
    readonly buffer: PoolBufferSpec;
    /** Bytes por registro: o stride do struct gerado do schema (o do `array<T>` no WGSL). */
    readonly stride: number;
    /** Slots ocupáveis (maior slot já usado + 1). */
    readonly count: number;
    /** Registros que cabem no buffer atual. */
    readonly capacity: number;
    /** Incrementa a cada recriação do buffer (crescimento). */
    readonly generation: number;
    /** Slots de posse da GPU (`slot.entities({ owns })`): escritos por um estágio, não pela CPU. */
    readonly gpuOwned: number;
}

/**
 * Consulta de leitura aos pools do `ResourceSystem` — o contrato que estágios (Flows) de
 * C3/C4 usam para ligar buffers coalescidos e indexar entidades, sem depender da classe
 * `ResourceSystem`.
 *
 * Um recurso que declara vários descritores em pool ocupa o **mesmo slot** em todos eles
 * (ex.: `Transform[i]` e `WorldTransform[i]` são sempre a mesma entidade); com `count` no
 * descritor, uma faixa de slots contíguos (spec 008).
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
    /** Faixa da entidade no pool (`count` slots a partir de `first`; spec 008). */
    poolRangeOf(
        /** Chave do pool. */
        poolKey: string,
        /** Entidade. */
        entityId: EntityId,
    ):
        | {
              /** Primeiro slot da faixa. */
              readonly first: number;
              /** Slots da faixa. */
              readonly count: number;
          }
        | undefined;
    /**
     * Bitset de slots ocupados do pool na GPU (`array<u32>`, um bit por slot; spec 008), criado no primeiro pedido e
     * mantido pela C2. `undefined` se o pool não existe.
     */
    poolLiveBuffer(poolKey: string): StorageBufferSpec | undefined;
    /** O slot é de posse da GPU (`slot.entities({ owns })`: escrito por um estágio, não pela CPU)? */
    poolSlotOwnedByGpu(poolKey: string, slot: number): boolean;
    /** Pool key do primeiro descritor em pool do recurso, ou `undefined`. */
    poolKeyForResource(resource: Resource): string | undefined;
}
