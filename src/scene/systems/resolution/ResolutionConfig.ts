import type { ResolutionType } from './ResolutionType';

/**
 * Configuração do sistema de resolução de colisões.
 *
 * Parâmetros físicos são compartilhados entre todos os tipos de resolver.
 * Parâmetros específicos de cada tipo são ignorados pelos demais.
 *
 * @example
 * const world = new PhysicsWorld({
 *   resolution: {
 *     type:         ResolutionType.SEQUENTIAL_IMPULSE,
 *     iterations:   10,
 *     warmStarting: true,
 *     friction:     0.6,
 *   },
 * });
 */
export interface ResolutionConfig {
    /** Método de resolução. Default: IMPULSE. */
    type?: ResolutionType;

    // ── Parâmetros físicos (compartilhados) ─────────────────────────────────

    /** Coeficiente de restituição global. Default: 0.3. */
    restitution?: number;
    /** Velocidade relativa mínima (m/s) para aplicar restituição. Default: 1.0. */
    restitutionThreshold?: number;
    /** Coeficiente de atrito de Coulomb (μ). Default: 0.5. */
    friction?: number;
    /**
     * Fator de Baumgarte — fração da penetração corrigida por substep (0–1).
     * Default: 0.4.
     */
    baumgarteFactor?: number;
    /**
     * Penetração mínima (m) antes de aplicar correção de posição.
     * Default: 0.005 (5 mm).
     */
    penetrationSlop?: number;

    // ── Sequential Impulse (PGS) ─────────────────────────────────────────────

    /**
     * Número de iterações PGS por substep.
     * Valores maiores convergem melhor para pilhas, mas custam mais.
     * Default: 10. Ignorado por IMPULSE e PBD.
     */
    iterations?: number;
    /**
     * Reutiliza os impulsos acumulados do frame anterior como ponto de partida.
     * Reduz iterações necessárias para convergência em contatos persistentes.
     * Default: true. Ignorado por IMPULSE e PBD.
     */
    warmStarting?: boolean;
}
