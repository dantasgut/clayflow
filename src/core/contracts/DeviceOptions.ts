/**
 * Preferências do usuário para o device GPU, aplicadas em `EngineCore.initialize()` e reaplicadas em
 * `requestRecover()`. Todas opcionais: sem elas o motor pede o adaptador padrão, as features opcionais que
 * usa (quando disponíveis) e os limites de escala no máximo do adaptador.
 */
export interface DeviceOptions {
    /** Preferência de potência repassada a `requestAdapter`. Ausente = escolha do navegador. */
    readonly powerPreference?: 'low-power' | 'high-performance';
    /** Features obrigatórias: se o adaptador não oferece alguma, a criação do device falha nomeando-a. */
    readonly requiredFeatures?: readonly GPUFeatureName[];
    /** Features desejadas: pedidas se disponíveis; as ausentes aparecem em `missingFeatures`. */
    readonly optionalFeatures?: readonly GPUFeatureName[];
    /**
     * Limites pedidos pelo usuário. Valor acima do máximo do adaptador → usa o máximo e registra em
     * `DeviceCapabilities.clampedLimits`.
     */
    readonly requiredLimits?: Readonly<Record<string, number>>;
}

/** Identificação do adaptador GPU obtido (`GPUAdapterInfo` + fallback). */
export interface AdapterDescription {
    /** Fabricante (ex.: `apple`, `nvidia`). Pode vir vazio por privacidade do navegador. */
    readonly vendor: string;
    /** Família/arquitetura (ex.: `metal-3`). Pode vir vazia. */
    readonly architecture: string;
    /** Identificador do dispositivo. Pode vir vazio. */
    readonly device: string;
    /** Descrição legível. Pode vir vazia. */
    readonly description: string;
    /** `true` quando o adaptador é a implementação de software de fallback. */
    readonly isFallbackAdapter: boolean;
}

/** Limite pedido que excedia o máximo do adaptador e foi reduzido. */
export interface ClampedLimit {
    /** Nome do limite (`GPUSupportedLimits`). */
    readonly name: string;
    /** Valor pedido em `DeviceOptions.requiredLimits`. */
    readonly requested: number;
    /** Valor concedido (máximo do adaptador). */
    readonly granted: number;
}

/**
 * Relatório das capacidades efetivas do device atual, devolvido por `EngineCore.capabilities()` (só dados).
 * Recalculado a cada criação de device (inicialização e recuperação).
 */
export interface DeviceCapabilities {
    /** Adaptador obtido. */
    readonly adapter: AdapterDescription;
    /** Preferência de potência pedida (`'default'` quando não informada). */
    readonly powerPreference: 'low-power' | 'high-performance' | 'default';
    /** Features habilitadas no device. */
    readonly features: readonly GPUFeatureName[];
    /** Features desejadas (pelo motor ou pelo usuário) que o adaptador não oferece. */
    readonly missingFeatures: readonly GPUFeatureName[];
    /** Limites efetivos do device (nome → valor). */
    readonly limits: Readonly<Record<string, number>>;
    /** Limites pedidos acima do máximo do adaptador, com o valor concedido. */
    readonly clampedLimits: readonly ClampedLimit[];
}
