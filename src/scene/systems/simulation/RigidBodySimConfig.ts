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
    /**
     * Margem especulativa para detecção de contatos iminentes (backend='gpu').
     * 0 = desativado (padrão). Valores > 0 ativam contatos especulativos para prevenir
     * tunelamento em corpos velozes. Valor sugerido: 0.05 (5 cm).
     * Default: 0 (desativado).
     */
    predictiveThreshold?: number;
    /**
     * Velocidade de aproximação (m/s) abaixo da qual o coeficiente de restituição é
     * forçado a zero, eliminando quique em colisões de baixa energia (backend='gpu').
     * Default: 2.0 (m/s — queda de ~20 cm já não quica).
     */
    restitutionThreshold?: number;
    /**
     * Velocidade linear (m/s) abaixo da qual o corpo é considerado em repouso e tem
     * vel/omega zerados (pseudo-sleep) para evitar vibração residual (backend='gpu').
     * 0 = desativado. Default: 0.01 (1 cm/s).
     */
    sleepLinThreshold?: number;
    /**
     * Fator de correção de Baumgarte [0.1–0.3] para o solver LCP/PGS (backend='gpu', ResolutionType.LCP).
     * Controla a velocidade de correção de penetração por bias do constraint.
     * Valores altos convergem mais rápido mas podem introduzir instabilidade.
     * Default: 0.2.
     */
    baumgarteBeta?: number;
    /**
     * Fator de escala para warm starting do solver LCP/PGS [0.8–1.0] (backend='gpu', ResolutionType.LCP).
     * Escala os impulsos acumulados do frame anterior usados como solução inicial.
     * 1.0 = warm start completo; 0.0 = desativado.
     * Default: 0.85.
     */
    warmStartFactor?: number;
}
