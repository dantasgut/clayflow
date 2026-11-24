import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { color } from '../color';
import { map } from '../map';
import { math } from '../math';
import { pattern } from '../pattern';
import { surface } from '../surface';
import {
    bumpLinks,
    PATTERN_SCALE,
    patternLinks,
    patternSpace,
    SAMPLE_INPUT,
    SPACE_LINKS,
    type Link,
} from './pattern';
import {
    ASH_EARLY,
    ASH_FIBER,
    ASH_OFFSET,
    ASH_PIT,
    ASH_PORE,
    ASH_RINGS,
    PINE_FINE_OFFSET,
    PINE_FINE_RINGS,
    BIRCH_DASH,
    BIRCH_EDGE,
    BIRCH_LENTICELS,
    BIRCH_PEEL,
    relief,
} from './relief';

// Espécies de madeira, assoalhos, casca e cortiça (spec 011, T117). Cada espécie tem a sua cor, o seu veio e a sua
// figura, calculados por pixel (`pattern.rings`: o corte tangencial do tronco com a fibra ao longo de u;
// `pattern_scale` repetições por unidade de uv; numa esfera, (2, 1)), em várias escalas: as faixas largas de cor da
// tábua, os anéis de largura irregular (com os arcos onde o corte passa perto da medula), o tom de cada ano, as faixas
// da grã ao longo da fibra, a fibra fina, os tracinhos claros (os raios medulares do carvalho, as bolsas de resina do
// pinho), os poros (os vasos grandes do carvalho e da nogueira; nenhum no pinho, que é conífera) e os nós — os galhos
// que atravessam a tábua (`knots`, `knot_size` de `pattern.rings`: os anéis desviam em volta do nó e fecham dentro
// dele, o miolo escuro `knot_color`). O acabamento: encerada (a interface de celulose e cera, IOR 1,5, acetinada, com o
// relevo da fibra na normal) ou envernizada — um dielétrico em camada (`closure.layer`, IOR 1,5) que acompanha o poro
// aberto e a fibra: a normal do verniz desce em cada poro e ondula com a fibra fina, e o realce quebra em tracinhos ao
// longo dela. Nas envernizadas a figura é a do corte tangencial: o anel é uma linha fina e escura (o lenho tardio
// estreito) sobre o lenho claro, de espaçamento muito irregular — a fundura do corte varia ao longo da tábua
// (`distortion`) e as linhas são curvas de nível dela, com ovais e catedrais —, com pouco contraste. Os assoalhos são as
// mesmas madeiras em tábuas (`pattern.planks`): cada peça com os seus anéis, na sua direção, e o seu tom.

type Rgb = readonly [number, number, number];

/** Valores de uma espécie de madeira. */
interface SpeciesValues {
    /** Cor do lenho inicial, do tardio e do miolo dos nós. */
    readonly color: Rgb;
    readonly late_color: Rgb;
    readonly knot_color: Rgb;
    /** O deslocamento do padrão no uv (a medula) e os parâmetros dos anéis (`pattern.rings`). */
    readonly offset: readonly [number, number];
    readonly rings: Readonly<Record<string, number | number[]>>;
    /** O nível do perfil do anel em que a cor começa a escurecer (0: transição gradual; 0,7: faixa tardia estreita). */
    readonly late_start: number;
    /** A variação do tom (± a fração): de anel para anel, das faixas largas, das faixas da grã, da fibra e da fibra fina. */
    readonly year: number;
    readonly broad: number;
    readonly figure: number;
    readonly streak: number;
    readonly fine: number;
    /** Os poros (vasos): a escala do grão alongado e o quanto escurecem (0 = sem poros). */
    readonly pore_scale: readonly [number, number];
    readonly pore: number;
    /** Os tracinhos claros ao longo da fibra (raios medulares, bolsas de resina): o quanto clareiam (0 = sem) e a escala. */
    readonly fleck: number;
    readonly fleck_scale: readonly [number, number];
    /** A rugosidade da interface da madeira (encerada) e, com verniz, a dele, a cor de absorção e a fundura do poro. */
    readonly roughness: number;
    readonly coat?: {
        readonly roughness: number;
        readonly color: Rgb;
        readonly pore: number;
        /** O quanto o verniz acompanha a fibra fina (a altura, em unidades do padrão; 0 = liso). */
        readonly fiber?: number;
    };
    /** Os nomes dos parâmetros expostos (o padrão: os de `woodPine`). */
    readonly expose?: readonly (readonly [string, string])[];
    /** As tábuas do assoalho (`pattern.planks`) e a variação do tom de peça para peça (± a fração). */
    readonly planks?: Readonly<Record<string, number>>;
    readonly plank_tone?: number;
}

/**
 * Sub-grafo de uma espécie de madeira: a cor (os anéis, o ano, as faixas, a fibra, os tracinhos, os poros e os nós) num
 * `bsdf.diffuse` sob um `bsdf.dielectric` — a cera, com o relevo da fibra na normal, ou a madeira molhada pelo verniz
 * (sem especular próprio) sob o verniz em camada, com o poro aberto na normal dele. Com `planks`, os padrões leem a
 * coordenada de cada tábua e a junta entra na cor e na normal do verniz.
 */
export function species(name: string, v: SpeciesValues): NodeDefinition {
    const floor = v.planks !== undefined;
    const coated = v.coat !== undefined;
    const grains = ['rings', 'fiber', 'thread', 'pore', 'fleck', 'figure', 'broad'];
    // A coordenada dos padrões do veio: a do uv ou a de cada tábua (sem período: a emenda cai nas juntas).
    const veins: Link[] = grains.flatMap((id): Link[] =>
        floor
            ? [
                  ['planks.p', `${id}.p`],
                  ['uv.width', `${id}.width`],
              ]
            : patternLinks(id),
    );
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(v.offset),
                ...(floor ? { planks: pattern.planks.with(v.planks) } : {}),
                rings: pattern.rings.with(v.rings),
                fiber: pattern.grain.with({ scale: [3, 150], octaves: 2, seed: 3 }),
                thread: pattern.grain.with({ scale: [9, 460], octaves: 2, seed: 4 }),
                pore: pattern.grain.with({ scale: [...v.pore_scale], octaves: 1, seed: 7 }),
                fleck: pattern.grain.with({ scale: [...v.fleck_scale], octaves: 1, seed: 11 }),
                figure: pattern.grain.with({ scale: [1.1, 8], octaves: 3, gain: 0.55, seed: 12 }),
                broad: pattern.grain.with({ scale: [0.45, 2.4], octaves: 3, gain: 0.55, seed: 13 }),
                tone: color.ramp.with({
                    color_a: [...v.color],
                    color_b: [...v.late_color],
                    low: v.late_start,
                    high: 1,
                }),
                year: map.range.with({ out_min: 1 - v.year, out_max: 1 + v.year }),
                wide: map.range.with({
                    in_min: -0.5,
                    in_max: 0.5,
                    out_min: 1 - v.broad,
                    out_max: 1 + v.broad,
                }),
                band: map.range.with({
                    in_min: -0.5,
                    in_max: 0.5,
                    out_min: 1 - v.figure,
                    out_max: 1 + v.figure,
                }),
                streak: map.range.with({
                    in_min: -0.5,
                    in_max: 0.5,
                    out_min: 1 - v.streak,
                    out_max: 1 + v.streak,
                }),
                hair: map.range.with({
                    in_min: -0.5,
                    in_max: 0.5,
                    out_min: 1 - v.fine,
                    out_max: 1 + v.fine,
                }),
                dash: map.range.with({
                    in_min: 0.42,
                    in_max: 0.6,
                    out_min: 1,
                    out_max: 1 + v.fleck,
                }),
                ...(floor
                    ? {
                          board: map.range.with({
                              out_min: 1 - (v.plank_tone ?? 0),
                              out_max: 1 + (v.plank_tone ?? 0),
                          }),
                          gap_mask: map.range.with({ out_min: 0, out_max: 0.85 }),
                          wood: math.mix3,
                      }
                    : {}),
                shade_a: math.mul,
                shade_b: math.mul,
                shade_c: math.mul,
                shade_d: math.mul,
                shade_e: math.mul,
                shade: math.mul,
                lit: math.scale3,
                pore_mask: map.range.with({
                    in_min: 0.25,
                    in_max: 0.5,
                    out_min: 0,
                    out_max: v.pore,
                }),
                pore_color: math.value3.with({
                    value: [v.late_color[0] * 0.35, v.late_color[1] * 0.35, v.late_color[2] * 0.35],
                }),
                pored: math.mix3,
                knot_color: math.value3.with({ value: [...v.knot_color] }),
                knot_mask: map.range.with({ in_min: 0.05, in_max: 0.6 }),
                knotted: math.mix3,
                body: bsdf.diffuse.with({ roughness: 0.5 }),
                specular: bsdf.dielectric.with({
                    ior: coated ? 1 : 1.5,
                    roughness: v.roughness,
                }),
                sum: closure.add,
                relief: surface.bump.with({ strength: floor ? 0 : 0.00004 }),
                fiber_relief: surface.bump.with({ strength: floor ? 0 : 0.0003 }),
                grained: closure.normal,
                // O verniz: a normal dele desce nos poros abertos (e na junta das tábuas).
                open: pattern.threshold.with({ low: 0.5, high: 0.2 }),
                pore_relief: surface.bump.with({ strength: v.coat?.pore ?? 0 }),
                coat_fiber: surface.bump.with({ strength: v.coat?.fiber ?? 0 }),
                joint_relief: surface.bump.with({ strength: floor ? 0.004 : 0 }),
                coat: bsdf.dielectric.with({ ior: 1.5, roughness: v.coat?.roughness ?? 0.3 }),
                coat_surface: closure.normal,
                out: closure.layer.with({
                    top_color: [...(v.coat?.color ?? [1, 1, 1])],
                    top_weight: coated ? 1 : 0,
                }),
            },
            links: [
                ...SPACE_LINKS,
                ...(floor ? patternLinks('planks') : []),
                ...veins,
                ['rings.value', 'tone.t'],
                ['rings.ring', 'year.x'],
                ['broad.value', 'wide.x'],
                ['figure.value', 'band.x'],
                ['fiber.value', 'streak.x'],
                ['thread.value', 'hair.x'],
                ['fleck.value', 'dash.x'],
                ...(floor ? ([['planks.plank', 'board.x']] as Link[]) : []),
                ['year.value', 'shade_a.a'],
                ['wide.value', 'shade_a.b'],
                ['band.value', 'shade_b.a'],
                ['streak.value', 'shade_b.b'],
                ['hair.value', 'shade_c.a'],
                ['dash.value', 'shade_c.b'],
                ['shade_a.value', 'shade_d.a'],
                ['shade_b.value', 'shade_d.b'],
                ['shade_c.value', 'shade_e.a'],
                ...(floor ? ([['board.value', 'shade_e.b']] as Link[]) : []),
                ['shade_d.value', 'shade.a'],
                ['shade_e.value', 'shade.b'],
                ['tone.color', 'lit.v'],
                ['shade.value', 'lit.s'],
                ['pore.value', 'pore_mask.x'],
                ['lit.value', 'pored.a'],
                ['pore_color.value', 'pored.b'],
                ['pore_mask.value', 'pored.t'],
                ['rings.knot', 'knot_mask.x'],
                ['pored.value', 'knotted.a'],
                ['knot_color.value', 'knotted.b'],
                ['knot_mask.value', 'knotted.t'],
                ...(floor
                    ? ([
                          ['planks.joint', 'gap_mask.x'],
                          ['knotted.value', 'wood.a'],
                          ['pore_color.value', 'wood.b'],
                          ['gap_mask.value', 'wood.t'],
                          ['wood.value', 'body.color'],
                      ] as Link[])
                    : ([['knotted.value', 'body.color']] as Link[])),
                ['specular.value', 'sum.a'],
                ['body.value', 'sum.b'],
                ...bumpLinks('relief', 'rings.gradient'),
                ...bumpLinks('fiber_relief', 'fiber.gradient', 'relief.value'),
                ['sum.value', 'grained.c'],
                ['fiber_relief.value', 'grained.normal'],
                ['pore.value', 'open.value'],
                ['pore.gradient', 'open.gradient'],
                ...bumpLinks('pore_relief', 'open.gradient'),
                ...bumpLinks('coat_fiber', 'thread.gradient', 'pore_relief.value'),
                ...bumpLinks(
                    'joint_relief',
                    floor ? 'planks.gradient' : 'open.gradient',
                    'coat_fiber.value',
                ),
                ['coat.value', 'coat_surface.c'],
                ['joint_relief.value', 'coat_surface.normal'],
                ['coat_surface.value', 'out.top'],
                ['grained.value', 'out.base'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: v.expose ?? [
                ['tone.color_a', 'color'],
                ['tone.color_b', 'late_color'],
                ['knot_color.value', 'knot_color'],
                ['rings.knots', 'knots'],
                ['rings.knot_size', 'knot_size'],
                ['specular.roughness', 'roughness'],
                ['out.top_color', 'coat_color'],
                ['coat.roughness', 'coat_roughness'],
                ['out.top_weight', 'coat_weight'],
                ['pore_relief.strength', 'pore_relief'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `material.woodPine` — pinho encerado: amarelo-palha claro (`color`) com as faixas do lenho tardio alaranjadas
 * (`late_color`; a transição é brusca, no fim do anel), anéis largos e irregulares (46 por unidade do padrão), as
 * bolsas de resina (tracinhos claros ao longo da fibra) e os nós — o pinho tem muitos (`knots`, 3 células por unidade
 * do padrão, um nó em três de cada dez), grandes, castanho-avermelhados, com o veio desviando em volta; sem poros (é
 * conífera). Parâmetros: `color`, `late_color`, `knot_color`, `knots`, `knot_size`, `roughness`, `coat_color`,
 * `coat_roughness`, `coat_weight` (0: sem verniz), `pore_relief`, `pattern_scale`.
 */
export const woodPine = species('material.woodPine', {
    color: [0.62, 0.44, 0.22],
    late_color: [0.5, 0.29, 0.11],
    knot_color: [0.2, 0.085, 0.03],
    offset: [0.77, -0.45],
    rings: {
        scale: 46,
        depth: 0.16,
        distortion: 0.13,
        distortion_scale: [1.3, 1.9],
        irregularity: 1,
        waviness: 0.022,
        waviness_scale: [2.2, 5],
        seed: 9,
        knots: 3,
        knot_size: 0.04,
        knot_rings: 9,
    },
    late_start: 0.6,
    year: 0.1,
    broad: 0.12,
    figure: 0.1,
    streak: 0.12,
    fine: 0.1,
    pore_scale: [10, 240],
    pore: 0,
    fleck: 0.16,
    fleck_scale: [5, 130],
    roughness: 0.55,
});

/**
 * `material.woodOak` — carvalho claro fosco (lixado e encerado): castanho-amarelado (`color`) com o lenho tardio pouco
 * mais escuro (`late_color`), os anéis em arcos (84 por unidade do padrão, de largura irregular), os vasos grandes do
 * lenho inicial em traços escuros ao longo do veio e os raios medulares — tracinhos claros e curtos que atravessam os
 * anéis; um nó pequeno de vez em quando. Parâmetros: os de `woodPine`.
 */
export const woodOak = species('material.woodOak', {
    color: [0.5, 0.35, 0.19],
    late_color: [0.33, 0.2, 0.095],
    knot_color: [0.13, 0.07, 0.03],
    offset: [0.13, -0.3],
    rings: {
        scale: 84,
        depth: 0.14,
        distortion: 0.12,
        distortion_scale: [1.1, 1.8],
        irregularity: 1,
        waviness: 0.02,
        waviness_scale: [2.5, 7],
        seed: 1,
        knots: 1.1,
        knot_size: 0.022,
        knot_rings: 7,
    },
    late_start: 0.35,
    year: 0.14,
    broad: 0.14,
    figure: 0.1,
    streak: 0.16,
    fine: 0.12,
    pore_scale: [7, 190],
    pore: 0.7,
    fleck: 0.3,
    fleck_scale: [22, 260],
    roughness: 0.6,
});

/**
 * `material.woodWalnut` — nogueira oleada: castanho-chocolate (`color`) com as linhas dos anéis mais escuras
 * (`late_color`), finas e de espaçamento irregular — a figura do corte tangencial, com ovais e catedrais —, as faixas
 * claras e escuras ao longo da fibra (± 24 %), as manchas largas e os poros escuros e compridos espalhados; acetinada.
 * Parâmetros: os de `woodPine`.
 */
export const woodWalnut = species('material.woodWalnut', {
    color: [0.215, 0.125, 0.07],
    late_color: [0.13, 0.072, 0.04],
    knot_color: [0.03, 0.016, 0.01],
    offset: [0.41, -0.36],
    rings: {
        scale: 78,
        depth: 0.2,
        distortion: 0.3,
        distortion_scale: [0.8, 2.3],
        irregularity: 1,
        waviness: 0.01,
        waviness_scale: [1.3, 24],
        seed: 5,
        knots: 0.8,
        knot_size: 0.03,
        knot_rings: 4,
    },
    late_start: 0.5,
    year: 0.16,
    broad: 0.24,
    figure: 0.24,
    streak: 0.18,
    fine: 0.14,
    pore_scale: [9, 150],
    pore: 0.75,
    fleck: 0,
    fleck_scale: [16, 210],
    roughness: 0.42,
});

/**
 * `material.woodOakVarnished` — carvalho escurecido e envernizado: a madeira tingida de castanho-escuro (`color`), as
 * linhas dos anéis pouco mais escuras (`late_color`), finas e irregulares, as faixas largas de cor e os vasos — poros
 * alongados e escuros, muitos, ao longo da fibra —, sob um verniz âmbar acetinado (rugosidade 0,2: o realce
 * de uma janela ou de um painel é uma mancha larga e macia) que acompanha o poro aberto e a fibra — a normal do verniz desce em cada vaso
 * (`pore_relief`, a altura em unidades do padrão) e ondula com a fibra fina: a mancha do realce sai cortada em
 * tracinhos ao longo da fibra. Parâmetros: os de `woodPine`.
 */
export const woodOakVarnished = species('material.woodOakVarnished', {
    color: [0.2, 0.105, 0.046],
    late_color: [0.135, 0.068, 0.029],
    knot_color: [0.04, 0.02, 0.01],
    offset: [0.58, -0.33],
    rings: {
        scale: 84,
        depth: 0.2,
        distortion: 0.32,
        distortion_scale: [0.7, 2.2],
        irregularity: 1,
        waviness: 0.009,
        waviness_scale: [1.2, 26],
        seed: 17,
        knots: 0,
    },
    late_start: 0.55,
    year: 0.12,
    broad: 0.22,
    figure: 0.12,
    streak: 0.22,
    fine: 0.2,
    pore_scale: [10, 210],
    pore: 0.92,
    fleck: 0.1,
    fleck_scale: [22, 260],
    roughness: 0.6,
    coat: { roughness: 0.2, color: [1, 0.82, 0.6], pore: 0.0034, fiber: 0.0003 },
});

/**
 * `material.woodMahogany` — mogno envernizado: laranja-avermelhado (`color`) com as linhas dos anéis castanhas
 * (`late_color`), finas, onduladas e de espaçamento irregular — as catedrais e os ovais do corte tangencial —, as
 * faixas da grã revessa ao longo da fibra, os tracinhos escuros dos poros, sob um verniz brilhante (rugosidade 0,11,
 * alaranjado) com o poro de leve aberto; sem nós. Parâmetros: os de `woodPine`.
 */
export const woodMahogany = species('material.woodMahogany', {
    color: [0.5, 0.165, 0.05],
    late_color: [0.33, 0.1, 0.032],
    knot_color: [0.06, 0.02, 0.012],
    offset: [0.27, -0.4],
    rings: {
        scale: 92,
        depth: 0.18,
        distortion: 0.34,
        distortion_scale: [0.6, 2],
        irregularity: 1,
        waviness: 0.008,
        waviness_scale: [1.1, 24],
        seed: 13,
        knots: 0,
    },
    late_start: 0.6,
    year: 0.14,
    broad: 0.2,
    figure: 0.22,
    streak: 0.2,
    fine: 0.18,
    pore_scale: [12, 230],
    pore: 0.85,
    fleck: 0,
    fleck_scale: [16, 210],
    roughness: 0.5,
    coat: { roughness: 0.11, color: [1, 0.72, 0.45], pore: 0.002, fiber: 0.00016 },
});

/** O carvalho dos assoalhos: os anéis com poucos arcos (a medula longe), o tom variando de tábua para tábua. */
const FLOOR_OAK = {
    color: [0.5, 0.33, 0.17],
    late_color: [0.3, 0.17, 0.075],
    knot_color: [0.11, 0.055, 0.025],
    offset: [0, 0],
    rings: {
        scale: 110,
        depth: 0.25,
        distortion: 0.2,
        distortion_scale: [1.2, 2.2],
        irregularity: 1,
        waviness: 0.02,
        waviness_scale: [2.5, 7],
        seed: 21,
        knots: 1.6,
        knot_size: 0.02,
        knot_rings: 4,
    },
    late_start: 0.35,
    year: 0.1,
    broad: 0.1,
    figure: 0.08,
    streak: 0.1,
    fine: 0.06,
    pore_scale: [7, 190],
    pore: 0.5,
    fleck: 0.14,
    fleck_scale: [22, 260],
    roughness: 0.6,
    coat: { roughness: 0.22, color: [1, 0.86, 0.62], pore: 0.0004 },
    plank_tone: 0.26,
} as const satisfies Omit<SpeciesValues, 'planks'>;

/**
 * `material.woodFloorPlanks` — assoalho de réguas de carvalho: tábuas de 1 por 6 larguras (`pattern.planks`: 16
 * larguras por unidade do padrão) em fileiras deslocadas ao acaso, cada uma com os seus anéis, os seus nós e o seu tom
 * (± 26 % de tábua para tábua), a junta escura entre elas e o verniz acetinado (rugosidade 0,22) que desce na junta e
 * nos poros. Parâmetros: os de `woodPine`.
 */
export const woodFloorPlanks = species('material.woodFloorPlanks', {
    ...FLOOR_OAK,
    planks: { scale: 16, length: 6, arrangement: 0, gap: 0.025, bevel: 0.05, seed: 31 },
});

/**
 * `material.woodFloorHerringbone` — taco em espinha de peixe: peças de 1 por 4 larguras (`pattern.planks`: 24 larguras
 * por unidade do padrão) alternadas a 90°, cada uma encostada no topo da vizinha — o veio de cada peça corre no
 * comprimento dela, e o tom muda de peça para peça —, com a junta escura e o verniz acetinado. Parâmetros: os de
 * `woodPine`.
 */
export const woodFloorHerringbone = species('material.woodFloorHerringbone', {
    ...FLOOR_OAK,
    planks: { scale: 24, length: 4, arrangement: 1, gap: 0.03, bevel: 0.05, seed: 33 },
});

/**
 * Sub-grafo de um freixo cru: a cor, o veio e os vasos (os de `material.woodAsh`), o corpo de subsuperfície e o lobo
 * da interface alongado pela fibra, com o relevo em milímetros de `reliefNode` na normal.
 */
/** Valores de uma madeira crua com subsuperfície (a cor, o veio, os traços ao longo da fibra, o espalhamento). */
interface RawWoodValues {
    readonly offset: readonly [number, number];
    readonly rings: Record<string, number | number[]>;
    /** O lenho inicial, o tardio e o nível do anel em que o tardio começa. */
    readonly color: Rgb3;
    readonly late: Rgb3;
    readonly low: number;
    /** Os traços ao longo da fibra (os vasos escuros do freixo, as bolsas de resina claras do pinho) e a cobertura. */
    readonly pore_color: Rgb3;
    readonly pore: number;
    /** O quanto os traços aparecem do lenho inicial ao tardio (`map.range` sobre o anel). */
    readonly early: Record<string, number>;
    /** A amplitude das faixas largas de tom e o miolo dos nós. */
    readonly broad: number;
    readonly knot_color: Rgb3;
    readonly radius: Rgb3;
    readonly roughness: number;
    readonly anisotropy: number;
    /** O grão dos traços ao longo da fibra e os níveis dele entre os quais a face vira traço (os do freixo). */
    readonly pore_grain?: Record<string, number | number[]>;
    readonly pit?: Record<string, number>;
    /** A variação do tom (± a fração) de anel para anel e das faixas da grã (0,07). */
    readonly year?: number;
    readonly figure?: number;
    /**
     * As faixas largas mais quentes ao longo da fibra: o grão delas, a cor que multiplica a da madeira e o quanto
     * entram no máximo (sem: nenhuma).
     */
    readonly warm?: {
        readonly grain: Record<string, number | number[]>;
        readonly tint: Rgb3;
        readonly amount: number;
    };
}
type Rgb3 = readonly [number, number, number];

/** O freixo cru. */
const ASH_WOOD: RawWoodValues = {
    offset: ASH_OFFSET,
    rings: ASH_RINGS,
    color: [0.66, 0.53, 0.37],
    late: [0.5, 0.36, 0.21],
    low: 0.68,
    pore_color: [0.2, 0.13, 0.07],
    pore: 0.75,
    early: ASH_EARLY,
    broad: 0.1,
    knot_color: [0.2, 0.12, 0.06],
    radius: [1.1, 0.7, 0.35],
    roughness: 0.62,
    anisotropy: 0.6,
};

function ash(
    name: string,
    reliefNode: NodeDefinition,
    v: RawWoodValues = ASH_WOOD,
): NodeDefinition {
    const year = v.year ?? 0.07;
    const figure = v.figure ?? 0.07;
    const { warm } = v;
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(v.offset),
                // Os anéis, a medula e os nós: os mesmos valores na cor e no relevo.
                count: math.value.with({ value: v.rings.scale as number }),
                pith: math.value.with({ value: v.rings.depth as number }),
                knots: math.value.with({ value: v.rings.knots ?? 0 }),
                rings: pattern.rings.with(v.rings),
                fiber: pattern.grain.with(ASH_FIBER),
                thread: pattern.grain.with({ scale: [7, 300], octaves: 2, seed: 44 }),
                pore: pattern.grain.with(v.pore_grain ?? ASH_PORE),
                pit: pattern.threshold.with(v.pit ?? ASH_PIT),
                figure: pattern.grain.with({ scale: [1.1, 8], octaves: 3, gain: 0.55, seed: 45 }),
                broad: pattern.grain.with({ scale: [0.45, 2.4], octaves: 3, gain: 0.55, seed: 46 }),
                tone: color.ramp.with({
                    color_a: [...v.color],
                    color_b: [...v.late],
                    low: v.low,
                    high: 1,
                }),
                year: map.range.with({ out_min: 1 - year, out_max: 1 + year }),
                wide: map.range.with({
                    in_min: -0.5,
                    in_max: 0.5,
                    out_min: 1 - v.broad,
                    out_max: 1 + v.broad,
                }),
                band: map.range.with({
                    in_min: -0.5,
                    in_max: 0.5,
                    out_min: 1 - figure,
                    out_max: 1 + figure,
                }),
                streak: map.range.with({ in_min: -0.5, in_max: 0.5, out_min: 0.88, out_max: 1.12 }),
                hair: map.range.with({ in_min: -0.5, in_max: 0.5, out_min: 0.93, out_max: 1.07 }),
                shade_a: math.mul,
                shade_b: math.mul,
                shade_c: math.mul,
                shade: math.mul,
                lit: math.scale3,
                // As faixas quentes: a cor da madeira multiplicada pela cor da faixa, onde o grão largo passa do nível.
                ...(warm === undefined
                    ? {}
                    : {
                          warm: pattern.grain.with(warm.grain),
                          warm_mask: map.range.with({
                              in_min: -0.2,
                              in_max: 0.3,
                              out_min: 0,
                              out_max: warm.amount,
                          }),
                          warm_tint: math.value3.with({ value: [...warm.tint] }),
                          tinted: math.mul3,
                          warmed: math.mix3,
                      }),
                // Os vasos abertos: escuros no fundo, só no lenho inicial.
                early: map.range.with(v.early),
                hollow: map.range.with({ out_min: v.pore, out_max: 0 }),
                pore_mask: math.mul,
                pore_color: math.value3.with({ value: [...v.pore_color] }),
                pored: math.mix3,
                // O miolo dos nós, escuro.
                knot_color: math.value3.with({ value: [...v.knot_color] }),
                knotted: math.mix3,
                world: math.value.with({ value: 1 }),
                body: bsdf.subsurface.with({ radius: [...v.radius] }),
                specular: bsdf.dielectric.with({
                    ior: 1.5,
                    roughness: v.roughness,
                    anisotropy: v.anisotropy,
                }),
                sum: closure.add,
                tile: math.value2.with({ value: [1, 1] }),
                height: reliefNode,
                normal: surface.reliefNormal,
                out: closure.normal,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('rings', 'fiber', 'thread', 'pore', 'figure', 'broad'),
                ['tile.value', 'uv.scale'],
                ['count.value', 'rings.scale'],
                ['pith.value', 'rings.depth'],
                ['knots.value', 'rings.knots'],
                ['count.value', 'height.ring_count'],
                ['pith.value', 'height.pith_depth'],
                ['knots.value', 'height.knot_density'],
                ['pore.value', 'pit.value'],
                ['pore.gradient', 'pit.gradient'],
                ['rings.value', 'tone.t'],
                ['rings.ring', 'year.x'],
                ['broad.value', 'wide.x'],
                ['figure.value', 'band.x'],
                ['fiber.value', 'streak.x'],
                ['thread.value', 'hair.x'],
                ['year.value', 'shade_a.a'],
                ['wide.value', 'shade_a.b'],
                ['band.value', 'shade_b.a'],
                ['streak.value', 'shade_b.b'],
                ['shade_a.value', 'shade_c.a'],
                ['shade_b.value', 'shade_c.b'],
                ['shade_c.value', 'shade.a'],
                ['hair.value', 'shade.b'],
                ['tone.color', 'lit.v'],
                ['shade.value', 'lit.s'],
                ['rings.value', 'early.x'],
                ['pit.value', 'hollow.x'],
                ['early.value', 'pore_mask.a'],
                ['hollow.value', 'pore_mask.b'],
                ...(warm === undefined
                    ? ([['lit.value', 'pored.a']] as Link[])
                    : ([
                          ...patternLinks('warm'),
                          ['warm.value', 'warm_mask.x'],
                          ['lit.value', 'tinted.a'],
                          ['warm_tint.value', 'tinted.b'],
                          ['lit.value', 'warmed.a'],
                          ['tinted.value', 'warmed.b'],
                          ['warm_mask.value', 'warmed.t'],
                          ['warmed.value', 'pored.a'],
                      ] as Link[])),
                ['pore_color.value', 'pored.b'],
                ['pore_mask.value', 'pored.t'],
                ['pored.value', 'knotted.a'],
                ['knot_color.value', 'knotted.b'],
                ['rings.knot', 'knotted.t'],
                ['knotted.value', 'body.color'],
                ['world.value', 'body.scale'],
                ['uv.du', 'specular.tangent'],
                ['specular.value', 'sum.a'],
                ['body.value', 'sum.b'],
                ['s.value', 'height.s'],
                ['tile.value', 'height.pattern_scale'],
                ['height.value', 'normal.relief'],
                ['world.value', 'normal.scale'],
                ['sum.value', 'out.c'],
                ['normal.value', 'out.normal'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['tone.color_a', 'color'],
                ['tone.color_b', 'late_color'],
                ['pore_color.value', 'pore_color'],
                ['knot_color.value', 'knot_color'],
                ['specular.roughness', 'roughness'],
                ['specular.anisotropy', 'anisotropy'],
                ['body.radius', 'radius'],
                ['height.ring_height', 'ring_height'],
                ['height.pore_depth', 'pore_depth'],
                ['height.fiber_height', 'fiber_height'],
                ['height.furrow_depth', 'furrow_depth'],
                ['count.value', 'ring_count'],
                ['pith.value', 'pith_depth'],
                ['knots.value', 'knot_density'],
                ['world.value', 'scale'],
                ['tile.value', 'pattern_scale'],
            ],
        },
    );
}

/**
 * `material.woodAsh` — freixo cru: madeira clara e fosca, lixada e escovada de leve, sem verniz nem cera. Creme
 * (`color`), com o veio discreto e irregular — o lenho tardio pouco mais escuro (`late_color`), cada anel com o seu
 * tom, faixas largas, a fibra fina — e os vasos abertos do lenho inicial em tracinhos escuros ao longo do veio
 * (`pore_color`; o freixo tem o anel poroso). A madeira clara é translúcida a curta distância: a luz entra, espalha-se
 * nas fibras e sai perto — o corpo é `bsdf.subsurface`, com o caminho livre médio `radius` de (1,1, 0,7, 0,35) mm,
 * mais longo no vermelho (valores estimados: ordem de 1 mm, sem medida publicada do freixo; Marschner et al. 2005,
 * "Measuring and Modeling the Appearance of Finished Wood", medem o espalhamento sob a superfície da madeira e a
 * anisotropia dele pela fibra), e `scale` unidades do mundo por metro — é o que dá o aspecto macio da madeira crua,
 * e uma peça fina deixa passar luz. Sem verniz, a interface é a da celulose (IOR 1,5) de lobo largo (`roughness`,
 * 0,62) e alongado através da fibra (`anisotropy`, 0,6, a tangente ao longo do veio: o realce de fibra de Marschner
 * et al., aqui no lobo da interface). O relevo é o de `relief.woodAsh`, em milímetros — o lenho tardio saliente
 * (`ring_height`, 0,12), os poros abertos (`pore_depth`, 0,25) e a fibra levantada (`fiber_height`, 0,08) —, na
 * normal; com `Displacements.woodAsh()` na entidade de uma `ParametricSurface`, na geometria. Os anéis (`ring_count`,
 * por unidade do padrão), a distância da medula ao plano do corte (`pith_depth`) e os nós (`knot_density`, células por
 * unidade do padrão; 0 no freixo) são um valor só, ligado à cor e ao relevo. Parâmetros: `color`, `late_color`,
 * `pore_color`, `roughness`, `anisotropy`, `radius`, `ring_height`, `pore_depth`, `fiber_height`, `furrow_depth`,
 * `ring_count`, `pith_depth`, `knot_density`, `scale`, `pattern_scale`.
 */
export const woodAsh = ash('material.woodAsh', relief.woodAsh);

/**
 * `material.woodAshBrushed` — freixo escovado a fundo (a tábua escovada com escova de aço ou jateada, crua): a mesma
 * madeira de `woodAsh` — clara, fosca, o corpo de subsuperfície (`radius`, (1,1, 0,7, 0,35) mm, estimado) — com o
 * relevo de `relief.woodAshBrushed`: a fibra macia do lenho inicial removida em sulcos ao longo do veio
 * (`furrow_depth`, 1,1 mm), o lenho tardio saliente em cristas (`ring_height`, 0,8 mm), os vasos abertos
 * (`pore_depth`, 0,5 mm) e a fibra levantada (`fiber_height`, 0,15 mm). Na normal, o relevo sombreia o veio; com
 * `Displacements.woodAshBrushed()` na entidade de uma `ParametricSurface`, vai à geometria — a silhueta fica
 * serrilhada pelas cristas e os sulcos fazem sombra na luz rasante. A luz que entra pelas cristas finas (da ordem do
 * milímetro, a do raio de espalhamento) sai do outro lado: a subsuperfície clareia a sombra dos sulcos. Parâmetros:
 * os de `woodAsh`.
 */
export const woodAshBrushed = ash('material.woodAshBrushed', relief.woodAshBrushed);

/**
 * `material.woodPineFine` — pinho claro de veio fino, cru (fosco, sem verniz), escovado: amarelo-mel (`color`), com
 * muitas linhas de veio finas (o lenho tardio estreito, castanho-alaranjado: `late_color`) que ondulam, abrem e
 * fecham, de largura e tom irregulares (`ring_count`, 92 anéis por unidade do padrão), faixas largas de tom e faixas
 * mais alaranjadas ao longo da fibra, a fileira de "catedrais" fechadas e de ilhas onde o corte é tangente aos anéis
 * (`pith_depth`, 0,015: a medula quase no plano do corte), os nós — o olho oval de anéis apertados e miolo escuro
 * (`knot_color`), com o veio desviando em gota (`knot_density`, 4,5 células por unidade do padrão) —, as bolsas de
 * resina em riscos claros, finos e curtos ao longo da fibra (`pore_color`) e a fibra fina. O corpo é subsuperfície
 * (`radius`, (1,2; 0,75; 0,35) mm, mais longo no vermelho: estimado, da ordem de 1 mm como o do freixo — sem medida
 * publicada do pinho): o aspecto macio e quente, e o fundo dos sulcos mais claro. O relevo é o de
 * `relief.woodPineFine`, em milímetros — o lenho tardio em crista (`ring_height`, 0,8), os sulcos da escova
 * (`furrow_depth`, 0,2), a fibra (`fiber_height`, 0,06) —, na normal; com `Displacements.woodPineFine()` na entidade
 * de uma `ParametricSurface`, na geometria (a silhueta serrilhada de leve, a sombra fina nos sulcos sob a luz
 * rasante atravessada ao veio). Os anéis, a medula e os nós são um valor só para a cor e o relevo: passe os mesmos
 * ao material e ao deslocamento. Parâmetros: os de `woodAsh`.
 */
export const woodPineFine = ash('material.woodPineFine', relief.woodPineFine, {
    offset: PINE_FINE_OFFSET,
    rings: PINE_FINE_RINGS,
    color: [0.6, 0.4, 0.17],
    late: [0.4, 0.21, 0.07],
    low: 0.76,
    pore_color: [0.82, 0.66, 0.38],
    pore: 0.9,
    early: { in_min: 0, in_max: 1, out_min: 0.7, out_max: 0.7 },
    broad: 0.24,
    knot_color: [0.2, 0.09, 0.03],
    radius: [1.2, 0.75, 0.35],
    roughness: 0.58,
    anisotropy: 0.5,
    pore_grain: { scale: [4.5, 170], octaves: 1, seed: 47 },
    pit: { low: 0.54, high: 0.4 },
    year: 0.13,
    figure: 0.1,
    warm: {
        grain: { scale: [0.35, 3.4], octaves: 2, gain: 0.5, seed: 48 },
        tint: [1.1, 0.76, 0.45],
        amount: 1,
    },
});

/**
 * `material.barkBirch` — casca de bétula: lisa, branca e acetinada (`color`; a betulina, rugosidade 0,45), manchada de
 * leve em faixas em volta do tronco, com as lenticelas — traços curtos, escuros e salientes em volta do tronco
 * (`lenticel_color`) — e as tiras de casca fina que descascam: sob a tira solta aparece a camada de baixo, rosada
 * (`under_color`), e a borda levantada faz sombra. O relevo é o de `relief.barkBirch`, em milímetros — a borda
 * enrolada das tiras (`peel_height`, 4), as lenticelas (`lenticel_height`, 1,2) e a ondulação do tronco
 * (`swell_height`, 2), com `scale` unidades do mundo por metro —, na normal; com `Displacements.barkBirch()` na
 * entidade de uma `ParametricSurface`, na geometria. Parâmetros: `color`, `under_color`, `lenticel_color`,
 * `roughness`, `peel_height`, `lenticel_height`, `swell_height`, `scale`, `pattern_scale`.
 */
export const barkBirch = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            peel: pattern.grain.with(BIRCH_PEEL),
            strip: pattern.threshold.with(BIRCH_EDGE),
            mark: pattern.grain.with(BIRCH_LENTICELS),
            dash: pattern.threshold.with(BIRCH_DASH),
            stain: pattern.grain.with({ scale: [2, 14], octaves: 4, gain: 0.55, seed: 99 }),
            white: math.value3.with({ value: [0.78, 0.76, 0.7] }),
            under: math.value3.with({ value: [0.62, 0.44, 0.33] }),
            dark: math.value3.with({ value: [0.06, 0.045, 0.035] }),
            banded: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.84, out_max: 1.1 }),
            white_lit: math.scale3,
            // Sob a tira solta (abaixo do nível), a camada rosada; perto da borda, a sombra dela.
            below: map.range.with({ in_min: 0.02, in_max: 0.2, out_min: 0.75, out_max: 0 }),
            layered: math.mix3,
            marked: math.mix3,
            body: bsdf.diffuse.with({ roughness: 0.4 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.45 }),
            sum: closure.add,
            tile: math.value2.with({ value: [1, 1] }),
            height: relief.barkBirch,
            normal: surface.reliefNormal,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('peel', 'mark', 'stain'),
            ['tile.value', 'uv.scale'],
            ['peel.value', 'strip.value'],
            ['peel.gradient', 'strip.gradient'],
            ['mark.value', 'dash.value'],
            ['mark.gradient', 'dash.gradient'],
            ['stain.value', 'banded.x'],
            ['white.value', 'white_lit.v'],
            ['banded.value', 'white_lit.s'],
            ['peel.value', 'below.x'],
            ['white_lit.value', 'layered.a'],
            ['under.value', 'layered.b'],
            ['below.value', 'layered.t'],
            ['layered.value', 'marked.a'],
            ['dark.value', 'marked.b'],
            ['dash.value', 'marked.t'],
            ['marked.value', 'body.color'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['s.value', 'height.s'],
            ['tile.value', 'height.pattern_scale'],
            ['height.value', 'normal.relief'],
            ['sum.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.barkBirch',
        ...SAMPLE_INPUT,
        expose: [
            ['white.value', 'color'],
            ['under.value', 'under_color'],
            ['dark.value', 'lenticel_color'],
            ['specular.roughness', 'roughness'],
            ['height.peel_height', 'peel_height'],
            ['height.lenticel_height', 'lenticel_height'],
            ['height.swell_height', 'swell_height'],
            ['normal.scale', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.cork` — cortiça aglomerada (a rolha, o painel): os grânulos prensados (`pattern.cells`: 84 por unidade do
 * padrão), cada um de um tom do castanho-claro (`color`) ao mais escuro (`dark_color`), com a junta de cola escura
 * entre eles, as lenticelas — os canais escuros da casca do sobreiro, em alguns grânulos (um em dez, `pore_color`) —
 * e o grão fino das células da cortiça em relevo (`relief`, em unidades do padrão); fosca e macia (difuso áspero,
 * interface de suberina, IOR 1,5, rugosidade 0,9). Parâmetros: `color`, `dark_color`, `pore_color`, `roughness`,
 * `relief`, `pattern_scale`.
 */
export const cork = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            granule: pattern.cells.with({ scale: 84, jitter: 1, crease: 0.22, seed: 181 }),
            cell: pattern.grain.with({ scale: [230, 230], octaves: 2, seed: 182 }),
            light: math.value3.with({ value: [0.5, 0.35, 0.2] }),
            dark: math.value3.with({ value: [0.36, 0.24, 0.13] }),
            pore_color: math.value3.with({ value: [0.09, 0.05, 0.03] }),
            pick: map.range.with({ in_min: 0, in_max: 0.9 }),
            is_pore: map.range.with({ in_min: 0.9, in_max: 0.91 }),
            pore_core: map.range.with({ in_min: 0.5, in_max: 1 }),
            pore_mask: math.mul,
            tone: math.mix3,
            pored: math.mix3,
            glue: map.range.with({ out_min: 0.7, out_max: 1 }),
            speck: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.86, out_max: 1.12 }),
            shade: math.mul,
            lit: math.scale3,
            granule_relief: surface.bump.with({ strength: 0.0012 }),
            relief: surface.bump.with({ strength: 0.0006 }),
            body: bsdf.diffuse.with({ roughness: 1 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.9 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('granule', 'cell'),
            ['granule.cell', 'pick.x'],
            ['granule.cell', 'is_pore.x'],
            ['granule.height', 'pore_core.x'],
            ['is_pore.value', 'pore_mask.a'],
            ['pore_core.value', 'pore_mask.b'],
            ['light.value', 'tone.a'],
            ['dark.value', 'tone.b'],
            ['pick.value', 'tone.t'],
            ['tone.value', 'pored.a'],
            ['pore_color.value', 'pored.b'],
            ['pore_mask.value', 'pored.t'],
            ['granule.height', 'glue.x'],
            ['cell.value', 'speck.x'],
            ['glue.value', 'shade.a'],
            ['speck.value', 'shade.b'],
            ['pored.value', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ...bumpLinks('granule_relief', 'granule.gradient'),
            ...bumpLinks('relief', 'cell.gradient', 'granule_relief.value'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.cork',
        ...SAMPLE_INPUT,
        expose: [
            ['light.value', 'color'],
            ['dark.value', 'dark_color'],
            ['pore_color.value', 'pore_color'],
            ['specular.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);
