import type { ConsumerResolver, ResolveContext } from '../../scene/consumers/ConsumerResolver';
import type { ResolvedSource } from '../../scene/consumers/ResolvedSource';
import { sourceOfDescriptor } from '../../scene/consumers/strategies/sourceOfDescriptor';
import { WaterSurface } from '../app/WaterSurface';

/**
 * Fonte de um descritor do `WaterSurface` da cena (spec 031): o estado (`WaterSurface.state`), o mapa de cáusticas
 * (`WaterSurface.caustics`), a profundidade da água vista pela luz (`WaterSurface.lightDepth`) ou a matriz dessa vista
 * (`WaterSurface.lightMatrix`) — o que a contribuição da água à transmissão da luz lê em qualquer desenho.
 */
export class WaterSurfaceResolver implements ConsumerResolver {
    readonly name: string;

    constructor(
        /** Descritor do `WaterSurface`. */
        private readonly descId: string,
        /** Tipo WGSL do binding. */
        readonly typeName: string,
    ) {
        this.name = `WaterSurface.${descId}`;
    }

    resolve(ctx: ResolveContext): ResolvedSource | undefined {
        for (const id of ctx.world.queryBySchemaName(WaterSurface.schema.name)) {
            const water = ctx.world
                .resourcesOf(id)
                .find((r): r is WaterSurface => r instanceof WaterSurface);
            if (water !== undefined) return sourceOfDescriptor(ctx.resources, water, this.descId);
        }
        return undefined;
    }
}

/** Resolvers da superfície de água, registrados pela aplicação na cena (sem substituir os da aplicação). */
export const WATER_CONSUMERS: readonly ConsumerResolver[] = [
    new WaterSurfaceResolver('state', 'WaterState'),
    new WaterSurfaceResolver('caustics', 'texture_2d<f32>'),
    new WaterSurfaceResolver('lightDepth', 'texture_2d<f32>'),
    new WaterSurfaceResolver('lightMatrix', 'WaterLightMatrix'),
];
