/**
 * Estado compartilhado entre os stages do pipeline XPBD.
 *
 * Preenchido pelo PredictStage e consumido pelo VelocityRecoveryStage e ContactResponseStage.
 * Isolado em um objeto próprio — não contamina PhysicsStageContext (que é
 * compartilhado com o pipeline SI).
 */
export interface XPBDState {
    /** Posição antes da predição [x, y, z] — chave: body.uuid. */
    posCache: Map<string, [number, number, number]>;
    /** Rotação antes da predição [x, y, z, w] — chave: body.uuid. */
    rotCache: Map<string, [number, number, number, number]>;
    /** Velocidade antes da predição [x, y, z] — usada para restituição. */
    velCache: Map<string, [number, number, number]>;
    /**
     * λ acumulado por contato (índice = posição em context.contacts)
     * escrito pelo SolveStage ao final de cada substep e lido pelo
     * ContactResponseStage para calcular o limite de Coulomb do atrito.
     */
    contactLambda: number[];
}

export function createXPBDState(): XPBDState {
    return {
        posCache:      new Map(),
        rotCache:      new Map(),
        velCache:      new Map(),
        contactLambda: [],
    };
}
