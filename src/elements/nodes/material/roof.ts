import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { map } from '../map';
import { math } from '../math';
import { pattern } from '../pattern';
import { surface } from '../surface';
import { patternLinks, patternSpace, SAMPLE_INPUT, SPACE_LINKS } from './pattern';
import { relief, ROOF_CLAY, ROOF_CLEAVAGE, ROOF_SLATES, ROOF_TILES } from './relief';

// Telhados (spec 011, T118): a telha de barro de capa e canal e a ardósia — fiadas sobrepostas (`pattern.shingles`),
// com o relevo em milímetros (`relief.roofTile`, `relief.roofSlate`) na normal e, com `Displacements`, na geometria: a
// sobreposição de cada fiada faz sombra. `pattern_scale` (1, 1): a peça inteira; `tiles` as telhas e as fiadas por
// unidade do padrão.

type Rgb = readonly [number, number, number];

/** As cores e o acabamento de um telhado. */
interface RoofValues {
    /** A telha, as mais claras, as mais escuras (a queima, o lote), as manchas e o líquen. */
    readonly color: Rgb;
    readonly pale: Rgb;
    readonly dark: Rgb;
    readonly stain: Rgb;
    readonly lichen: Rgb;
    /** A cobertura das manchas e do líquen (0 a 1), a variação do tom do grão (± a fração) e a rugosidade. */
    readonly stains: number;
    readonly cover: number;
    readonly grain: number;
    readonly roughness: number;
    /** A altura (mm, abaixo do topo) em que a cor cai para o fundo — o canal sujo, o vão. */
    readonly cavity: number;
    readonly seed: number;
}

/**
 * Sub-grafo de um telhado: cada telha com o seu tom (da clara à escura), o grão da face, as manchas escuras que
 * escorrem para o pé de cada fiada, o líquen em manchas nas faces e a cor caindo no fundo do relevo — o de
 * `reliefNode`, em milímetros, na normal.
 */
function roofOf(
    name: string,
    reliefNode: NodeDefinition,
    courses: typeof ROOF_TILES,
    face: typeof ROOF_CLAY,
    v: RoofValues,
): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                tile: math.value2.with({ value: [1, 1] }),
                tiles: math.value2.with({ value: [...courses.scale] }),
                courses: pattern.shingles.with(courses),
                face: pattern.grain.with(face),
                weather: pattern.grain.with({
                    scale: [3, 5],
                    octaves: 4,
                    gain: 0.55,
                    seed: v.seed,
                }),
                growth: pattern.grain.with({
                    scale: [8, 8],
                    octaves: 4,
                    gain: 0.6,
                    seed: v.seed + 1,
                }),
                base: math.value3.with({ value: [...v.color] }),
                pale: math.value3.with({ value: [...v.pale] }),
                dark: math.value3.with({ value: [...v.dark] }),
                soot: math.value3.with({ value: [...v.stain] }),
                green: math.value3.with({ value: [...v.lichen] }),
                // O tom de cada telha: a metade de cima dos valores clareia, o quarto de baixo escurece.
                lighter: map.range.with({ in_min: 0.5, in_max: 1, out_min: 0, out_max: 0.85 }),
                darker: map.range.with({ in_min: 0.28, in_max: 0, out_min: 0, out_max: 0.9 }),
                fired_a: math.mix3,
                fired: math.mix3,
                speck: map.range.with({
                    in_min: -0.6,
                    in_max: 0.6,
                    out_min: 1 - v.grain,
                    out_max: 1 + v.grain,
                }),
                lit: math.scale3,
                // As manchas: mais fortes junto do pé da fiada (onde a água escorre e para).
                wet: map.range.with({ in_min: 0, in_max: 0.5, out_min: 0, out_max: v.stains }),
                foot: map.range.with({ in_min: 0, in_max: 0.7, out_min: 1, out_max: 0.4 }),
                stained_t: math.mul,
                stained: math.mix3,
                cover: math.value.with({ value: v.cover }),
                level: map.range.with({ out_min: 0.75, out_max: -0.25 }),
                patch_a: math.sub,
                patch: map.range.with({ in_min: 0, in_max: 0.2, out_min: 0, out_max: 0.85 }),
                grown: math.mix3,
                height: reliefNode,
                depth: math.split3,
                cavity: map.range.with({ in_min: 0, in_max: v.cavity, out_min: 0.3, out_max: 1 }),
                skin: math.scale3,
                body: bsdf.diffuse.with({ roughness: 0.9 }),
                specular: bsdf.dielectric.with({ ior: 1.5, roughness: v.roughness }),
                sum: closure.add,
                normal: surface.reliefNormal,
                out: closure.normal,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('courses', 'face', 'weather', 'growth'),
                ['tile.value', 'uv.scale'],
                ['tiles.value', 'courses.scale'],
                ['courses.tile', 'lighter.x'],
                ['courses.tile', 'darker.x'],
                ['base.value', 'fired_a.a'],
                ['pale.value', 'fired_a.b'],
                ['lighter.value', 'fired_a.t'],
                ['fired_a.value', 'fired.a'],
                ['dark.value', 'fired.b'],
                ['darker.value', 'fired.t'],
                ['face.value', 'speck.x'],
                ['fired.value', 'lit.v'],
                ['speck.value', 'lit.s'],
                ['weather.value', 'wet.x'],
                ['courses.along', 'foot.x'],
                ['wet.value', 'stained_t.a'],
                ['foot.value', 'stained_t.b'],
                ['lit.value', 'stained.a'],
                ['soot.value', 'stained.b'],
                ['stained_t.value', 'stained.t'],
                ['cover.value', 'level.x'],
                ['growth.value', 'patch_a.a'],
                ['level.value', 'patch_a.b'],
                ['patch_a.value', 'patch.x'],
                ['stained.value', 'grown.a'],
                ['green.value', 'grown.b'],
                ['patch.value', 'grown.t'],
                ['s.value', 'height.s'],
                ['tile.value', 'height.pattern_scale'],
                ['tiles.value', 'height.tiles'],
                ['height.value', 'depth.v'],
                ['depth.x', 'cavity.x'],
                ['grown.value', 'skin.v'],
                ['cavity.value', 'skin.s'],
                ['skin.value', 'body.color'],
                ['specular.value', 'sum.a'],
                ['body.value', 'sum.b'],
                ['height.value', 'normal.relief'],
                ['sum.value', 'out.c'],
                ['normal.value', 'out.normal'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['base.value', 'color'],
                ['pale.value', 'pale_color'],
                ['dark.value', 'dark_color'],
                ['soot.value', 'stain_color'],
                ['green.value', 'lichen_color'],
                ['cover.value', 'lichen'],
                ['specular.roughness', 'roughness'],
                ['height.lift', 'lift'],
                ['height.face_height', 'face_height'],
                ['tiles.value', 'tiles'],
                ['normal.scale', 'scale'],
                ['tile.value', 'pattern_scale'],
            ],
        },
    );
}

/**
 * `material.roofTile` — telhado de telha de barro de capa e canal: fiadas de telhas curvas sobrepostas
 * (`pattern.shingles` com o perfil da capa convexa e do canal côncavo; `tiles`, 14 colunas por 9 fiadas por unidade do
 * padrão, negativo em y: o pé para o lado de v maior), terracota (`color`) com a variação da queima de telha para
 * telha — das mal queimadas, claras (`pale_color`), às requeimadas, escuras (`dark_color`) —, o grão do barro, as
 * manchas escuras de fuligem e umidade que juntam no pé de cada fiada (`stain_color`), o líquen em manchas
 * (`lichen_color`; `lichen` a cobertura, 0,28) e o fundo dos canais mais escuro; fosca (rugosidade 0,75). O relevo é o
 * de `relief.roofTile`, em milímetros (`lift`, 18: do fundo do canal ao topo da capa; `face_height`, 0,7), com `scale`
 * unidades do mundo por metro, na normal; com `Displacements.roofTile()` na entidade de uma `ParametricSurface`, na
 * geometria — a sobreposição de cada fiada faz sombra. Parâmetros: `color`, `pale_color`, `dark_color`,
 * `stain_color`, `lichen_color`, `lichen`, `roughness`, `lift`, `face_height`, `tiles`, `scale`, `pattern_scale`.
 */
export const roofTile = roofOf('material.roofTile', relief.roofTile, ROOF_TILES, ROOF_CLAY, {
    color: [0.4, 0.135, 0.06],
    pale: [0.54, 0.25, 0.12],
    dark: [0.19, 0.07, 0.04],
    stain: [0.045, 0.038, 0.034],
    lichen: [0.46, 0.47, 0.3],
    stains: 0.8,
    cover: 0.28,
    grain: 0.1,
    roughness: 0.75,
    cavity: 9,
    seed: 123,
});

/**
 * `material.roofSlate` — telhado de ardósia: placas planas em fiadas desencontradas, cada uma deitada sobre a de
 * baixo, com o pé recuado ao acaso e o vão entre duas (`pattern.shingles`; `tiles`, 9 por 12 por unidade do padrão) —
 * cinza-azulada (`color`), umas placas mais claras (`pale_color`) e outras arroxeadas (`dark_color`), a clivagem da
 * pedra na face, as manchas de umidade no pé de cada fiada (`stain_color`) e pouco líquen (`lichen`, 0,1); a ardósia
 * tem um brilho acetinado (rugosidade 0,45). O relevo é o de `relief.roofSlate`, em milímetros (`lift`, 9;
 * `face_height`, 0,9), na normal; com `Displacements.roofSlate()`, na geometria. Parâmetros: os de `roofTile`.
 */
export const roofSlate = roofOf(
    'material.roofSlate',
    relief.roofSlate,
    ROOF_SLATES,
    ROOF_CLEAVAGE,
    {
        color: [0.105, 0.115, 0.135],
        pale: [0.2, 0.215, 0.235],
        dark: [0.1, 0.08, 0.1],
        stain: [0.03, 0.03, 0.035],
        lichen: [0.42, 0.44, 0.32],
        stains: 0.5,
        cover: 0.1,
        grain: 0.16,
        roughness: 0.45,
        cavity: 4,
        seed: 133,
    },
);
