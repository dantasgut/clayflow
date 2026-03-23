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

    // ── XPBD ─────────────────────────────────────────────────────────────────

    /**
     * Compliance da constraint de contato (m/N — inverso da rigidez).
     * α = 0 → rígido (padrão); α > 0 → suaviza a correção por substep,
     * limitando Δpos = depth / (wSum + α/dt²) e prevenindo explosões
     * de velocidade angular em corpos alongados (bastão, placa).
     * Valores típicos: 1e-6 (quase rígido) a 1e-3 (notavelmente elástico).
     * Default: 0. Ignorado por IMPULSE e SEQUENTIAL_IMPULSE.
     */
    compliance?: number;

    /**
     * Escala a correção angular da constraint de posição XPBD (0–1).
     * 0 = sem correção angular (corpos tombam livremente — recomendado).
     * 1 = XPBD padrão (torque restaurador forte, pode impedir tombamento).
     * Default: 0.
     */
    angularCorrectionScale?: number;

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
    /**
     * Fator de sobre-relaxação do PGS (ω). Range recomendado: [1.0, 1.5].
     * Valores > 1 aceleram a convergência para pilhas de objetos, reduzindo
     * o número de iterações necessárias. Valores > 1.5 podem causar
     * instabilidade em cenas densas. Default: 1.0 (sem sobre-relaxação).
     * Ignorado por IMPULSE e PBD.
     */
    overRelaxation?: number;
    /**
     * Habilita Friction Anchors — armazena o ponto de contato inicial e aplica
     * uma velocidade de restauração para prevenir drift em superfícies inclinadas.
     * Default: false. Ignorado por IMPULSE e PBD.
     */
    frictionAnchors?: boolean;
    /**
     * Fator de restauração do Friction Anchor (0–1).
     * Controla com que intensidade o anchor puxa o objeto de volta à posição
     * original de contato. Valores altos (> 0.5) podem causar vibração.
     * Default: 0.2. Ignorado se frictionAnchors = false.
     */
    frictionAnchorBeta?: number;
}
