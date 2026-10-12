import type { Resource } from '../../contracts/Resource';
import type { Schema } from '../../descriptors/Schema';
import type { ConsumerResolver, ResolveContext, ResolvedSource } from '../ConsumerResolver';
import { firstResourceOf } from './firstResourceOf';
import { sourceOfDescriptor } from './sourceOfDescriptor';

/**
 * Fonte de uma textura (view) alocada pela C2 para o descritor `descId` do primeiro recurso com `schema` (ex.: a
 * profundidade do `ShadowMap`, a cor da cena em `FrameTargets`). `typeName` é o tipo WGSL do binding
 * (ex.: `texture_depth_2d`); `name` é o nome em `consumes`.
 */
export class TextureResolver implements ConsumerResolver {
    constructor(
        readonly name: string,
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
