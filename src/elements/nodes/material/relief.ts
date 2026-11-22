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

/** Os anéis de crescimento da madeira da biblioteca (`pattern.rings`): 64 por unidade do padrão, largura irregular. */
export const WOOD_RINGS = {
    scale: 64,
    depth: 0.1,
    distortion: 0.12,
    distortion_scale: [1.2, 2],
    irregularity: 1,
    waviness: 0.012,
    waviness_scale: [2.5, 6],
};

/** A fibra da madeira (`pattern.grain` alongado ao longo do veio). */
export const WOOD_FIBER = { scale: [3, 150], octaves: 2, seed: 3 };

/** A face irregular da madeira bruta (a erosão, as marcas da serra): um grão largo. */
export const WOOD_WEAR = { scale: [5, 18], octaves: 3, seed: 31 };

/** O grão alongado cujas cristas são as frestas da madeira seca (lentes de alguns centímetros ao longo da fibra). */
const WOOD_SPLIT = { scale: [4.5, 64], octaves: 2, gain: 0.35, seed: 23 };

/**
 * `relief.woodRough` — o relevo da madeira bruta e envelhecida (tábua serrada exposta ao tempo): o lenho inicial, mole,
 * gasta, e o tardio fica saliente (`ring_height`, 0,8 mm entre o fundo e a crista do anel); a face é irregular (a
 * erosão e as marcas da serra: um grão largo, `wear_height`, 1,2 mm); a fibra levantada risca a face ao longo do veio
 * (`fiber_height`, 0,3 mm); frestas em forma de lente abrem ao longo da fibra onde a peça secou (`crack_depth`, 3 mm:
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
            crack: pattern.threshold.with({ low: 0.37, high: 0.27 }),
            hairline: pattern.grain.with({ scale: [2.3, 118], octaves: 2, gain: 0.4, seed: 29 }),
            hair: pattern.threshold.with({ low: 0.36, high: 0.29 }),
            pore: pattern.grain.with({ scale: [10, 240], octaves: 1, seed: 7 }),
            pit: pattern.threshold.with({ low: 0.5, high: 0.25 }),
            ring_relief: surface.relief.with({ height: 0.8, level: 0.59 }),
            wear_relief: surface.relief.with({ height: 1.2 }),
            fiber_relief: surface.relief.with({ height: 0.3 }),
            crack_relief: surface.relief.with({ height: 3, level: 1 }),
            hair_relief: surface.relief.with({ height: 1.2, level: 1 }),
            pore_relief: surface.relief.with({ height: 0.2, level: 1 }),
            sum_a: math.add3,
            sum_b: math.add3,
            sum_c: math.add3,
            sum_d: math.add3,
            out: math.add3,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('rings', 'fiber', 'wear', 'split', 'hairline', 'pore'),
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
            ['sum_c.value', 'out.a'],
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

/**
 * Relevos dos materiais prontos (spec 011): sub-grafos de ponto que devolvem o relevo (`vec3f`: altura em milímetros e
 * as derivadas no uv) da amostra de superfície — a entrada de `surface.reliefNormal` no material e de
 * `surface.displacement` na `DisplacementFunction`.
 */
export const relief = { woodRough, leather, wool } as const;
