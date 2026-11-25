import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { NodeGraph, type GraphNode } from '../../../scene/graph/NodeGraph';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { map } from '../map';
import { math } from '../math';
import { pattern } from '../pattern';
import { surface } from '../surface';
import {
    bumpLinks,
    type Link,
    PATTERN_SCALE,
    patternLinks,
    patternSpace,
    SAMPLE_INPUT,
    SPACE_LINKS,
} from './pattern';

// Vidros, cristais e gemas (spec 011, retomada). Os transparentes são o `material.glass` com as constantes ópticas de
// cada mineral: a reflexão de dielétrico somada à transmissão com refração traçada, as duas com o mesmo IOR; a cor
// vem da absorção no percurso (`color` é a cor depois de `depth` unidades do mundo dentro da peça: a pedra grossa é
// mais escura e mais saturada que a fina); a dispersão ("fogo") pelo número de Abbe. O brilho de uma gema lapidada é
// da geometria — as facetas e as reflexões internas —, não do material: numa esfera ela é uma bola de vidro colorido.
// Índices de refração: os tabelados de cada mineral (raio ordinário nos birrefringentes — a birrefringência não é
// calculada); números de Abbe: o do diamante (55,3) e o do quartzo (69) são os tabelados, os demais são estimados da
// dispersão B−G publicada de cada pedra.

type Rgb = readonly [number, number, number];

/** Os valores de um transparente. */
interface ClearValues {
    readonly ior: number;
    readonly abbe: number;
    /** A cor depois de `depth` unidades de percurso (`depth` 0: sem absorção). */
    readonly color?: Rgb;
    readonly depth?: number;
    readonly roughness?: number;
    /** O espalhamento do meio por unidade de percurso (as inclusões finas: o véu leitoso). */
    readonly scatter?: Rgb;
}

/**
 * Sub-grafo de um transparente: `bsdf.dielectric` + `bsdf.transmission` de mesmo IOR e rugosidade, com a absorção, a
 * dispersão e — com `scatter` — o espalhamento do meio. Parâmetros: `ior`, `roughness`, `color`, `depth`, `abbe` e, com
 * `scatter`, `scatter`.
 */
function clearOf(name: string, v: ClearValues): NodeDefinition {
    const milky = v.scatter !== undefined;
    const nodes: Record<string, GraphNode> = {
        ior: math.value.with({ value: v.ior }),
        roughness: math.value.with({ value: v.roughness ?? 0 }),
        reflection: bsdf.dielectric,
        refraction: bsdf.transmission.with({
            abbe: v.abbe,
            color: [...(v.color ?? [1, 1, 1])],
            depth: v.depth ?? 0,
        }),
        ...(milky
            ? { veil: closure.mediumScatter.with({ scatter: [...v.scatter!], anisotropy: 0.3 }) }
            : {}),
        out: closure.add,
    };
    const links: Link[] = [
        ['ior.value', 'reflection.ior'],
        ['ior.value', 'refraction.ior'],
        ['roughness.value', 'reflection.roughness'],
        ['roughness.value', 'refraction.roughness'],
        ['reflection.value', 'out.a'],
        ...(milky
            ? ([
                  ['refraction.value', 'veil.c'],
                  ['veil.value', 'out.b'],
              ] as Link[])
            : ([['refraction.value', 'out.b']] as Link[])),
    ];
    return Subgraph.point(new NodeGraph({ nodes, links, output: 'out.value' }), {
        name,
        expose: [
            ['ior.value', 'ior'],
            ['roughness.value', 'roughness'],
            ['refraction.color', 'color'],
            ['refraction.depth', 'depth'],
            ['refraction.abbe', 'abbe'],
            ...(milky ? ([['veil.scatter', 'scatter']] as const) : []),
        ],
    });
}

/** `material.glassGreen` — vidro de garrafa verde (sodo-cálcico com ferro e cromo): IOR 1,52, a cor na espessura. */
export const glassGreen = clearOf('material.glassGreen', {
    ior: 1.52,
    abbe: 58,
    color: [0.22, 0.62, 0.26],
    depth: 1.2,
});

/** `material.glassBlue` — vidro azul-cobalto: IOR 1,52; o cobalto absorve do vermelho ao verde. */
export const glassBlue = clearOf('material.glassBlue', {
    ior: 1.52,
    abbe: 58,
    color: [0.04, 0.14, 0.78],
    depth: 1.2,
});

/** `material.glassAmber` — vidro âmbar (o do frasco de remédio, da garrafa de cerveja): IOR 1,52. */
export const glassAmber = clearOf('material.glassAmber', {
    ior: 1.52,
    abbe: 58,
    color: [0.78, 0.36, 0.05],
    depth: 1.2,
});

/** `material.glassFrosted` — vidro jateado: o do `glass` com as duas interfaces ásperas (rugosidade 0,35). */
export const glassFrosted = clearOf('material.glassFrosted', {
    ior: 1.52,
    abbe: 58,
    roughness: 0.35,
});

/**
 * `material.crystal` — cristal de chumbo (o do cálice e do lustre lapidados): vidro com 24 % de óxido de chumbo — IOR
 * 1,58 e número de Abbe 41: reflete mais e separa mais as cores que o vidro comum.
 */
export const crystal = clearOf('material.crystal', { ior: 1.58, abbe: 41 });

/** `material.quartz` — cristal de rocha (quartzo hialino): incolor, IOR 1,544, número de Abbe 69. */
export const quartz = clearOf('material.quartz', { ior: 1.544, abbe: 69 });

/** `material.amethyst` — ametista (quartzo roxo, o ferro irradiado): IOR 1,544; do lilás ao roxo fundo na espessura. */
export const amethyst = clearOf('material.amethyst', {
    ior: 1.544,
    abbe: 69,
    color: [0.42, 0.1, 0.72],
    depth: 2.5,
});

/** `material.citrine` — citrino (quartzo amarelo): IOR 1,544; do amarelo-palha ao mel. */
export const citrine = clearOf('material.citrine', {
    ior: 1.544,
    abbe: 69,
    color: [0.95, 0.6, 0.1],
    depth: 2.5,
});

/**
 * `material.roseQuartz` — quartzo rosa: IOR 1,544; rosa pálido e leitoso — as fibras microscópicas que dão a cor
 * também espalham a luz (`scatter`, por unidade de percurso).
 */
export const roseQuartz = clearOf('material.roseQuartz', {
    ior: 1.544,
    abbe: 69,
    color: [0.96, 0.62, 0.66],
    depth: 2.5,
    scatter: [1.6, 1.5, 1.5],
});

/**
 * `material.diamond` — diamante: incolor, IOR 2,417 (reflete 17 % de frente, contra 4 % do vidro; o ângulo crítico de
 * 24,4° é o que prende a luz na lapidação brilhante) e número de Abbe 55,3 (a dispersão de 0,044: o "fogo").
 */
export const diamond = clearOf('material.diamond', { ior: 2.417, abbe: 55.3 });

/** `material.ruby` — rubi (coríndon com cromo): IOR 1,77; vermelho de sangue, quase sem verde nem azul. */
export const ruby = clearOf('material.ruby', {
    ior: 1.77,
    abbe: 72,
    color: [0.78, 0.02, 0.07],
    depth: 2.5,
});

/** `material.sapphire` — safira azul (coríndon com ferro e titânio): IOR 1,77. */
export const sapphire = clearOf('material.sapphire', {
    ior: 1.77,
    abbe: 72,
    color: [0.03, 0.1, 0.72],
    depth: 2.5,
});

/** `material.emerald` — esmeralda (berilo com cromo): IOR 1,58; verde levemente azulado. */
export const emerald = clearOf('material.emerald', {
    ior: 1.58,
    abbe: 60,
    color: [0.02, 0.56, 0.24],
    depth: 2.5,
});

/** `material.aquamarine` — água-marinha (berilo com ferro): IOR 1,58; azul-esverdeado claro. */
export const aquamarine = clearOf('material.aquamarine', {
    ior: 1.58,
    abbe: 60,
    color: [0.45, 0.86, 0.92],
    depth: 2.5,
});

/** `material.topaz` — topázio azul: IOR 1,62. */
export const topaz = clearOf('material.topaz', {
    ior: 1.62,
    abbe: 60,
    color: [0.2, 0.66, 0.95],
    depth: 2.5,
});

/** `material.garnet` — granada (piropo-almandina): IOR 1,79; vermelho-vinho escuro. */
export const garnet = clearOf('material.garnet', {
    ior: 1.79,
    abbe: 42,
    color: [0.42, 0.015, 0.04],
    depth: 2.5,
});

/** `material.peridot` — peridoto (olivina): IOR 1,67; verde-oliva amarelado. */
export const peridot = clearOf('material.peridot', {
    ior: 1.67,
    abbe: 50,
    color: [0.5, 0.8, 0.12],
    depth: 2.5,
});

/**
 * `material.amber` — âmbar (resina fóssil): IOR 1,54; do mel ao conhaque na espessura, com o véu leve das bolhas e
 * inclusões microscópicas (`scatter`).
 */
export const amber = clearOf('material.amber', {
    ior: 1.54,
    abbe: 45,
    color: [0.9, 0.42, 0.04],
    depth: 2.5,
    scatter: [0.5, 0.4, 0.25],
});

/** `material.obsidian` — obsidiana (vidro vulcânico): IOR 1,49; preta na massa, fumê só na lasca fina. */
export const obsidian = clearOf('material.obsidian', {
    ior: 1.49,
    abbe: 55,
    color: [0.03, 0.028, 0.03],
    depth: 0.05,
});

/** O corpo difuso de cor `color` sob a interface polida de um mineral opaco, com a normal `normal`. */
function polished(ior: number, roughness: number): Record<string, GraphNode> {
    return {
        body: bsdf.diffuse.with({ roughness: 0.6 }),
        specular: bsdf.dielectric.with({ ior, roughness }),
        sum: closure.add,
        out: closure.normal,
    };
}

function polishedLinks(color: string, normal: string): Link[] {
    return [
        [color, 'body.color'],
        ['specular.value', 'sum.a'],
        ['body.value', 'sum.b'],
        ['sum.value', 'out.c'],
        [normal, 'out.normal'],
    ];
}

/**
 * `material.turquoise` — turquesa: fosfato de cobre opaco, azul-esverdeado (`color`), com a matriz — a rede de veios
 * castanho-escuros da rocha hospedeira (`matrix_color`: as linhas em que um grão de cinco oitavas passa por zero) — e as manchas de
 * tom; polimento ceroso (IOR 1,62, rugosidade 0,18). Parâmetros: `color`, `matrix_color`, `roughness`, `relief`,
 * `pattern_scale`.
 */
export const turquoise = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            web: pattern.grain.with({ scale: [2.4, 2.4], octaves: 5, gain: 0.62, seed: 501 }),
            web_distance: math.abs,
            vein: map.range.with({ in_min: 0.006, in_max: 0.035 }),
            patchy: pattern.grain.with({ scale: [2.5, 2.5], octaves: 4, gain: 0.55, seed: 502 }),
            speck: pattern.grain.with({ scale: [60, 60], octaves: 2, seed: 503 }),
            blue: math.value3.with({ value: [0.06, 0.5, 0.52] }),
            green: math.value3.with({ value: [0.1, 0.48, 0.36] }),
            matrix: math.value3.with({ value: [0.07, 0.04, 0.02] }),
            drift: map.range.with({ in_min: -0.5, in_max: 0.5 }),
            stone: math.mix3,
            speckled: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.08 }),
            lit: math.scale3,
            veined: math.mix3,
            relief: surface.bump.with({ strength: 0.0002 }),
            ...polished(1.62, 0.18),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('web', 'patchy', 'speck'),
            ['patchy.value', 'drift.x'],
            ['blue.value', 'stone.a'],
            ['green.value', 'stone.b'],
            ['drift.value', 'stone.t'],
            ['speck.value', 'speckled.x'],
            ['stone.value', 'lit.v'],
            ['speckled.value', 'lit.s'],
            ['matrix.value', 'veined.a'],
            ['lit.value', 'veined.b'],
            ['web.value', 'web_distance.x'],
            ['web_distance.value', 'vein.x'],
            ['vein.value', 'veined.t'],
            ...bumpLinks('relief', 'speck.gradient'),
            ...polishedLinks('veined.value', 'relief.value'),
        ],
        output: 'out.value',
    }),
    {
        name: 'material.turquoise',
        ...SAMPLE_INPUT,
        expose: [
            ['blue.value', 'color'],
            ['matrix.value', 'matrix_color'],
            ['specular.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.lapisLazuli` — lápis-lazúli: a lazurita azul-ultramar (`color`), manchada do azul-escuro ao violeta, com os
 * veios brancos de calcita (`calcite_color`: onde um grão largo passa por zero) e os pontos de pirita — cristais
 * dourados miúdos, um condutor (`pyrite_color`), nas células de um Voronoi fino que passam de um nível, mais juntos em
 * nuvens. Polido (IOR 1,5, rugosidade 0,1). Parâmetros: `color`, `calcite_color`, `pyrite_color`, `roughness`,
 * `pattern_scale`.
 */
export const lapisLazuli = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            cloud: pattern.grain.with({ scale: [3, 3], octaves: 5, gain: 0.55, seed: 511 }),
            vein: pattern.grain.with({ scale: [2.2, 2.2], octaves: 4, gain: 0.6, seed: 512 }),
            fleck: pattern.cells.with({ scale: 90, jitter: 1, crease: 0.5, seed: 513 }),
            swarm: pattern.grain.with({ scale: [4, 4], octaves: 3, seed: 514 }),
            deep: math.value3.with({ value: [0.015, 0.035, 0.32] }),
            dark: math.value3.with({ value: [0.01, 0.012, 0.11] }),
            calcite: math.value3.with({ value: [0.72, 0.72, 0.7] }),
            mottle: map.range.with({ in_min: -0.5, in_max: 0.5 }),
            blue: math.mix3,
            distance: math.abs,
            streak: map.range.with({ in_min: 0.004, in_max: 0.022, out_min: 0.55, out_max: 0 }),
            stone: math.mix3,
            crowd: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: -0.12, out_max: 0.12 }),
            level: math.add,
            some: map.range.with({ in_min: 0.9, in_max: 0.91 }),
            core: map.range.with({ in_min: 0.3, in_max: 0.5 }),
            gilt: math.mul,
            pyrite: bsdf.conductor.with({
                color: [0.86, 0.72, 0.4],
                edge_tint: [0.98, 0.93, 0.78],
                roughness: 0.2,
            }),
            ...polished(1.5, 0.1),
            flecked: closure.mix,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('cloud', 'vein', 'fleck', 'swarm'),
            ['cloud.value', 'mottle.x'],
            ['dark.value', 'blue.a'],
            ['deep.value', 'blue.b'],
            ['mottle.value', 'blue.t'],
            ['vein.value', 'distance.x'],
            ['distance.value', 'streak.x'],
            ['blue.value', 'stone.a'],
            ['calcite.value', 'stone.b'],
            ['streak.value', 'stone.t'],
            ['swarm.value', 'crowd.x'],
            ['fleck.cell', 'level.a'],
            ['crowd.value', 'level.b'],
            ['level.value', 'some.x'],
            ['fleck.height', 'core.x'],
            ['some.value', 'gilt.a'],
            ['core.value', 'gilt.b'],
            ['stone.value', 'body.color'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'flecked.a'],
            ['pyrite.value', 'flecked.b'],
            ['gilt.value', 'flecked.t'],
            ['flecked.value', 'out.c'],
            ['s.normal', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.lapisLazuli',
        ...SAMPLE_INPUT,
        expose: [
            ['deep.value', 'color'],
            ['calcite.value', 'calcite_color'],
            ['pyrite.color', 'pyrite_color'],
            ['specular.roughness', 'roughness'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.malachite` — malaquita: as faixas concêntricas de verde-claro e verde-escuro do crescimento botrioidal — as
 * curvas de nível de um grão largo (`bands` faixas por unidade do valor dele), cada faixa com a borda viva de um lado
 * e o tom esmaecendo do outro —, polida (IOR 1,75, rugosidade 0,07). Parâmetros: `color`, `dark_color`, `bands`,
 * `roughness`, `pattern_scale`.
 */
export const malachite = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            growth: pattern.grain.with({ scale: [1.6, 1.6], octaves: 3, gain: 0.45, seed: 521 }),
            bands: math.value.with({ value: 9 }),
            many: math.value.with({ value: 31 }),
            wide_at: math.mul,
            wide: math.fract,
            thin_at: math.mul,
            thin: math.fract,
            thin_part: map.range.with({ out_min: 0.75, out_max: 1 }),
            tone: math.mul,
            light: math.value3.with({ value: [0.06, 0.5, 0.3] }),
            dark: math.value3.with({ value: [0.0, 0.09, 0.05] }),
            green: math.mix3,
            ...polished(1.75, 0.07),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('growth'),
            ['growth.value', 'wide_at.a'],
            ['bands.value', 'wide_at.b'],
            ['wide_at.value', 'wide.x'],
            ['growth.value', 'thin_at.a'],
            ['many.value', 'thin_at.b'],
            ['thin_at.value', 'thin.x'],
            ['thin.value', 'thin_part.x'],
            ['wide.value', 'tone.a'],
            ['thin_part.value', 'tone.b'],
            ['dark.value', 'green.a'],
            ['light.value', 'green.b'],
            ['tone.value', 'green.t'],
            ...polishedLinks('green.value', 's.normal'),
        ],
        output: 'out.value',
    }),
    {
        name: 'material.malachite',
        ...SAMPLE_INPUT,
        expose: [
            ['light.value', 'color'],
            ['dark.value', 'dark_color'],
            ['bands.value', 'bands'],
            ['specular.roughness', 'roughness'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.opal` — opala nobre: o corpo leitoso e translúcido (subsuperfície branco-azulada, `color`, raio de
 * espalhamento em milímetros) e o jogo de cores — as placas de esferas de sílica empilhadas, cada placa
 * (`pattern.cells`) com o seu passo: um refletor com película fina de espessura própria (de `thickness_min` a
 * `thickness_max` nm), cuja cor muda com o ângulo —, sob o polimento (IOR 1,45). É a iridescência de película fina no
 * lugar da difração do empilhamento: as cores e a mudança com o ângulo são parecidas, não as mesmas. Parâmetros:
 * `color`, `radius`, `scale`, `play` (o peso do jogo de cores), `thickness_min`, `thickness_max`, `roughness`,
 * `pattern_scale`.
 */
export const opal = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            plate: pattern.cells.with({ scale: 9, jitter: 1, crease: 0.12, seed: 531 }),
            small: pattern.cells.with({ scale: 26, jitter: 1, crease: 0.15, seed: 532 }),
            mixed: math.add,
            thickness: map.range.with({ in_min: 0, in_max: 2, out_min: 260, out_max: 720 }),
            body: bsdf.subsurface.with({ color: [0.82, 0.88, 0.92], radius: [1.2, 1.6, 2.2] }),
            specular: bsdf.dielectric.with({ ior: 1.45, roughness: 0.04 }),
            sum: closure.add,
            stack: bsdf.conductor.with({ color: [0.85, 0.85, 0.85], roughness: 0.3 }),
            fire: closure.thinFilm.with({ ior: 1.45 }),
            play: math.value.with({ value: 0.75 }),
            lit_some: map.range.with({ in_min: 0.25, in_max: 0.6 }),
            lit: math.mul,
            out: closure.mix,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('plate', 'small'),
            ['plate.cell', 'mixed.a'],
            ['small.cell', 'mixed.b'],
            ['mixed.value', 'thickness.x'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['stack.value', 'fire.c'],
            ['thickness.value', 'fire.thickness'],
            ['small.cell', 'lit_some.x'],
            ['lit_some.value', 'lit.a'],
            ['play.value', 'lit.b'],
            ['sum.value', 'out.a'],
            ['fire.value', 'out.b'],
            ['lit.value', 'out.t'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.opal',
        ...SAMPLE_INPUT,
        expose: [
            ['body.color', 'color'],
            ['body.radius', 'radius'],
            ['body.scale', 'scale'],
            ['play.value', 'play'],
            ['thickness.out_min', 'thickness_min'],
            ['thickness.out_max', 'thickness_max'],
            ['specular.roughness', 'roughness'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.onyx` — ônix preto polido: calcedônia preta com raras faixas brancas finas e paralelas (as curvas de nível
 * de um grão muito alongado), polimento de espelho (IOR 1,54, rugosidade 0,03). Parâmetros: `color`, `band_color`,
 * `roughness`, `pattern_scale`.
 */
export const onyx = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            layer: pattern.grain.with({ scale: [0.6, 5], octaves: 3, gain: 0.5, seed: 541 }),
            distance: math.abs,
            band: map.range.with({ in_min: 0.002, in_max: 0.007, out_min: 0.6, out_max: 0 }),
            black: math.value3.with({ value: [0.006, 0.006, 0.007] }),
            white: math.value3.with({ value: [0.7, 0.68, 0.64] }),
            stone: math.mix3,
            ...polished(1.54, 0.03),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('layer'),
            ['layer.value', 'distance.x'],
            ['distance.value', 'band.x'],
            ['black.value', 'stone.a'],
            ['white.value', 'stone.b'],
            ['band.value', 'stone.t'],
            ...polishedLinks('stone.value', 's.normal'),
        ],
        output: 'out.value',
    }),
    {
        name: 'material.onyx',
        ...SAMPLE_INPUT,
        expose: [
            ['black.value', 'color'],
            ['white.value', 'band_color'],
            ['specular.roughness', 'roughness'],
            PATTERN_SCALE,
        ],
    },
);
