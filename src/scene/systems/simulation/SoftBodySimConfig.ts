import type { ResolutionType } from '../resolution/ResolutionType';

/**
 * Config mínima de resolução para o pipeline SoftBody.
 *
 * Mantida separada de `ResolutionConfig` (que é exclusiva do pipeline RigidBody)
 * para deixar explícita a independência entre os dois pipelines.
 * O único tipo suportado atualmente é `XPBD` — o campo existe para documentação
 * e para tornar a seleção de pipeline simétrica em relação ao RigidBody.
 */
export interface SoftBodyResolutionConfig {
    /**
     * Tipo de pipeline para corpos deformáveis.
     * Atualmente apenas `ResolutionType.XPBD` é implementado (e é o default).
     * Campo reservado para futuros backends (GPU spring-mass, FEM, MPM).
     */
    type?: ResolutionType.XPBD;
}

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
 *
 * @example
 * // Pipeline explícito para cada tipo de corpo:
 * const world = new PhysicsWorld({
 *   rigidBody: { resolution: { type: ResolutionType.SEQUENTIAL_IMPULSE } },
 *   softBody:  { resolution: { type: ResolutionType.XPBD }, iterations: 15 },
 * });
 */
export interface SoftBodySimConfig {
    /**
     * Seleção explícita de pipeline para corpos deformáveis.
     * Permite declarar o tipo de resolução SoftBody independentemente do RigidBody.
     * Default implícito: `ResolutionType.XPBD`.
     */
    resolution?: SoftBodyResolutionConfig;
    /**
     * Número de iterações do solver XPBD por substep.
     * Valores maiores convergem melhor em malhas densas, com custo proporcional.
     * Default: 10.
     */
    iterations?: number;
    /**
     * Coeficiente de restituição na colisão partícula-colissor (0–1).
     * Default: 0.05.
     */
    restitution?: number;
}
