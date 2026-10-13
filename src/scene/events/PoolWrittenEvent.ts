import type { Schema } from '../descriptors/Schema';

/**
 * Payload de `poolWritten`: a C2 enviou dados da CPU para o pool `poolKey` neste quadro (spec 007, envio por delta).
 * Um evento por pool por rodada de envio — não um por Resource —, com as faixas de slots escritas.
 */
export interface PoolWrittenEvent {
    /** Chave do pool escrito. */
    readonly poolKey: string;
    /** Schema do elemento do pool. */
    readonly schema: Schema;
    /** Faixas escritas: `[primeiro slot, quantidade]`, em ordem crescente e sem sobreposição. */
    readonly ranges: readonly (readonly [number, number])[];
}
