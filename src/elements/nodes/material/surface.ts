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
} from './pattern';

// Materiais prontos opacos de uma interface só (spec 011, R11): um especular de dielétrico sobre um difuso — a luz que
// a interface não reflete entra, espalha no corpo e sai com a cor dele. Cada um com a estrutura que o nome promete,
// calculada por pixel pelos nós de padrão sobre o uv (`pattern_scale` repetições por unidade de uv; numa esfera, (2, 1)):
// os anéis e a fibra da madeira, o grão do couro, a textura de molde do plástico fosco, o esmalte sobre o corpo da
// cerâmica. Os valores são os padrões dos parâmetros expostos; cada parâmetro é também uma entrada.

/** Valores de um dielétrico opaco: cor do corpo, rugosidade e IOR da interface, rugosidade do difuso. */
interface OpaqueValues {
    readonly color: readonly [number, number, number];
    readonly roughness: number;
    readonly ior: number;
    readonly diffuse_roughness: number;
}

/** Sub-grafo de um dielétrico opaco liso: `bsdf.dielectric` somado a `bsdf.diffuse` (`closure.add`). */
function opaque(name: string, v: OpaqueValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                body: bsdf.diffuse.with({ color: [...v.color], roughness: v.diffuse_roughness }),
                specular: bsdf.dielectric.with({ ior: v.ior, roughness: v.roughness }),
                out: closure.add,
            },
            links: [
                ['specular.value', 'out.a'],
                ['body.value', 'out.b'],
            ],
            output: 'out.value',
        }),
        {
            name,
            expose: [
                ['body.color', 'color'],
                ['specular.roughness', 'roughness'],
                ['specular.ior', 'ior'],
                ['body.roughness', 'diffuse_roughness'],
            ],
        },
    );
}

/**
 * Sub-grafo de um dielétrico opaco com grão fino isotrópico (`pattern.grain` de `scale` células por unidade do padrão):
 * o relevo de altura `relief` (em unidades do padrão) perturba a normal — a textura de molde, a borracha.
 */
function grained(name: string, v: OpaqueValues, scale: number, relief: number): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                grain: pattern.grain.with({ scale: [scale, scale], octaves: 2 }),
                relief: surface.bump.with({ strength: relief }),
                body: bsdf.diffuse.with({ color: [...v.color], roughness: v.diffuse_roughness }),
                specular: bsdf.dielectric.with({ ior: v.ior, roughness: v.roughness }),
                sum: closure.add,
                out: closure.normal,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('grain'),
                ...bumpLinks('relief', 'grain.gradient'),
                ['specular.value', 'sum.a'],
                ['body.value', 'sum.b'],
                ['sum.value', 'out.c'],
                ['relief.value', 'out.normal'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['body.color', 'color'],
                ['specular.roughness', 'roughness'],
                ['specular.ior', 'ior'],
                ['body.roughness', 'diffuse_roughness'],
                ['relief.strength', 'relief'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `material.woodRaw` — madeira crua (carvalho lixado, sem acabamento): difuso áspero sob uma interface de celulose
 * muito rugosa, sem realce nítido. IOR 1,53 (celulose, n_D 1,53–1,55; `research.md` R11); rugosidade 0,7 (madeira
 * lixada). A estrutura: os anéis de crescimento (`pattern.rings`: o corte tangencial de um tronco com a fibra ao longo
 * de u, 30 anéis por unidade do padrão em média, de largura irregular — anos largos e estreitos —, com as linhas
 * onduladas e os arcos da "catedral" onde o corte passa perto da medula) dão a cor do lenho inicial (`color`) ao tardio
 * (`late_color`), com o tom variando de anel para anel; a fibra (`pattern.grain` alongado 32 : 1) risca a cor e os
 * poros a escurecem em traços finos ao longo do veio. Lixada, a peça é quase lisa: o relevo dos anéis (`relief`) é
 * mínimo e o que se sente é a fibra (`fiber_relief`) — alturas em unidades do padrão.
 * Parâmetros: `color`, `late_color`, `roughness`, `ior`, `diffuse_roughness`, `relief`, `fiber_relief`,
 * `pattern_scale`.
 */
export const woodRaw = Subgraph.point(
    new NodeGraph({
        nodes: {
            // A medula a 0,42 do padrão: os arcos dos anéis ficam no meio da peça, não na borda do uv.
            ...patternSpace([0, -0.42]),
            rings: pattern.rings.with({
                scale: 64,
                depth: 0.1,
                distortion: 0.12,
                distortion_scale: [1.2, 2],
                irregularity: 1,
                waviness: 0.012,
                waviness_scale: [2.5, 6],
            }),
            fiber: pattern.grain.with({ scale: [3, 150], octaves: 2, seed: 3 }),
            pore: pattern.grain.with({ scale: [10, 240], octaves: 1, seed: 7 }),
            // A faixa escura é o fim do anel: a cor só escurece no terço final do perfil.
            tone: color.ramp.with({
                color_a: [0.45, 0.28, 0.15],
                color_b: [0.27, 0.15, 0.07],
                low: 0.55,
                high: 1,
            }),
            year: map.range.with({ out_min: 0.8, out_max: 1.15 }),
            streak: map.range.with({ in_min: -0.5, in_max: 0.5, out_min: 0.72, out_max: 1.24 }),
            shade: math.mul,
            lit: math.scale3,
            pore_mask: map.range.with({ in_min: 0.25, in_max: 0.5, out_min: 0, out_max: 0.7 }),
            pore_color: math.value3.with({ value: [0.12, 0.06, 0.025] }),
            wood: math.mix3,
            body: bsdf.diffuse.with({ roughness: 0.6 }),
            specular: bsdf.dielectric.with({ ior: 1.53, roughness: 0.7 }),
            sum: closure.add,
            relief: surface.bump.with({ strength: 0.00003 }),
            fiber_relief: surface.bump.with({ strength: 0.0004 }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('rings', 'fiber', 'pore'),
            ['rings.value', 'tone.t'],
            ['rings.ring', 'year.x'],
            ['fiber.value', 'streak.x'],
            ['year.value', 'shade.a'],
            ['streak.value', 'shade.b'],
            ['tone.color', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['pore.value', 'pore_mask.x'],
            ['lit.value', 'wood.a'],
            ['pore_color.value', 'wood.b'],
            ['pore_mask.value', 'wood.t'],
            ['wood.value', 'body.color'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ...bumpLinks('relief', 'rings.gradient'),
            ...bumpLinks('fiber_relief', 'fiber.gradient', 'relief.value'),
            ['sum.value', 'out.c'],
            ['fiber_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.woodRaw',
        ...SAMPLE_INPUT,
        expose: [
            ['tone.color_a', 'color'],
            ['tone.color_b', 'late_color'],
            ['specular.roughness', 'roughness'],
            ['specular.ior', 'ior'],
            ['body.roughness', 'diffuse_roughness'],
            ['relief.strength', 'relief'],
            ['fiber_relief.strength', 'fiber_relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.leather` — couro curtido com acabamento: IOR 1,5 (colágeno e o filme de acabamento, n ≈ 1,5). A estrutura:
 * o grão (`pattern.cells`: 64 células por unidade do padrão, abauladas, com sulcos entre elas) em relevo (`relief`), mais escuro
 * e fosco nos sulcos (rugosidade 0,8) e liso nos platôs (`roughness`, 0,42), com rugas largas (`pattern.grain`) que
 * ondulam a superfície e variam o brilho. Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`, `relief`,
 * `pattern_scale`.
 */
export const leather = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            grain: pattern.cells.with({ scale: 64, jitter: 0.9, crease: 0.5 }),
            wrinkle: pattern.grain.with({ scale: [9, 9], octaves: 3, seed: 5 }),
            hide: math.value3.with({ value: [0.22, 0.1, 0.05] }),
            crease_shade: map.range.with({ out_min: 0.62, out_max: 1 }),
            cell_tone: map.range.with({ out_min: 0.88, out_max: 1.1 }),
            shade: math.mul,
            lit: math.scale3,
            gloss: map.range.with({ out_min: 0.8, out_max: 0.42 }),
            wear: map.range.with({ in_min: -1, in_max: 1, out_min: -0.1, out_max: 0.1 }),
            rough: math.add,
            body: bsdf.diffuse.with({ roughness: 0.5 }),
            specular: bsdf.dielectric.with({ ior: 1.5 }),
            sum: closure.add,
            relief: surface.bump.with({ strength: 0.0022 }),
            wrinkle_relief: surface.bump.with({ strength: 0.005 }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('grain', 'wrinkle'),
            ['grain.height', 'crease_shade.x'],
            ['grain.cell', 'cell_tone.x'],
            ['crease_shade.value', 'shade.a'],
            ['cell_tone.value', 'shade.b'],
            ['hide.value', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ['grain.height', 'gloss.x'],
            ['wrinkle.value', 'wear.x'],
            ['gloss.value', 'rough.a'],
            ['wear.value', 'rough.b'],
            ['rough.value', 'specular.roughness'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ...bumpLinks('relief', 'grain.gradient'),
            ...bumpLinks('wrinkle_relief', 'wrinkle.gradient', 'relief.value'),
            ['sum.value', 'out.c'],
            ['wrinkle_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.leather',
        ...SAMPLE_INPUT,
        expose: [
            ['hide.value', 'color'],
            ['gloss.out_max', 'roughness'],
            ['specular.ior', 'ior'],
            ['body.roughness', 'diffuse_roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.rubber` — borracha preta: IOR 1,519 (borracha natural, poli-isopreno, n_D 1,519), rugosidade 0,75, albedo
 * 0,03 (o negro de fumo absorve quase tudo); a superfície fosca tem um grão fino (140 por unidade do padrão) de relevo
 * leve (`relief`). Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`, `relief`, `pattern_scale`.
 */
export const rubber = grained(
    'material.rubber',
    { color: [0.03, 0.03, 0.03], roughness: 0.75, ior: 1.519, diffuse_roughness: 0.3 },
    140,
    0.0005,
);

/**
 * `material.ceramic` — cerâmica esmaltada (grés): o corpo difuso de argila queimada, com as pintas escuras do ferro
 * (`pattern.cells`: uma célula em dez, no miolo dela), sob o esmalte — um vidro de silicato em camada (`closure.layer`),
 * IOR 1,5, rugosidade 0,08, tingido (`glaze_color`) e de espessura irregular (`pattern.grain` largo ondula a normal do
 * esmalte: o reflexo treme de leve, como no esmalte escorrido). Parâmetros: `color`, `roughness`, `ior`,
 * `diffuse_roughness`, `glaze_color`, `pattern_scale`.
 */
export const ceramic = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            speck: pattern.cells.with({ scale: 70, jitter: 1, crease: 0.5, seed: 2 }),
            pooling: pattern.grain.with({ scale: [5, 5], octaves: 2, seed: 9 }),
            clay: math.value3.with({ value: [0.72, 0.62, 0.5] }),
            iron: math.value3.with({ value: [0.2, 0.11, 0.06] }),
            chosen: map.range.with({ in_min: 0.9, in_max: 0.91 }),
            core: map.range.with({ in_min: 0.55, in_max: 0.9 }),
            mask: math.mul,
            tinted: math.mix3,
            body: bsdf.diffuse.with({ roughness: 0.2 }),
            wave: surface.bump.with({ strength: 0.004 }),
            glaze: bsdf.dielectric.with({ ior: 1.5, roughness: 0.08 }),
            glaze_surface: closure.normal,
            out: closure.layer.with({ top_color: [0.97, 0.93, 0.85] }),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('speck', 'pooling'),
            ['speck.cell', 'chosen.x'],
            ['speck.height', 'core.x'],
            ['chosen.value', 'mask.a'],
            ['core.value', 'mask.b'],
            ['clay.value', 'tinted.a'],
            ['iron.value', 'tinted.b'],
            ['mask.value', 'tinted.t'],
            ['tinted.value', 'body.color'],
            ...bumpLinks('wave', 'pooling.gradient'),
            ['glaze.value', 'glaze_surface.c'],
            ['wave.value', 'glaze_surface.normal'],
            ['glaze_surface.value', 'out.top'],
            ['body.value', 'out.base'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.ceramic',
        ...SAMPLE_INPUT,
        expose: [
            ['clay.value', 'color'],
            ['glaze.roughness', 'roughness'],
            ['glaze.ior', 'ior'],
            ['body.roughness', 'diffuse_roughness'],
            ['out.top_color', 'glaze_color'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.plasticMatte` — plástico fosco (polipropileno texturizado): IOR 1,49 (polipropileno e PMMA, n_D 1,49),
 * rugosidade 0,6, com a textura de molde — um grão fino (220 por unidade do padrão) em relevo (`relief`). Parâmetros:
 * `color`, `roughness`, `ior`, `diffuse_roughness`, `relief`, `pattern_scale`.
 */
export const plasticMatte = grained(
    'material.plasticMatte',
    { color: [0.7, 0.08, 0.06], roughness: 0.6, ior: 1.49, diffuse_roughness: 0 },
    220,
    0.0005,
);

/**
 * `material.plasticGloss` — plástico brilhante (PMMA injetado, polido): IOR 1,49 (PMMA, n_D 1,49), rugosidade 0,08;
 * liso, sem padrão — o que se vê nele é o reflexo do ambiente. Parâmetros: `color`, `roughness`, `ior`,
 * `diffuse_roughness`.
 */
export const plasticGloss = opaque('material.plasticGloss', {
    color: [0.05, 0.25, 0.7],
    roughness: 0.08,
    ior: 1.49,
    diffuse_roughness: 0,
});
