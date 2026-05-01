import type { Application } from '../app/Application';

/**
 * EnginePlugin: extensão pluggable para `Application`. Plugins podem registrar
 * Flows, instalar handlers de evento, criar sistemas auxiliares, etc.
 *
 * Uso:
 * ```ts
 * const app = await Application.create({ canvas });
 * app.use(physicsPlugin());
 * app.use(interactionPlugin({ window }));
 * app.start();
 * ```
 *
 * Plugins built-in:
 *   - `physicsPlugin()` — registra todos os physics flows.
 *   - `interactionPlugin(opts)` — instala InteractionSystem.
 *
 * Type-only cycle Application↔EnginePlugin é aceito (madge --exclude documentado).
 */
export interface EnginePlugin {
    readonly name: string;
    install(app: Application): void;
    /**
     * Optional. Cleanup quando Application.dispose() é chamado.
     */
    dispose?(app: Application): void;
}
