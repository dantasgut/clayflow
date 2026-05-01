import type { EnginePlugin } from './EnginePlugin';
import { InteractionSystem } from '../input/InteractionSystem';

export interface InteractionPluginOptions {
    readonly window?: Window | null;
}

/**
 * Cria + attach um `InteractionSystem` ao Application. O sistema fica
 * acessível via `app.interaction` (extension property; usar
 * `(app as any).interaction` ou keep a referência local).
 *
 * Detach ocorre automaticamente em `app.dispose()` via plugin.dispose hook.
 *
 * Uso:
 * ```ts
 * const plugin = interactionPlugin();
 * app.use(plugin);
 * plugin.system.addController(new OrbitController(...));
 * ```
 */
export function interactionPlugin(
    options: InteractionPluginOptions = {},
): EnginePlugin & { system: InteractionSystem | null } {
    const state: { system: InteractionSystem | null } = { system: null };
    return {
        name: 'interaction',
        get system() {
            return state.system;
        },
        install(app) {
            const sys = new InteractionSystem(
                {
                    canvas: app.canvas,
                    window: options.window ?? (typeof window !== 'undefined' ? window : null),
                },
                app.events,
            );
            sys.attach();
            state.system = sys;
        },
        dispose(_app) {
            if (state.system !== null) {
                state.system.detach();
                state.system = null;
            }
        },
    };
}
