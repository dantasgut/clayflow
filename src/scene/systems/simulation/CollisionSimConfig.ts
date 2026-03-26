/**
 * Configuração do pipeline de detecção de colisão.
 * Parâmetros de narrowphase CPU foram removidos (GPU-only).
 */
export interface CollisionSimConfig {
    /**
     * Habilita contatos especulativos anti-tunneling.
     * Testa posições previstas (pos + vel·dt) para pares sem contato atual,
     * gerando contatos preventivos antes da penetração ocorrer.
     * Default: false.
     */
    predictiveContacts?: boolean;
    /** Velocidade relativa mínima (m/s) para ativar contatos especulativos. Default: 2.0. */
    predictiveContactsThreshold?: number;
}
