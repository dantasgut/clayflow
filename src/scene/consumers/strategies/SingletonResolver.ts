import type { Resource } from '../../contracts/Resource';
import type { Schema } from '../../descriptors/Schema';
import type { ConsumerResolver, ResolveContext } from '../ConsumerResolver';
import type { ResolvedSource } from '../ResolvedSource';
import { firstResourceOf } from './firstResourceOf';
import { sourceOfDescriptor } from './sourceOfDescriptor';

/** Opções de `SingletonResolver`. */
export interface SingletonResolverOptions {
    /** Nome do resolver (fornecedor `{ consumer }` de um recurso). Default: `schema.name`. */
    readonly name?: string;
    /** Filtro do recurso (ex.: só luzes que projetam sombra). Default: o primeiro com o schema. */
    readonly select?: (resource: Resource) => boolean;
}

/**
 * Fonte de um Resource único da cena: o descritor `descId` do **primeiro recurso inserido que continua na cena** com
 * `schema` (ex.: a câmera ativa, o `Time`, o `ParticlePhysics`). Trocar o recurso (remover o primeiro) muda a fonte.
 */
export class SingletonResolver implements ConsumerResolver {
    /** Nome do resolver (`options.name`, ou `schema.name`). */
    readonly name: string;
    /** Struct WGSL do Resource (`schema.wgslName`). */
    readonly typeName: string;

    constructor(
        private readonly schema: Schema,
        private readonly descId: string,
        private readonly options: SingletonResolverOptions = {},
    ) {
        this.name = options.name ?? schema.name;
        this.typeName = schema.wgslName;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        const resource = firstResourceOf(ctx.world, this.schema, this.descId, this.options.select);
        return resource === undefined
            ? undefined
            : sourceOfDescriptor(ctx.resources, resource, this.descId);
    }
}
