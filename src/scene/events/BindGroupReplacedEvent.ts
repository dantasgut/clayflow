import type { BindGroupSpec } from '../../core/contracts/index';

/**
 * Bind group de um pipeline de Flow recriado pela C2: uma fonte que ele liga foi recriada (pool que cresceu, textura
 * do canvas redimensionada, singleton trocado, binding privado religado). O antigo é liberado; o Flow passa a gravar
 * com o novo no quadro seguinte (o `BoundFlow` já aponta para ele).
 */
export interface BindGroupReplacedEvent {
    /** `Flow.type` do dono do pipeline. */
    readonly flow: string;
    /** Id do pipeline. */
    readonly pipeline: string;
    /** Índice do `@group`. */
    readonly group: number;
    readonly oldSpec: BindGroupSpec;
    readonly newSpec: BindGroupSpec;
}
