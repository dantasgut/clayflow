import type { StorageBufferSpec } from '../../core/contracts/index';
import type { EntityId } from '../world/EntityId';
import type { Resource } from './Resource';

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
    poolBufferSpec(poolKey: string): StorageBufferSpec | undefined;
    /** Número de slots ocupáveis (maior slot já usado + 1). 0 se o pool não existe. */
    poolCount(poolKey: string): number;
    /** Slot da entidade no pool; igual em todos os pools de um mesmo recurso. */
    poolSlotOf(poolKey: string, entityId: EntityId): number | undefined;
    /** Pool key do primeiro descritor em pool do recurso, ou `undefined`. */
    poolKeyForResource(resource: Resource): string | undefined;
}
