import type { Application } from '../app/Application';

/**
 * EnginePlugin: extensão pluggable para `Application`. Plugins podem registrar
 * Flows, instalar handlers de evento, criar sistemas auxiliares, etc.
 *
 * Uso:
 * ```ts
 * const app = await Application.create({ canvas });
 * app.use(myPlugin);
 * app.start();
 * ```
 *
 * A entrada (`app.input`) e os controllers de câmera não precisam de plugin: a aplicação liga os dispositivos e tica
 * os controllers da cena (spec 007).
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
