import type { ResolutionConfig } from '../resolution/ResolutionConfig';

/**
 * Configuração da simulação de corpos rígidos.
 *
 * Agrupa exclusivamente os parâmetros do pipeline RigidBody:
 * método de resolução (SI / XPBD) e estágios opcionais de estabilização.
 *
 * Parâmetros de detecção de colisão (narrowphase, contatos especulativos)
 * ficam em `CollisionSimConfig`, pois são independentes do tipo de corpo.
 */
export interface RigidBodySimConfig {
    /** Método de resolução e seus parâmetros numéricos. */
    resolution?: ResolutionConfig;
    /**
     * Habilita correção giroscópica (Δω = −I⁻¹·(ω × I·ω)·dt).
     * Previne drift em corpos com tensor de inércia assimétrico girando
     * em alta velocidade (bastão, placa). Default: false.
     */
    gyroscopic?: boolean;
}
