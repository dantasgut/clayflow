import type { EnginePlugin } from './EnginePlugin';
import { LCPFlow } from '../../elements/physics/flows/LCPFlow';
import { XPBDFlow } from '../../elements/physics/flows/XPBDFlow';
import { FEMFlow } from '../../elements/physics/flows/FEMFlow';
import { MPMFlow } from '../../elements/physics/flows/MPMFlow';
import { SPHFlow } from '../../elements/physics/flows/SPHFlow';
import { PBFFlow } from '../../elements/physics/flows/PBFFlow';

export interface PhysicsPluginOptions {
    /**
     * Subset de flows a registrar. Default: todos.
     * Use para evitar overhead de criar flows que a cena não usa.
     */
    readonly enabled?: readonly ('LCP' | 'XPBD' | 'FEM' | 'MPM' | 'SPH' | 'PBF')[];
}

/**
 * Registra todos os physics flows no `Application.flows`. Substitui o
 * boilerplate de:
 * ```ts
 * app.flows.register(new LCPFlow(...));
 * app.flows.register(new XPBDFlow(...));
 * // ... 4 mais
 * ```
 *
 * Por:
 * ```ts
 * app.use(physicsPlugin());
 * // ou opt-in seletivo:
 * app.use(physicsPlugin({ enabled: ['LCP', 'XPBD'] }));
 * ```
 */
export function physicsPlugin(options: PhysicsPluginOptions = {}): EnginePlugin {
    const enabled = options.enabled;
    return {
        name: 'physics',
        install(app) {
            const want = (key: 'LCP' | 'XPBD' | 'FEM' | 'MPM' | 'SPH' | 'PBF'): boolean =>
                enabled === undefined || enabled.includes(key);
            const ctx = {
                core: app.core,
                world: app.world,
                resources: app.resources,
            };
            if (want('LCP')) app.flows.register(new LCPFlow(ctx.core, ctx.world, ctx.resources));
            if (want('XPBD')) app.flows.register(new XPBDFlow(ctx.core, ctx.world, ctx.resources));
            if (want('FEM')) app.flows.register(new FEMFlow(ctx.core, ctx.world, ctx.resources));
            if (want('MPM')) app.flows.register(new MPMFlow(ctx.core, ctx.world, ctx.resources));
            if (want('SPH')) app.flows.register(new SPHFlow(ctx.core, ctx.world, ctx.resources));
            if (want('PBF')) app.flows.register(new PBFFlow(ctx.core, ctx.world, ctx.resources));
        },
    };
}
