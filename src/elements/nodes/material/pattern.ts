import type { GraphNode } from '../../../scene/graph/NodeGraph';
import { input } from '../input';
import { surface } from '../surface';

// O que os materiais prontos com padrão têm em comum (spec 011, US5): a amostra de superfície como entrada do sub-grafo
// (sem ligação obrigatória: vale a do ponto `material`), o espaço do padrão no uv (`surface.uvSpace`, com a escala
// exposta como `pattern_scale`) e as ligações dele aos padrões e ao relevo. Os padrões são calculados por pixel pelos
// nós `pattern.*`, com a coordenada estável no objeto (o uv), filtrados pela largura do pixel e sem emenda onde o uv dá
// a volta.

/** Uma ligação do grafo: saída → entrada. */
export type Link = readonly [string, string];

/** A entrada `s` do sub-grafo (a amostra de superfície) e o valor dela sem ligação: a amostra do ponto `material`. */
export const SAMPLE_INPUT = {
    inputs: { s: 'SurfaceSample' },
    defaults: { s: 's' },
} as const;

/**
 * Os nós da amostra (`s`) e do espaço do padrão (`uv`): `scale` repetições do padrão por unidade de uv (o
 * `pattern_scale` exposto) e o deslocamento `offset` do padrão.
 */
export function patternSpace(
    offset: readonly [number, number] = [0, 0],
): Record<string, GraphNode> {
    return { s: input.surfaceSample(), uv: surface.uvSpace.with({ offset: [...offset] }) };
}

/** As ligações da amostra ao espaço do padrão. */
export const SPACE_LINKS: readonly Link[] = [
    ['s.uv', 'uv.uv'],
    ['s.duvdx', 'uv.duvdx'],
    ['s.duvdy', 'uv.duvdy'],
    ['s.dpdu', 'uv.dpdu'],
    ['s.dpdv', 'uv.dpdv'],
];

/** As ligações do espaço do padrão ao nó de padrão `id` (coordenada, largura do pixel e período). */
export function patternLinks(...ids: readonly string[]): Link[] {
    return ids.flatMap((id): Link[] => [
        ['uv.p', `${id}.p`],
        ['uv.width', `${id}.width`],
        ['uv.wrap', `${id}.wrap`],
    ]);
}

/**
 * As ligações do relevo `id` (`surface.bump`): a normal de partida (`from`: a da amostra, ou a de outro relevo — os
 * dois se somam), as tangentes do espaço do padrão e o gradiente `gradient` (a saída de um padrão).
 */
export function bumpLinks(id: string, gradient: string, from = 's.normal'): Link[] {
    return [
        [from, `${id}.normal`],
        ['uv.du', `${id}.du`],
        ['uv.dv', `${id}.dv`],
        [gradient, `${id}.gradient`],
    ];
}

/** O parâmetro exposto comum: a escala do padrão no uv. */
export const PATTERN_SCALE = ['uv.scale', 'pattern_scale'] as const;
