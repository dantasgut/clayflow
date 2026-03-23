/**
 * Estado compartilhado entre os stages do pipeline PBD.
 *
 * Preenchido pelo PBDPredictStage e consumido pelo PBDVelocityUpdateStage.
 * Isolado em um objeto próprio — não contamina PhysicsStageContext (que é
 * compartilhado com o pipeline SI).
 */
export interface PBDState {
    /** Posição antes da predição [x, y, z] — chave: body.uuid. */
    posCache: Map<string, [number, number, number]>;
    /** Rotação antes da predição [x, y, z, w] — chave: body.uuid. */
    rotCache: Map<string, [number, number, number, number]>;
    /** Velocidade antes da predição [x, y, z] — usada para restituição. */
    velCache: Map<string, [number, number, number]>;
    /**
     * λ acumulado por contato (índice = posição em context.contacts)
     * escrito pelo PBDSolveStage ao final de cada substep e lido pelo
     * PBDVelocityUpdateStage para calcular o limite de Coulomb do atrito.
     */
    contactLambda: number[];
}

export function createPBDState(): PBDState {
    return {
        posCache:      new Map(),
        rotCache:      new Map(),
        velCache:      new Map(),
        contactLambda: [],
    };
}
