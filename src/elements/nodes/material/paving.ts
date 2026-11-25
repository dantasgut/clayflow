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

/** Os valores de um asfalto. */
interface AsphaltValues {
    /** Britas por unidade do padrão e a largura do betume entre elas (fração da célula). */
    readonly stones: number;
    readonly crease: number;
    /** A altura das britas e a da areia, em unidades do padrão. */
    readonly relief: number;
    readonly grit: number;
    readonly dark: Rgb;
    readonly light: Rgb;
    /** O expoente da escolha do tom da brita (maior: menos pedras claras). */
    readonly pale: number;
    readonly roughness: number;
    /** A rede de trincas: a profundidade, em unidades do padrão (sem: asfalto inteiro). */
    readonly cracks?: number;
    readonly seed: number;
}

/**
 * Sub-grafo de um asfalto: as britas (`pattern.cells`, cada célula uma pedra de tom próprio entre `color` e
 * `stone_color`) presas no betume (`binder_color`, nos sulcos, mais liso que a pedra), as manchas largas do desgaste e
 * a areia que pica a face. Com `cracks`, a rede de trincas: as placas grandes (um Voronoi de 3,5 células por unidade:
 * a "pele de jacaré") e, só nas manchas mais gastas, as trincas finas dentro delas — escuras e fundas, com o traçado
 * entortado por um grão largo (a coordenada das trincas é a do padrão deslocada 4 % de uma unidade).
 */
function asphaltOf(name: string, a: AsphaltValues): ReturnType<typeof Subgraph.point> {
    const cracked = a.cracks !== undefined;
    const crackNodes: Record<string, GraphNode> = cracked
        ? {
              crack: pattern.cells.with({ scale: 3.5, jitter: 1, crease: 0.03, seed: a.seed + 10 }),
              fine: pattern.cells.with({ scale: 9, jitter: 1, crease: 0.045, seed: a.seed + 11 }),
              bend_x: pattern.grain.with({ scale: [5, 5], octaves: 3, seed: a.seed + 12 }),
              bend_y: pattern.grain.with({ scale: [5, 5], octaves: 3, seed: a.seed + 13 }),
              bend: math.value.with({ value: 0.04 }),
              straight: math.split2,
              off_x: math.mul,
              off_y: math.mul,
              bent_x: math.add,
              bent_y: math.add,
              bent: math.combine2,
              where: map.range.with({ in_min: 0, in_max: 0.35 }),
              gap: map.range.with({ out_min: 1, out_max: 0 }),
              fine_gap: map.range.with({ out_min: 1, out_max: 0 }),
              fine_part: math.mul,
              open: math.max,
              crack_color: math.value3.with({ value: [0.008, 0.008, 0.009] }),
              split: math.mix3,
              crack_depth: math.value.with({ value: a.cracks! }),
              fine_depth: math.mul,
              crack_relief: surface.bump,
              fine_relief: surface.bump,
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
              ...(['crack', 'fine'] as const).flatMap((id): Link[] => [
                  ['bent.value', `${id}.p`],
                  ['uv.width', `${id}.width`],
                  ['uv.wrap', `${id}.wrap`],
              ]),
              ['patch.value', 'where.x'],
              ['crack.height', 'gap.x'],
              ['fine.height', 'fine_gap.x'],
              ['fine_gap.value', 'fine_part.a'],
              ['where.value', 'fine_part.b'],
              ['gap.value', 'open.a'],
              ['fine_part.value', 'open.b'],
              ['road.value', 'split.a'],
              ['crack_color.value', 'split.b'],
              ['open.value', 'split.t'],
              ...bumpLinks('crack_relief', 'crack.gradient', 'grit_relief.value'),
              ['crack_depth.value', 'crack_relief.strength'],
              ['crack_depth.value', 'fine_depth.a'],
              ['where.value', 'fine_depth.b'],
              ...bumpLinks('fine_relief', 'fine.gradient', 'crack_relief.value'),
              ['fine_depth.value', 'fine_relief.strength'],
          ]
        : [];
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                stone: pattern.cells.with({
                    scale: a.stones,
                    jitter: 1,
                    crease: a.crease,
                    seed: a.seed,
                }),
                grit: pattern.grain.with({
                    scale: [3.2 * a.stones, 3.2 * a.stones],
                    octaves: 2,
                    seed: a.seed + 1,
                }),
                patch: pattern.grain.with({ scale: [4, 4], octaves: 3, seed: a.seed + 2 }),
                dark: math.value3.with({ value: [...a.dark] }),
                light: math.value3.with({ value: [...a.light] }),
                binder: math.value3.with({ value: [0.012, 0.012, 0.013] }),
                pale: math.value.with({ value: a.pale }),
                pick: math.pow,
                aggregate: math.mix3,
                worn: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.8, out_max: 1.2 }),
                gritty: map.range.with({
                    in_min: -0.6,
                    in_max: 0.6,
                    out_min: 0.85,
                    out_max: 1.15,
                }),
                tone: math.mul,
                toned: math.scale3,
                road: math.mix3,
                rough: map.range.with({ out_min: 0.45, out_max: a.roughness }),
                relief: surface.bump.with({ strength: a.relief }),
                grit_relief: surface.bump.with({ strength: a.grit }),
                ...crackNodes,
                ...mineral(0.85, 1.55),
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('stone', 'grit', 'patch'),
                ['stone.cell', 'pick.x'],
                ['pale.value', 'pick.e'],
                ['dark.value', 'aggregate.a'],
                ['light.value', 'aggregate.b'],
                ['pick.value', 'aggregate.t'],
                ['patch.value', 'worn.x'],
                ['grit.value', 'gritty.x'],
                ['worn.value', 'tone.a'],
                ['gritty.value', 'tone.b'],
                ['aggregate.value', 'toned.v'],
                ['tone.value', 'toned.s'],
                ['binder.value', 'road.a'],
                ['toned.value', 'road.b'],
                ['stone.height', 'road.t'],
                ['stone.height', 'rough.x'],
                ['rough.value', 'specular.roughness'],
                ...bumpLinks('relief', 'stone.gradient'),
                ...bumpLinks('grit_relief', 'grit.gradient', 'relief.value'),
                ...crackLinks,
                ...mineralLinks(
                    cracked ? 'split.value' : 'road.value',
                    cracked ? 'fine_relief.value' : 'grit_relief.value',
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
                ['rough.out_max', 'roughness'],
                ['relief.strength', 'relief'],
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
 * `material.asphaltFine` — asfalto de granulometria fina (o da rua recapeada): britas de 5 mm (200 por unidade do
 * padrão), quase todas escuras, o betume ainda cobrindo a pedra — a superfície mais lisa e mais escura dos três.
 * Parâmetros: `color`, `stone_color`, `binder_color`, `roughness`, `relief`, `pattern_scale`.
 */
export const asphaltFine = asphaltOf('material.asphaltFine', {
    stones: 200,
    crease: 0.5,
    relief: 0.0011,
    grit: 0.00012,
    dark: [0.03, 0.03, 0.033],
    light: [0.13, 0.13, 0.125],
    pale: 3,
    roughness: 0.75,
    seed: 301,
});

/**
 * `material.asphaltCoarse` — asfalto grosso e gasto (o da estrada antiga): britas de 20 mm (48 por unidade do padrão)
 * à vista, muitas já claras de tão polidas, o betume recuado entre elas — o relevo mais alto dos três. Parâmetros: os
 * de `asphaltFine`.
 */
export const asphaltCoarse = asphaltOf('material.asphaltCoarse', {
    stones: 48,
    crease: 0.45,
    relief: 0.0075,
    grit: 0.0007,
    dark: [0.045, 0.045, 0.048],
    light: [0.2, 0.19, 0.18],
    pale: 2,
    roughness: 0.9,
    seed: 311,
});

/**
 * `material.asphaltCracked` — asfalto rachado: o asfalto médio (80 britas por unidade) cortado pela rede de trincas —
 * as placas grandes da "pele de jacaré" e, nas manchas mais gastas, as trincas finas dentro delas —, escuras e fundas
 * (`crack_depth`, em unidades do padrão; `crack_color`). Parâmetros: os de `asphaltFine`, `crack_depth`,
 * `crack_color`.
 */
export const asphaltCracked = asphaltOf('material.asphaltCracked', {
    stones: 80,
    crease: 0.4,
    relief: 0.0035,
    grit: 0.0004,
    dark: [0.055, 0.055, 0.058],
    light: [0.26, 0.25, 0.235],
    pale: 2,
    roughness: 0.88,
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
     * O padrão é o de mossas (`pattern.dents`: a altura cresce do ponto da célula para a borda) lido ao contrário — a
     * pedra abaulada com o vale vivo onde duas se encostam —: a faixa da altura dele que vira a junta.
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

/**
 * Sub-grafo de um material de peças com junta: cada peça escolhe a cor entre `color` e `alt_color` e o tom na faixa
 * `lot`, com as manchas largas e a areia por cima; a junta (`joint_color`) fica onde a altura do padrão desce a zero.
 * Três relevos somados na normal: o da peça sobre a junta (`relief`), o da face — só sobre a peça (`face_relief`) — e
 * o da areia. Parâmetros: `color`, `alt_color`, `joint_color`, `roughness`, `relief`, `face_relief`, `pattern_scale`.
 */
function piecesOf(name: string, v: PieceValues): ReturnType<typeof Subgraph.point> {
    const turned = v.turned === true;
    const height = v.inverted !== undefined ? 'rise.value' : 'bond.height';
    const marked = v.marks !== undefined;
    // Com os eixos trocados: a coordenada e o período entram trocados no padrão, e o gradiente dele volta trocado.
    const turnNodes: Record<string, GraphNode> = turned
        ? {
              p_parts: math.split2,
              p_turned: math.combine2,
              wrap_parts: math.split2,
              wrap_turned: math.combine2,
              slope_parts: math.split2,
              slope: math.combine2,
              ...(marked ? { mark_parts: math.split2, mark_slope: math.combine2 } : {}),
          }
        : {};
    const turnLinks: Link[] = turned
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
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                bond: v.bond,
                ...turnNodes,
                stain: pattern.grain.with({
                    scale: [...v.stain.scale],
                    octaves: v.stain.octaves,
                    seed: v.seed + 1,
                }),
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
                gritty: map.range.with({
                    in_min: -0.6,
                    in_max: 0.6,
                    out_min: 0.88,
                    out_max: 1.1,
                }),
                tone_lot: math.mul,
                tone: math.mul,
                lit: math.scale3,
                mortar_lit: math.scale3,
                wall: math.mix3,
                relief: surface.bump.with({
                    strength: v.inverted !== undefined ? -v.relief : v.relief,
                }),
                ...(v.inverted !== undefined
                    ? {
                          rise: map.range.with({
                              in_min: v.inverted[0],
                              in_max: v.inverted[1],
                              out_min: 1,
                              out_max: 0,
                          }),
                      }
                    : {}),
                ...(v.marks !== undefined
                    ? {
                          marks: v.marks.node,
                          ringed: map.range.with({ out_min: 0.35, out_max: 1 }),
                          tone_marks: math.mul,
                          marks_relief: surface.bump.with({ strength: v.marks.relief }),
                      }
                    : {}),
                face_height: math.value.with({ value: v.face.height }),
                face_on: math.mul,
                face_relief: surface.bump,
                grit_relief: surface.bump.with({ strength: v.grit.height }),
                ...mineral(v.roughness),
            },
            links: [
                ...SPACE_LINKS,
                ...turnLinks,
                ...patternLinks('stain', 'face', 'grit'),
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
                          ...bumpLinks(
                              'marks_relief',
                              turned ? 'mark_slope.value' : 'marks.gradient',
                              'relief.value',
                          ),
                      ] as Link[])
                    : ([['tone.value', 'lit.s']] as Link[])),
                ...(v.inverted !== undefined ? ([['bond.height', 'rise.x']] as Link[]) : []),
                ['mortar.value', 'mortar_lit.v'],
                ['gritty.value', 'mortar_lit.s'],
                ['mortar_lit.value', 'wall.a'],
                ['lit.value', 'wall.b'],
                [height, 'wall.t'],
                ...bumpLinks('relief', turned ? 'slope.value' : 'bond.gradient'),
                [height, 'face_on.a'],
                ['face_height.value', 'face_on.b'],
                ...bumpLinks(
                    'face_relief',
                    'face.gradient',
                    marked ? 'marks_relief.value' : 'relief.value',
                ),
                ['face_on.value', 'face_relief.strength'],
                ...bumpLinks('grit_relief', 'grit.gradient', 'face_relief.value'),
                ...mineralLinks('wall.value', 'grit_relief.value'),
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
                ['relief.strength', 'relief'],
                ['face_height.value', 'face_relief'],
                PATTERN_SCALE,
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
 * `material.cobblestone` — pedras roladas assentadas (o pé de moleque): seixos de 14 cm (7 por unidade do padrão), cada
 * um uma calota abaulada com o vale vivo onde dois se encostam (`pattern.dents` lido ao contrário), do seu tom entre o
 * cinza e o pardo, lisos de rio, com terra no fundo dos vales. Parâmetros: os de `piecesOf`.
 */
export const cobblestone = piecesOf('material.cobblestone', {
    bond: pattern.dents.with({ scale: 7, jitter: 0.55, seed: 421 }),
    piece: 'cell',
    inverted: [0.4, 0.62],
    color: [0.3, 0.29, 0.28],
    alt: [0.33, 0.26, 0.19],
    lot: [0.66, 1.25],
    joint: [0.08, 0.065, 0.05],
    stain: { scale: [9, 9], octaves: 3, range: [0.88, 1.1] },
    face: { scale: [60, 60], octaves: 3, height: 0.0007 },
    grit: { scale: 300, height: 0.00025 },
    relief: 0.03,
    roughness: 0.5,
    seed: 421,
});

/**
 * `material.bamboo` — painel de bambu: colmos de 7 cm lado a lado, em pé (`pattern.planks` com os eixos trocados: 14
 * colmos por unidade do padrão), a seção redonda (a aresta arredondada até o meio do colmo), os nós — um anel fino
 * escuro e afundado a cada oito diâmetros, em alturas diferentes de colmo para colmo (um segundo `pattern.planks` de
 * mesmas fileiras) —, a casca dourada lisa com a fibra fina ao longo. Parâmetros: os de `piecesOf`.
 */
export const bamboo = piecesOf('material.bamboo', {
    bond: pattern.planks.with({
        scale: 14,
        length: 64,
        arrangement: 0,
        gap: 0.05,
        bevel: 0.5,
        seed: 431,
    }),
    marks: {
        node: pattern.planks.with({
            scale: 14,
            length: 8,
            arrangement: 0,
            gap: 0.03,
            bevel: 0.07,
            seed: 432,
        }),
        relief: 0.002,
    },
    piece: 'plank',
    turned: true,
    color: [0.56, 0.42, 0.2],
    alt: [0.45, 0.31, 0.14],
    lot: [0.84, 1.14],
    joint: [0.07, 0.05, 0.025],
    stain: { scale: [22, 5], octaves: 3, range: [0.86, 1.12] },
    face: { scale: [130, 3], octaves: 2, height: 0.0005 },
    grit: { scale: 200, height: 0.0001 },
    relief: 0.02,
    roughness: 0.35,
    seed: 431,
});
