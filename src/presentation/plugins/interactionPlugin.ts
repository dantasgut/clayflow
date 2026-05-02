import type { EnginePlugin } from './EnginePlugin';
import { InteractionSystem } from '../input/InteractionSystem';

/**
 * Opções do interactionPlugin.
 */
export interface InteractionPluginOptions {
    /**
     * Window onde keyboard listeners são registrados. Default: `window` global.
     * Use null para desabilitar keyboard input (apenas pointer/touch).
     */
    readonly window?: Window | null;
}

/**
 * Plugin de interaction com getter público para o `InteractionSystem`
 * após install. Null antes de `app.use(plugin)`.
 */
export interface InteractionPluginInstance extends EnginePlugin {
    /** InteractionSystem ativo (ou null antes do install). */
    readonly system: InteractionSystem | null;
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
): InteractionPluginInstance {
    const state: { system: InteractionSystem | null } = { system: null };
    return {
        name: 'interaction',
        /** Acesso ao InteractionSystem após `app.use(plugin)`. Null antes do install. */
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
