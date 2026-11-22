import { NodeGraph } from '../../../scene/graph/NodeGraph';
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
import {
    BARK_OAK,
    BARK_PINE,
    LEAF_DRY,
    LEAF_GREEN,
    LEAF_MATTE,
    leafPads,
    leafVeins,
    relief,
    type BarkPatterns,
    type LeafPatterns,
} from './relief';

// Plantas (spec 011, T118): as cascas grossas (carvalho e pinheiro), a folha (verde e seca) e a rolha de cortiça
// natural. A estrutura é calculada por pixel pelos nós de padrão sobre o uv (`pattern_scale` repetições por unidade de
// uv; numa esfera, (2, 1); nas cascas, (1, 1): o tronco inteiro).

type Rgb = readonly [number, number, number];

/** As cores de uma casca fissurada. */
interface BarkColors {
    /** A face das placas, as cristas gastas, o fundo das fissuras, a casca interna (a parede) e o líquen. */
    readonly color: Rgb;
    readonly ridge: Rgb;
    readonly furrow: Rgb;
    readonly inner: Rgb;
    readonly lichen: Rgb;
    /** A cobertura do líquen (0 a 1) e o quanto da parede da fissura mostra a casca interna. */
    readonly cover: number;
    readonly wall: number;
    /** A variação do tom (± a fração) de placa para placa e de escama para escama. */
    readonly plate: number;
    readonly scale: number;
    /** O quanto a borda de cada escama mostra a casca interna (a camada de baixo à vista). */
    readonly edge: number;
    readonly seed: number;
}

/**
 * Sub-grafo de uma casca fissurada: a cor das placas (cada placa e cada escama com o seu tom, as cristas gastas mais
 * claras), a casca interna na parede das fissuras, o líquen nas faces, e a cor caindo para o fundo com a fundura do
 * relevo — o de `reliefNode`, em milímetros, na normal.
 */
function fissured(
    name: string,
    reliefNode: NodeDefinition,
    v: BarkPatterns,
    c: BarkColors,
): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                plates: pattern.fissures.with(v.plates),
                scales: pattern.cells.with(v.scales),
                flakes: pattern.grain.with(v.flakes),
                moss: pattern.grain.with({ scale: [5, 4], octaves: 5, gain: 0.6, seed: c.seed }),
                grey: math.value3.with({ value: [...c.color] }),
                pale: math.value3.with({ value: [...c.ridge] }),
                furrow: math.value3.with({ value: [...c.furrow] }),
                inner: math.value3.with({ value: [...c.inner] }),
                green: math.value3.with({ value: [...c.lichen] }),
                raised: map.range.with({ in_min: -0.1, in_max: 0.6 }),
                face: math.mix3,
                plate_tone: map.range.with({ out_min: 1 - c.plate, out_max: 1 + c.plate }),
                scale_tone: map.range.with({ out_min: 1 - c.scale, out_max: 1 + c.scale }),
                tone: math.mul,
                face_lit: math.scale3,
                // A parede da fissura: onde a placa desce, a casca interna à vista.
                wall: map.range.with({ in_min: 0.3, in_max: 0.9, out_min: c.wall, out_max: 0 }),
                walled: math.mix3,
                // A borda das escamas: a camada de baixo, da cor da casca interna.
                rim: map.range.with({ in_min: 0, in_max: 0.7, out_min: c.edge, out_max: 0 }),
                rimmed: math.mix3,
                // O líquen: nas manchas em que o grão largo passa de um nível, só nas faces altas.
                cover: math.value.with({ value: c.cover }),
                level: map.range.with({ out_min: 0.75, out_max: -0.25 }),
                patch_a: math.sub,
                patch: map.range.with({ in_min: 0, in_max: 0.25, out_min: 0, out_max: 0.8 }),
                on_face: math.mul,
                mossy: math.mix3,
                tile: math.value2.with({ value: [1, 1] }),
                height: reliefNode,
                depth: math.split3,
                cavity: map.range.with({ in_min: -8, in_max: -0.5 }),
                skin: math.mix3,
                body: bsdf.diffuse.with({ roughness: 1 }),
                specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.95 }),
                sum: closure.add,
                normal: surface.reliefNormal,
                out: closure.normal,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('plates', 'scales', 'flakes', 'moss'),
                ['tile.value', 'uv.scale'],
                ['flakes.value', 'raised.x'],
                ['grey.value', 'face.a'],
                ['pale.value', 'face.b'],
                ['raised.value', 'face.t'],
                ['plates.plate', 'plate_tone.x'],
                ['scales.cell', 'scale_tone.x'],
                ['plate_tone.value', 'tone.a'],
                ['scale_tone.value', 'tone.b'],
                ['face.value', 'face_lit.v'],
                ['tone.value', 'face_lit.s'],
                ['plates.height', 'wall.x'],
                ['face_lit.value', 'walled.a'],
                ['inner.value', 'walled.b'],
                ['wall.value', 'walled.t'],
                ['cover.value', 'level.x'],
                ['moss.value', 'patch_a.a'],
                ['level.value', 'patch_a.b'],
                ['patch_a.value', 'patch.x'],
                ['patch.value', 'on_face.a'],
                ['plates.height', 'on_face.b'],
                ['scales.height', 'rim.x'],
                ['walled.value', 'rimmed.a'],
                ['inner.value', 'rimmed.b'],
                ['rim.value', 'rimmed.t'],
                ['rimmed.value', 'mossy.a'],
                ['green.value', 'mossy.b'],
                ['on_face.value', 'mossy.t'],
                ['s.value', 'height.s'],
                ['tile.value', 'height.pattern_scale'],
                ['height.value', 'depth.v'],
                ['depth.x', 'cavity.x'],
                ['furrow.value', 'skin.a'],
                ['mossy.value', 'skin.b'],
                ['cavity.value', 'skin.t'],
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
                ['grey.value', 'color'],
                ['pale.value', 'ridge_color'],
                ['furrow.value', 'furrow_color'],
                ['inner.value', 'inner_color'],
                ['green.value', 'lichen_color'],
                ['cover.value', 'lichen'],
                ['specular.roughness', 'roughness'],
                ['height.furrow_depth', 'furrow_depth'],
                ['height.ridge_height', 'ridge_height'],
                ['height.scale_height', 'scale_height'],
                ['normal.scale', 'scale'],
                ['tile.value', 'pattern_scale'],
            ],
        },
    );
}

/**
 * `material.bark` — casca de carvalho, grossa e fissurada: placas compridas ao longo de v (o eixo do tronco), de face
 * escamosa, castanho-acinzentadas (`color`), cada placa de um tom (± 30 %) e cada escama do seu (± 20 %), mais
 * claras nas cristas gastas (`ridge_color`), separadas por fissuras fundas que se ramificam e se juntam e cortadas em
 * blocos por quebras em volta do tronco; na parede da fissura aparece a casca interna, castanho-avermelhada
 * (`inner_color`), e o fundo é escuro (`furrow_color`: a cor cai com a fundura); o líquen em manchas largas e ralas
 * (`lichen_color`, cinza-esverdeado, só nas faces; `lichen` a cobertura, 0,24); fosca (rugosidade 0,95). O relevo é o
 * de `relief.bark`, em milímetros e em várias escalas — as fissuras (`furrow_depth`, 16), as cristas (`ridge_height`,
 * 3,4) e as escamas em degraus (`scale_height`, 2,8), com `scale` unidades do mundo por metro —, na normal; com
 * `Displacements.bark()` na entidade de uma `ParametricSurface`, na geometria (a silhueta irregular, a sombra dentro
 * das fissuras e entre as escamas). Parâmetros: `color`, `ridge_color`, `furrow_color`, `inner_color`,
 * `lichen_color`, `lichen`, `roughness`, `furrow_depth`, `ridge_height`, `scale_height`, `scale`, `pattern_scale`.
 */
export const bark = fissured('material.bark', relief.bark, BARK_OAK, {
    color: [0.115, 0.088, 0.066],
    ridge: [0.27, 0.235, 0.195],
    furrow: [0.018, 0.011, 0.008],
    inner: [0.15, 0.065, 0.03],
    lichen: [0.36, 0.42, 0.3],
    cover: 0.24,
    wall: 0.75,
    plate: 0.3,
    scale: 0.2,
    edge: 0.25,
    seed: 94,
});

/**
 * `material.barkPine` — casca de pinheiro: placas largas e chatas, castanhas (`color`), cobertas de escamas finas em
 * camadas — cada escama de um tom (± 30 %), a superfície gasta cinza-rosada (`ridge_color`), a borda de cada escama
 * da cor da camada de baixo, avermelhada —,
 * separadas por fissuras estreitas e fundas, de parede avermelhada (`inner_color`) e fundo escuro (`furrow_color`);
 * pouco líquen (`lichen`, 0,08). O relevo é o de `relief.barkPine`, em milímetros, na normal; com
 * `Displacements.barkPine()` na entidade de uma `ParametricSurface`, na geometria. Parâmetros: os de `bark`.
 */
export const barkPine = fissured('material.barkPine', relief.barkPine, BARK_PINE, {
    color: [0.2, 0.12, 0.075],
    ridge: [0.33, 0.27, 0.235],
    furrow: [0.025, 0.011, 0.007],
    inner: [0.25, 0.085, 0.032],
    lichen: [0.4, 0.44, 0.34],
    cover: 0.08,
    wall: 0.85,
    plate: 0.24,
    scale: 0.3,
    edge: 0.4,
    seed: 116,
});

/** Valores de uma folha. */
interface LeafValues {
    /** O limbo, a margem (e as manchas largas), as nervuras, as pintas e a luz que atravessa. */
    readonly color: Rgb;
    readonly edge: Rgb;
    readonly vein: Rgb;
    readonly spot: Rgb;
    readonly through: Rgb;
    /** A fração da luz de trás que atravessa, a cobertura da margem e das pintas. */
    readonly translucency: number;
    readonly margin: number;
    readonly spots: number;
    /**
     * A rugosidade da cutícula no meio das almofadas do limbo e a das nervuras e vênulas; o quanto ela sobe nas
     * manchas foscas e na margem.
     */
    readonly roughness: number;
    readonly vein_roughness: number;
    readonly dull: number;
    /** A penugem (o brilho de fibra dos tricomas), nas folhas que a têm: a cor e a rugosidade. */
    readonly down?: { readonly color: Rgb; readonly roughness: number };
}

/**
 * Sub-grafo de uma folha: o limbo com as nervuras (`pattern.veins`: a central ao longo de u, as secundárias e a rede
 * de vênulas) na cor e em relevo — o de `reliefNode`, em milímetros: as nervuras, as almofadas do limbo entre as
 * vênulas e a ondulação da lâmina, na normal —, de parede fina — a luz de trás atravessa espalhada
 * (`bsdf.translucent`), menos nas nervuras, mais grossas —, sob a cutícula (um dielétrico de cera) de rugosidade
 * variável: lisa no meio das almofadas, fosca nas vênulas, nas nervuras, na margem e em manchas largas — o realce
 * aparece em pedaços, um por almofada inclinada para a luz, cortado pelas nervuras.
 */
function leafOf(
    name: string,
    reliefNode: NodeDefinition,
    p: LeafPatterns,
    v: LeafValues,
): NodeDefinition {
    const downy = v.down !== undefined;
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                veins: pattern.veins.with(leafVeins(p)),
                pad: pattern.cells.with(leafPads(p)),
                mottle: pattern.grain.with({
                    scale: [3, 3],
                    octaves: 4,
                    gain: 0.55,
                    seed: p.seed + 1,
                }),
                speck: pattern.grain.with({ scale: [13, 13], octaves: 3, seed: p.seed + 2 }),
                skin: pattern.grain.with({ scale: [170, 170], octaves: 2, seed: p.seed + 3 }),
                bloom: pattern.grain.with({
                    scale: [4.5, 4.5],
                    octaves: 3,
                    gain: 0.6,
                    seed: p.seed + 5,
                }),
                green: math.value3.with({ value: [...v.color] }),
                yellow: math.value3.with({ value: [...v.edge] }),
                rib: math.value3.with({ value: [...v.vein] }),
                brown: math.value3.with({ value: [...v.spot] }),
                light: math.value3.with({ value: [...v.through] }),
                // O limbo: cada aréola com o seu tom (± 9 %) e as manchas largas (± 18 %).
                areole: map.range.with({ out_min: 0.91, out_max: 1.09 }),
                blotch: map.range.with({
                    in_min: -0.6,
                    in_max: 0.6,
                    out_min: 0.82,
                    out_max: 1.18,
                }),
                shade: math.mul,
                limb: math.scale3,
                // A margem: a cor muda da metade da lâmina até a borda, em manchas.
                border: map.range.with({ in_min: 0.45, in_max: 1, out_min: 0, out_max: v.margin }),
                ragged: map.range.with({ in_min: -0.5, in_max: 0.4, out_min: 0.25, out_max: 1 }),
                margin: math.mul,
                edged: math.mix3,
                spot: map.range.with({ in_min: 0.42, in_max: 0.56, out_min: 0, out_max: v.spots }),
                spotted: math.mix3,
                // As nervuras mais claras: a central e as secundárias cheias, a rede de vênulas só de leve.
                ribbed: map.range.with({ out_min: 0, out_max: 0.42 }),
                netted: map.range.with({ out_min: 0, out_max: 0.3 }),
                paler: math.add,
                veined: math.mix3,
                body: bsdf.diffuse.with({ roughness: 0.5 }),
                // A luz que atravessa: a cor do limbo contra a luz, mais escura nas nervuras (mais grossas).
                thick: map.range.with({ out_min: 1, out_max: 0.3 }),
                lit: math.scale3,
                through: bsdf.translucent,
                mixed: closure.mix.with({ t: v.translucency }),
                // A cutícula: lisa no meio da almofada, fosca na vênula; mais fosca nas manchas e na margem.
                gloss: map.range.with({
                    in_min: 0,
                    in_max: 0.4,
                    out_min: v.vein_roughness,
                    out_max: v.roughness,
                }),
                patchy: map.range.with({
                    in_min: -0.05,
                    in_max: 0.45,
                    out_min: 0,
                    out_max: v.dull,
                }),
                worn: map.range.with({ in_min: 0.55, in_max: 1, out_min: 0, out_max: v.dull }),
                rough_a: math.add,
                rough_b: math.add,
                rough: math.clamp,
                cuticle: bsdf.dielectric.with({ ior: 1.45 }),
                sum: closure.add,
                ...(v.down !== undefined
                    ? {
                          down: bsdf.sheen.with({
                              color: [...v.down.color],
                              roughness: v.down.roughness,
                          }),
                          coated: closure.add,
                      }
                    : {}),
                tile: math.value2.with({ value: [1, 1] }),
                height: reliefNode,
                normal: surface.reliefNormal,
                fine_relief: surface.bump.with({ strength: 0.0003 }),
                out: closure.normal,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('veins', 'pad', 'mottle', 'speck', 'skin', 'bloom'),
                ['tile.value', 'uv.scale'],
                ['veins.cell', 'areole.x'],
                ['mottle.value', 'blotch.x'],
                ['areole.value', 'shade.a'],
                ['blotch.value', 'shade.b'],
                ['green.value', 'limb.v'],
                ['shade.value', 'limb.s'],
                ['veins.across', 'border.x'],
                ['mottle.value', 'ragged.x'],
                ['border.value', 'margin.a'],
                ['ragged.value', 'margin.b'],
                ['limb.value', 'edged.a'],
                ['yellow.value', 'edged.b'],
                ['margin.value', 'edged.t'],
                ['speck.value', 'spot.x'],
                ['edged.value', 'spotted.a'],
                ['brown.value', 'spotted.b'],
                ['spot.value', 'spotted.t'],
                ['veins.main', 'ribbed.x'],
                ['veins.height', 'netted.x'],
                ['ribbed.value', 'paler.a'],
                ['netted.value', 'paler.b'],
                ['spotted.value', 'veined.a'],
                ['rib.value', 'veined.b'],
                ['paler.value', 'veined.t'],
                ['veined.value', 'body.color'],
                ['veins.height', 'thick.x'],
                ['light.value', 'lit.v'],
                ['thick.value', 'lit.s'],
                ['lit.value', 'through.color'],
                ['body.value', 'mixed.a'],
                ['through.value', 'mixed.b'],
                ['pad.height', 'gloss.x'],
                ['bloom.value', 'patchy.x'],
                ['veins.across', 'worn.x'],
                ['gloss.value', 'rough_a.a'],
                ['patchy.value', 'rough_a.b'],
                ['rough_a.value', 'rough_b.a'],
                ['worn.value', 'rough_b.b'],
                ['rough_b.value', 'rough.x'],
                ['rough.value', 'cuticle.roughness'],
                ['cuticle.value', 'sum.a'],
                ['mixed.value', 'sum.b'],
                ...(downy
                    ? ([
                          ['down.value', 'coated.a'],
                          ['sum.value', 'coated.b'],
                      ] as Link[])
                    : []),
                ['s.value', 'height.s'],
                ['tile.value', 'height.pattern_scale'],
                ['height.value', 'normal.relief'],
                ...bumpLinks('fine_relief', 'skin.gradient', 'normal.value'),
                [downy ? 'coated.value' : 'sum.value', 'out.c'],
                ['fine_relief.value', 'out.normal'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['green.value', 'color'],
                ['yellow.value', 'edge_color'],
                ['rib.value', 'vein_color'],
                ['brown.value', 'spot_color'],
                ['light.value', 'transmission_color'],
                ['mixed.t', 'translucency'],
                ['gloss.out_max', 'roughness'],
                ['gloss.out_min', 'vein_roughness'],
                ...(downy ? ([['down.color', 'down_color']] as const) : []),
                ['height.vein_height', 'vein_height'],
                ['height.bulge_height', 'bulge_height'],
                ['height.pad_height', 'pad_height'],
                ['height.wave_height', 'wave_height'],
                ['normal.scale', 'scale'],
                ['tile.value', 'pattern_scale'],
            ],
        },
    );
}

/**
 * `material.leaf` — folha verde cerosa (a face de cima; o cafeeiro, a magnólia, o louro): o limbo verde-escuro (`color`), cada
 * aréola com o seu tom e manchas largas, a margem amarelada em manchas (`edge_color`), umas pintas castanhas
 * (`spot_color`) e as nervuras mais claras e amareladas (`vein_color`) — a central ao longo de u, onze secundárias de
 * cada lado, alternadas e curvas para a ponta, e a rede fina das vênulas (`pattern.veins`: uma lâmina a cada duas
 * unidades do padrão ao longo de u). O relevo é o de `relief.leaf`, em milímetros — as nervuras afundadas
 * (`vein_height`, −0,35) num vale largo, com o limbo estufado entre duas secundárias (`bulge_height`, −0,9), o limbo
 * abaulado em almofadas entre as vênulas (`pad_height`, 0,18) e a ondulação da lâmina (`wave_height`, 1,2), com
 * `scale` unidades do mundo por metro —, na normal; com `Displacements.leaf()` na entidade de uma
 * `ParametricSurface`, na geometria. A cutícula é cera (IOR 1,45) de rugosidade variável: lisa no meio de cada
 * almofada (`roughness`, 0,2), fosca nas vênulas e nas nervuras (`vein_roughness`, 0,45), mais fosca em manchas
 * largas e na margem (até + 0,3). Cada trecho do limbo tem a sua inclinação: o realce não é um só — aparece em
 * pedaços, entre as nervuras, nas almofadas alinhadas com a luz, e muda de lugar com o ângulo. A folha é uma parede
 * fina: `translucency` (0,42) da luz de trás atravessa espalhada, verde-amarelada (`transmission_color`), menos nas
 * nervuras, mais grossas — contra a luz, o limbo acende e as nervuras ficam escuras. Parâmetros: `color`,
 * `edge_color`, `vein_color`, `spot_color`, `transmission_color`, `translucency`, `roughness`, `vein_roughness`,
 * `vein_height`, `bulge_height`, `pad_height`, `wave_height`, `scale`, `pattern_scale`.
 */
export const leaf = leafOf('material.leaf', relief.leaf, LEAF_GREEN, {
    color: [0.05, 0.15, 0.025],
    edge: [0.34, 0.36, 0.06],
    vein: [0.36, 0.44, 0.13],
    spot: [0.2, 0.12, 0.04],
    through: [0.45, 0.62, 0.08],
    translucency: 0.42,
    margin: 0.75,
    spots: 0.5,
    roughness: 0.2,
    vein_roughness: 0.45,
    dull: 0.3,
});

/**
 * `material.leafMatte` — folha fosca (sálvia, a folha do carvalho, a face de baixo de muitas): verde-acinzentada
 * (`color`), sem realce especular — a cutícula é áspera no limbo todo (`roughness`, 0,82; `vein_roughness`, 0,9) —,
 * com a penugem leve dos tricomas (`down_color`: o brilho de fibra de `bsdf.sheen`, que clareia a folha no rasante). O
 * limbo é empolado: almofadas miúdas e altas entre as vênulas (`relief.leafMatte`: `pad_height`, 0,15 mm), as
 * nervuras afundadas e claras. Deixa passar menos luz (`translucency`, 0,3). Parâmetros: os de `leaf` e `down_color`.
 */
export const leafMatte = leafOf('material.leafMatte', relief.leafMatte, LEAF_MATTE, {
    color: [0.085, 0.14, 0.065],
    edge: [0.16, 0.2, 0.09],
    vein: [0.26, 0.32, 0.18],
    spot: [0.16, 0.14, 0.07],
    through: [0.4, 0.55, 0.14],
    translucency: 0.3,
    margin: 0.5,
    spots: 0.25,
    roughness: 0.82,
    vein_roughness: 0.9,
    dull: 0.1,
    down: { color: [0.14, 0.16, 0.14], roughness: 0.55 },
});

/**
 * `material.leafDry` — folha seca de outono: castanho-alaranjada (`color`), a margem mais escura e queimada
 * (`edge_color`), muitas pintas (`spot_color`), as nervuras claras e salientes (a lâmina encolheu entre elas:
 * `relief.leafDry`, `vein_height` 0,45 mm), a lâmina amassada (`wave_height`, 1,5 mm) e fosca (rugosidade 0,6); ainda
 * deixa passar a luz, alaranjada (`translucency`, 0,3). Parâmetros: os de `leaf`.
 */
export const leafDry = leafOf('material.leafDry', relief.leafDry, LEAF_DRY, {
    color: [0.36, 0.16, 0.045],
    edge: [0.16, 0.07, 0.025],
    vein: [0.5, 0.33, 0.14],
    spot: [0.1, 0.045, 0.02],
    through: [0.7, 0.3, 0.05],
    translucency: 0.3,
    margin: 0.85,
    spots: 0.75,
    roughness: 0.6,
    vein_roughness: 0.75,
    dull: 0.15,
});

/**
 * `material.corkStopper` — cortiça natural (a rolha de vinho): castanho-clara (`color`), em faixas largas mais escuras
 * (`dark_color`: as camadas de crescimento da casca do sobreiro), com as lenticelas — os canais escuros, alongados ao
 * longo de u, de borda irregular (`lenticel_color`; as faixas onde um grão alongado de três oitavas passa de um nível),
 * afundados (`relief`, a altura em unidades do padrão) —, as cavidades pequenas (uma célula em sete de
 * `pattern.dents`: a calota côncava, escura no fundo) e a textura granulada das células da cortiça
 * (`pattern.cells`: 110 por unidade do padrão, cada uma com o seu tom); fosca e macia (difuso áspero, interface de
 * suberina, IOR 1,5, rugosidade 0,9). Parâmetros: `color`, `dark_color`, `lenticel_color`, `roughness`, `relief`,
 * `pattern_scale`.
 */
export const corkStopper = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            cell: pattern.cells.with({ scale: 110, jitter: 1, crease: 0.5, seed: 271 }),
            lenticel: pattern.grain.with({ scale: [5, 46], octaves: 3, gain: 0.6, seed: 272 }),
            // 1 na face, 0 dentro do canal (o grão acima do nível).
            open: pattern.threshold.with({ low: 0.38, high: 0.28 }),
            pit: pattern.dents.with({ scale: 64, jitter: 1, seed: 273 }),
            layer: pattern.grain.with({ scale: [0.5, 5], octaves: 3, gain: 0.5, seed: 274 }),
            tan: math.value3.with({ value: [0.55, 0.39, 0.23] }),
            dark: math.value3.with({ value: [0.4, 0.26, 0.14] }),
            hole: math.value3.with({ value: [0.11, 0.06, 0.03] }),
            banded: map.range.with({ in_min: -0.5, in_max: 0.5 }),
            tone: math.mix3,
            speck: map.range.with({ out_min: 0.8, out_max: 1.16 }),
            wall: map.range.with({ out_min: 0.72, out_max: 1 }),
            shade: math.mul,
            lit: math.scale3,
            channel: map.range.with({ out_min: 0.9, out_max: 0 }),
            pored: math.mix3,
            // As cavidades: uma mossa em cinco, escura no fundo (a altura da mossa é 0 no ponto dela).
            some: map.range.with({ in_min: 0.86, in_max: 0.87 }),
            bottom: map.range.with({ in_min: 0.03, in_max: 0.3, out_min: 0.9, out_max: 0 }),
            cavity: math.mul,
            pitted: math.mix3,
            dig: map.range.with({ out_min: 0, out_max: 0.006 }),
            channel_relief: surface.bump.with({ strength: 0.0035 }),
            pit_relief: surface.bump,
            relief: surface.bump.with({ strength: 0.0012 }),
            body: bsdf.diffuse.with({ roughness: 1 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.9 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('cell', 'lenticel', 'pit', 'layer'),
            ['lenticel.value', 'open.value'],
            ['lenticel.gradient', 'open.gradient'],
            ['layer.value', 'banded.x'],
            ['tan.value', 'tone.a'],
            ['dark.value', 'tone.b'],
            ['banded.value', 'tone.t'],
            ['cell.cell', 'speck.x'],
            ['cell.height', 'wall.x'],
            ['speck.value', 'shade.a'],
            ['wall.value', 'shade.b'],
            ['tone.value', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['open.value', 'channel.x'],
            ['lit.value', 'pored.a'],
            ['hole.value', 'pored.b'],
            ['channel.value', 'pored.t'],
            ['pit.cell', 'some.x'],
            ['pit.height', 'bottom.x'],
            ['some.value', 'cavity.a'],
            ['bottom.value', 'cavity.b'],
            ['pored.value', 'pitted.a'],
            ['hole.value', 'pitted.b'],
            ['cavity.value', 'pitted.t'],
            ['pitted.value', 'body.color'],
            ['some.value', 'dig.x'],
            ...bumpLinks('channel_relief', 'open.gradient'),
            ...bumpLinks('pit_relief', 'pit.gradient', 'channel_relief.value'),
            ['dig.value', 'pit_relief.strength'],
            ...bumpLinks('relief', 'cell.gradient', 'pit_relief.value'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.corkStopper',
        ...SAMPLE_INPUT,
        expose: [
            ['tan.value', 'color'],
            ['dark.value', 'dark_color'],
            ['hole.value', 'lenticel_color'],
            ['specular.roughness', 'roughness'],
            ['channel_relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);
