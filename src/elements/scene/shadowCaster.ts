import type { ConsumerResolver, ResolveContext } from '../../scene/consumers/ConsumerResolver';
import type { ResolvedSource } from '../../scene/consumers/ResolvedSource';
import { sourceOfDescriptor } from '../../scene/consumers/strategies/sourceOfDescriptor';
import type { Resource } from '../../scene/contracts/Resource';
import type { World } from '../../scene/world/World';
import { DirectionalLight } from './DirectionalLight';
import { ShadowMap } from './ShadowMap';

/**
 * O `ShadowMap` de uma `DirectionalLight` que projeta sombra (`castShadow = 1`) — o mapa que a cena usa para a sombra
 * (o primeiro, como até aqui). Seletor dos slots e resolvers que leem o mapa que projeta.
 */
export function castingShadowMap(world: World): (resource: Resource) => boolean {
    return (resource) => {
        const id = world.entityIdOfResource(resource);
        if (id === undefined) return false;
        const light = world.resourcesOf(id).find((r) => r instanceof DirectionalLight);
        return light?.data.castShadow === 1;
    };
}

/**
 * Fonte de um descritor do mapa de sombra que projeta (spec 031): a profundidade (`ShadowCaster.depth`) ou o
 * amostrador de comparação (`ShadowCaster.sampler`), para a contribuição de sombra dos pontos de cena.
 */
export class ShadowCasterResolver implements ConsumerResolver {
    readonly name: string;

    constructor(
        /** Descritor do `ShadowMap` (`depth`, `compare`). */
        private readonly descId: string,
        /** Tipo WGSL do binding. */
        readonly typeName: string,
    ) {
        this.name = `ShadowCaster.${descId === 'compare' ? 'sampler' : descId}`;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        const casting = castingShadowMap(ctx.world);
        for (const id of ctx.world.queryBySchemaName(ShadowMap.schema.name)) {
            const map = ctx.world
                .resourcesOf(id)
                .find((r): r is ShadowMap => r instanceof ShadowMap && casting(r));
            if (map !== undefined) return sourceOfDescriptor(ctx.resources, map, this.descId);
        }
        return undefined;
    }
}
