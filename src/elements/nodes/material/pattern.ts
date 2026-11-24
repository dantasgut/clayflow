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
 * As ligações do veio da madeira (o nó `rings`, um `pattern.rings`) ao grão `id` (`pattern.grain`) que corre ao longo
 * da fibra: a coordenada é a do veio (`rings.along`: x ao longo da fibra, o raio dos anéis através dela) e o gradiente
 * volta à do padrão por `rings.bend` — a fibra, os sulcos e os riscos acompanham as curvas dos anéis e o desvio em
 * volta dos nós, em vez de cortá-los em linha reta. `wrap` falso: sem período (a coordenada de cada tábua).
 */
export function veinLinks(ids: readonly string[], wrap = true): Link[] {
    return ids.flatMap((id): Link[] => [
        ['rings.along', `${id}.p`],
        ['rings.bend', `${id}.bend`],
        ['uv.width', `${id}.width`],
        ...(wrap ? ([['uv.wrap', `${id}.wrap`]] as Link[]) : []),
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
