import { NodeGraph } from '../../../scene/graph/NodeGraph';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { math } from '../math';
import { pattern } from '../pattern';
import { surface } from '../surface';
import {
    PATTERN_SCALE,
    patternLinks,
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

/** As placas da casca grossa (`pattern.fissures`): 14 por unidade do padrão em volta do tronco, 2,3 ao longo dele. */
export const BARK_PLATES = { scale: [14, 2.3], jitter: 1, crease: 0.3, seed: 91 };

/** As fissuras menores dentro das placas. */
export const BARK_CHECKS = { scale: [26, 5], jitter: 1, crease: 0.3, seed: 95 };

/** As cristas ásperas da face das placas (um grão alongado ao longo do tronco). */
export const BARK_FLAKES = { scale: [46, 7], octaves: 3, gain: 0.6, seed: 92 };

/**
 * `relief.bark` — o relevo da casca grossa fissurada (carvalho, pinheiro velho): placas compridas ao longo de v (o eixo
 * do tronco) separadas por fissuras fundas que se ramificam e se juntam (`pattern.fissures`; `furrow_depth`, 9 mm, de
 * parede inclinada), fissuras menores dentro das placas (3 mm), a face em cristas ásperas ao longo do tronco
 * (`ridge_height`, 3,4 mm) e as placas abauladas por um grão largo (2,5 mm). Parâmetros: `furrow_depth`,
 * `ridge_height`, `pattern_scale`.
 */
const bark = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            plates: pattern.fissures.with(BARK_PLATES),
            checks: pattern.fissures.with(BARK_CHECKS),
            flakes: pattern.grain.with(BARK_FLAKES),
            swell: pattern.grain.with({ scale: [5, 3], octaves: 2, seed: 93 }),
            plate_relief: surface.relief.with({ height: 9, level: 1 }),
            check_relief: surface.relief.with({ height: 3, level: 1 }),
            flake_relief: surface.relief.with({ height: 3.4 }),
            swell_relief: surface.relief.with({ height: 2.5 }),
            sum_a: math.add3,
            sum_b: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('plates', 'checks', 'flakes', 'swell'),
            ...reliefLinks('plate_relief', 'plates.height', 'plates.gradient'),
            ...reliefLinks('check_relief', 'checks.height', 'checks.gradient'),
            ...reliefLinks('flake_relief', 'flakes.value', 'flakes.gradient'),
            ...reliefLinks('swell_relief', 'swell.value', 'swell.gradient'),
            ['plate_relief.value', 'sum_a.a'],
            ['check_relief.value', 'sum_a.b'],
            ['flake_relief.value', 'sum_b.a'],
            ['swell_relief.value', 'sum_b.b'],
            ['sum_a.value', 'out.a'],
            ['sum_b.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.bark',
        ...SAMPLE_INPUT,
        expose: [
            ['plate_relief.height', 'furrow_depth'],
            ['flake_relief.height', 'ridge_height'],
            PATTERN_SCALE,
        ],
    },
);

/** As tiras da bétula que descascam (`pattern.grain` alongado em volta do tronco): acima do nível, a tira solta. */
export const BIRCH_PEEL = { scale: [1.3, 9], octaves: 4, gain: 0.55, seed: 96 };

/** Os níveis do grão entre os quais a casca passa de lisa a tira levantada (uma borda viva). */
export const BIRCH_EDGE = { low: 0.2, high: 0.26 };

/** As lenticelas da bétula (`pattern.grain` muito alongado em volta do tronco: traços curtos e escuros). */
export const BIRCH_LENTICELS = { scale: [7, 64], octaves: 2, gain: 0.5, seed: 97 };

/** Os níveis do grão entre os quais a casca vira lenticela. */
export const BIRCH_DASH = { low: 0.34, high: 0.46 };

/**
 * `relief.barkBirch` — o relevo da casca de bétula: lisa, com as tiras de casca fina que descascam em volta do tronco
 * (`peel_height`, 1,4 mm: a borda da tira levantada, viva), as lenticelas salientes (`lenticel_height`, 0,5 mm) e a
 * ondulação leve do tronco (0,6 mm). Parâmetros: `peel_height`, `lenticel_height`, `pattern_scale`.
 */
const barkBirch = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            peel: pattern.grain.with(BIRCH_PEEL),
            strip: pattern.threshold.with(BIRCH_EDGE),
            mark: pattern.grain.with(BIRCH_LENTICELS),
            dash: pattern.threshold.with(BIRCH_DASH),
            swell: pattern.grain.with({ scale: [3, 5], octaves: 3, seed: 98 }),
            peel_relief: surface.relief.with({ height: 1.4 }),
            dash_relief: surface.relief.with({ height: 0.5 }),
            swell_relief: surface.relief.with({ height: 0.6 }),
            sum: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('peel', 'mark', 'swell'),
            ['peel.value', 'strip.value'],
            ['peel.gradient', 'strip.gradient'],
            ['mark.value', 'dash.value'],
            ['mark.gradient', 'dash.gradient'],
            ...reliefLinks('peel_relief', 'strip.value', 'strip.gradient'),
            ...reliefLinks('dash_relief', 'dash.value', 'dash.gradient'),
            ...reliefLinks('swell_relief', 'swell.value', 'swell.gradient'),
            ['peel_relief.value', 'sum.a'],
            ['dash_relief.value', 'sum.b'],
            ['sum.value', 'out.a'],
            ['swell_relief.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'relief.barkBirch',
        ...SAMPLE_INPUT,
        expose: [
            ['peel_relief.height', 'peel_height'],
            ['dash_relief.height', 'lenticel_height'],
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
    barkBirch,
    driedMud,
} as const;
