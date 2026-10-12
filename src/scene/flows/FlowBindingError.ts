/** Detalhes de um erro de ligação: o binding do WGSL, o pipeline e o Flow. */
export interface FlowBindingErrorDetails {
    readonly flow: string;
    readonly pipeline: string;
    readonly group?: number;
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
    override readonly name = 'FlowBindingError';
    constructor(
        message: string,
        readonly details: FlowBindingErrorDetails,
    ) {
        super(message);
    }
}
