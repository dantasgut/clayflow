/**
 * Configuração da simulação de corpos rígidos GPU.
 *
 * Parâmetros do pipeline GPU (XPBD / LCP): iterações, damping, thresholds.
 * Campos de pipeline CPU (resolution, gyroscopic) foram removidos (GPU-only).
 */
export interface RigidBodySimConfig {
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
     * Fator de correção de Baumgarte [0.1–0.3] para o solver LCP/PGS.
     * Controla a velocidade de correção de penetração por bias do constraint.
     * Valores altos convergem mais rápido mas podem introduzir instabilidade.
     * Default: 0.2.
     */
    baumgarteBeta?: number;
    /**
     * Fator de escala para warm starting do solver LCP/PGS [0.8–1.0].
     * Escala os impulsos acumulados do frame anterior usados como solução inicial.
     * 1.0 = warm start completo; 0.0 = desativado.
     * Default: 0.85.
     */
    warmStartFactor?: number;
}
