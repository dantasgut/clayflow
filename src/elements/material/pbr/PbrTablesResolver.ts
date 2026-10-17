import type { ConsumerResolver, ResolveContext } from '../../../scene/consumers/ConsumerResolver';
import type { ResolvedSource } from '../../../scene/consumers/ResolvedSource';
import { sourceOfDescriptor } from '../../../scene/consumers/strategies/sourceOfDescriptor';
import { PbrTables } from './PbrTables';

/**
 * Fonte de um descritor das tabelas do sombreamento físico (spec 011): a tabela DFG (`PbrTables.dfg`) ou o amostrador
 * dela (`PbrTables.sampler`), do primeiro `PbrTables` da cena, para o avaliador do fechamento.
 */
export class PbrTablesResolver implements ConsumerResolver {
    readonly name: string;

    constructor(
        /** Descritor do `PbrTables` (`dfg`, `sampler`). */
        private readonly descId: 'dfg' | 'sampler',
        /** Tipo WGSL do binding. */
        readonly typeName: string,
    ) {
        this.name = `PbrTables.${descId}`;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        for (const id of ctx.world.queryBySchemaName(PbrTables.schema.name)) {
            const tables = ctx.world.resourcesOf(id).find((r) => r instanceof PbrTables);
            if (tables !== undefined) return sourceOfDescriptor(ctx.resources, tables, this.descId);
        }
        return undefined;
    }
}
