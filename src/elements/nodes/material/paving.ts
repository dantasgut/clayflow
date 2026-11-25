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

// Pavimentos e alvenaria de peças (spec 011, retomada): dielétricos opacos como os de `stone.ts` — um difuso áspero
// sob uma interface mineral —, com o desenho das peças calculado por pixel pelos nós de padrão sobre o uv
// (`pattern_scale` repetições por unidade de uv). O relevo é o da normal (`surface.bump`, a altura em unidades do
// padrão); uma unidade do padrão corresponde a cerca de um metro nas medidas dos comentários.

type Rgb = readonly [number, number, number];

/** O corpo difuso sob a interface mineral e a saída com a normal do relevo. */
function mineral(roughness: number, ior = 1.5): Record<string, GraphNode> {
    return {
        body: bsdf.diffuse.with({ roughness: 1 }),
        specular: bsdf.dielectric.with({ ior, roughness }),
        sum: closure.add,
        out: closure.normal,
    };
}

/** As ligações do corpo: a cor do difuso e a normal final. */
function mineralLinks(color: string, normal: string): Link[] {
    return [
        [color, 'body.color'],
        ['specular.value', 'sum.a'],
        ['body.value', 'sum.b'],
        ['sum.value', 'out.c'],
        [normal, 'out.normal'],
    ];
}

/**
 * As pedras embutidas numa massa, com os nós que já existem: as células arredondadas de `pattern.areoles` (`scale` por
 * unidade do padrão), das quais só a fração `fill` tem pedra (as de valor acima de 1 − `fill`) e cada pedra encolhe
 * conforme o valor dela (a altura da almofada menos 0,45 · o valor: pedras grandes e pequenas). Saem os nós
 * `<id>_weight` (o peso da pedra sobre a massa, de borda suave) e `<id>_seen` (1 sobre a pedra, de borda viva: liga o
 * relevo dela).
 */
function embedded(
    id: string,
    scale: number,
    fill: number,
    seed: number,
): { nodes: Record<string, GraphNode>; links: Link[] } {
    return {
        nodes: {
            [id]: pattern.areoles.with({ scale, jitter: 0.8, wall: 0.3, seed }),
            [`${id}_some`]: map.range.with({ in_min: 1 - fill, in_max: 1 - fill + 0.02 }),
            [`${id}_vary`]: math.value.with({ value: 0.45 }),
            [`${id}_shrink`]: math.mul,
            [`${id}_raised`]: math.sub,
            [`${id}_body`]: map.range.with({ in_min: 0.08, in_max: 0.32 }),
            [`${id}_edge`]: map.range.with({ in_min: 0.08, in_max: 0.1 }),
            [`${id}_weight`]: math.mul,
            [`${id}_seen`]: math.mul,
        },
        links: [
            ...patternLinks(id),
            [`${id}.cell`, `${id}_some.x`],
            [`${id}.cell`, `${id}_shrink.a`],
            [`${id}_vary.value`, `${id}_shrink.b`],
            [`${id}.height`, `${id}_raised.a`],
            [`${id}_shrink.value`, `${id}_raised.b`],
            [`${id}_raised.value`, `${id}_body.x`],
            [`${id}_raised.value`, `${id}_edge.x`],
            [`${id}_body.value`, `${id}_weight.a`],
            [`${id}_some.value`, `${id}_weight.b`],
            [`${id}_edge.value`, `${id}_seen.a`],
            [`${id}_some.value`, `${id}_seen.b`],
        ],
    };
}

/** Os valores de um asfalto. */
interface AsphaltValues {
    /** Britas graúdas por unidade do padrão e a fração das células que tem brita. */
    readonly stones: number;
    readonly fill: number;
    /** A altura das britas graúdas, das miúdas e da areia, em unidades do padrão. */
    readonly relief: number;
    readonly fine: number;
    readonly grit: number;
    readonly dark: Rgb;
    readonly light: Rgb;
    /** O expoente da escolha do tom da brita (maior: menos pedras claras). */
    readonly pale: number;
    /** Quanto do betume ainda cobre o topo das britas (0: pedra limpa e gasta; 1: asfalto novo, todo preto). */
    readonly coated: number;
    readonly roughness: number;
    /** A rede de trincas: a profundidade, em unidades do padrão (sem: asfalto inteiro). */
    readonly cracks?: number;
    readonly seed: number;
}

/**
 * Sub-grafo de um asfalto (concreto betuminoso): a massa preta de betume e areia com as britas embutidas em duas
 * granulometrias — as graúdas (as células arredondadas de `pattern.areoles`, só numa parte delas e de tamanhos variados:
 * `embedded`) e, entre elas, as miúdas (três vezes menores) —, cada pedra do seu tom entre `color` e `stone_color`, o
 * topo mais claro onde o trânsito limpou o betume e ainda escuro onde ele cobre (`coated`). O betume é mais liso que a
 * pedra (rugosidade 0,5 contra `roughness`); as manchas largas do desgaste mudam o tom. Três relevos na normal: as
 * britas graúdas, as miúdas (só entre as graúdas) e a areia. Com `cracks`, a rede de trincas: as placas grandes (a
 * "pele de jacaré") e, nas manchas mais gastas, as finas dentro delas, de traçado entortado por um grão largo.
 */
function asphaltOf(name: string, a: AsphaltValues): NodeDefinition {
    const cracked = a.cracks !== undefined;
    const crackNodes: Record<string, GraphNode> = cracked
        ? {
              crack: pattern.cells.with({ scale: 3.5, jitter: 1, crease: 0.03, seed: a.seed + 10 }),
              hair: pattern.cells.with({ scale: 9, jitter: 1, crease: 0.045, seed: a.seed + 11 }),
              bend_x: pattern.grain.with({ scale: [5, 5], octaves: 4, seed: a.seed + 12 }),
              bend_y: pattern.grain.with({ scale: [5, 5], octaves: 4, seed: a.seed + 13 }),
              bend: math.value.with({ value: 0.05 }),
              straight: math.split2,
              off_x: math.mul,
              off_y: math.mul,
              bent_x: math.add,
              bent_y: math.add,
              bent: math.combine2,
              where: map.range.with({ in_min: 0, in_max: 0.35 }),
              gap: map.range.with({ out_min: 1, out_max: 0 }),
              hair_gap: map.range.with({ out_min: 1, out_max: 0 }),
              hair_part: math.mul,
              open: math.max,
              crack_color: math.value3.with({ value: [0.006, 0.006, 0.007] }),
              split: math.mix3,
              crack_depth: math.value.with({ value: a.cracks! }),
              hair_depth: math.mul,
              crack_relief: surface.bump,
              hair_relief: surface.bump,
          }
        : {};
    const crackLinks: Link[] = cracked
        ? [
              ...patternLinks('bend_x', 'bend_y'),
              ['uv.p', 'straight.v'],
              ['bend_x.value', 'off_x.a'],
              ['bend.value', 'off_x.b'],
              ['bend_y.value', 'off_y.a'],
              ['bend.value', 'off_y.b'],
              ['straight.x', 'bent_x.a'],
              ['off_x.value', 'bent_x.b'],
              ['straight.y', 'bent_y.a'],
              ['off_y.value', 'bent_y.b'],
              ['bent_x.value', 'bent.x'],
              ['bent_y.value', 'bent.y'],
              ...(['crack', 'hair'] as const).flatMap((id): Link[] => [
                  ['bent.value', `${id}.p`],
                  ['uv.width', `${id}.width`],
                  ['uv.wrap', `${id}.wrap`],
              ]),
              ['patch.value', 'where.x'],
              ['crack.height', 'gap.x'],
              ['hair.height', 'hair_gap.x'],
              ['hair_gap.value', 'hair_part.a'],
              ['where.value', 'hair_part.b'],
              ['gap.value', 'open.a'],
              ['hair_part.value', 'open.b'],
              ['road.value', 'split.a'],
              ['crack_color.value', 'split.b'],
              ['open.value', 'split.t'],
              ...bumpLinks('crack_relief', 'crack.gradient', 'grit_relief.value'),
              ['crack_depth.value', 'crack_relief.strength'],
              ['crack_depth.value', 'hair_depth.a'],
              ['where.value', 'hair_depth.b'],
              ...bumpLinks('hair_relief', 'hair.gradient', 'crack_relief.value'),
              ['hair_depth.value', 'hair_relief.strength'],
          ]
        : [];
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                ...embedded('stone', a.stones, a.fill, a.seed).nodes,
                ...embedded('chip', 3.1 * a.stones, 0.8, a.seed + 5).nodes,
                grit: pattern.grain.with({
                    scale: [9 * a.stones, 9 * a.stones],
                    octaves: 2,
                    seed: a.seed + 1,
                }),
                patch: pattern.grain.with({ scale: [4, 4], octaves: 4, seed: a.seed + 2 }),
                dark: math.value3.with({ value: [...a.dark] }),
                light: math.value3.with({ value: [...a.light] }),
                binder: math.value3.with({ value: [0.014, 0.014, 0.015] }),
                pale: math.value.with({ value: a.pale }),
                pick: math.pow,
                rock: math.mix3,
                chip_pick: math.pow,
                chip_rock: math.mix3,
                // O betume que ainda cobre a pedra: o tom dela puxado para o do betume.
                coated: math.value.with({ value: a.coated }),
                rock_coated: math.mix3,
                chip_coated: math.mix3,
                worn: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.78, out_max: 1.22 }),
                gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.8, out_max: 1.2 }),
                tone: math.mul,
                binder_lit: math.scale3,
                with_chips: math.mix3,
                with_stones: math.mix3,
                road: math.scale3,
                top: math.max,
                rough: map.range.with({ out_min: 0.5, out_max: a.roughness }),
                relief_height: math.value.with({ value: a.relief }),
                relief_on: math.mul,
                relief: surface.bump,
                between: map.range.with({ out_min: 1, out_max: 0 }),
                chip_height: math.value.with({ value: a.fine }),
                chip_between: math.mul,
                chip_on: math.mul,
                chip_relief: surface.bump,
                grit_relief: surface.bump.with({ strength: a.grit }),
                ...crackNodes,
                ...mineral(0.85, 1.55),
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('grit', 'patch'),
                ...embedded('stone', a.stones, a.fill, a.seed).links,
                ...embedded('chip', 3.1 * a.stones, 0.8, a.seed + 5).links,
                ['stone.cell', 'pick.x'],
                ['pale.value', 'pick.e'],
                ['dark.value', 'rock.a'],
                ['light.value', 'rock.b'],
                ['pick.value', 'rock.t'],
                ['chip.cell', 'chip_pick.x'],
                ['pale.value', 'chip_pick.e'],
                ['dark.value', 'chip_rock.a'],
                ['light.value', 'chip_rock.b'],
                ['chip_pick.value', 'chip_rock.t'],
                ['rock.value', 'rock_coated.a'],
                ['binder.value', 'rock_coated.b'],
                ['coated.value', 'rock_coated.t'],
                ['chip_rock.value', 'chip_coated.a'],
                ['binder.value', 'chip_coated.b'],
                ['coated.value', 'chip_coated.t'],
                ['patch.value', 'worn.x'],
                ['grit.value', 'gritty.x'],
                ['worn.value', 'tone.a'],
                ['gritty.value', 'tone.b'],
                ['binder.value', 'binder_lit.v'],
                ['gritty.value', 'binder_lit.s'],
                ['binder_lit.value', 'with_chips.a'],
                ['chip_coated.value', 'with_chips.b'],
                ['chip_weight.value', 'with_chips.t'],
                ['with_chips.value', 'with_stones.a'],
                ['rock_coated.value', 'with_stones.b'],
                ['stone_weight.value', 'with_stones.t'],
                ['with_stones.value', 'road.v'],
                ['tone.value', 'road.s'],
                ['stone_weight.value', 'top.a'],
                ['chip_weight.value', 'top.b'],
                ['top.value', 'rough.x'],
                ['rough.value', 'specular.roughness'],
                ...bumpLinks('relief', 'stone.gradient'),
                ['relief_height.value', 'relief_on.a'],
                ['stone_seen.value', 'relief_on.b'],
                ['relief_on.value', 'relief.strength'],
                ['stone_seen.value', 'between.x'],
                ['between.value', 'chip_between.a'],
                ['chip_seen.value', 'chip_between.b'],
                ['chip_between.value', 'chip_on.a'],
                ['chip_height.value', 'chip_on.b'],
                ...bumpLinks('chip_relief', 'chip.gradient', 'relief.value'),
                ['chip_on.value', 'chip_relief.strength'],
                ...bumpLinks('grit_relief', 'grit.gradient', 'chip_relief.value'),
                ...crackLinks,
                ...mineralLinks(
                    cracked ? 'split.value' : 'road.value',
                    cracked ? 'hair_relief.value' : 'grit_relief.value',
                ),
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['dark.value', 'color'],
                ['light.value', 'stone_color'],
                ['binder.value', 'binder_color'],
                ['coated.value', 'coated'],
                ['rough.out_max', 'roughness'],
                ['relief_height.value', 'relief'],
                ...(cracked
                    ? ([
                          ['crack_depth.value', 'crack_depth'],
                          ['crack_color.value', 'crack_color'],
                      ] as const)
                    : []),
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `material.asphaltFine` — asfalto novo de granulometria fina (a rua recapeada): britas graúdas de 6 mm (160 por
 * unidade do padrão) em quase todas as células, ainda cobertas de betume (`coated` 0,7) — preto, de relevo baixo, com
 * o brilho do betume. Parâmetros: `color`, `stone_color`, `binder_color`, `coated`, `roughness`, `relief`,
 * `pattern_scale`.
 */
export const asphaltFine = asphaltOf('material.asphaltFine', {
    stones: 160,
    fill: 0.9,
    relief: 0.0009,
    fine: 0.0004,
    grit: 0.00012,
    dark: [0.06, 0.06, 0.062],
    light: [0.3, 0.29, 0.27],
    pale: 2.5,
    coated: 0.7,
    roughness: 0.75,
    seed: 301,
});

/**
 * `material.asphaltCoarse` — asfalto grosso e gasto (a estrada antiga): britas graúdas de 16 a 20 mm (55 por unidade
 * do padrão) à vista, limpas e polidas pelo trânsito (`coated` 0,1: do cinza ao bege claro), com as miúdas e o betume
 * recuados entre elas — o relevo mais alto dos três. Parâmetros: os de `asphaltFine`.
 */
export const asphaltCoarse = asphaltOf('material.asphaltCoarse', {
    stones: 55,
    fill: 0.75,
    relief: 0.004,
    fine: 0.0015,
    grit: 0.0004,
    dark: [0.1, 0.1, 0.1],
    light: [0.46, 0.43, 0.38],
    pale: 1.3,
    coated: 0.1,
    roughness: 0.92,
    seed: 311,
});

/**
 * `material.asphaltCracked` — asfalto velho rachado: britas de 10 mm (95 por unidade) meio limpas (`coated` 0,35),
 * cortado pela rede de trincas — as placas grandes da "pele de jacaré" e, nas manchas mais gastas, as finas dentro
 * delas —, escuras e fundas (`crack_depth`, em unidades do padrão; `crack_color`). Parâmetros: os de `asphaltFine`,
 * `crack_depth`, `crack_color`.
 */
export const asphaltCracked = asphaltOf('material.asphaltCracked', {
    stones: 95,
    fill: 0.8,
    relief: 0.002,
    fine: 0.0008,
    grit: 0.00025,
    dark: [0.08, 0.08, 0.082],
    light: [0.36, 0.34, 0.31],
    pale: 1.8,
    coated: 0.35,
    roughness: 0.9,
    cracks: 0.012,
    seed: 321,
});

/**
 * `material.pavementPortuguese` — calçada portuguesa em ondas (o mosaico de Copacabana): pedras pequenas de calcário
 * branco (`color`) e de basalto preto (`dark_color`) de 5 a 6 cm (18 por unidade do padrão), cada uma inteira de uma
 * cor só — a cor sai do ponto da pedra (`point` de `pattern.cells`) no desenho: faixas de `rows` pares por unidade do
 * padrão (1: meio metro cada faixa), onduladas por um seno de `waves` (a frequência angular: π, uma onda a cada duas
 * unidades) e amplitude `amplitude` (0,28 unidade) —, assentadas com junta de areia
 * (`joint_color`) e alisadas pelo passo (rugosidade 0,55). Parâmetros: `color`, `dark_color`, `joint_color`,
 * `roughness`, `relief`, `rows`, `waves`, `amplitude`, `pattern_scale`.
 */
export const pavementPortuguese = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            stone: pattern.cells.with({ scale: 18, jitter: 0.7, crease: 0.14, seed: 331 }),
            grit: pattern.grain.with({ scale: [260, 260], octaves: 2, seed: 332 }),
            at: math.split2,
            waves: math.value.with({ value: Math.PI }),
            amplitude: math.value.with({ value: 0.28 }),
            rows: math.value.with({ value: 1 }),
            phase: math.mul,
            swell: math.sin,
            lift: math.mul,
            across: math.add,
            band: math.mul,
            turn: math.fract,
            black: map.range.with({ in_min: 0.5, in_max: 0.5001 }),
            white: math.value3.with({ value: [0.66, 0.64, 0.58] }),
            basalt: math.value3.with({ value: [0.045, 0.045, 0.05] }),
            sand: math.value3.with({ value: [0.24, 0.21, 0.17] }),
            rock: math.mix3,
            lot: map.range.with({ out_min: 0.82, out_max: 1.12 }),
            gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.1 }),
            tone: math.mul,
            lit: math.scale3,
            sand_lit: math.scale3,
            floor: math.mix3,
            relief: surface.bump.with({ strength: 0.0035 }),
            grit_relief: surface.bump.with({ strength: 0.0003 }),
            ...mineral(0.55, 1.55),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('stone', 'grit'),
            ['stone.point', 'at.v'],
            ['at.x', 'phase.a'],
            ['waves.value', 'phase.b'],
            ['phase.value', 'swell.x'],
            ['swell.value', 'lift.a'],
            ['amplitude.value', 'lift.b'],
            ['at.y', 'across.a'],
            ['lift.value', 'across.b'],
            ['across.value', 'band.a'],
            ['rows.value', 'band.b'],
            ['band.value', 'turn.x'],
            ['turn.value', 'black.x'],
            ['white.value', 'rock.a'],
            ['basalt.value', 'rock.b'],
            ['black.value', 'rock.t'],
            ['stone.cell', 'lot.x'],
            ['grit.value', 'gritty.x'],
            ['lot.value', 'tone.a'],
            ['gritty.value', 'tone.b'],
            ['rock.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['sand.value', 'sand_lit.v'],
            ['gritty.value', 'sand_lit.s'],
            ['sand_lit.value', 'floor.a'],
            ['lit.value', 'floor.b'],
            ['stone.height', 'floor.t'],
            ...bumpLinks('relief', 'stone.gradient'),
            ...bumpLinks('grit_relief', 'grit.gradient', 'relief.value'),
            ...mineralLinks('floor.value', 'grit_relief.value'),
        ],
        output: 'out.value',
    }),
    {
        name: 'material.pavementPortuguese',
        ...SAMPLE_INPUT,
        expose: [
            ['white.value', 'color'],
            ['basalt.value', 'dark_color'],
            ['sand.value', 'joint_color'],
            ['specular.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            ['rows.value', 'rows'],
            ['waves.value', 'waves'],
            ['amplitude.value', 'amplitude'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.grassPaver` — concregrama (o piso-grama): a grelha de concreto (`pattern.bricks` em grade, 5 furos por
 * unidade do padrão; as nervuras ocupam a "junta" do padrão, um terço do passo) com os furos quadrados cheios de terra
 * (`soil_color`) e grama (`grass_color`: tufos de dois tons, a terra à vista onde a grama falha), rebaixados `depth`
 * (unidades do padrão) em relação ao concreto. A grama é a cor e a normal de um tapete visto de cima: as folhas em pé
 * são geometria, fora deste material. Parâmetros: `color`, `grass_color`, `soil_color`, `roughness`, `depth`,
 * `pattern_scale`.
 */
export const grassPaver = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            grid: pattern.bricks.with({
                scale: [5, 5],
                shift: 0,
                gap: 0.34,
                bevel: 0.07,
                seed: 341,
            }),
            stain: pattern.grain.with({ scale: [3, 3], octaves: 4, seed: 342 }),
            grit: pattern.grain.with({ scale: [220, 220], octaves: 2, seed: 343 }),
            tuft: pattern.grain.with({ scale: [34, 34], octaves: 3, gain: 0.6, seed: 344 }),
            blade: pattern.grain.with({ scale: [150, 150], octaves: 2, seed: 345 }),
            cement: math.value3.with({ value: [0.4, 0.39, 0.37] }),
            green: math.value3.with({ value: [0.11, 0.22, 0.045] }),
            deep: math.value3.with({ value: [0.035, 0.085, 0.02] }),
            soil: math.value3.with({ value: [0.085, 0.06, 0.04] }),
            stained: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.78, out_max: 1.18 }),
            gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.86, out_max: 1.12 }),
            tone: math.mul,
            cement_lit: math.scale3,
            shade: map.range.with({ in_min: -0.5, in_max: 0.5 }),
            lawn: math.mix3,
            bare: map.range.with({ in_min: -0.55, in_max: -0.15 }),
            bed: math.mix3,
            floor: math.mix3,
            depth: math.value.with({ value: 0.006 }),
            sink: math.mul,
            minus: math.value.with({ value: -1 }),
            relief: surface.bump,
            blade_height: math.value.with({ value: 0.0012 }),
            blade_on: math.mul,
            blade_relief: surface.bump,
            grit_height: math.value.with({ value: 0.0004 }),
            grit_on: math.mul,
            web: map.range.with({ out_min: 1, out_max: 0 }),
            grit_relief: surface.bump,
            ...mineral(0.9),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('grid', 'stain', 'grit', 'tuft', 'blade'),
            ['stain.value', 'stained.x'],
            ['grit.value', 'gritty.x'],
            ['stained.value', 'tone.a'],
            ['gritty.value', 'tone.b'],
            ['cement.value', 'cement_lit.v'],
            ['tone.value', 'cement_lit.s'],
            ['tuft.value', 'shade.x'],
            ['deep.value', 'lawn.a'],
            ['green.value', 'lawn.b'],
            ['shade.value', 'lawn.t'],
            ['blade.value', 'bare.x'],
            ['soil.value', 'bed.a'],
            ['lawn.value', 'bed.b'],
            ['bare.value', 'bed.t'],
            ['cement_lit.value', 'floor.a'],
            ['bed.value', 'floor.b'],
            ['grid.height', 'floor.t'],
            ['depth.value', 'sink.a'],
            ['minus.value', 'sink.b'],
            ...bumpLinks('relief', 'grid.gradient'),
            ['sink.value', 'relief.strength'],
            ['grid.height', 'blade_on.a'],
            ['blade_height.value', 'blade_on.b'],
            ...bumpLinks('blade_relief', 'blade.gradient', 'relief.value'),
            ['blade_on.value', 'blade_relief.strength'],
            ['grid.height', 'web.x'],
            ['web.value', 'grit_on.a'],
            ['grit_height.value', 'grit_on.b'],
            ...bumpLinks('grit_relief', 'grit.gradient', 'blade_relief.value'),
            ['grit_on.value', 'grit_relief.strength'],
            ...mineralLinks('floor.value', 'grit_relief.value'),
        ],
        output: 'out.value',
    }),
    {
        name: 'material.grassPaver',
        ...SAMPLE_INPUT,
        expose: [
            ['cement.value', 'color'],
            ['green.value', 'grass_color'],
            ['soil.value', 'soil_color'],
            ['specular.roughness', 'roughness'],
            ['depth.value', 'depth'],
            PATTERN_SCALE,
        ],
    },
);

/** Os valores de um material de peças com junta. */
interface PieceValues {
    /** O padrão das peças (saídas `height` e `gradient`) e a saída dele com o valor de cada peça. */
    readonly bond: GraphNode;
    readonly piece: string;
    /** As peças correm ao longo de `p.y` (o padrão é calculado com os eixos trocados). */
    readonly turned?: boolean;
    /**
     * A faixa da altura do padrão em que a cor passa da junta à peça (sem: a altura inteira) — nas pedras abauladas
     * (`pattern.areoles`: a almofada sobe da borda ao meio), a terra só no fundo do vale.
     */
    readonly inverted?: readonly [number, number];
    /** Um segundo padrão de peças sobre o primeiro (os nós do bambu): escurece e afunda onde a altura dele desce. */
    readonly marks?: { readonly node: GraphNode; readonly relief: number };
    /** As duas cores entre as quais cada peça escolhe a sua, a faixa do tom de peça para peça e a cor da junta. */
    readonly color: Rgb;
    readonly alt: Rgb;
    readonly lot: readonly [number, number];
    readonly joint: Rgb;
    /** As manchas largas (frequências por eixo, oitavas e a faixa do tom). */
    readonly stain: {
        readonly scale: readonly [number, number];
        readonly octaves: number;
        readonly range: readonly [number, number];
    };
    /** O relevo da face (a clivagem da pedra, a fibra): frequências, oitavas e a altura em unidades do padrão. */
    readonly face: {
        readonly scale: readonly [number, number];
        readonly octaves: number;
        readonly height: number;
    };
    /** A areia: a frequência e a altura. */
    readonly grit: { readonly scale: number; readonly height: number };
    /** A altura da peça sobre a junta, em unidades do padrão. */
    readonly relief: number;
    readonly roughness: number;
    readonly seed: number;
}

/** As ligações de um padrão (valor e gradiente) ao relevo `to` (`surface.relief`). */
function reliefLinks(to: string, value: string, gradient: string): Link[] {
    return [
        [value, `${to}.value`],
        [gradient, `${to}.gradient`],
        ['uv.wrap', `${to}.wrap`],
    ];
}

/** Os padrões das peças, partilhados pela cor e pelo relevo: o das peças (com os eixos trocados ou não), a face, a areia. */
function pieceNodes(v: PieceValues): Record<string, GraphNode> {
    const marked = v.marks !== undefined;
    return {
        ...patternSpace(),
        bond: v.bond,
        ...(v.turned === true
            ? {
                  p_parts: math.split2,
                  p_turned: math.combine2,
                  wrap_parts: math.split2,
                  wrap_turned: math.combine2,
                  slope_parts: math.split2,
                  slope: math.combine2,
                  ...(marked ? { mark_parts: math.split2, mark_slope: math.combine2 } : {}),
              }
            : {}),
        ...(v.inverted !== undefined
            ? {
                  rise: map.range.with({
                      in_min: v.inverted[0],
                      in_max: v.inverted[1],
                  }),
              }
            : {}),
        ...(v.marks !== undefined ? { marks: v.marks.node } : {}),
        face: pattern.grain.with({
            scale: [...v.face.scale],
            octaves: v.face.octaves,
            gain: 0.55,
            seed: v.seed + 2,
        }),
        grit: pattern.grain.with({
            scale: [v.grit.scale, v.grit.scale],
            octaves: 2,
            seed: v.seed + 3,
        }),
    };
}

/** As ligações dos padrões das peças. Com os eixos trocados, a coordenada e o período entram trocados e o gradiente volta. */
function pieceLinks(v: PieceValues): Link[] {
    const marked = v.marks !== undefined;
    const turned: Link[] =
        v.turned === true
            ? [
                  ['uv.p', 'p_parts.v'],
                  ['p_parts.y', 'p_turned.x'],
                  ['p_parts.x', 'p_turned.y'],
                  ['uv.wrap', 'wrap_parts.v'],
                  ['wrap_parts.y', 'wrap_turned.x'],
                  ['wrap_parts.x', 'wrap_turned.y'],
                  ['p_turned.value', 'bond.p'],
                  ['uv.width', 'bond.width'],
                  ['wrap_turned.value', 'bond.wrap'],
                  ['bond.gradient', 'slope_parts.v'],
                  ['slope_parts.y', 'slope.x'],
                  ['slope_parts.x', 'slope.y'],
                  ...(marked
                      ? ([
                            ['p_turned.value', 'marks.p'],
                            ['uv.width', 'marks.width'],
                            ['wrap_turned.value', 'marks.wrap'],
                            ['marks.gradient', 'mark_parts.v'],
                            ['mark_parts.y', 'mark_slope.x'],
                            ['mark_parts.x', 'mark_slope.y'],
                        ] as Link[])
                      : []),
              ]
            : patternLinks('bond', ...(marked ? ['marks'] : []));
    return [
        ...SPACE_LINKS,
        ...turned,
        ...patternLinks('face', 'grit'),
        ...(v.inverted !== undefined ? ([['bond.height', 'rise.x']] as Link[]) : []),
    ];
}

/**
 * O relevo em milímetros de um material de peças (`relief.<nome>`): a peça sobre a junta (`joint_depth`: a junta
 * recuada, com a aresta arredondada do padrão; nas pedras abauladas, a calota inteira), a face — só sobre a peça
 * (`face_height`) —, a areia e, quando há, as marcas. A mesma função inclina a normal do material e move os vértices
 * (`Displacements.<nome>`): a sombra dentro da junta é da geometria. Parâmetros: `joint_depth`, `face_height`,
 * `pattern_scale`.
 */
function pieceRelief(id: string, v: PieceValues): NodeDefinition {
    const turned = v.turned === true;
    const dome = v.inverted !== undefined;
    const marked = v.marks !== undefined;
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...pieceNodes(v),
                joint_relief: surface.relief.with({ height: 1000 * v.relief, level: 1 }),
                face_height: math.value.with({ value: 1000 * v.face.height }),
                face_on: math.mul,
                face_relief: surface.relief,
                grit_relief: surface.relief.with({ height: 1000 * v.grit.height }),
                ...(marked
                    ? {
                          marks_relief: surface.relief.with({
                              height: 1000 * v.marks!.relief,
                              level: 1,
                          }),
                      }
                    : {}),
                sum: math.add3,
                more: math.add3,
                out: math.add3,
            },
            links: [
                ...pieceLinks(v),
                ...reliefLinks(
                    'joint_relief',
                    'bond.height',
                    turned ? 'slope.value' : 'bond.gradient',
                ),
                [dome ? 'rise.value' : 'bond.height', 'face_on.a'],
                ['face_height.value', 'face_on.b'],
                ...reliefLinks('face_relief', 'face.value', 'face.gradient'),
                ['face_on.value', 'face_relief.height'],
                ...reliefLinks('grit_relief', 'grit.value', 'grit.gradient'),
                ...(marked
                    ? reliefLinks(
                          'marks_relief',
                          'marks.height',
                          turned ? 'mark_slope.value' : 'marks.gradient',
                      )
                    : []),
                ['joint_relief.value', 'sum.a'],
                ['face_relief.value', 'sum.b'],
                ['sum.value', 'more.a'],
                ['grit_relief.value', 'more.b'],
                ['more.value', 'out.a'],
                ...(marked ? ([['marks_relief.value', 'out.b']] as Link[]) : []),
            ],
            output: 'out.value',
        }),
        {
            name: `relief.${id}`,
            ...SAMPLE_INPUT,
            expose: [
                ['joint_relief.height', 'joint_depth'],
                ['face_height.value', 'face_height'],
                PATTERN_SCALE,
            ],
        },
    );
}

/** Os relevos dos materiais de peças, pelo nome do material (a entrada de `relief` e de `Displacements`). */
const reliefs: Record<string, NodeDefinition> = {};

/**
 * Sub-grafo de um material de peças com junta: cada peça escolhe a cor entre `color` e `alt_color` e o tom na faixa
 * `lot`, com as manchas largas e a areia por cima; a junta (`joint_color`) fica onde a altura do padrão desce a zero.
 * O relevo é o de `pieceRelief`, em milímetros (`relief`: a peça sobre a junta; `face_relief`: a face), na normal e —
 * com `Displacements.<nome>` — na geometria; `scale`: unidades do mundo por metro. Parâmetros: `color`, `alt_color`,
 * `joint_color`, `roughness`, `relief`, `face_relief`, `scale`, `pattern_scale`.
 */
function piecesOf(name: string, v: PieceValues): NodeDefinition {
    const id = name.slice('material.'.length);
    const height = pieceRelief(id, v);
    reliefs[id] = height;
    const level = v.inverted !== undefined ? 'rise.value' : 'bond.height';
    const marked = v.marks !== undefined;
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...pieceNodes(v),
                stain: pattern.grain.with({
                    scale: [...v.stain.scale],
                    octaves: v.stain.octaves,
                    seed: v.seed + 1,
                }),
                first: math.value3.with({ value: [...v.color] }),
                second: math.value3.with({ value: [...v.alt] }),
                mortar: math.value3.with({ value: [...v.joint] }),
                pick: math.mix3,
                lot: map.range.with({ out_min: v.lot[0], out_max: v.lot[1] }),
                stained: map.range.with({
                    in_min: -0.6,
                    in_max: 0.6,
                    out_min: v.stain.range[0],
                    out_max: v.stain.range[1],
                }),
                gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.88, out_max: 1.1 }),
                tone_lot: math.mul,
                tone: math.mul,
                ...(marked
                    ? {
                          ringed: map.range.with({ out_min: 0.35, out_max: 1 }),
                          tone_marks: math.mul,
                      }
                    : {}),
                lit: math.scale3,
                mortar_lit: math.scale3,
                wall: math.mix3,
                tile: math.value2.with({ value: [1, 1] }),
                height,
                normal: surface.reliefNormal,
                ...mineral(v.roughness),
            },
            links: [
                ...pieceLinks(v),
                ...patternLinks('stain'),
                ['tile.value', 'uv.scale'],
                ['first.value', 'pick.a'],
                ['second.value', 'pick.b'],
                [`bond.${v.piece}`, 'pick.t'],
                [`bond.${v.piece}`, 'lot.x'],
                ['stain.value', 'stained.x'],
                ['grit.value', 'gritty.x'],
                ['lot.value', 'tone_lot.a'],
                ['stained.value', 'tone_lot.b'],
                ['tone_lot.value', 'tone.a'],
                ['gritty.value', 'tone.b'],
                ['pick.value', 'lit.v'],
                ...(marked
                    ? ([
                          ['marks.height', 'ringed.x'],
                          ['tone.value', 'tone_marks.a'],
                          ['ringed.value', 'tone_marks.b'],
                          ['tone_marks.value', 'lit.s'],
                      ] as Link[])
                    : ([['tone.value', 'lit.s']] as Link[])),
                ['mortar.value', 'mortar_lit.v'],
                ['gritty.value', 'mortar_lit.s'],
                ['mortar_lit.value', 'wall.a'],
                ['lit.value', 'wall.b'],
                [level, 'wall.t'],
                ['s.value', 'height.s'],
                ['tile.value', 'height.pattern_scale'],
                ['height.value', 'normal.relief'],
                ...mineralLinks('wall.value', 'normal.value'),
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['first.value', 'color'],
                ['second.value', 'alt_color'],
                ['mortar.value', 'joint_color'],
                ['specular.roughness', 'roughness'],
                ['height.joint_depth', 'relief'],
                ['height.face_height', 'face_relief'],
                ['normal.scale', 'scale'],
                ['tile.value', 'pattern_scale'],
            ],
        },
    );
}

/**
 * `material.paverHerringbone` — bloco intertravado de concreto em espinha de peixe: peças de 10 × 20 cm
 * (`pattern.planks`, arranjo em espinha, 10 larguras por unidade do padrão) de concreto cinza, o tom mudando de peça
 * para peça, a aresta chanfrada e a junta fina cheia de areia. Parâmetros: os de `piecesOf`.
 */
export const paverHerringbone = piecesOf('material.paverHerringbone', {
    bond: pattern.planks.with({
        scale: 10,
        length: 2,
        arrangement: 1,
        gap: 0.045,
        bevel: 0.09,
        seed: 351,
    }),
    piece: 'plank',
    color: [0.36, 0.355, 0.34],
    alt: [0.3, 0.29, 0.285],
    lot: [0.86, 1.12],
    joint: [0.16, 0.14, 0.115],
    stain: { scale: [2.5, 2.5], octaves: 4, range: [0.82, 1.15] },
    face: { scale: [70, 70], octaves: 3, height: 0.0006 },
    grit: { scale: 300, height: 0.0003 },
    relief: 0.0045,
    roughness: 0.88,
    seed: 351,
});

/**
 * `material.concreteBlock` — parede de blocos de concreto com junta: blocos de 39 × 19 cm em amarração de meio bloco
 * (`pattern.bricks`: 2,5 × 5 por unidade do padrão), a face porosa e áspera do concreto seco vibrado, a junta de
 * argamassa de 1 cm, mais clara e recuada. Parâmetros: os de `piecesOf`.
 */
export const concreteBlock = piecesOf('material.concreteBlock', {
    bond: pattern.bricks.with({ scale: [2.5, 5], shift: 0.5, gap: 0.055, bevel: 0.04, seed: 361 }),
    piece: 'brick',
    color: [0.42, 0.42, 0.41],
    alt: [0.36, 0.36, 0.355],
    lot: [0.9, 1.08],
    joint: [0.5, 0.49, 0.455],
    stain: { scale: [2, 3], octaves: 4, range: [0.84, 1.14] },
    face: { scale: [110, 110], octaves: 3, height: 0.0011 },
    grit: { scale: 320, height: 0.0004 },
    relief: 0.003,
    roughness: 0.92,
    seed: 361,
});

/**
 * `material.concreteSlab` — piso de placas de concreto com junta: placas quadradas de 50 cm em grade
 * (`pattern.bricks` sem deslocamento, 2 × 2 por unidade do padrão), a face desempenada com as manchas largas da cura, a
 * junta seca estreita e escura. Parâmetros: os de `piecesOf`.
 */
export const concreteSlab = piecesOf('material.concreteSlab', {
    bond: pattern.bricks.with({ scale: [2, 2], shift: 0, gap: 0.014, bevel: 0.012, seed: 371 }),
    piece: 'brick',
    color: [0.45, 0.44, 0.42],
    alt: [0.4, 0.395, 0.385],
    lot: [0.92, 1.07],
    joint: [0.06, 0.058, 0.055],
    stain: { scale: [1.6, 1.6], octaves: 5, range: [0.78, 1.18] },
    face: { scale: [24, 24], octaves: 4, height: 0.0007 },
    grit: { scale: 260, height: 0.00035 },
    relief: 0.006,
    roughness: 0.86,
    seed: 371,
});

/**
 * `material.stoneSetts` — paralelepípedo: pedras de granito de 12 × 18 cm assentadas em fiadas com amarração
 * (`pattern.bricks`: 6 × 9 por unidade do padrão), a face abaulada e polida pelo trânsito, o tom do cinza azulado ao
 * pardo de pedra para pedra, a junta larga de terra. Parâmetros: os de `piecesOf`.
 */
export const stoneSetts = piecesOf('material.stoneSetts', {
    bond: pattern.bricks.with({ scale: [6, 9], shift: 0.5, gap: 0.16, bevel: 0.2, seed: 381 }),
    piece: 'brick',
    color: [0.3, 0.3, 0.31],
    alt: [0.32, 0.29, 0.26],
    lot: [0.72, 1.2],
    joint: [0.1, 0.085, 0.065],
    stain: { scale: [3, 3], octaves: 3, range: [0.85, 1.12] },
    face: { scale: [42, 42], octaves: 4, height: 0.0016 },
    grit: { scale: 280, height: 0.0003 },
    relief: 0.007,
    roughness: 0.72,
    seed: 381,
});

/**
 * `material.stoneWall` — muro de cantaria: blocos de arenito de tamanhos variados (`pattern.ashlar`: fiadas de 33 cm,
 * cada vão cortado até três vezes), a face lascada (a clivagem da pedra em relevo), o tom do pardo ao cinza de bloco
 * para bloco, a junta de argamassa recuada. Parâmetros: os de `piecesOf`.
 */
export const stoneWall = piecesOf('material.stoneWall', {
    bond: pattern.ashlar.with({
        scale: [1.5, 3],
        shift: 0.5,
        levels: 3,
        keep: 0.3,
        gap: 0.06,
        bevel: 0.07,
        seed: 391,
    }),
    piece: 'block',
    color: [0.46, 0.37, 0.26],
    alt: [0.38, 0.34, 0.29],
    lot: [0.76, 1.18],
    joint: [0.27, 0.24, 0.2],
    stain: { scale: [4, 4], octaves: 4, range: [0.8, 1.16] },
    face: { scale: [12, 12], octaves: 5, height: 0.009 },
    grit: { scale: 240, height: 0.0005 },
    relief: 0.009,
    roughness: 0.92,
    seed: 391,
});

/**
 * `material.stackedSlate` — pedra filetada: filetes de ardósia de 7 cm de altura e comprimentos variados empilhados
 * a seco (`pattern.ashlar` de fiadas baixas e vãos compridos), a face partida com a clivagem ao longo do filete, a
 * junta uma sombra estreita. Parâmetros: os de `piecesOf`.
 */
export const stackedSlate = piecesOf('material.stackedSlate', {
    bond: pattern.ashlar.with({
        scale: [1.2, 12],
        shift: 0.5,
        levels: 2,
        keep: 0.15,
        gap: 0.06,
        bevel: 0.12,
        seed: 401,
    }),
    piece: 'block',
    color: [0.33, 0.33, 0.34],
    alt: [0.27, 0.265, 0.26],
    lot: [0.7, 1.22],
    joint: [0.02, 0.02, 0.022],
    stain: { scale: [3, 5], octaves: 3, range: [0.86, 1.12] },
    face: { scale: [5, 46], octaves: 4, height: 0.0035 },
    grit: { scale: 220, height: 0.0004 },
    relief: 0.006,
    roughness: 0.8,
    seed: 401,
});

/**
 * `material.flagstone` — piso de pedras irregulares (a calçada de pedra portuguesa rústica, o piso de pedra de São
 * Tomé): lajes de contorno poligonal (`pattern.cells`: 4 por unidade do padrão) com a face de clivagem, o tom mudando
 * de laje para laje, rejuntadas com argamassa. Parâmetros: os de `piecesOf`.
 */
export const flagstone = piecesOf('material.flagstone', {
    bond: pattern.cells.with({ scale: 4, jitter: 0.9, crease: 0.07, seed: 411 }),
    piece: 'cell',
    color: [0.36, 0.28, 0.2],
    alt: [0.24, 0.25, 0.26],
    lot: [0.68, 1.2],
    joint: [0.2, 0.185, 0.16],
    stain: { scale: [5, 5], octaves: 4, range: [0.82, 1.15] },
    face: { scale: [16, 16], octaves: 5, height: 0.0028 },
    grit: { scale: 260, height: 0.0004 },
    relief: 0.008,
    roughness: 0.82,
    seed: 411,
});

/**
 * `material.cobblestone` — calçamento de pedras roladas (o pé de moleque): seixos de rio de 14 cm (as células
 * arredondadas de `pattern.areoles`, 7 por unidade do padrão), cada um abaulado da borda ao meio (3,5 cm), do seu tom
 * entre o cinza e o pardo, lisos, com terra batida no fundo dos vales. Parâmetros: os de `piecesOf`.
 */
export const cobblestone = piecesOf('material.cobblestone', {
    bond: pattern.areoles.with({ scale: 7, jitter: 0.8, wall: 0.3, seed: 421 }),
    piece: 'cell',
    inverted: [0.02, 0.2],
    color: [0.3, 0.29, 0.28],
    alt: [0.34, 0.26, 0.18],
    lot: [0.6, 1.3],
    joint: [0.07, 0.055, 0.04],
    stain: { scale: [9, 9], octaves: 3, range: [0.85, 1.12] },
    face: { scale: [50, 50], octaves: 4, height: 0.0012 },
    grit: { scale: 300, height: 0.0003 },
    relief: 0.035,
    roughness: 0.55,
    seed: 421,
});

/**
 * `material.gravel` — brita (o cascalho de jardim, uma camada): pedras de 3 a 4 cm (`pattern.areoles`, 28 por unidade
 * do padrão) abauladas, do cinza claro ao pardo, com a sombra funda entre elas. Parâmetros: os de `piecesOf`.
 */
export const gravel = piecesOf('material.gravel', {
    bond: pattern.areoles.with({ scale: 28, jitter: 0.8, wall: 0.3, seed: 441 }),
    piece: 'cell',
    inverted: [0.02, 0.3],
    color: [0.4, 0.39, 0.37],
    alt: [0.3, 0.24, 0.18],
    lot: [0.5, 1.35],
    joint: [0.025, 0.022, 0.02],
    stain: { scale: [6, 6], octaves: 3, range: [0.9, 1.1] },
    face: { scale: [200, 200], octaves: 3, height: 0.0005 },
    grit: { scale: 400, height: 0.00015 },
    relief: 0.012,
    roughness: 0.8,
    seed: 441,
});

/** O painel de bambu: 14 colmos por unidade do padrão (7 cm de diâmetro), um nó a cada 5 diâmetros. */
const BAMBOO = { scale: 14, spacing: 5, ring_height: 0.1, ring_width: 0.16 };

/** A fibra fina ao longo do colmo (um grão muito alongado). */
const BAMBOO_FIBRE = { scale: [170, 2.5], octaves: 2, seed: 432 };

/**
 * O perfil dos colmos, com os nós que já existem: as fileiras de `pattern.planks` com os eixos trocados (cada fileira
 * um colmo em pé, cada peça um entrenó, deslocada ao acaso de colmo para colmo) dão a posição dentro da peça
 * (`local`), e os nós de matemática fazem dela o meio cilindro — √(1 − x²), x de −1 a 1 através do colmo — engrossado
 * `ring_height` no anel do nó (1 − smoothstep da distância à ponta do entrenó, em diâmetros). Saem `cane_height.value`
 * (a altura em diâmetros), `cane_slope.value` (o gradiente dela ∂/∂p, a borda do cilindro presa em 20) e
 * `ring.value` (1 no meio do nó).
 */
function bambooProfile(): { nodes: Record<string, GraphNode>; links: Link[] } {
    const { scale, spacing, ring_height: swell, ring_width: wide } = BAMBOO;
    return {
        nodes: {
            p_parts: math.split2,
            p_turned: math.combine2,
            wrap_parts: math.split2,
            wrap_turned: math.combine2,
            cane: pattern.planks.with({
                scale,
                length: spacing,
                arrangement: 0,
                gap: 0,
                bevel: 0.02,
                seed: 431,
            }),
            at: math.split2,
            one: math.value.with({ value: 1 }),
            two: math.value.with({ value: 2 }),
            twice: math.mul,
            x: math.sub,
            x2: math.mul,
            inside: math.sub,
            floor: math.value.with({ value: 0.0025 }),
            kept: math.max,
            arc: math.sqrt,
            length: math.value.with({ value: spacing }),
            rest: math.sub,
            near: math.min,
            wide: math.value.with({ value: wide }),
            fall: math.smoothstep,
            ring: math.sub,
            ring_height: math.value.with({ value: swell }),
            thick: math.mul,
            swell: math.add,
            round: math.mul,
            half: math.value.with({ value: 0.5 }),
            cane_height: math.mul,
            // ∂/∂(através) = −x / corpo · engrosso; em `p`, × −(colmos por unidade) já com o sinal.
            lean: math.div,
            lean_swell: math.mul,
            minus_scale: math.value.with({ value: -scale }),
            slope_across: math.mul,
            // ∂/∂(ao longo) = ½ · corpo · `ring_height` · (∓ 6 t (1 − t) / largura), t a distância à ponta em larguras.
            t_raw: math.div,
            t: math.clamp,
            t_left: math.sub,
            t_bell: math.mul,
            side: math.sub,
            sign: map.range.with({ in_min: -0.001, in_max: 0.001, out_min: -1, out_max: 1 }),
            bell_signed: math.mul,
            bell_body: math.mul,
            along_gain: math.value.with({ value: (0.5 * swell * 6 * scale) / wide }),
            slope_along: math.mul,
            cane_slope: math.combine2,
        },
        links: [
            ['uv.p', 'p_parts.v'],
            ['p_parts.y', 'p_turned.x'],
            ['p_parts.x', 'p_turned.y'],
            ['uv.wrap', 'wrap_parts.v'],
            ['wrap_parts.y', 'wrap_turned.x'],
            ['wrap_parts.x', 'wrap_turned.y'],
            ['p_turned.value', 'cane.p'],
            ['uv.width', 'cane.width'],
            ['wrap_turned.value', 'cane.wrap'],
            ['cane.local', 'at.v'],
            ['at.y', 'twice.a'],
            ['two.value', 'twice.b'],
            ['twice.value', 'x.a'],
            ['one.value', 'x.b'],
            ['x.value', 'x2.a'],
            ['x.value', 'x2.b'],
            ['one.value', 'inside.a'],
            ['x2.value', 'inside.b'],
            ['inside.value', 'kept.a'],
            ['floor.value', 'kept.b'],
            ['kept.value', 'arc.x'],
            ['length.value', 'rest.a'],
            ['at.x', 'rest.b'],
            ['at.x', 'near.a'],
            ['rest.value', 'near.b'],
            ['wide.value', 'fall.edge1'],
            ['near.value', 'fall.x'],
            ['one.value', 'ring.a'],
            ['fall.value', 'ring.b'],
            ['ring.value', 'thick.a'],
            ['ring_height.value', 'thick.b'],
            ['one.value', 'swell.a'],
            ['thick.value', 'swell.b'],
            ['arc.value', 'round.a'],
            ['swell.value', 'round.b'],
            ['round.value', 'cane_height.a'],
            ['half.value', 'cane_height.b'],
            ['x.value', 'lean.a'],
            ['arc.value', 'lean.b'],
            ['lean.value', 'lean_swell.a'],
            ['swell.value', 'lean_swell.b'],
            ['lean_swell.value', 'slope_across.a'],
            ['minus_scale.value', 'slope_across.b'],
            ['near.value', 't_raw.a'],
            ['wide.value', 't_raw.b'],
            ['t_raw.value', 't.x'],
            ['one.value', 't_left.a'],
            ['t.value', 't_left.b'],
            ['t.value', 't_bell.a'],
            ['t_left.value', 't_bell.b'],
            ['at.x', 'side.a'],
            ['rest.value', 'side.b'],
            ['side.value', 'sign.x'],
            ['t_bell.value', 'bell_signed.a'],
            ['sign.value', 'bell_signed.b'],
            ['bell_signed.value', 'bell_body.a'],
            ['arc.value', 'bell_body.b'],
            ['bell_body.value', 'slope_along.a'],
            ['along_gain.value', 'slope_along.b'],
            ['slope_across.value', 'cane_slope.x'],
            ['slope_along.value', 'cane_slope.y'],
        ],
    };
}

/**
 * `relief.bamboo` — o relevo do painel de bambu: cada colmo um meio cilindro (`diameter`, 71 mm por diâmetro do
 * padrão), engrossado no anel do nó, com a fibra fina ao longo (0,2 mm). Parâmetros: `diameter`, `pattern_scale`.
 */
const bambooRelief = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            ...bambooProfile().nodes,
            fibre: pattern.grain.with(BAMBOO_FIBRE),
            cane_relief: surface.relief.with({ height: 71 }),
            fibre_relief: surface.relief.with({ height: 0.2 }),
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...bambooProfile().links,
            ...patternLinks('fibre'),
            ...reliefLinks('cane_relief', 'cane_height.value', 'cane_slope.value'),
            ...reliefLinks('fibre_relief', 'fibre.value', 'fibre.gradient'),
            ['cane_relief.value', 'out.a'],
            ['fibre_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.bamboo',
        ...SAMPLE_INPUT,
        expose: [['cane_relief.height', 'diameter'], PATTERN_SCALE],
    },
);
reliefs.bamboo = bambooRelief;

/**
 * `material.bamboo` — painel de bambu: colmos de 7 cm lado a lado, em pé, cada um um cilindro de verdade no relevo (na
 * normal e, com `Displacements.bamboo`, na geometria), do seu tom entre o dourado (`color`) e o palha esverdeado
 * (`alt_color`), com as estrias compridas da casca, o nó — o anel saliente, escuro (`node_color`) numa faixa estreita
 * e mais claro logo acima e abaixo — e a sombra na folga entre vizinhos. A casca é lisa e encerada (IOR 1,5,
 * rugosidade 0,3). Montado com `pattern.planks` e os nós de matemática (`bambooProfile`). Parâmetros: `color`,
 * `alt_color`, `node_color`, `roughness`, `diameter` (mm), `scale` (unidades por metro), `pattern_scale`.
 */
export const bamboo = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            ...bambooProfile().nodes,
            streak: pattern.grain.with({ scale: [45, 1.2], octaves: 3, gain: 0.55, seed: 433 }),
            blotch: pattern.grain.with({ scale: [6, 2], octaves: 3, seed: 434 }),
            gold: math.value3.with({ value: [0.6, 0.45, 0.2] }),
            straw: math.value3.with({ value: [0.5, 0.46, 0.22] }),
            knot: math.value3.with({ value: [0.16, 0.1, 0.045] }),
            pick: math.mix3,
            lot: map.range.with({ out_min: 0.82, out_max: 1.14 }),
            streaked: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.86, out_max: 1.12 }),
            blotched: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.08 }),
            // Logo acima e abaixo do nó a casca é mais clara (a cera); no meio dele, a faixa escura.
            halo: map.range.with({ in_min: 0.05, in_max: 0.5, out_min: 1, out_max: 1.14 }),
            tone_a: math.mul,
            tone_b: math.mul,
            tone: math.mul,
            lit: math.scale3,
            band: map.range.with({ in_min: 0.8, in_max: 0.97, out_min: 0, out_max: 0.85 }),
            ringed: math.mix3,
            // A folga entre colmos: escura onde o cilindro desce a zero.
            deep: map.range.with({ in_min: 0.05, in_max: 0.4, out_min: 0.15, out_max: 1 }),
            shaded: math.scale3,
            tile: math.value2.with({ value: [1, 1] }),
            height: bambooRelief,
            normal: surface.reliefNormal,
            ...mineral(0.3),
        },
        links: [
            ...SPACE_LINKS,
            ...bambooProfile().links,
            ...patternLinks('streak', 'blotch'),
            ['tile.value', 'uv.scale'],
            ['gold.value', 'pick.a'],
            ['straw.value', 'pick.b'],
            ['cane.plank', 'pick.t'],
            ['cane.plank', 'lot.x'],
            ['streak.value', 'streaked.x'],
            ['blotch.value', 'blotched.x'],
            ['ring.value', 'halo.x'],
            ['lot.value', 'tone_a.a'],
            ['streaked.value', 'tone_a.b'],
            ['blotched.value', 'tone_b.a'],
            ['halo.value', 'tone_b.b'],
            ['tone_a.value', 'tone.a'],
            ['tone_b.value', 'tone.b'],
            ['pick.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['ring.value', 'band.x'],
            ['lit.value', 'ringed.a'],
            ['knot.value', 'ringed.b'],
            ['band.value', 'ringed.t'],
            ['arc.value', 'deep.x'],
            ['ringed.value', 'shaded.v'],
            ['deep.value', 'shaded.s'],
            ['s.value', 'height.s'],
            ['tile.value', 'height.pattern_scale'],
            ['height.value', 'normal.relief'],
            ...mineralLinks('shaded.value', 'normal.value'),
        ],
        output: 'out.value',
    }),
    {
        name: 'material.bamboo',
        ...SAMPLE_INPUT,
        expose: [
            ['gold.value', 'color'],
            ['straw.value', 'alt_color'],
            ['knot.value', 'node_color'],
            ['specular.roughness', 'roughness'],
            ['height.diameter', 'diameter'],
            ['normal.scale', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/** Os relevos em milímetros dos materiais de peças (`relief.<nome>`, `Displacements.<nome>`). */
export const pavingRelief = {
    paverHerringbone: reliefs.paverHerringbone!,
    concreteBlock: reliefs.concreteBlock!,
    concreteSlab: reliefs.concreteSlab!,
    stoneSetts: reliefs.stoneSetts!,
    stoneWall: reliefs.stoneWall!,
    stackedSlate: reliefs.stackedSlate!,
    flagstone: reliefs.flagstone!,
    cobblestone: reliefs.cobblestone!,
    gravel: reliefs.gravel!,
    bamboo: reliefs.bamboo!,
} as const;
