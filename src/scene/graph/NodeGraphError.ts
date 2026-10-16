/** Motivo de um erro de grafo de nós. */
export type NodeGraphErrorKind =
    | 'node-signature'
    | 'unknown-node'
    | 'unknown-port'
    | 'type-mismatch'
    | 'unconnected-input'
    | 'duplicate-link'
    | 'cycle'
    | 'context'
    | 'target'
    | 'serialization';

/**
 * Erro de um grafo de nós (spec 031, FR-015): síncrono, na criação ou na alteração. `detail` nomeia os nós e as
 * portas envolvidos (o caminho, num ciclo).
 */
export class NodeGraphError extends Error {
    readonly kind: NodeGraphErrorKind;
    readonly detail: readonly string[];

    constructor(kind: NodeGraphErrorKind, message: string, detail: readonly string[]) {
        super(message);
        this.name = 'NodeGraphError';
        this.kind = kind;
        this.detail = detail;
    }
}
