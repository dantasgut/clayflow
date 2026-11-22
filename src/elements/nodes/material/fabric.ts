import { NodeGraph, type GraphNode } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
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
import { relief, WOOL_FLUFF, WOOL_KNIT } from './relief';

// Tecidos (spec 011, R11): o corpo difuso das fibras mais o brilho de fibra (`bsdf.sheen`, a distribuição "Charlie" de
// Estevez e Kulla 2017, "Production Friendly Microfacet Sheen BRDF": rugosidade baixa = pelo ereto e borda viva, o
// veludo; alta = fibra solta e borda suave, o algodão). A trama é calculada por pixel (`pattern.weave` sobre o uv:
// `pattern_scale` repetições por unidade de uv; numa esfera, (2, 1)): os fios de urdidura (`color`) e de trama
// (`weft_color`) cruzados no ligamento de cada tecido, com o relevo dos fios (`relief`, em unidades do padrão), a
// irregularidade de fio para fio e a penugem das fibras (`pattern.grain` fino). Cada fio é um cilindro de fibras
// torcidas (`twist`: a saída `fiber` da trama, levada ao mundo por `surface.direction`): a direção da fibra à vista é a
// tangente do brilho ao longo do fio — o realce da seda quebra em tracinhos de fio em fio e corre pelas dobras do pano.
// A lã é tricô (`pattern.knit`, pontos em V) de fio grosso, com o relevo em milímetros (`relief.wool`).

/** Valores de um tecido de trama à vista. */
interface FabricValues {
    /** Cor dos fios de urdidura e dos de trama. */
    readonly color: readonly [number, number, number];
    readonly weft_color: readonly [number, number, number];
    readonly sheen_color: readonly [number, number, number];
    readonly sheen_roughness: number;
    /** Fios por unidade do padrão e o ligamento (`over`/`under`/`shift` de `pattern.weave`); fração do passo sem fio. */
    readonly threads: number;
    readonly bind: readonly [number, number, number];
    readonly gap: number;
    /** Variação do tom de fio para fio (± a fração) e o tom no fundo da trama (1 = sem sombra). */
    readonly irregularity: number;
    readonly hollow: number;
    /** Altura do relevo dos fios e da penugem, em unidades do padrão; células da penugem por unidade. */
    readonly relief: number;
    readonly fluff: number;
    readonly fluff_scale: number;
    /** Variação do tom de fibra para fibra (± a fração, pelo grão da penugem): a lã mesclada. */
    readonly melange: number;
    /** Ângulo (rad) da hélice das fibras em torno do eixo do fio: a torção. */
    readonly twist: number;
    /** Variação do tom em faixas ao longo da urdidura (± a fração): os fios mais grossos e mais finos, à vista de longe. */
    readonly slub: number;
}

/** Os nós da trama colorida: os dois fios, a variação de fio para fio e a sombra do fundo — a cor em `lit.value`. */
function weaveNodes(v: FabricValues): Record<string, GraphNode> {
    return {
        ...patternSpace(),
        weave: pattern.weave.with({
            scale: v.threads,
            over: v.bind[0],
            under: v.bind[1],
            shift: v.bind[2],
            gap: v.gap,
            twist: v.twist,
        }),
        fiber_direction: surface.direction,
        fluff: pattern.grain.with({ scale: [v.fluff_scale, v.fluff_scale], octaves: 2, seed: 4 }),
        // As faixas ao longo da urdidura: grupos de uns três fios, de uns trinta de comprimento — o que sobra da trama
        // abaixo do pixel.
        slub: pattern.grain.with({ scale: [v.threads / 3, v.threads / 30], octaves: 2, seed: 8 }),
        streak: map.range.with({
            in_min: -0.6,
            in_max: 0.6,
            out_min: 1 - v.slub,
            out_max: 1 + v.slub,
        }),
        streaked: math.mul,
        // Os cabos do fio torcido: os sulcos entre eles escurecem (as faixas em hélice de cada fio, de perto).
        plied: map.range.with({ out_min: 0.74, out_max: 1.06 }),
        twisted: math.mul,
        warp: math.value3.with({ value: [...v.color] }),
        weft: math.value3.with({ value: [...v.weft_color] }),
        yarn: math.mix3,
        uneven: map.range.with({ out_min: 1 - v.irregularity, out_max: 1 + v.irregularity }),
        hollow: map.range.with({ out_min: v.hollow, out_max: 1 }),
        melange: map.range.with({
            in_min: -0.6,
            in_max: 0.6,
            out_min: 1 - v.melange,
            out_max: 1 + v.melange,
        }),
        thread_shade: math.mul,
        shade: math.mul,
        lit: math.scale3,
        relief: surface.bump.with({ strength: v.relief }),
        fluff_relief: surface.bump.with({ strength: v.fluff }),
    };
}

/** As ligações da trama colorida e dos dois relevos (a normal em `fluff_relief.value`). */
const WEAVE_LINKS: readonly Link[] = [
    ...SPACE_LINKS,
    ...patternLinks('weave', 'fluff', 'slub'),
    ['weft.value', 'yarn.a'],
    ['warp.value', 'yarn.b'],
    ['weave.warp', 'yarn.t'],
    ['weave.thread', 'uneven.x'],
    ['weave.height', 'hollow.x'],
    ['fluff.value', 'melange.x'],
    ['uneven.value', 'thread_shade.a'],
    ['hollow.value', 'thread_shade.b'],
    ['slub.value', 'streak.x'],
    ['melange.value', 'streaked.a'],
    ['streak.value', 'streaked.b'],
    ['weave.strand', 'plied.x'],
    ['thread_shade.value', 'twisted.a'],
    ['plied.value', 'twisted.b'],
    ['twisted.value', 'shade.a'],
    ['streaked.value', 'shade.b'],
    ['yarn.value', 'lit.v'],
    ['shade.value', 'lit.s'],
    ...bumpLinks('relief', 'weave.gradient'),
    ...bumpLinks('fluff_relief', 'fluff.gradient', 'relief.value'),
    ['uv.du', 'fiber_direction.du'],
    ['uv.dv', 'fiber_direction.dv'],
    ['weave.fiber', 'fiber_direction.direction'],
];

/** Os parâmetros expostos da trama. */
const WEAVE_EXPOSE = [
    ['warp.value', 'color'],
    ['weft.value', 'weft_color'],
    ['relief.strength', 'relief'],
    PATTERN_SCALE,
] as const;

/** Sub-grafo de um tecido: a trama colorida num `bsdf.diffuse` somado a `bsdf.sheen`, com a normal do relevo. */
function fabric(name: string, v: FabricValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...weaveNodes(v),
                fibers: bsdf.diffuse.with({ roughness: 1 }),
                fuzz: bsdf.sheen.with({ color: [...v.sheen_color], roughness: v.sheen_roughness }),
                sum: closure.add,
                out: closure.normal,
            },
            links: [
                ...WEAVE_LINKS,
                ['lit.value', 'fibers.color'],
                ['fibers.value', 'sum.a'],
                ['fuzz.value', 'sum.b'],
                ['sum.value', 'out.c'],
                ['fluff_relief.value', 'out.normal'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ...WEAVE_EXPOSE,
                ['fuzz.color', 'sheen_color'],
                ['fuzz.roughness', 'sheen_roughness'],
                ['fibers.roughness', 'diffuse_roughness'],
            ],
        },
    );
}

/**
 * `material.cotton` — algodão cru: tela (um fio por cima, um por baixo), 110 fios por unidade do padrão, fios irregulares
 * (± 16 %) e felpudos — a penugem das fibras soltas (grão fino em relevo) borra o contorno dos fios e mescla o tom —;
 * fosco e macio: difuso áspero, sem especular, e brilho de fibra fraco e largo (rugosidade 0,9) na borda. Parâmetros: `color`, `weft_color`,
 * `sheen_color`, `sheen_roughness`, `diffuse_roughness`, `relief`, `pattern_scale`.
 */
export const cotton = fabric('material.cotton', {
    color: [0.78, 0.75, 0.68],
    weft_color: [0.72, 0.68, 0.6],
    sheen_color: [0.25, 0.25, 0.25],
    sheen_roughness: 0.9,
    threads: 110,
    bind: [1, 1, 1],
    gap: 0.1,
    irregularity: 0.16,
    hollow: 0.62,
    relief: 0.0026,
    fluff: 0.0011,
    fluff_scale: 240,
    melange: 0.14,
    twist: 0.4,
    slub: 0.05,
});

const DENIM: FabricValues = {
    color: [0.022, 0.04, 0.125],
    weft_color: [0.26, 0.28, 0.33],
    sheen_color: [0.06, 0.08, 0.14],
    sheen_roughness: 0.85,
    threads: 120,
    bind: [3, 1, 1],
    gap: 0.04,
    irregularity: 0.25,
    hollow: 0.42,
    relief: 0.003,
    fluff: 0.0008,
    fluff_scale: 280,
    melange: 0.16,
    twist: 0.45,
    slub: 0.12,
};

/**
 * `material.denim` — jeans: sarja 3/1 de algodão (120 fios por unidade do padrão) — a urdidura tingida de índigo
 * (`color`) passa três fios por cima da trama crua (`weft_color`) e um por baixo, cada fio deslocado um: a diagonal da
 * sarja, com os pontos claros da trama; fios irregulares (± 25 %); brilho de fibra fraco e largo. O desgaste: o índigo
 * tinge só a casca do fio, e onde o pano dobra e roça (as cristas das dobras: a curvatura principal convexa da
 * superfície, de `wear_low` a `wear_high` por unidade — só nas superfícies com geometria diferencial) a casca gasta e
 * o miolo branco aparece (`wear_color`), em manchas irregulares pelo grão da penugem. Parâmetros: os de `cotton`, mais
 * `wear_color`, `wear_low`, `wear_high`.
 */
export const denim = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...weaveNodes(DENIM),
            curved: surface.curvature,
            crest: map.range.with({ in_min: 5, in_max: 22, out_max: 0.75 }),
            patchy: map.range.with({ in_min: -0.5, in_max: 0.3, out_min: 0.15, out_max: 1 }),
            worn: math.mul,
            core: math.value3.with({ value: [0.3, 0.36, 0.48] }),
            faded: math.mix3,
            fibers: bsdf.diffuse.with({ roughness: 1 }),
            fuzz: bsdf.sheen.with({
                color: [...DENIM.sheen_color],
                roughness: DENIM.sheen_roughness,
            }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...WEAVE_LINKS,
            ['s.curvature', 'curved.curvature'],
            ['curved.k1', 'crest.x'],
            ['fluff.value', 'patchy.x'],
            ['crest.value', 'worn.a'],
            ['patchy.value', 'worn.b'],
            ['lit.value', 'faded.a'],
            ['core.value', 'faded.b'],
            ['worn.value', 'faded.t'],
            ['faded.value', 'fibers.color'],
            ['fibers.value', 'sum.a'],
            ['fuzz.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['fluff_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.denim',
        ...SAMPLE_INPUT,
        expose: [
            ...WEAVE_EXPOSE,
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
            ['fibers.roughness', 'diffuse_roughness'],
            ['core.value', 'wear_color'],
            ['crest.in_min', 'wear_low'],
            ['crest.in_max', 'wear_high'],
        ],
    },
);

/**
 * `material.wool` — lã em tricô (ponto meia de fio cardado grosso): colunas de pontos em V (`pattern.knit`: 30 colunas
 * por unidade do padrão), cada perna um fio redondo de fibras torcidas; a cor varia de ponto para ponto (± 10 %) e de
 * fibra para fibra (a lã mesclada, ± 35 %), e escurece no fundo entre os fios; felpuda — a penugem (grão fino em
 * relevo) borra o contorno dos fios, e o brilho de fibra forte e bem largo (0,9) é o halo difuso da lã, sem realce.
 * O relevo é o de `relief.wool`, em milímetros — o fio (`height`, 1,4 mm) e a penugem —, com `scale` unidades do mundo
 * por metro: na normal e, com `Displacements.wool()` na entidade de uma `ParametricSurface`, na geometria.
 * Parâmetros: `color`, `sheen_color`, `sheen_roughness`, `diffuse_roughness`, `height`, `scale`, `pattern_scale`.
 */
export const wool = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            knit: pattern.knit.with(WOOL_KNIT),
            fluff: pattern.grain.with(WOOL_FLUFF),
            yarn: math.value3.with({ value: [0.24, 0.15, 0.09] }),
            uneven: map.range.with({ out_min: 0.9, out_max: 1.1 }),
            hollow: map.range.with({ in_min: 0, in_max: 0.6, out_min: 0.45, out_max: 1 }),
            melange: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.65, out_max: 1.35 }),
            plied: map.range.with({ out_min: 0.7, out_max: 1.08 }),
            twisted: math.mul,
            stitch_shade: math.mul,
            shade: math.mul,
            lit: math.scale3,
            // A escala do padrão, uma para a cor e para o relevo.
            tile: math.value2.with({ value: [1, 1] }),
            height: relief.wool,
            normal: surface.reliefNormal,
            fibers: bsdf.diffuse.with({ roughness: 1 }),
            fuzz: bsdf.sheen.with({ color: [0.42, 0.34, 0.27], roughness: 0.9 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('knit', 'fluff'),
            ['tile.value', 'uv.scale'],
            ['tile.value', 'height.pattern_scale'],
            ['s.value', 'height.s'],
            ['knit.stitch', 'uneven.x'],
            ['knit.height', 'hollow.x'],
            ['fluff.value', 'melange.x'],
            ['knit.strand', 'plied.x'],
            ['uneven.value', 'twisted.a'],
            ['plied.value', 'twisted.b'],
            ['twisted.value', 'stitch_shade.a'],
            ['hollow.value', 'stitch_shade.b'],
            ['stitch_shade.value', 'shade.a'],
            ['melange.value', 'shade.b'],
            ['yarn.value', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['lit.value', 'fibers.color'],
            ['height.value', 'normal.relief'],
            ['fibers.value', 'sum.a'],
            ['fuzz.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.wool',
        ...SAMPLE_INPUT,
        expose: [
            ['yarn.value', 'color'],
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
            ['fibers.roughness', 'diffuse_roughness'],
            ['height.height', 'height'],
            ['normal.scale', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.velvet` — veludo: o corpo é só o difuso escuro das fibras vistas de cima (sem especular: nenhum realce
 * nítido) e o que brilha é o pelo em pé visto de lado — o brilho de fibra (`bsdf.sheen`, rugosidade 0,55: um halo
 * claro e macio na borda rasante, o centro escuro e fosco). O pelo não fica todo em pé: `pattern.grain` largo e suave
 * (3 manchas por unidade do padrão, uma oitava) inclina de leve a direção do pelo (`nap`, a altura em unidades do
 * padrão) — regiões largas em que o halo se desloca e o tom clareia ou escurece um pouco, sem manchas duras —, e um
 * grão fino (`pile`) dá o granulado das pontas. Parâmetros: `color`, `sheen_color`, `sheen_roughness`,
 * `diffuse_roughness`, `nap`, `pile`, `pattern_scale`.
 */
export const velvet = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            combed: pattern.grain.with({ scale: [3, 3], octaves: 1, seed: 11 }),
            tips: pattern.grain.with({ scale: [300, 300], octaves: 1, seed: 12 }),
            fibers: bsdf.diffuse.with({ color: [0.085, 0.006, 0.022], roughness: 1 }),
            fuzz: bsdf.sheen.with({ color: [0.6, 0.07, 0.17], roughness: 0.45 }),
            sum: closure.add,
            nap: surface.bump.with({ strength: 0.022 }),
            pile: surface.bump.with({ strength: 0.0003 }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('combed', 'tips'),
            ...bumpLinks('nap', 'combed.gradient'),
            ...bumpLinks('pile', 'tips.gradient', 'nap.value'),
            ['fibers.value', 'sum.a'],
            ['fuzz.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['pile.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.velvet',
        ...SAMPLE_INPUT,
        expose: [
            ['fibers.color', 'color'],
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
            ['fibers.roughness', 'diffuse_roughness'],
            ['nap.strength', 'nap'],
            ['pile.strength', 'pile'],
            PATTERN_SCALE,
        ],
    },
);

const SILK: FabricValues = {
    color: [0.75, 0.7, 0.55],
    weft_color: [0.7, 0.64, 0.5],
    sheen_color: [0.2, 0.2, 0.2],
    sheen_roughness: 0.5,
    threads: 150,
    bind: [4, 1, 2],
    gap: 0.02,
    irregularity: 0.1,
    hollow: 0.75,
    relief: 0.0012,
    fluff: 0,
    fluff_scale: 300,
    melange: 0,
    twist: 0.2,
    slub: 0.03,
};

/**
 * `material.silk` — seda/cetim: cetim 4/1 (a urdidura flutua quatro fios por cima, 150 fios por unidade do padrão) —
 * o difuso das fibras, um especular de dielétrico anisotrópico (filamentos lisos e paralelos: IOR 1,56 da fibroína,
 * rugosidade 0,3, anisotropia 0,8 — `research.md` R11) com a tangente na direção da fibra do fio à vista (a saída
 * `fiber` da trama: o eixo do fio — a urdidura ao longo de v, a trama ao longo de u — com a torção de 0,2 rad: o brilho
 * corre ao longo do fio, em tracinhos de flutuação em flutuação, e pelas dobras do pano) e um brilho de fibra fraco. Parâmetros: `color`,
 * `weft_color`, `roughness`, `anisotropy`, `ior`, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale`.
 */
export const silk = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...weaveNodes(SILK),
            fibers: bsdf.diffuse.with({ roughness: 0.5 }),
            threads: bsdf.dielectric.with({ ior: 1.56, roughness: 0.3, anisotropy: 0.8 }),
            fuzz: bsdf.sheen.with({
                color: [...SILK.sheen_color],
                roughness: SILK.sheen_roughness,
            }),
            body: closure.add,
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...WEAVE_LINKS,
            ['lit.value', 'fibers.color'],
            ['fiber_direction.value', 'threads.tangent'],
            ['threads.value', 'body.a'],
            ['fibers.value', 'body.b'],
            ['body.value', 'sum.a'],
            ['fuzz.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['fluff_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.silk',
        ...SAMPLE_INPUT,
        expose: [
            ...WEAVE_EXPOSE,
            ['threads.roughness', 'roughness'],
            ['threads.anisotropy', 'anisotropy'],
            ['threads.ior', 'ior'],
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
        ],
    },
);

const SHEER: FabricValues = {
    color: [0.85, 0.82, 0.75],
    weft_color: [0.85, 0.82, 0.75],
    sheen_color: [0.25, 0.25, 0.25],
    sheen_roughness: 0.8,
    threads: 60,
    bind: [1, 1, 1],
    gap: 0.5,
    irregularity: 0.12,
    hollow: 0.6,
    relief: 0.003,
    fluff: 0,
    fluff_scale: 300,
    melange: 0,
    twist: 0.3,
    slub: 0.08,
};

/**
 * `material.sheerFabric` — tecido fino (voile, cortina): tela aberta (60 fios por unidade do padrão, metade do passo
 * sem fio) de parede fina — a luz de trás passa espalhada (`bsdf.translucent`) misturada ao difuso das fibras: pelos
 * fios, `translucency` (0,5); pelos vãos da trama, inteira. A cor vale para os dois; um brilho de fibra fraco.
 * Parâmetros: `color`, `weft_color`, `translucency`, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale`.
 */
export const sheerFabric = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...weaveNodes(SHEER),
            fibers: bsdf.diffuse.with({ roughness: 1 }),
            through: bsdf.translucent,
            open: map.range.with({ out_min: 0.5, out_max: 1 }),
            cloth: closure.mix,
            fuzz: bsdf.sheen.with({
                color: [...SHEER.sheen_color],
                roughness: SHEER.sheen_roughness,
            }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...WEAVE_LINKS,
            ['lit.value', 'fibers.color'],
            ['lit.value', 'through.color'],
            ['weave.gap', 'open.x'],
            ['fibers.value', 'cloth.a'],
            ['through.value', 'cloth.b'],
            ['open.value', 'cloth.t'],
            ['cloth.value', 'sum.a'],
            ['fuzz.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['fluff_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.sheerFabric',
        ...SAMPLE_INPUT,
        expose: [
            ...WEAVE_EXPOSE,
            ['open.out_min', 'translucency'],
            ['fuzz.color', 'sheen_color'],
            ['fuzz.roughness', 'sheen_roughness'],
        ],
    },
);
