import type { EnginePlugin } from './EnginePlugin';
import { LCPFlow } from '../../elements/physics/flows/LCPFlow';
import { PBFFlow } from '../../elements/physics/flows/PBFFlow';

/** Opções do `physicsPlugin()`. */
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
            // XPBD: registrado por factory pela Application (instanciado no primeiro corpo) — spec 006.
            // FEM: registrado por factory pela Application — spec 006.
            // MPM: registrado por factory pela Application — spec 006.
            // SPH: registrado por factory pela Application — spec 006.
            if (want('PBF')) app.flows.register(new PBFFlow(ctx.core, ctx.world, ctx.resources));
        },
    };
}
