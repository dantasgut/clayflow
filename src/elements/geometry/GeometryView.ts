import type { EntityId } from '../../scene/world/EntityId';

/**
 * Tipo de uma vista da geometria (spec 041, R20): quem a olha e, por isso, o critério do erro.
 * - `'camera'`: uma câmera (a entidade com `Camera`): o tamanho na imagem dela — a fração da altura da imagem por
 *   segmento e o erro de corda da superfície, os mesmos da malha da câmera ativa.
 * - `'light'`: a luz direcional com o mapa de sombra virtual (a entidade com `ShadowMap`): o erro de corda em texels do
 *   nível do mapa onde o retalho cai (lido do `ShadowMatrix` do quadro) e o segmento mínimo de um texel.
 */
export type GeometryViewKind = 'camera' | 'light';

/**
 * Pedido de uma vista adaptativa da geometria (spec 041, R20): quem consome uma vista diferente da câmera ativa (o
 * estágio de sombra, um reflexo, outra câmera) a pede à geometria; a geometria acrescenta os descritores da vista
 * (vértices, índices e o registro indireto, com o orçamento constante de vértices dela) e o produtor da geometria a
 * refaz pelo critério da vista. A malha da câmera ativa continua a de sempre (`vertices`, `indices`, `indirect`).
 */
export interface GeometryViewRequest {
    /** Nome da vista na geometria (os descritores `view:<key>:<parte>`); um por consumidor. */
    readonly key: string;
    /** Quem olha (o critério). */
    readonly kind: GeometryViewKind;
    /** A entidade da vista: a da `Camera` (`'camera'`) ou a do `ShadowMap` (`'light'`). */
    readonly source: EntityId;
    /** `'light'`: erro de corda tolerado em texels do nível do mapa. Padrão 0,5. */
    readonly error?: number;
    /** `'light'`: o menor segmento em texels do nível (nenhum triângulo menor que o texel). Padrão 1. */
    readonly segment?: number;
}

/** Vista resolvida (valores efetivos). */
export interface GeometryView {
    readonly key: string;
    readonly kind: GeometryViewKind;
    readonly source: EntityId;
    readonly error: number;
    readonly segment: number;
}

/** As partes da saída de uma vista. */
export type GeometryViewPart = 'vertices' | 'indices' | 'indirect';

/** Id do descritor da parte `part` da vista `key` na geometria. */
export function geometryViewDescriptor(key: string, part: GeometryViewPart): string {
    return `view:${key}:${part}`;
}

/** Os valores efetivos de um pedido. @throws RangeError com erro ou segmento fora de (0, ∞). */
export function resolveGeometryView(request: GeometryViewRequest): GeometryView {
    const error = request.error ?? 0.5;
    const segment = request.segment ?? 1;
    for (const [name, v] of [
        ['erro', error],
        ['segmento', segment],
    ] as const) {
        if (!(v > 0) || !Number.isFinite(v))
            throw new RangeError(`GeometryView '${request.key}': ${name} ${v} inválido (> 0).`);
    }
    if (request.key.length === 0) throw new RangeError('GeometryView: nome vazio.');
    return { key: request.key, kind: request.kind, source: request.source, error, segment };
}
