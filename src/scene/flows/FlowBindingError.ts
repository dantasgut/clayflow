/** Detalhes de um erro de ligação: o binding do WGSL, o pipeline e o Flow. */
export interface FlowBindingErrorDetails {
    /** `type` do Flow. */
    readonly flow: string;
    /** Id do pipeline. */
    readonly pipeline: string;
    /** Índice do `@group`. */
    readonly group?: number;
    /** Índice do `@binding`. */
    readonly binding?: number;
    /** Nome da variável no WGSL. */
    readonly variable?: string;
    /** Nome de `consumes` envolvido. */
    readonly consumes?: string;
}

/**
 * Erro na preparação de um pipeline de Flow pela C2 (FR-012): binding do WGSL sem fonte (nem privado, nem coberto
 * por `consumes`), nome de `consumes` sem resolver, dois nomes de `consumes` para o mesmo tipo, ou fonte incompatível
 * com o binding (uniform × storage, profundidade × cor). A mensagem nomeia binding, grupo, pipeline, Flow e nome.
 */
export class FlowBindingError extends Error {
    /** Nome do erro (`'FlowBindingError'`). */
    override readonly name = 'FlowBindingError';
    /**
     * @param message - Mensagem com binding, grupo, pipeline, Flow e nome.
     * @param details - Os mesmos dados, estruturados.
     */
    constructor(
        message: string,
        /** Binding, grupo, pipeline, Flow e nome de `consumes` envolvidos. */
        readonly details: FlowBindingErrorDetails,
    ) {
        super(message);
    }
}
