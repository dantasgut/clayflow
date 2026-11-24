import { NodeGraph } from '../../../scene/graph/NodeGraph';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { input } from '../input';
import { map } from '../map';
import { math } from '../math';
import { pattern } from '../pattern';
import { surface } from '../surface';
import {
    PATTERN_SCALE,
    patternLinks,
    veinLinks,
    patternSpace,
    SAMPLE_INPUT,
    SPACE_LINKS,
    type Link,
} from './pattern';

// Relevos dos materiais prontos (spec 011, R17): a altura de cada material como função da amostra de superfície — o
// relevo (altura em milímetros e as derivadas no uv, de `surface.relief`), somado dos padrões que o material já usa na
// cor. Uma função para os dois consumidores: o material inclina a normal com ela (`surface.reliefNormal`) e a
// `DisplacementFunction` da entidade move os vértices com ela (`surface.displacement`; `Displacements.<nome>()`). No
// material a largura do filtro é a do pixel; na geometria, a do passo da malha: o que a malha não resolve fica só na
// normal.

/** As ligações de um padrão `id` (saídas `value`/`gradient`) ao relevo `to` (`surface.relief`). */
function reliefLinks(to: string, value: string, gradient: string): Link[] {
    return [
        [value, `${to}.value`],
        [gradient, `${to}.gradient`],
        ['uv.wrap', `${to}.wrap`],
    ];
}

/** O deslocamento do padrão da madeira no uv: a medula a 0,42 (os arcos dos anéis no meio da peça). */
export const WOOD_OFFSET = [0, -0.42] as const;

/**
 * Os anéis de crescimento da madeira da biblioteca (`pattern.rings`): 64 por unidade do padrão, largura irregular, com
 * um nó de vez em quando.
 */
export const WOOD_RINGS = {
    scale: 64,
    depth: 0.1,
    distortion: 0.12,
    distortion_scale: [1.2, 2],
    irregularity: 1,
    waviness: 0.012,
    waviness_scale: [2.5, 6],
    knots: 1.4,
    knot_size: 0.03,
    knot_rings: 5,
};

/** A fibra da madeira (`pattern.grain` alongado ao longo do veio). */
export const WOOD_FIBER = { scale: [3, 150], octaves: 2, seed: 3 };

/** A face irregular da madeira bruta (a erosão, as marcas da serra): um grão largo. */
export const WOOD_WEAR = { scale: [5, 18], octaves: 3, seed: 31 };

/** O grão alongado cujas cristas são as frestas da madeira seca (lentes de alguns centímetros ao longo da fibra). */
const WOOD_SPLIT = { scale: [2.6, 40], octaves: 4, gain: 0.55, seed: 23 };

/** Os sulcos da fibra gasta: um grão alongado de três oitavas (fundos e largos numas faixas, rasos noutras). */
const WOOD_FURROW = { scale: [2.4, 84], octaves: 3, gain: 0.6, seed: 27 };

/**
 * `relief.woodRough` — o relevo da madeira bruta e envelhecida (tábua serrada exposta ao tempo): o lenho inicial, mole,
 * gasta, e o tardio fica saliente (`ring_height`, 0,3 mm entre o fundo e a crista do anel); a face é irregular (a
 * erosão e as marcas da serra: um grão largo, `wear_height`, 1,2 mm); a fibra levantada risca a face ao longo do veio
 * (`fiber_height`, 0,5 mm) e os sulcos da fibra gasta, de fundura variada, correm por ela (2,4 mm); frestas em forma de lente abrem ao longo da fibra onde a peça secou (`crack_depth`, 3 mm:
 * as faixas onde um grão alongado passa de um nível), com riscos mais finos e curtos entre elas (1,2 mm); os poros
 * abertos picam a face (0,2 mm).
 * Parâmetros: `ring_height`, `wear_height`, `fiber_height`, `crack_depth`, `pattern_scale`.
 */
const woodRough = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(WOOD_OFFSET),
            rings: pattern.rings.with(WOOD_RINGS),
            fiber: pattern.grain.with(WOOD_FIBER),
            wear: pattern.grain.with(WOOD_WEAR),
            split: pattern.grain.with(WOOD_SPLIT),
            crack: pattern.threshold.with({ low: 0.34, high: 0.22 }),
            furrow: pattern.grain.with(WOOD_FURROW),
            hairline: pattern.grain.with({ scale: [5, 150], octaves: 3, gain: 0.5, seed: 29 }),
            hair: pattern.threshold.with({ low: 0.4, high: 0.28 }),
            pore: pattern.grain.with({ scale: [10, 240], octaves: 1, seed: 7 }),
            pit: pattern.threshold.with({ low: 0.5, high: 0.25 }),
            ring_relief: surface.relief.with({ height: 0.3, level: 0.59 }),
            wear_relief: surface.relief.with({ height: 1.2 }),
            fiber_relief: surface.relief.with({ height: 0.5 }),
            furrow_relief: surface.relief.with({ height: 2.4 }),
            crack_relief: surface.relief.with({ height: 3, level: 1 }),
            hair_relief: surface.relief.with({ height: 1.2, level: 1 }),
            pore_relief: surface.relief.with({ height: 0.2, level: 1 }),
            sum_a: math.add3,
            sum_b: math.add3,
            sum_c: math.add3,
            sum_d: math.add3,
            sum_e: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('rings', 'fiber', 'wear', 'split', 'hairline', 'pore', 'furrow'),
            ...reliefLinks('furrow_relief', 'furrow.value', 'furrow.gradient'),
            ['hairline.value', 'hair.value'],
            ['hairline.gradient', 'hair.gradient'],
            ...reliefLinks('hair_relief', 'hair.value', 'hair.gradient'),
            ['split.value', 'crack.value'],
            ['split.gradient', 'crack.gradient'],
            ['pore.value', 'pit.value'],
            ['pore.gradient', 'pit.gradient'],
            ...reliefLinks('ring_relief', 'rings.value', 'rings.gradient'),
            ...reliefLinks('wear_relief', 'wear.value', 'wear.gradient'),
            ...reliefLinks('fiber_relief', 'fiber.value', 'fiber.gradient'),
            ...reliefLinks('crack_relief', 'crack.value', 'crack.gradient'),
            ...reliefLinks('pore_relief', 'pit.value', 'pit.gradient'),
            ['ring_relief.value', 'sum_a.a'],
            ['fiber_relief.value', 'sum_a.b'],
            ['crack_relief.value', 'sum_b.a'],
            ['pore_relief.value', 'sum_b.b'],
            ['sum_a.value', 'sum_c.a'],
            ['wear_relief.value', 'sum_c.b'],
            ['sum_b.value', 'sum_d.a'],
            ['hair_relief.value', 'sum_d.b'],
            ['sum_c.value', 'sum_e.a'],
            ['furrow_relief.value', 'sum_e.b'],
            ['sum_e.value', 'out.a'],
            ['sum_d.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.woodRough',
        ...SAMPLE_INPUT,
        expose: [
            ['ring_relief.height', 'ring_height'],
            ['wear_relief.height', 'wear_height'],
            ['fiber_relief.height', 'fiber_height'],
            ['crack_relief.height', 'crack_depth'],
            PATTERN_SCALE,
        ],
    },
);

/** O grão do couro da biblioteca (`pattern.cells`): 64 células por unidade do padrão, com sulcos entre elas. */
export const LEATHER_GRAIN = { scale: 64, jitter: 0.9, crease: 0.5 };

/** As rugas largas do couro (`pattern.grain`). */
export const LEATHER_WRINKLE = { scale: [9, 9], octaves: 3, seed: 5 };

/**
 * `relief.leather` — o relevo do couro: os sulcos entre as células do grão (`height`, 0,35 mm abaixo dos platôs) e as
 * rugas largas que ondulam a pele (`wrinkle_height`, 0,5 mm). Parâmetros: `height`, `wrinkle_height`, `pattern_scale`.
 */
const leather = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            grain: pattern.cells.with(LEATHER_GRAIN),
            wrinkle: pattern.grain.with(LEATHER_WRINKLE),
            grain_relief: surface.relief.with({ height: 0.35, level: 1 }),
            wrinkle_relief: surface.relief.with({ height: 0.5 }),
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('grain', 'wrinkle'),
            ...reliefLinks('grain_relief', 'grain.height', 'grain.gradient'),
            ...reliefLinks('wrinkle_relief', 'wrinkle.value', 'wrinkle.gradient'),
            ['grain_relief.value', 'out.a'],
            ['wrinkle_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.leather',
        ...SAMPLE_INPUT,
        expose: [
            ['grain_relief.height', 'height'],
            ['wrinkle_relief.height', 'wrinkle_height'],
            PATTERN_SCALE,
        ],
    },
);

/** O tricô da lã da biblioteca (`pattern.knit`): 30 colunas de pontos por unidade do padrão, fio cheio e torcido. */
export const WOOL_KNIT = { scale: 30, aspect: 1.35, thickness: 1, twist: 0.5 };

/** A penugem da lã (`pattern.grain` fino). */
export const WOOL_FLUFF = { scale: [150, 150], octaves: 2, seed: 4 };

/**
 * `relief.wool` — o relevo da lã em tricô: o fio das pernas dos pontos (`height`, 1,4 mm do fundo da malha ao alto do
 * fio) e a penugem das fibras soltas (`fluff_height`, 0,25 mm), que borra o contorno do fio. Parâmetros: `height`,
 * `fluff_height`, `pattern_scale`.
 */
const wool = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            knit: pattern.knit.with(WOOL_KNIT),
            fluff: pattern.grain.with(WOOL_FLUFF),
            yarn_relief: surface.relief.with({ height: 1.4, level: 0.35 }),
            fluff_relief: surface.relief.with({ height: 0.25 }),
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('knit', 'fluff'),
            ...reliefLinks('yarn_relief', 'knit.height', 'knit.gradient'),
            ...reliefLinks('fluff_relief', 'fluff.value', 'fluff.gradient'),
            ['yarn_relief.value', 'out.a'],
            ['fluff_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.wool',
        ...SAMPLE_INPUT,
        expose: [
            ['yarn_relief.height', 'height'],
            ['fluff_relief.height', 'fluff_height'],
            PATTERN_SCALE,
        ],
    },
);

/** As camadas do arenito (`pattern.grain` esticado ao longo de u: os estratos). */
export const SANDSTONE_STRATA = { scale: [0.3, 15], octaves: 3, gain: 0.5, seed: 71 };

/** Os alvéolos da erosão do arenito (um grão largo). */
export const SANDSTONE_WEATHER = { scale: [7, 7], octaves: 3, seed: 72 };

/** Os grãos de areia do arenito (`pattern.cells`). */
export const SANDSTONE_GRAIN = { scale: 120, jitter: 1, crease: 0.5, seed: 73 };

/**
 * `relief.sandstone` — o relevo do arenito bruto: os estratos mais moles recuam (`layer_height`, 4 mm entre o fundo e
 * a crista de uma camada), a erosão cava alvéolos largos (`weather_height`, 3 mm) e os grãos de areia picam a face
 * (`grain_height`, 0,3 mm). Parâmetros: `layer_height`, `weather_height`, `grain_height`, `pattern_scale`.
 */
const sandstone = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            strata: pattern.grain.with(SANDSTONE_STRATA),
            weather: pattern.grain.with(SANDSTONE_WEATHER),
            grain: pattern.cells.with(SANDSTONE_GRAIN),
            strata_relief: surface.relief.with({ height: 4 }),
            weather_relief: surface.relief.with({ height: 3 }),
            grain_relief: surface.relief.with({ height: 0.3, level: 1 }),
            sum: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('strata', 'weather', 'grain'),
            ...reliefLinks('strata_relief', 'strata.value', 'strata.gradient'),
            ...reliefLinks('weather_relief', 'weather.value', 'weather.gradient'),
            ...reliefLinks('grain_relief', 'grain.height', 'grain.gradient'),
            ['strata_relief.value', 'sum.a'],
            ['weather_relief.value', 'sum.b'],
            ['sum.value', 'out.a'],
            ['grain_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.sandstone',
        ...SAMPLE_INPUT,
        expose: [
            ['strata_relief.height', 'layer_height'],
            ['weather_relief.height', 'weather_height'],
            ['grain_relief.height', 'grain_height'],
            PATTERN_SCALE,
        ],
    },
);

/** A parede de tijolos da biblioteca (`pattern.bricks`): 4 tijolos e 12 fiadas por unidade do padrão, junta de 13 %. */
export const BRICK_BOND = { scale: [4, 12], shift: 0.5, gap: 0.13, bevel: 0.07, seed: 81 };

/** A face áspera do tijolo (um grão de três oitavas). */
export const BRICK_FACE = { scale: [60, 60], octaves: 3, gain: 0.6, seed: 82 };

/** A areia da argamassa (um grão fino). */
export const BRICK_SAND = { scale: [220, 220], octaves: 2, seed: 83 };

/**
 * `relief.brick` — o relevo da parede de tijolos: a junta de argamassa recuada (`joint_depth`, 5 mm abaixo da face,
 * com a aresta do tijolo arredondada), a face áspera do tijolo (`face_height`, 0,9 mm) e a areia da argamassa e do
 * barro (0,25 mm). Parâmetros: `joint_depth`, `face_height`, `pattern_scale`.
 */
const brick = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            bond: pattern.bricks.with(BRICK_BOND),
            face: pattern.grain.with(BRICK_FACE),
            sand: pattern.grain.with(BRICK_SAND),
            joint_relief: surface.relief.with({ height: 5, level: 1 }),
            face_relief: surface.relief.with({ height: 0.9 }),
            sand_relief: surface.relief.with({ height: 0.25 }),
            sum: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('bond', 'face', 'sand'),
            ...reliefLinks('joint_relief', 'bond.height', 'bond.gradient'),
            ...reliefLinks('face_relief', 'face.value', 'face.gradient'),
            ...reliefLinks('sand_relief', 'sand.value', 'sand.gradient'),
            ['joint_relief.value', 'sum.a'],
            ['face_relief.value', 'sum.b'],
            ['sum.value', 'out.a'],
            ['sand_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.brick',
        ...SAMPLE_INPUT,
        expose: [
            ['joint_relief.height', 'joint_depth'],
            ['face_relief.height', 'face_height'],
            PATTERN_SCALE,
        ],
    },
);

/** Os padrões de uma casca fissurada, partilhados pelo relevo e pela cor do material. */
export interface BarkPatterns {
    /** As placas compridas ao longo do tronco e as fissuras fundas entre elas (`pattern.fissures`). */
    readonly plates: { scale: number[]; jitter: number; crease: number; seed: number };
    /** As quebras em volta do tronco, que cortam as placas em blocos (`pattern.fissures` deitado). */
    readonly breaks: { scale: number[]; jitter: number; crease: number; seed: number };
    /** As fissuras menores dentro das placas. */
    readonly checks: { scale: number[]; jitter: number; crease: number; seed: number };
    /** As escamas da face das placas (`pattern.cells`: o sulco entre duas é a borda da lasca). */
    readonly scales: { scale: number; jitter: number; crease: number; seed: number };
    /** As cristas ásperas da face (um grão alongado ao longo do tronco). */
    readonly flakes: { scale: number[]; octaves: number; gain: number; seed: number };
}

/**
 * As alturas (mm) do relevo de uma casca: fissuras, quebras, fissuras menores, escamas (a mais alta), cristas, grão
 * fino e o abaulado das placas.
 */
interface BarkHeights {
    readonly furrow: number;
    readonly breaks: number;
    readonly checks: number;
    readonly scales: number;
    readonly flakes: number;
    readonly fine: number;
    readonly swell: number;
}

/**
 * A casca do carvalho: 10 placas por unidade do padrão em volta do tronco e 4,5 ao longo dele (a parede da fissura
 * ocupa um quarto da placa), quebradas em blocos, com escamas miúdas.
 */
export const BARK_OAK: BarkPatterns = {
    plates: { scale: [10, 4.5], jitter: 1, crease: 0.26, seed: 91 },
    breaks: { scale: [4, 11], jitter: 1, crease: 0.08, seed: 90 },
    checks: { scale: [30, 8], jitter: 1, crease: 0.25, seed: 95 },
    scales: { scale: 54, jitter: 1, crease: 0.4, seed: 89 },
    flakes: { scale: [50, 8], octaves: 3, gain: 0.6, seed: 92 },
};

/**
 * A casca do pinheiro: placas largas (7 por unidade do padrão em volta do tronco, 2,6 ao longo), chatas, de fissura
 * estreita, cobertas de escamas grandes e finas em camadas (22 por unidade), com a borda de cada uma em degrau.
 */
export const BARK_PINE: BarkPatterns = {
    plates: { scale: [7, 2.6], jitter: 1, crease: 0.1, seed: 111 },
    breaks: { scale: [2.5, 6], jitter: 1, crease: 0.06, seed: 112 },
    checks: { scale: [16, 9], jitter: 1, crease: 0.12, seed: 113 },
    scales: { scale: 22, jitter: 1, crease: 0.12, seed: 114 },
    flakes: { scale: [20, 9], octaves: 3, gain: 0.6, seed: 115 },
};

/** O relevo de uma casca fissurada: a soma dos padrões dela, cada um com a sua altura em milímetros. */
function barkRelief(name: string, v: BarkPatterns, h: BarkHeights) {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                plates: pattern.fissures.with(v.plates),
                breaks: pattern.fissures.with(v.breaks),
                checks: pattern.fissures.with(v.checks),
                scales: pattern.cells.with(v.scales),
                flakes: pattern.grain.with(v.flakes),
                fine: pattern.grain.with({
                    scale: [150, 150],
                    octaves: 2,
                    seed: v.plates.seed + 7,
                }),
                swell: pattern.grain.with({ scale: [5, 3], octaves: 2, seed: v.plates.seed + 2 }),
                plate_relief: surface.relief.with({ height: h.furrow, level: 1 }),
                break_relief: surface.relief.with({ height: h.breaks, level: 1 }),
                check_relief: surface.relief.with({ height: h.checks, level: 1 }),
                // Cada escama é um platô no seu nível (de 0,3 a 1 da altura), com o sulco entre duas no nível zero:
                // a face das placas em degraus, com sombra própria entre as escamas.
                scale_top: math.value.with({ value: h.scales }),
                scale_level: map.range.with({ out_min: 0.3, out_max: 1 }),
                scale_lift: math.mul,
                scale_relief: surface.relief,
                flake_relief: surface.relief.with({ height: h.flakes }),
                fine_relief: surface.relief.with({ height: h.fine }),
                swell_relief: surface.relief.with({ height: h.swell }),
                sum_a: math.add3,
                sum_b: math.add3,
                sum_c: math.add3,
                sum_d: math.add3,
                sum_e: math.add3,
                out: math.add3,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('plates', 'breaks', 'checks', 'scales', 'flakes', 'fine', 'swell'),
                ...reliefLinks('plate_relief', 'plates.height', 'plates.gradient'),
                ...reliefLinks('break_relief', 'breaks.height', 'breaks.gradient'),
                ...reliefLinks('check_relief', 'checks.height', 'checks.gradient'),
                ['scales.cell', 'scale_level.x'],
                ['scale_level.value', 'scale_lift.a'],
                ['scale_top.value', 'scale_lift.b'],
                ['scale_lift.value', 'scale_relief.height'],
                ...reliefLinks('scale_relief', 'scales.height', 'scales.gradient'),
                ...reliefLinks('flake_relief', 'flakes.value', 'flakes.gradient'),
                ...reliefLinks('fine_relief', 'fine.value', 'fine.gradient'),
                ...reliefLinks('swell_relief', 'swell.value', 'swell.gradient'),
                ['plate_relief.value', 'sum_a.a'],
                ['break_relief.value', 'sum_a.b'],
                ['check_relief.value', 'sum_b.a'],
                ['scale_relief.value', 'sum_b.b'],
                ['flake_relief.value', 'sum_c.a'],
                ['fine_relief.value', 'sum_c.b'],
                ['sum_a.value', 'sum_d.a'],
                ['sum_b.value', 'sum_d.b'],
                ['sum_c.value', 'sum_e.a'],
                ['swell_relief.value', 'sum_e.b'],
                ['sum_d.value', 'out.a'],
                ['sum_e.value', 'out.b'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['plate_relief.height', 'furrow_depth'],
                ['flake_relief.height', 'ridge_height'],
                ['scale_top.value', 'scale_height'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `relief.bark` — o relevo da casca grossa do carvalho, em várias escalas: placas compridas ao longo de v (o eixo do
 * tronco) separadas por fissuras fundas que se ramificam e se juntam (`pattern.fissures`; `furrow_depth`, 16 mm, de
 * parede inclinada) e cortadas em blocos por quebras em volta do tronco (6 mm); dentro das placas, fissuras menores
 * (3,5 mm); a face das placas em degraus — cada escama é um platô no seu nível (`scale_height`, de 0,8 a 2,8 mm
 * acima do sulco entre duas) —, as cristas ásperas ao longo do tronco (`ridge_height`, 3,4 mm), o grão fino (0,6 mm)
 * e as placas abauladas (3 mm). Parâmetros: `furrow_depth`, `ridge_height`, `scale_height`, `pattern_scale`.
 */
const bark = barkRelief('relief.bark', BARK_OAK, {
    furrow: 16,
    breaks: 6,
    checks: 3.5,
    scales: 2.8,
    flakes: 3.4,
    fine: 0.6,
    swell: 3,
});

/**
 * `relief.barkPine` — o relevo da casca do pinheiro: placas largas separadas por fissuras estreitas e fundas
 * (`furrow_depth`, 12 mm) e por quebras em volta do tronco (5 mm), cobertas de escamas grandes em camadas — cada
 * escama é um platô no seu nível, com a borda em degrau (`scale_height`, de 1 a 3,4 mm) —, com as fissuras menores
 * (2 mm), as cristas (`ridge_height`, 1,2 mm) e o grão fino (0,5 mm).
 * Parâmetros: os de `relief.bark`.
 */
const barkPine = barkRelief('relief.barkPine', BARK_PINE, {
    furrow: 12,
    breaks: 5,
    checks: 2,
    scales: 3.4,
    flakes: 1.2,
    fine: 0.5,
    swell: 3,
});

/** As telhas de barro de capa e canal (`pattern.shingles`): 14 colunas por 9 fiadas, o pé para `p.y` maior. */
export const ROOF_TILES = {
    scale: [14, -9],
    shift: 0,
    gap: 0,
    bevel: 0.08,
    profile: 0.5,
    irregularity: 0.1,
    seed: 121,
};

/** As placas de ardósia (`pattern.shingles`): 9 por 12 fiadas, com as juntas desencontradas. */
export const ROOF_SLATES = {
    scale: [9, -12],
    shift: 0.5,
    gap: 0.05,
    bevel: 0.05,
    profile: 0,
    irregularity: 0.14,
    seed: 131,
};

/** A face áspera do barro cozido. */
export const ROOF_CLAY = { scale: [90, 90], octaves: 3, gain: 0.6, seed: 122 };

/** A clivagem da ardósia: lascas finas ao longo da placa (um grão alongado no sentido da queda). */
export const ROOF_CLEAVAGE = { scale: [26, 5], octaves: 4, gain: 0.55, seed: 132 };

/** O relevo de um telhado: as fiadas sobrepostas (`lift`, mm entre o fundo e o topo) e a face (`face`, mm). */
function roofRelief(
    name: string,
    courses: typeof ROOF_TILES,
    face: typeof ROOF_CLAY,
    lift: number,
    faceHeight: number,
) {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                courses: pattern.shingles.with(courses),
                face: pattern.grain.with(face),
                course_relief: surface.relief.with({ height: lift }),
                face_relief: surface.relief.with({ height: faceHeight }),
                out: math.add3,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('courses', 'face'),
                ...reliefLinks('course_relief', 'courses.height', 'courses.gradient'),
                ...reliefLinks('face_relief', 'face.value', 'face.gradient'),
                ['course_relief.value', 'out.a'],
                ['face_relief.value', 'out.b'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['course_relief.height', 'lift'],
                ['face_relief.height', 'face_height'],
                ['courses.scale', 'tiles'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `relief.roofTile` — o relevo do telhado de telha de barro de capa e canal: as fiadas sobrepostas
 * (`pattern.shingles`, com o perfil da capa convexa e do canal côncavo; `lift`, 18 mm do fundo do canal da telha de baixo ao topo da
 * capa no pé da telha: metade do degrau da fiada, metade do perfil) e a face áspera do barro (`face_height`, 0,7 mm). `tiles`: colunas e fiadas por unidade do
 * padrão (negativo em y: o pé para o lado de v maior). Parâmetros: `lift`, `face_height`, `tiles`, `pattern_scale`.
 */
const roofTile = roofRelief('relief.roofTile', ROOF_TILES, ROOF_CLAY, 18, 0.7);

/**
 * `relief.roofSlate` — o relevo do telhado de ardósia: placas planas em fiadas desencontradas, cada uma deitada sobre
 * a de baixo (`lift`, 9 mm: duas espessuras de placa), com o pé de cada placa recuado ao acaso e o vão entre duas, e a
 * clivagem da pedra na face (`face_height`, 0,9 mm). Parâmetros: `lift`, `face_height`, `tiles`, `pattern_scale`.
 */
const roofSlate = roofRelief('relief.roofSlate', ROOF_SLATES, ROOF_CLEAVAGE, 9, 0.9);

/** As tiras da bétula que descascam (`pattern.grain` alongado em volta do tronco): acima do nível, a tira solta. */
export const BIRCH_PEEL = { scale: [1.3, 9], octaves: 4, gain: 0.55, seed: 96 };

/** Os níveis do grão entre os quais a casca passa de lisa a tira levantada (uma borda viva). */
export const BIRCH_EDGE = { low: 0.2, high: 0.26 };

/** As lenticelas da bétula (`pattern.grain` muito alongado em volta do tronco: traços curtos e escuros). */
export const BIRCH_LENTICELS = { scale: [7, 64], octaves: 2, gain: 0.5, seed: 97 };

/** Os níveis do grão entre os quais a casca vira lenticela. */
export const BIRCH_DASH = { low: 0.34, high: 0.46 };

/** Os níveis do grão em que a tira solta volta a assentar, da borda para dentro (a borda fica enrolada, levantada). */
export const BIRCH_SETTLE = { low: 0.27, high: 0.36 };

/**
 * `relief.barkBirch` — o relevo da casca de bétula: lisa, com as tiras de casca fina que descascam em volta do tronco
 * — a borda de cada tira enrolada, levantada da superfície (`peel_height`, 4 mm), e o resto da tira solto, a um quarto
 * disso —, as lenticelas salientes (`lenticel_height`, 1,2 mm) e a ondulação do tronco (`swell_height`, 2 mm).
 * Parâmetros: `peel_height`, `lenticel_height`, `swell_height`, `pattern_scale`.
 */
const barkBirch = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            peel: pattern.grain.with(BIRCH_PEEL),
            strip: pattern.threshold.with(BIRCH_EDGE),
            settle: pattern.threshold.with(BIRCH_SETTLE),
            mark: pattern.grain.with(BIRCH_LENTICELS),
            dash: pattern.threshold.with(BIRCH_DASH),
            swell: pattern.grain.with({ scale: [3, 5], octaves: 3, seed: 98 }),
            // A borda sobe a altura toda na beira da tira e desce três quartos dela para dentro.
            curl: math.value.with({ value: 4 }),
            back: math.mul,
            down: math.value.with({ value: -0.75 }),
            peel_relief: surface.relief,
            settle_relief: surface.relief,
            dash_relief: surface.relief.with({ height: 1.2 }),
            swell_relief: surface.relief.with({ height: 2 }),
            sum_a: math.add3,
            sum_b: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('peel', 'mark', 'swell'),
            ['peel.value', 'strip.value'],
            ['peel.gradient', 'strip.gradient'],
            ['peel.value', 'settle.value'],
            ['peel.gradient', 'settle.gradient'],
            ['mark.value', 'dash.value'],
            ['mark.gradient', 'dash.gradient'],
            ['curl.value', 'back.a'],
            ['down.value', 'back.b'],
            ['curl.value', 'peel_relief.height'],
            ['back.value', 'settle_relief.height'],
            ...reliefLinks('peel_relief', 'strip.value', 'strip.gradient'),
            ...reliefLinks('settle_relief', 'settle.value', 'settle.gradient'),
            ...reliefLinks('dash_relief', 'dash.value', 'dash.gradient'),
            ...reliefLinks('swell_relief', 'swell.value', 'swell.gradient'),
            ['peel_relief.value', 'sum_a.a'],
            ['settle_relief.value', 'sum_a.b'],
            ['dash_relief.value', 'sum_b.a'],
            ['swell_relief.value', 'sum_b.b'],
            ['sum_a.value', 'out.a'],
            ['sum_b.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.barkBirch',
        ...SAMPLE_INPUT,
        expose: [
            ['curl.value', 'peel_height'],
            ['dash_relief.height', 'lenticel_height'],
            ['swell_relief.height', 'swell_height'],
            PATTERN_SCALE,
        ],
    },
);

/** As placas do barro seco (`pattern.cells`: 7 por unidade do padrão; o sulco entre elas é a rachadura). */
export const MUD_PLATES = { scale: 7, jitter: 0.85, crease: 0.13, seed: 101 };

/** As rachaduras finas dentro das placas. */
export const MUD_CHECKS = { scale: 26, jitter: 1, crease: 0.07, seed: 102 };

/** A face das placas (um grão). */
export const MUD_FACE = { scale: [34, 34], octaves: 3, seed: 103 };

/**
 * `relief.driedMud` — o relevo do barro seco: as rachaduras de retração entre as placas (`crack_depth`, 9 mm), as
 * rachaduras finas dentro delas (2 mm), a face das placas ondulada (`face_height`, 0,8 mm) e empenada por um grão largo
 * (1,5 mm). Parâmetros: `crack_depth`, `face_height`, `pattern_scale`.
 */
const driedMud = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            plates: pattern.cells.with(MUD_PLATES),
            checks: pattern.cells.with(MUD_CHECKS),
            face: pattern.grain.with(MUD_FACE),
            warp: pattern.grain.with({ scale: [4, 4], octaves: 2, seed: 104 }),
            crack_relief: surface.relief.with({ height: 9, level: 1 }),
            check_relief: surface.relief.with({ height: 2, level: 1 }),
            face_relief: surface.relief.with({ height: 0.8 }),
            warp_relief: surface.relief.with({ height: 1.5 }),
            sum_a: math.add3,
            sum_b: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('plates', 'checks', 'face', 'warp'),
            ...reliefLinks('crack_relief', 'plates.height', 'plates.gradient'),
            ...reliefLinks('check_relief', 'checks.height', 'checks.gradient'),
            ...reliefLinks('face_relief', 'face.value', 'face.gradient'),
            ...reliefLinks('warp_relief', 'warp.value', 'warp.gradient'),
            ['crack_relief.value', 'sum_a.a'],
            ['check_relief.value', 'sum_a.b'],
            ['face_relief.value', 'sum_b.a'],
            ['warp_relief.value', 'sum_b.b'],
            ['sum_a.value', 'out.a'],
            ['sum_b.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.driedMud',
        ...SAMPLE_INPUT,
        expose: [
            ['crack_relief.height', 'crack_depth'],
            ['face_relief.height', 'face_height'],
            PATTERN_SCALE,
        ],
    },
);

/** As nervuras de uma folha (`pattern.veins`): a rede de vênulas (`fine` células por unidade do padrão) e a semente. */
export interface LeafPatterns {
    readonly fine: number;
    readonly seed: number;
}

/**
 * As nervuras da folha da biblioteca: a central, que afina para a ponta, nove secundárias de cada lado — saem a uns 60°
 * e curvam para a ponta, com o espaçamento e o ângulo irregulares —, as terciárias em escada entre elas e a rede de
 * `fine` aréolas.
 */
export function leafVeins(v: LeafPatterns): Record<string, number | number[]> {
    return {
        scale: [0.5, 1],
        veins: 9,
        slope: 1.7,
        curve: 3.6,
        thickness: 0.02,
        fine: v.fine,
        seed: v.seed,
        irregular: 0.3,
        taper: 0.65,
        ladder: 22,
    };
}

/**
 * As almofadas do limbo: as aréolas da rede de vênulas (`pattern.areoles` com a semente de `pattern.veins`: as mesmas
 * células), arredondadas, com a altura subindo da vênula ao meio da aréola.
 */
export function leafPads(v: LeafPatterns): Record<string, number> {
    return { scale: v.fine, jitter: 0.8, wall: 0.25, seed: v.seed };
}

/** A ondulação larga do limbo (um grão do tamanho do espaço entre duas secundárias). */
export function leafWave(v: LeafPatterns): Record<string, number | number[]> {
    return { scale: [2.5, 5], octaves: 3, seed: v.seed + 4 };
}

/** As folhas da biblioteca: a cerosa, a fosca (rede de vênulas mais miúda: o limbo empolado) e a seca. */
export const LEAF_GREEN: LeafPatterns = { fine: 26, seed: 251 };
export const LEAF_MATTE: LeafPatterns = { fine: 34, seed: 281 };
export const LEAF_DRY: LeafPatterns = { fine: 26, seed: 261 };

/**
 * O relevo de uma folha: as nervuras central e secundárias (`vein`, mm na crista da central e 0,7 disso nas
 * secundárias; negativo: sulcos, a face de cima), o vale largo em volta delas — o limbo abaulado entre duas
 * secundárias (`bulge`, mm do fundo do vale ao alto do limbo) —, as almofadas do limbo entre as vênulas (`pad`, mm da
 * vênula ao meio da aréola) e a ondulação larga da lâmina (`wave`, mm). As vênulas não têm sulco próprio: são o vale
 * entre duas almofadas, que a malha resolve.
 */
function leafRelief(
    name: string,
    v: LeafPatterns,
    h: { vein: number; bulge: number; pad: number; wave: number },
) {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                // No relevo, só a central e as secundárias, com o dobro da largura da cor (o sulco fino demais para a
                // malha fazia riscos de sombra no rasante); as terciárias ficam na cor.
                veins: pattern.veins.with({
                    ...leafVeins(v),
                    fine: 0,
                    ladder: 0,
                    thickness: 0.04,
                }),
                // As mesmas nervuras com seis vezes a largura: o vale em que cada uma corre.
                valley: pattern.veins.with({
                    ...leafVeins(v),
                    fine: 0,
                    ladder: 0,
                    thickness: 0.09,
                }),
                pad: pattern.areoles.with(leafPads(v)),
                wave: pattern.grain.with(leafWave(v)),
                vein_relief: surface.relief.with({ height: h.vein }),
                valley_relief: surface.relief.with({ height: h.bulge, level: 1 }),
                pad_relief: surface.relief.with({ height: h.pad }),
                wave_relief: surface.relief.with({ height: h.wave }),
                sum_a: math.add3,
                sum_b: math.add3,
                out: math.add3,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('veins', 'valley', 'pad', 'wave'),
                ...reliefLinks('vein_relief', 'veins.height', 'veins.gradient'),
                ...reliefLinks('valley_relief', 'valley.height', 'valley.gradient'),
                ...reliefLinks('pad_relief', 'pad.height', 'pad.gradient'),
                ...reliefLinks('wave_relief', 'wave.value', 'wave.gradient'),
                ['vein_relief.value', 'sum_a.a'],
                ['valley_relief.value', 'sum_a.b'],
                ['pad_relief.value', 'sum_b.a'],
                ['wave_relief.value', 'sum_b.b'],
                ['sum_a.value', 'out.a'],
                ['sum_b.value', 'out.b'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['vein_relief.height', 'vein_height'],
                ['valley_relief.height', 'bulge_height'],
                ['pad_relief.height', 'pad_height'],
                ['wave_relief.height', 'wave_height'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `relief.leaf` — o relevo da folha cerosa grande e coriácea (a face de cima; a magnólia, o fícus, o cafeeiro): as
 * nervuras central e secundárias afundadas (`vein_height`, −0,7 mm na central, −0,5 nas secundárias, −0,35 nas
 * terciárias) no fundo de um vale raso (`bulge_height`, −0,35 mm), o limbo abaulado em almofadas redondas entre as
 * vênulas (`pad_height`, 0,3 mm: cada almofada com a sua inclinação, até uns 12° numa lâmina de 14 cm de largura) e a
 * ondulação larga da lâmina (`wave_height`, 1 mm). Medidas estimadas (a lâmina de uma folha coriácea tem de 0,3 a
 * 0,6 mm de espessura e a nervura central, de 1 a 2 mm). Parâmetros: `vein_height`, `bulge_height`, `pad_height`,
 * `wave_height`, `pattern_scale`.
 */
const leaf = leafRelief('relief.leaf', LEAF_GREEN, {
    vein: -0.7,
    bulge: -0.35,
    pad: 0.3,
    wave: 1,
});

/**
 * `relief.leafMatte` — o relevo da folha fosca (sálvia, a face de baixo do carvalho): o limbo empolado — as almofadas
 * altas entre as vênulas (`pad_height`, 0,3 mm) —, as nervuras afundadas (`vein_height`, −0,55 mm; `bulge_height`,
 * −0,2 mm) e a lâmina ondulada (`wave_height`, 1 mm). Medidas estimadas. Parâmetros: os de `relief.leaf`.
 */
const leafMatte = leafRelief('relief.leafMatte', LEAF_MATTE, {
    vein: -0.55,
    bulge: -0.2,
    pad: 0.3,
    wave: 1,
});

/**
 * `relief.leafDry` — o relevo da folha seca: a lâmina encolheu entre as nervuras, que ficam salientes (`vein_height`,
 * 0,7 mm; `bulge_height`, 0,25 mm: o limbo afunda entre duas), as aréolas afundam (`pad_height`, −0,15 mm) e a
 * lâmina amassa (`wave_height`, 1,6 mm). Medidas estimadas. Parâmetros: os de `relief.leaf`.
 */
const leafDry = leafRelief('relief.leafDry', LEAF_DRY, {
    vein: 0.7,
    bulge: 0.25,
    pad: -0.15,
    wave: 1.6,
});

/** O deslocamento do padrão do freixo no uv (a medula fora do meio da peça: os arcos dos anéis de um lado). */
export const ASH_OFFSET = [0.31, -0.45] as const;

/**
 * Os anéis do freixo (`pattern.rings`): 30 por unidade do padrão, de largura irregular e linha torta, sem nós. Uma
 * unidade do padrão são uns 4 cm de madeira (anéis de 3 mm, vasos de 0,2 mm).
 */
export const ASH_RINGS = {
    scale: 30,
    depth: 0.14,
    distortion: 0.16,
    distortion_scale: [1.2, 1.8],
    irregularity: 1,
    waviness: 0.03,
    waviness_scale: [2.2, 5],
    seed: 41,
};

/** A fibra do freixo (um grão alongado ao longo do veio). */
export const ASH_FIBER = { scale: [2.5, 110], octaves: 2, seed: 43 };

/** Os vasos do freixo (um grão alongado ao longo do veio: acima do nível, o poro aberto). */
export const ASH_PORE = { scale: [6, 60], octaves: 2, seed: 47 };

/** Os níveis do grão entre os quais a face vira poro (1 na face, 0 no fundo do poro). */
export const ASH_PIT = { low: 0.5, high: 0.25 };

/** O quanto o poro abre ao longo do anel: inteiro no lenho inicial (o anel poroso), quase nada no tardio. */
export const ASH_EARLY = { in_min: 0.1, in_max: 0.7, out_min: 1, out_max: 0.12 };

/** Os sulcos do freixo escovado (um grão alongado ao longo do veio: abaixo do nível, a fibra macia arrancada). */
export const ASH_FURROW = { scale: [2.2, 44], octaves: 3, gain: 0.6, seed: 49 };

/** Os níveis do grão entre os quais a face vira sulco (1 na face, 0 no fundo). */
export const ASH_GROOVE = { low: 0.3, high: -0.3 };

/**
 * O que corre ao longo da fibra (a fibra, os vasos, os sulcos) lê a coordenada do veio (`veinLinks`): acompanha as
 * curvas dos anéis e o desvio dos nós.
 *
 * O relevo de um freixo: o lenho tardio saliente (`ring`, mm entre o lenho inicial e a crista do anel), os vasos do
 * lenho inicial abertos em sulcos curtos ao longo do veio (`pore`, mm no lenho inicial, quase nada no tardio), a fibra
 * levantada (`fiber`, mm) e os sulcos da escova (`furrow`, mm: a fibra macia do lenho inicial arrancada em canais ao
 * longo do veio; no lenho tardio, quase nada).
 */
function ashRelief(
    name: string,
    h: { ring: number; pore: number; fiber: number; furrow: number },
    wood: { offset: readonly [number, number]; rings: Record<string, number | number[]> } = {
        offset: ASH_OFFSET,
        rings: ASH_RINGS,
    },
) {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(wood.offset),
                rings: pattern.rings.with(wood.rings),
                fiber: pattern.grain.with(ASH_FIBER),
                pore: pattern.grain.with(ASH_PORE),
                pit: pattern.threshold.with(ASH_PIT),
                furrow: pattern.grain.with(ASH_FURROW),
                groove: pattern.threshold.with(ASH_GROOVE),
                early: map.range.with(ASH_EARLY),
                deep: math.value.with({ value: h.pore }),
                open: math.mul,
                dug: math.value.with({ value: h.furrow }),
                torn: math.mul,
                ring_relief: surface.relief.with({ height: h.ring, level: 0.5 }),
                fiber_relief: surface.relief.with({ height: h.fiber }),
                pore_relief: surface.relief.with({ level: 1 }),
                furrow_relief: surface.relief.with({ level: 1 }),
                sum: math.add3,
                cut: math.add3,
                out: math.add3,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('rings'),
                ...veinLinks(['fiber', 'pore', 'furrow']),
                ['pore.value', 'pit.value'],
                ['pore.gradient', 'pit.gradient'],
                ['furrow.value', 'groove.value'],
                ['furrow.gradient', 'groove.gradient'],
                ['rings.value', 'early.x'],
                ['early.value', 'open.a'],
                ['deep.value', 'open.b'],
                ['open.value', 'pore_relief.height'],
                ['early.value', 'torn.a'],
                ['dug.value', 'torn.b'],
                ['torn.value', 'furrow_relief.height'],
                ...reliefLinks('ring_relief', 'rings.value', 'rings.gradient'),
                ...reliefLinks('fiber_relief', 'fiber.value', 'fiber.gradient'),
                ...reliefLinks('pore_relief', 'pit.value', 'pit.gradient'),
                ...reliefLinks('furrow_relief', 'groove.value', 'groove.gradient'),
                ['ring_relief.value', 'sum.a'],
                ['fiber_relief.value', 'sum.b'],
                ['pore_relief.value', 'cut.a'],
                ['furrow_relief.value', 'cut.b'],
                ['sum.value', 'out.a'],
                ['cut.value', 'out.b'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['ring_relief.height', 'ring_height'],
                ['deep.value', 'pore_depth'],
                ['fiber_relief.height', 'fiber_height'],
                ['dug.value', 'furrow_depth'],
                ['rings.scale', 'ring_count'],
                ['rings.depth', 'pith_depth'],
                ['rings.knots', 'knot_density'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `relief.woodAsh` — o relevo do freixo cru, lixado e escovado de leve: o lenho tardio, mais duro, fica saliente
 * (`ring_height`, 0,12 mm entre o lenho inicial e a crista do anel); os vasos grandes do lenho inicial ficam abertos,
 * em sulcos curtos ao longo do veio (`pore_depth`, 0,25 mm no lenho inicial, quase nada no tardio: o freixo tem o anel
 * poroso); a fibra levantada risca a face (`fiber_height`, 0,08 mm); sem os sulcos da escova (`furrow_depth`, 0).
 * Medidas estimadas (os vasos do lenho inicial do freixo têm de 0,15 a 0,35 mm de diâmetro). Os anéis são entradas
 * com valor — `ring_count` (anéis por unidade do padrão), `pith_depth` (a distância da medula ao plano do corte, em
 * unidades do padrão) e `knot_density` (células de nó por unidade do padrão; 0 = sem nós) —, as mesmas do material:
 * passe os mesmos valores aos dois. Parâmetros: `ring_height`, `pore_depth`, `fiber_height`, `furrow_depth`,
 * `ring_count`, `pith_depth`, `knot_density`, `pattern_scale`.
 */
const woodAsh = ashRelief('relief.woodAsh', { ring: 0.12, pore: 0.25, fiber: 0.08, furrow: 0 });

/**
 * `relief.woodAshBrushed` — o relevo do freixo escovado a fundo (a escova de aço ou o jato de areia tiram a fibra
 * macia do lenho inicial e deixam o lenho tardio em cristas): o anel saliente (`ring_height`, 0,8 mm entre o fundo do
 * lenho inicial e a crista do tardio), os sulcos ao longo do veio onde a fibra macia saiu (`furrow_depth`, 1,1 mm no
 * lenho inicial), os vasos abertos (`pore_depth`, 0,5 mm) e a fibra levantada (`fiber_height`, 0,15 mm) — de 0,5 a
 * 1,5 mm do fundo dos sulcos às cristas, o relevo que se vê e se sente numa tábua de freixo ou de carvalho escovada
 * ou jateada. Medidas estimadas. Parâmetros: os de `relief.woodAsh`.
 */
const woodAshBrushed = ashRelief('relief.woodAshBrushed', {
    ring: 0.8,
    pore: 0.5,
    fiber: 0.15,
    furrow: 1.1,
});

/** O deslocamento do padrão do pinho de veio fino no uv. */
export const PINE_FINE_OFFSET = [0.63, -0.73] as const;

/**
 * Os anéis do pinho de veio fino (`pattern.rings`): 115 por unidade do padrão — linhas finas, de largura irregular, que
 * ondulam, abrem e fecham (a ondulação do raio de 0,05, larga), o perfil com a queda larga (`fall` 0,32: a crista do
 * relevo sem degrau) —, o corte tangente aos anéis ao longo da medula (a
 * 0,015 do plano, a fundura variando 0,05: a fileira de "catedrais" fechadas e de ilhas alongadas; com o deslocamento
 * `PINE_FINE_OFFSET`, a 0,73 unidade do padrão acima da origem do uv) e os nós (4,5 células por unidade do padrão, um
 * em três de cada dez: o olho de anéis apertados, com o veio desviando em gota).
 */
export const PINE_FINE_RINGS = {
    scale: 115,
    depth: 0.015,
    distortion: 0.05,
    distortion_scale: [2.2, 3],
    irregularity: 1,
    waviness: 0.05,
    waviness_scale: [1.6, 5],
    seed: 19,
    knots: 4.5,
    knot_size: 0.03,
    knot_rings: 7,
    fall: 0.32,
};

/**
 * `relief.woodPineFine` — o relevo do pinho de veio fino escovado de leve: o lenho tardio (as linhas escuras, duras)
 * em crista suave e o inicial afundado (`ring_height`, 0,5 mm entre os dois — os anéis apertados do nó saem em relevo
 * com ele) e a fibra levantada (`fiber_height`, 0,04 mm), que corre paralela às linhas dos anéis. O relevo é o do
 * campo dos anéis: sem sulcos de escova independentes (`furrow_depth`, 0) e sem poros (`pore_depth`, 0: é conífera).
 * Medidas estimadas. Parâmetros: os de `relief.woodAsh`.
 */
const woodPineFine = ashRelief(
    'relief.woodPineFine',
    { ring: 0.5, pore: 0, fiber: 0.04, furrow: 0 },
    { offset: PINE_FINE_OFFSET, rings: PINE_FINE_RINGS },
);

/** Onde a peça de madeira maciça está no bloco: afastada da medula (em unidades do padrão), fora do eixo. */
export const SOLID_WOOD_OFFSET = [1.55, 0.3, 0.35] as const;

/**
 * O tronco da madeira maciça (`pattern.trunk`): 16 anéis por unidade do padrão, de largura irregular, ondulados, a
 * medula serpenteando de leve, o perfil em degrau (`fall` 0,3: o lenho tardio cai ao inicial do ano seguinte em três décimos
 * do anel — mais estreita, a queda fica menor que o passo da malha do deslocamento) e os galhos (0,8 célula por unidade ao longo do eixo).
 */
export const SOLID_WOOD_TRUNK = {
    scale: 16,
    irregularity: 0.9,
    waviness: 0.045,
    waviness_scale: [2.6, 1.1, 2.6],
    wander: 0.12,
    wander_scale: 0.4,
    seed: 23,
    knots: 0.8,
    knot_size: 0.08,
    knot_rings: 6,
    fall: 0.3,
};

/** A fibra da madeira maciça: riscos finos ao longo do eixo do tronco, dentro das superfícies dos anéis. */
export const SOLID_WOOD_FIBER = { scale: [70, 1.6, 70], octaves: 2, gain: 0.6, seed: 61 };

/** As ligações da amostra ao espaço maciço (`solid`, um `surface.solidSpace`). */
export const SOLID_LINKS = [
    ['s.object_position', 'solid.position'],
    ['s.dodu', 'solid.dodu'],
    ['s.dodv', 'solid.dodv'],
    ['s.duvdx', 'solid.duvdx'],
    ['s.duvdy', 'solid.duvdy'],
    ['s.footprint', 'solid.footprint'],
    ['solid.p', 'rings.p'],
    ['solid.width', 'rings.width'],
    ['rings.along', 'fiber.p'],
    ['solid.width', 'fiber.width'],
] as const;

/**
 * `relief.woodSolid` — o relevo da madeira maciça jateada: a areia tira o lenho inicial, macio, e deixa o tardio — cada
 * anel um degrau, que sobe devagar e cai de uma vez (`ring_height`, 0,7 mm do fundo à crista), mais a fibra levantada
 * (`fiber_height`, 0,05 mm). O relevo é o do campo dos anéis no volume (`pattern.trunk` na posição do objeto): segue
 * as curvas do veio em qualquer forma. Medidas estimadas. Parâmetros: `ring_height`, `fiber_height`, `ring_count`
 * (anéis por unidade do padrão), `knot_density` (células de galho por unidade ao longo do eixo), `pattern_scale`
 * (unidades do padrão por unidade do objeto), `offset` (onde a peça está no bloco) e `axis` (a direção da fibra no
 * objeto) — os mesmos do material: passe os mesmos valores aos dois.
 */
const woodSolid = Subgraph.point(
    new NodeGraph({
        nodes: {
            s: input.surfaceSample(),
            solid: surface.solidSpace.with({ offset: [...SOLID_WOOD_OFFSET] }),
            rings: pattern.trunk.with(SOLID_WOOD_TRUNK),
            fiber: pattern.grain3.with(SOLID_WOOD_FIBER),
            ring_relief: surface.solidRelief.with({ height: 0.7, level: 0.5 }),
            fiber_relief: surface.solidRelief.with({ height: 0.05 }),
            out: math.add3,
        },
        links: [
            ...SOLID_LINKS,
            ['rings.value', 'ring_relief.value'],
            ['rings.gradient', 'ring_relief.gradient'],
            ['solid.du', 'ring_relief.du'],
            ['solid.dv', 'ring_relief.dv'],
            ['fiber.value', 'fiber_relief.value'],
            ['fiber.gradient', 'fiber_relief.gradient'],
            ['solid.du', 'fiber_relief.du'],
            ['solid.dv', 'fiber_relief.dv'],
            ['ring_relief.value', 'out.a'],
            ['fiber_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.woodSolid',
        ...SAMPLE_INPUT,
        expose: [
            ['ring_relief.height', 'ring_height'],
            ['fiber_relief.height', 'fiber_height'],
            ['rings.scale', 'ring_count'],
            ['rings.knots', 'knot_density'],
            ['solid.scale', 'pattern_scale'],
            ['solid.offset', 'offset'],
            ['solid.axis', 'axis'],
        ],
    },
);

/**
 * Relevos dos materiais prontos (spec 011): sub-grafos de ponto que devolvem o relevo (`vec3f`: altura em milímetros e
 * as derivadas no uv) da amostra de superfície — a entrada de `surface.reliefNormal` no material e de
 * `surface.displacement` na `DisplacementFunction`.
 */
export const relief = {
    woodRough,
    leather,
    wool,
    sandstone,
    brick,
    bark,
    barkPine,
    barkBirch,
    driedMud,
    roofTile,
    roofSlate,
    leaf,
    leafMatte,
    leafDry,
    woodAsh,
    woodAshBrushed,
    woodPineFine,
    woodSolid,
} as const;
