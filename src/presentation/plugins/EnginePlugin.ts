import type { Application } from '../app/Application';

/**
 * EnginePlugin: extensão pluggable para `Application`. Plugins podem registrar
 * Flows, instalar handlers de evento, criar sistemas auxiliares, etc.
 *
 * Uso:
 * ```ts
 * const app = await Application.create({ canvas });
 * app.use(interactionPlugin({ window }));
 * app.start();
 * ```
 *
 * Plugins built-in:
 *   - `interactionPlugin(opts)` — instala InteractionSystem.
 *
 * Os solvers de física não precisam de plugin: são registrados por factory pela aplicação e instanciados pela C2 no
 * primeiro corpo de cada tipo (`DEFAULT_SOLVER_REGISTRATIONS`).
 *
 * Type-only cycle Application↔EnginePlugin é aceito (madge --exclude documentado).
 */
export interface EnginePlugin {
    /** Identificador único do plugin (para logs/dedup). */
    readonly name: string;
    /** Hook de instalação — chamado antes do GameLoop iniciar; registra flows/listeners/sistemas. */
    install(app: Application): void;
    /**
     * Optional. Cleanup quando Application.dispose() é chamado.
     */
    dispose?(app: Application): void;
}
