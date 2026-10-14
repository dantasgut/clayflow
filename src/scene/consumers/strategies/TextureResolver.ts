import type { Resource } from '../../contracts/Resource';
import type { Schema } from '../../descriptors/Schema';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';
import type { ResolvedSource } from '../ResolvedSource';
import { firstResourceOf } from './firstResourceOf';
import { sourceOfDescriptor } from './sourceOfDescriptor';

/**
 * Fonte de uma textura (view) alocada pela C2 para o descritor `descId` do primeiro recurso com `schema` (ex.: a
 * profundidade do `ShadowMap`, a cor da cena em `FrameTargets`). `typeName` é o tipo WGSL do binding
 * (ex.: `texture_depth_2d`); `name` é o nome em `consumes`.
 */
export class TextureResolver implements ConsumerResolver {
    /**
     * @param name - Nome em `consumes`.
     * @param typeName - Tipo WGSL do binding (ex.: `texture_depth_2d`).
     * @param schema - Schema do Resource dono da textura.
     * @param descId - Id do descritor de textura no Resource.
     * @param select - Filtro do Resource (padrão: o primeiro com o schema).
     */
    constructor(
        /** Nome em `consumes`. */
        readonly name: string,
        /** Tipo WGSL do binding (ex.: `texture_depth_2d`). */
        readonly typeName: string,
        private readonly schema: Schema,
        private readonly descId: string,
        private readonly select?: (resource: Resource) => boolean,
    ) {}

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        const resource = firstResourceOf(ctx.world, this.schema, this.descId, this.select);
        return resource === undefined
            ? undefined
            : sourceOfDescriptor(ctx.resources, resource, this.descId);
    }
}
