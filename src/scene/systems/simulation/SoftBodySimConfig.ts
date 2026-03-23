/**
 * Configuração da simulação de corpos deformáveis (XPBD SoftBody).
 *
 * Presença deste objeto em `PhysicsWorldOptions.softBody` habilita o
 * pipeline XPBD SoftBody no mundo. Todos os campos são opcionais —
 * `softBody: {}` usa os defaults e já ativa o pipeline.
 *
 * Forças globais (gravidade, vento) são registradas via `world.addForce()`
 * e aplicadas pelo XPBDSoftBodySolver — mesmo padrão do RigidBody.
 * Parâmetros por corpo (compliance, damping) são configurados em SoftBodyOptions.
 */
export interface SoftBodySimConfig {
    /**
     * Número de iterações do solver XPBD por substep.
     * Valores maiores convergem melhor em malhas densas, com custo proporcional.
     * Default: 10.
     */
    iterations?: number;
    /**
     * Coeficiente de restituição na colisão partícula-plano (0–1).
     * Default: 0.05.
     */
    restitution?: number;
}
