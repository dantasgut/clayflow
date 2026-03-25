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
    /**
     * Backend de simulação RigidBody.
     * 'cpu' — pipeline XPBD/SI em JavaScript (padrão, estável).
     * 'gpu' — pipeline XPBD em compute shaders WGSL (Fase 3).
     * Default: 'cpu'.
     */
    backend?: 'cpu' | 'gpu';
    /**
     * Número de iterações do solver PGS por substep (backend='gpu').
     * Default: 15. (Otimização 3c — compensa substeps=4 vs. substeps=8 anteriores)
     */
    iterations?: number;
    /**
     * Intervalo de frames entre leituras do profiler GPU (backend='gpu').
     * Valores menores aumentam a frequência dos logs de tempo de kernel.
     * Default: 60 (≈1 log/s a 60fps).
     */
    profilerLogInterval?: number;
}
