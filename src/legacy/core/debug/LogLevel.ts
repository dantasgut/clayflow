/**
 * Níveis de severidade do Logger.
 * A ordem numérica define a filtragem: mensagens abaixo do nível ativo são descartadas.
 */
export enum LogLevel {
    DEBUG  = 0,
    INFO   = 1,
    WARN   = 2,
    ERROR  = 3,
    SILENT = 4,
}
