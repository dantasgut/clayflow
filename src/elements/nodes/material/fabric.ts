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

// Tecidos (spec 011, R11): o corpo difuso das fibras mais o brilho de fibra (`bsdf.sheen`, a distribuição "Charlie" de
// Estevez e Kulla 2017, "Production Friendly Microfacet Sheen BRDF": rugosidade baixa = pelo ereto e borda viva, o
// veludo; alta = fibra solta e borda suave, o algodão). A trama é calculada por pixel (`pattern.weave` sobre o uv:
// `pattern_scale` repetições por unidade de uv; numa esfera, (2, 1)): os fios de urdidura (`color`) e de trama
// (`weft_color`) cruzados no ligamento de cada tecido, com o relevo dos fios (`relief`, em unidades do padrão), a
// irregularidade de fio para fio e a penugem das fibras (`pattern.grain` fino).

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
        }),
        fluff: pattern.grain.with({ scale: [v.fluff_scale, v.fluff_scale], octaves: 2, seed: 4 }),
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
    ...patternLinks('weave', 'fluff'),
    ['weft.value', 'yarn.a'],
    ['warp.value', 'yarn.b'],
    ['weave.warp', 'yarn.t'],
    ['weave.thread', 'uneven.x'],
    ['weave.height', 'hollow.x'],
    ['fluff.value', 'melange.x'],
    ['uneven.value', 'thread_shade.a'],
    ['hollow.value', 'thread_shade.b'],
    ['thread_shade.value', 'shade.a'],
    ['melange.value', 'shade.b'],
    ['yarn.value', 'lit.v'],
    ['shade.value', 'lit.s'],
    ...bumpLinks('relief', 'weave.gradient'),
    ...bumpLinks('fluff_relief', 'fluff.gradient', 'relief.value'),
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
 * (± 14 %); difuso áspero e brilho de fibra fraco e largo (rugosidade 0,9). Parâmetros: `color`, `weft_color`,
 * `sheen_color`, `sheen_roughness`, `diffuse_roughness`, `relief`, `pattern_scale`.
 */
export const cotton = fabric('material.cotton', {
    color: [0.78, 0.75, 0.68],
    weft_color: [0.72, 0.68, 0.6],
    sheen_color: [0.25, 0.25, 0.25],
    sheen_roughness: 0.9,
    threads: 110,
    bind: [1, 1, 1],
    gap: 0.14,
    irregularity: 0.14,
    hollow: 0.45,
    relief: 0.003,
    fluff: 0.0005,
    fluff_scale: 260,
    melange: 0.05,
});

/**
 * `material.wool` — lã (flanela mesclada): tela de fio grosso (60 por unidade do padrão), mole e irregular (± 22 %),
 * com a urdidura e a trama de tons diferentes, e felpuda — a penugem das fibras (grão de relevo forte, mais alto que o
 * dos fios) quebra o contorno dos fios e mescla o tom (± 40 %); brilho de fibra mais forte que o do algodão e largo
 * (0,8). Parâmetros: os de `cotton`.
 */
export const wool = fabric('material.wool', {
    color: [0.5, 0.4, 0.3],
    weft_color: [0.36, 0.28, 0.2],
    sheen_color: [0.4, 0.34, 0.28],
    sheen_roughness: 0.8,
    threads: 60,
    bind: [1, 1, 1],
    gap: 0,
    irregularity: 0.22,
    hollow: 0.82,
    relief: 0.003,
    fluff: 0.006,
    fluff_scale: 90,
    melange: 0.4,
});

/**
 * `material.denim` — jeans: sarja 3/1 de algodão (120 fios por unidade do padrão) — a urdidura tingida de índigo
 * (`color`) passa três fios por cima da trama crua (`weft_color`) e um por baixo, cada fio deslocado um: a diagonal da
 * sarja, com os pontos claros da trama; fios irregulares (± 25 %); brilho de fibra fraco e largo. Parâmetros: os de
 * `cotton`.
 */
export const denim = fabric('material.denim', {
    color: [0.025, 0.045, 0.13],
    weft_color: [0.32, 0.34, 0.38],
    sheen_color: [0.1, 0.13, 0.2],
    sheen_roughness: 0.85,
    threads: 120,
    bind: [3, 1, 1],
    gap: 0.08,
    irregularity: 0.25,
    hollow: 0.4,
    relief: 0.003,
    fluff: 0.0005,
    fluff_scale: 280,
    melange: 0.12,
});

/**
 * `material.velvet` — veludo: corpo escuro e brilho de fibra forte e estreito (pelo ereto, rugosidade 0,3) — a borda
 * mais clara que o centro. O pelo não fica todo em pé: `pattern.grain` largo (6 manchas por unidade do padrão) inclina
 * a normal do pelo (`nap`, a altura em unidades do padrão) — as manchas claras e escuras do pelo penteado, que mudam
 * com o ângulo da luz —, e um grão fino (`pile`) dá o granulado das pontas. Parâmetros: `color`, `sheen_color`,
 * `sheen_roughness`, `diffuse_roughness`, `nap`, `pile`, `pattern_scale`.
 */
export const velvet = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            combed: pattern.grain.with({ scale: [6, 6], octaves: 2, gain: 0.4, seed: 11 }),
            tips: pattern.grain.with({ scale: [260, 260], octaves: 1, seed: 12 }),
            fibers: bsdf.diffuse.with({ color: [0.16, 0.012, 0.045], roughness: 1 }),
            fuzz: bsdf.sheen.with({ color: [0.8, 0.14, 0.28], roughness: 0.3 }),
            sum: closure.add,
            nap: surface.bump.with({ strength: 0.016 }),
            pile: surface.bump.with({ strength: 0.0007 }),
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
};

/**
 * `material.silk` — seda/cetim: cetim 4/1 (a urdidura flutua quatro fios por cima, 150 fios por unidade do padrão) —
 * o difuso das fibras, um especular de dielétrico anisotrópico (fios lisos e paralelos: IOR 1,56 da fibroína,
 * rugosidade 0,3, anisotropia 0,8 — `research.md` R11) com a tangente na direção do fio à vista (a urdidura ao longo
 * de v, a trama ao longo de u: o brilho corre ao longo do fio) e um brilho de fibra fraco. Parâmetros: `color`,
 * `weft_color`, `roughness`, `anisotropy`, `ior`, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale`.
 */
export const silk = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...weaveNodes(SILK),
            fibers: bsdf.diffuse.with({ roughness: 0.5 }),
            thread_direction: math.mix3,
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
            ['uv.du', 'thread_direction.a'],
            ['uv.dv', 'thread_direction.b'],
            ['weave.warp', 'thread_direction.t'],
            ['thread_direction.value', 'threads.tangent'],
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
