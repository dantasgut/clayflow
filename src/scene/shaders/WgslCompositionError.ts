/** Motivo de uma falha de montagem de shader. */
export type WgslCompositionErrorKind =
    | 'cycle'
    | 'duplicate-module-name'
    | 'symbol-conflict'
    | 'struct-marker'
    | 'struct-conflict'
    | 'unresolved-reference'
    | 'point-signature'
    | 'point-missing'
    | 'manual-binding'
    | 'limit-exceeded';

/**
 * Erro da montagem de shaders por módulos (`wgslModule`/`composeWgsl`). `detail` traz os envolvidos: o caminho do
 * ciclo, os módulos com o mesmo nome, o símbolo e os seus donos, o marcador e o módulo, as chamadas sem definição, o ponto e a assinatura esperada e recebida.
 */
export class WgslCompositionError extends Error {
    /** Motivo. */
    readonly kind: WgslCompositionErrorKind;
    /** Envolvidos (módulos, símbolos, caminho). */
    readonly detail: readonly string[];

    constructor(kind: WgslCompositionErrorKind, message: string, detail: readonly string[]) {
        super(message);
        this.name = 'WgslCompositionError';
        this.kind = kind;
        this.detail = detail;
    }
}
