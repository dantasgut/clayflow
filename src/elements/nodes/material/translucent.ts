import { graphArgument, NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { input } from '../input';
import { surface } from '../surface';
import { closure } from '../closure';
import { color } from '../color';
import { map } from '../map';
import { math } from '../math';
import { pattern } from '../pattern';
import { PATTERN_SCALE, patternLinks, patternSpace, SAMPLE_INPUT, SPACE_LINKS } from './pattern';

// Materiais em que a luz entra no corpo (spec 011, R11): o vidro (transmissão com refração) e os de subsuperfície
// (pele, cera, mármore, porcelana, jade, leite) — um especular de dielétrico sobre `bsdf.subsurface`. A subsuperfície
// segue o perfil de difusão de Christensen e Burley 2015 ("Approximate Reflectance Profiles for Efficient Subsurface
// Scattering"): `color` é o albedo da superfície (a refletância difusa total R_d) e `radius` o caminho livre médio do
// espalhamento por canal em milímetros, ℓ = 1/(σ_s′ + σ_a), com os coeficientes medidos por Jensen et al. 2001 ("A
// Practical Model for Subsurface Light Transport", tabela 2) onde há medida — a pele, o mármore e o leite; a cera, a
// porcelana e o jade são estimados (sem medida tabelada). `scale` é a escala do mundo em unidades por metro (1: uma
// unidade é um metro): o raio em mm só aparece quando o objeto tem poucos centímetros na cena.

/** Valores de um material de subsuperfície. */
interface SubsurfaceValues {
    /** Albedo da superfície (R_d). */
    readonly color: readonly [number, number, number];
    /** Caminho livre médio por canal, em mm. */
    readonly radius: readonly [number, number, number];
    readonly roughness: number;
    readonly ior: number;
}

/** Sub-grafo de subsuperfície: `bsdf.dielectric` somado a `bsdf.subsurface` (`closure.add`). */
function scattering(name: string, v: SubsurfaceValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                body: bsdf.subsurface.with({ color: [...v.color], radius: [...v.radius] }),
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
                ['body.radius', 'radius'],
                ['body.scale', 'scale'],
                ['specular.roughness', 'roughness'],
                ['specular.ior', 'ior'],
            ],
        },
    );
}

/**
 * `material.skin` — pele clara: IOR 1,4 (epiderme; a faixa dos tecidos moles, 1,36–1,45), rugosidade 0,45; albedo
 * (0,63, 0,44, 0,34) e caminho livre médio (0,91, 0,60, 0,52) mm — a "skin2" de Jensen et al. 2001 (σ_s′ 1,09, 1,59,
 * 1,79 e σ_a 0,013, 0,070, 0,145 /mm): o vermelho espalha mais longe (o perfil dele decai em 0,66 e 2,0 mm; o do azul em
 * 0,22 e 0,67 mm) — o terminador avermelhado e a orelha acesa contra o sol. Parâmetros: `color`, `radius` (mm), `scale`
 * (unidades por metro), `roughness`, `ior`.
 */
export const skin = scattering('material.skin', {
    color: [0.63, 0.44, 0.34],
    radius: [0.91, 0.6, 0.52],
    roughness: 0.45,
    ior: 1.4,
});

/** Um grão maciço de frequência igual nos três eixos (os padrões da pele não têm direção). */
const skinGrain = (scale: number, octaves: number, seed: number) =>
    pattern.grain3.with({ scale: [scale, scale, scale], octaves, seed });

/**
 * `material.skinDetailed` — pele humana com o que se vê de perto. O corpo é subsuperfície, com `scale` unidades do
 * mundo por metro e `radius` (2,2; 1,1; 0,85) mm: o raio com que a cauda do perfil de Burley (3ℓ/s) iguala o
 * comprimento de difusão 1/σ_tr dos coeficientes da "skin2" de Jensen et al. 2001 (4,8; 1,7; 1,1 mm, com σ_tr =
 * √(3 σ_a σ_t′)) — o caminho livre médio 1/σ_t′ de `skin` (0,91; 0,60; 0,52) dá uma cauda de 2 mm no vermelho, curta
 * para a pele, que é em camadas (a derme com sangue espalha o vermelho bem mais longe que a epiderme). É uma
 * estimativa de uma camada só. O vermelho espalha mais longe: o terminador avermelhado, a orelha acesa na contraluz. A cor sai de dois
 * pigmentos: a melanina (`melanin` em [0, 1]: da pele clara `light_color` à escura `dark_color`), irregular em manchas
 * largas, e o sangue perto da superfície (`blood` em [0, 1]: a vermelhidão em manchas, que multiplica a cor por
 * `flush_color`); as sardas (`freckles` em [0, 1]) são pontos de melanina. O brilho são dois lobos da interface (IOR
 * 1,4): o largo da pele seca (`roughness`, 0,55) e o estreito da película de óleo (`oil_roughness`, 0,3), misturados
 * por `oil` em [0, 1] — a mistura varia em manchas: a pele brilha por partes. O relevo, em milímetros: os poros e as
 * linhas finas (`pore_height`, 0,12) e a irregularidade larga (`fold_height`, 0,08), na normal. Os padrões são maciços
 * (a posição no objeto, `pattern_scale` unidades do padrão por unidade do objeto): não dependem do uv da malha, sem
 * emenda. Sem medida publicada para as proporções de cor: `light_color`, `dark_color` e `flush_color` são estimados.
 * A cor varia também no fino: os capilares mancham a vermelhidão na escala de milímetros e um amarelado desigual
 * cobre o resto; e o brilho do óleo some dentro dos poros (as cavidades do relevo), quebrando o realce em pontos.
 * A penugem é um lobo de fibra fraco (`fuzz_color`): o brilho rasante no contorno. Três entradas por região, para
 * quem monta o rosto (sem ligação valem 1): `blood_mask` multiplica a vermelhidão (as bochechas, o nariz, as
 * orelhas), `oil_mask` o brilho do óleo (a testa, o nariz, os lábios) e `tint` a cor (os lábios).
 * Parâmetros: `melanin`, `blood`, `freckles`, `oil`, `fuzz_color`, `light_color`, `dark_color`, `flush_color`, `radius`,
 * `roughness`, `oil_roughness`, `ior`, `pore_height`, `fold_height`, `scale`, `pattern_scale`.
 */
export const skinDetailed = Subgraph.point(
    new NodeGraph({
        nodes: {
            s: input.surfaceSample(),
            // As entradas por região (sem ligação: 1): o sangue, o óleo e a cor multiplicados no ponto.
            blood_mask: graphArgument('blood_mask'),
            oil_mask: graphArgument('oil_mask'),
            tint: graphArgument('tint'),
            solid: surface.solidSpace,
            tile: math.value.with({ value: 1 }),
            world: math.value.with({ value: 1 }),
            pore: skinGrain(220, 2, 71),
            fold: skinGrain(45, 2, 72),
            blotch: skinGrain(2.2, 3, 73),
            mottle: skinGrain(9, 2, 74),
            speck: skinGrain(60, 1, 75),
            sheen: skinGrain(5, 2, 76),
            // A variação fina: os capilares (o vermelho em manchas de milímetros) e o amarelado desigual.
            capillary: skinGrain(38, 3, 77),
            sallow: skinGrain(14, 2, 78),
            melanin: math.value.with({ value: 0.25 }),
            blood: math.value.with({ value: 0.5 }),
            freckles: math.value.with({ value: 0.25 }),
            oil: math.value.with({ value: 0.55 }),
            light: math.value3.with({ value: [0.72, 0.46, 0.34] }),
            dark: math.value3.with({ value: [0.2, 0.11, 0.065] }),
            flush: math.value3.with({ value: [1, 0.52, 0.5] }),
            // A melanina em manchas largas: ± 7 % em volta do valor.
            uneven: map.range.with({ in_min: -0.5, in_max: 0.5, out_min: 0.93, out_max: 1.07 }),
            pigment: math.mul,
            base: math.mix3,
            // O sangue: a vermelhidão onde o grão largo passa do nível, até 70 % com `blood` 1.
            rosy: map.range.with({ in_min: -0.25, in_max: 0.45, out_min: 0, out_max: 0.7 }),
            rosy_amount: math.mul,
            fine: map.range.with({ in_min: -0.35, in_max: 0.35, out_min: 0.72, out_max: 1.28 }),
            rosy_fine: math.mul,
            rosy_region: math.mul,
            rosy_bound: math.clamp,
            reddened: math.mul3,
            flushed: math.mix3,
            // As sardas: pontos onde o grão médio passa do nível, mais escuros.
            spot: map.range.with({ in_min: 0.3, in_max: 0.42, out_min: 0, out_max: 0.55 }),
            spot_amount: math.mul,
            spot_color: math.value3.with({ value: [0.6, 0.42, 0.3] }),
            spotted: math.mul3,
            toned: math.mix3,
            yellow: math.value3.with({ value: [1, 0.92, 0.74] }),
            yellowed: math.mul3,
            yellow_amount: map.range.with({ in_min: -0.3, in_max: 0.4, out_min: 0, out_max: 0.4 }),
            uneven_tone: math.mix3,
            tinted: math.mul3,
            body: bsdf.subsurface.with({ radius: [2.2, 1.1, 0.85] }),
            dry: bsdf.dielectric.with({ ior: 1.4, roughness: 0.55 }),
            oily: bsdf.dielectric.with({ ior: 1.4, roughness: 0.26 }),
            // O óleo por partes: de 0,4 a 1,6 vez o valor, em manchas.
            slick: map.range.with({ in_min: -0.4, in_max: 0.4, out_min: 0.4, out_max: 1.6 }),
            slick_amount: math.mul,
            slick_region: math.mul,
            // O poro é uma cavidade: o brilho do óleo some dentro dele (a face do fundo não reflete para quem vê).
            cavity: map.range.with({ in_min: -0.12, in_max: -0.45, out_min: 1, out_max: 0.15 }),
            slick_open: math.mul,
            slick_bound: math.clamp,
            specular: closure.mix,
            sum: closure.add,
            // A penugem: o brilho rasante das fibras finas no contorno.
            fuzz: bsdf.sheen.with({ color: [0.05, 0.045, 0.04], roughness: 0.5 }),
            soft: closure.add,
            pore_relief: surface.solidRelief.with({ height: 0.12 }),
            fold_relief: surface.solidRelief.with({ height: 0.08 }),
            height: math.add3,
            normal: surface.reliefNormal,
            out: closure.normal,
        },
        links: [
            ['s.object_position', 'solid.position'],
            ['s.dodu', 'solid.dodu'],
            ['s.dodv', 'solid.dodv'],
            ['s.duvdx', 'solid.duvdx'],
            ['s.duvdy', 'solid.duvdy'],
            ['s.footprint', 'solid.footprint'],
            ['tile.value', 'solid.scale'],
            ...[
                'pore',
                'fold',
                'blotch',
                'mottle',
                'speck',
                'sheen',
                'capillary',
                'sallow',
            ].flatMap((id): [string, string][] => [
                ['solid.p', `${id}.p`],
                ['solid.width', `${id}.width`],
            ]),
            ['mottle.value', 'uneven.x'],
            ['melanin.value', 'pigment.a'],
            ['uneven.value', 'pigment.b'],
            ['light.value', 'base.a'],
            ['dark.value', 'base.b'],
            ['pigment.value', 'base.t'],
            ['blotch.value', 'rosy.x'],
            ['rosy.value', 'rosy_amount.a'],
            ['blood.value', 'rosy_amount.b'],
            ['base.value', 'reddened.a'],
            ['flush.value', 'reddened.b'],
            ['capillary.value', 'fine.x'],
            ['rosy_amount.value', 'rosy_fine.a'],
            ['fine.value', 'rosy_fine.b'],
            ['rosy_fine.value', 'rosy_region.a'],
            ['blood_mask.value', 'rosy_region.b'],
            ['rosy_region.value', 'rosy_bound.x'],
            ['base.value', 'flushed.a'],
            ['reddened.value', 'flushed.b'],
            ['rosy_bound.value', 'flushed.t'],
            ['speck.value', 'spot.x'],
            ['spot.value', 'spot_amount.a'],
            ['freckles.value', 'spot_amount.b'],
            ['flushed.value', 'spotted.a'],
            ['spot_color.value', 'spotted.b'],
            ['flushed.value', 'toned.a'],
            ['spotted.value', 'toned.b'],
            ['spot_amount.value', 'toned.t'],
            ['sallow.value', 'yellow_amount.x'],
            ['toned.value', 'yellowed.a'],
            ['yellow.value', 'yellowed.b'],
            ['toned.value', 'uneven_tone.a'],
            ['yellowed.value', 'uneven_tone.b'],
            ['yellow_amount.value', 'uneven_tone.t'],
            ['uneven_tone.value', 'tinted.a'],
            ['tint.value', 'tinted.b'],
            ['tinted.value', 'body.color'],
            ['world.value', 'body.scale'],
            ['sheen.value', 'slick.x'],
            ['slick.value', 'slick_amount.a'],
            ['oil.value', 'slick_amount.b'],
            ['dry.value', 'specular.a'],
            ['oily.value', 'specular.b'],
            ['slick_amount.value', 'slick_region.a'],
            ['oil_mask.value', 'slick_region.b'],
            ['pore.value', 'cavity.x'],
            ['slick_region.value', 'slick_open.a'],
            ['cavity.value', 'slick_open.b'],
            ['slick_open.value', 'slick_bound.x'],
            ['slick_bound.value', 'specular.t'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['pore.value', 'pore_relief.value'],
            ['pore.gradient', 'pore_relief.gradient'],
            ['solid.du', 'pore_relief.du'],
            ['solid.dv', 'pore_relief.dv'],
            ['fold.value', 'fold_relief.value'],
            ['fold.gradient', 'fold_relief.gradient'],
            ['solid.du', 'fold_relief.du'],
            ['solid.dv', 'fold_relief.dv'],
            ['pore_relief.value', 'height.a'],
            ['fold_relief.value', 'height.b'],
            ['height.value', 'normal.relief'],
            ['world.value', 'normal.scale'],
            ['sum.value', 'soft.a'],
            ['fuzz.value', 'soft.b'],
            ['soft.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.skinDetailed',
        inputs: { s: 'SurfaceSample', blood_mask: 'f32', oil_mask: 'f32', tint: 'vec3f' },
        defaults: { s: 's', blood_mask: '1.0', oil_mask: '1.0', tint: 'vec3f(1.0)' },
        expose: [
            ['melanin.value', 'melanin'],
            ['blood.value', 'blood'],
            ['freckles.value', 'freckles'],
            ['oil.value', 'oil'],
            ['light.value', 'light_color'],
            ['dark.value', 'dark_color'],
            ['flush.value', 'flush_color'],
            ['body.radius', 'radius'],
            ['dry.roughness', 'roughness'],
            ['oily.roughness', 'oil_roughness'],
            ['dry.ior', 'ior'],
            ['fuzz.color', 'fuzz_color'],
            ['pore_relief.height', 'pore_height'],
            ['fold_relief.height', 'fold_height'],
            ['world.value', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.eye` — o globo ocular: a esclera branca, translúcida, com os vasos finos (`veins` em [0, 1],
 * `vein_color`), a íris — de `iris_color` junto da pupila a `iris_edge_color` na borda, riscada pelas fibras radiais do
 * estroma e fechada pelo anel escuro do limbo —, a pupila preta e, por cima de tudo, a córnea molhada: a interface lisa
 * (IOR 1,376, `roughness` 0,03), que dá o reflexo das luzes. A íris é sombreada como o disco fundo que é (`iris_depth`,
 * −1,6 mm no centro: a normal de uma tigela), e a esclera escurece e fica rosada dos cantos para trás. A geometria é uma esfera centrada na origem do
 * objeto, com o olhar ao longo de `axis` (+z); `iris_size` é o raio da íris na esfera unitária (0,49: 11,7 mm num
 * globo de 24 mm) e `pupil_size` o da pupila como fração do da íris. O corpo é subsuperfície (`radius`, (0,6; 0,45;
 * 0,35) mm, estimado; `scale` unidades do mundo por metro): a esclera não é opaca. O que falta à física do olho: a
 * córnea não tem a curvatura própria nem refrata a íris (a íris aparece na superfície do globo, sem a profundidade e
 * sem a cáustica dela). Parâmetros: `iris_color`, `iris_edge_color`, `sclera_color`, `vein_color`, `veins`,
 * `iris_size`, `pupil_size`, `fibers`, `roughness`, `ior`, `radius`, `scale`, `axis`.
 */
export const eye = Subgraph.point(
    new NodeGraph({
        nodes: {
            s: input.surfaceSample(),
            solid: surface.solidSpace.with({ axis: [0, 0, 1] }),
            world: math.value.with({ value: 1 }),
            parts: pattern.iris.with({ iris: 0.46, pupil: 0.36, fibers: 64, soften: 0.06 }),
            // A íris: a cor do centro à borda, as fibras (± 45 %) e o limbo escuro.
            hue: color.ramp.with({
                color_a: [0.075, 0.036, 0.014],
                color_b: [0.028, 0.013, 0.006],
                low: 0,
                high: 1,
            }),
            streak: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.35, out_max: 1.65 }),
            // O anel claro em volta da pupila (a colarete) e a queda para a borda.
            lift: map.curve4.with({ p0: [0, 0.4], p1: [0.22, 1.5], p2: [0.6, 0.95], p3: [1, 0.6] }),
            lifted: math.mul,
            ring: map.range.with({ out_min: 1, out_max: 0.12 }),
            shade: math.mul,
            stroma: math.scale3,
            // A esclera e os vasos.
            white: math.value3.with({ value: [0.5, 0.47, 0.45] }),
            vessel: math.value3.with({ value: [0.55, 0.12, 0.1] }),
            veins: math.value.with({ value: 0.9 }),
            vein_amount: math.mul,
            sclera: math.mix3,
            // A esclera escurece e fica rosada dos cantos para trás (a conjuntiva, mais vascular longe da íris).
            corner: math.value3.with({ value: [0.7, 0.5, 0.48] }),
            cornered: math.mul3,
            shaded: math.mix3,
            corner_amount: map.range.with({ out_min: 0, out_max: 0.9 }),
            fronted: math.mix3,
            black: math.value3.with({ value: [0.005, 0.005, 0.005] }),
            holed: math.mix3,
            body: bsdf.subsurface.with({ radius: [0.6, 0.45, 0.35] }),
            // A íris atrás da córnea é um disco fundo: o corpo recebe a normal da tigela (`iris_depth`, em mm), não a
            // do globo — a luz de lado acende a borda oposta da íris, como no olho; a córnea reflete pela do globo.
            bowl: surface.solidRelief.with({ height: -1.6 }),
            hollow: surface.reliefNormal,
            deep: closure.normal,
            cornea: bsdf.dielectric.with({ ior: 1.376, roughness: 0.03 }),
            out: closure.add,
        },
        links: [
            ['s.object_position', 'solid.position'],
            ['s.dodu', 'solid.dodu'],
            ['s.dodv', 'solid.dodv'],
            ['s.duvdx', 'solid.duvdx'],
            ['s.duvdy', 'solid.duvdy'],
            ['s.footprint', 'solid.footprint'],
            ['solid.p', 'parts.p'],
            ['solid.width', 'parts.width'],
            ['parts.radial', 'hue.t'],
            ['parts.fiber', 'streak.x'],
            ['parts.limbus', 'ring.x'],
            ['parts.radial', 'lift.x'],
            ['streak.value', 'lifted.a'],
            ['lift.value', 'lifted.b'],
            ['lifted.value', 'shade.a'],
            ['ring.value', 'shade.b'],
            ['hue.color', 'stroma.v'],
            ['shade.value', 'stroma.s'],
            ['parts.vein', 'vein_amount.a'],
            ['veins.value', 'vein_amount.b'],
            ['white.value', 'sclera.a'],
            ['vessel.value', 'sclera.b'],
            ['vein_amount.value', 'sclera.t'],
            ['sclera.value', 'cornered.a'],
            ['corner.value', 'cornered.b'],
            ['parts.rim', 'corner_amount.x'],
            ['sclera.value', 'shaded.a'],
            ['cornered.value', 'shaded.b'],
            ['corner_amount.value', 'shaded.t'],
            ['shaded.value', 'fronted.a'],
            ['stroma.value', 'fronted.b'],
            ['parts.iris', 'fronted.t'],
            ['fronted.value', 'holed.a'],
            ['black.value', 'holed.b'],
            ['parts.pupil', 'holed.t'],
            ['holed.value', 'body.color'],
            ['world.value', 'body.scale'],
            ['parts.bowl', 'bowl.value'],
            ['parts.gradient', 'bowl.gradient'],
            ['solid.du', 'bowl.du'],
            ['solid.dv', 'bowl.dv'],
            ['bowl.value', 'hollow.relief'],
            ['world.value', 'hollow.scale'],
            ['body.value', 'deep.c'],
            ['hollow.value', 'deep.normal'],
            ['cornea.value', 'out.a'],
            ['deep.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.eye',
        inputs: { s: 'SurfaceSample' },
        defaults: { s: 's' },
        expose: [
            ['hue.color_a', 'iris_color'],
            ['hue.color_b', 'iris_edge_color'],
            ['white.value', 'sclera_color'],
            ['vessel.value', 'vein_color'],
            ['veins.value', 'veins'],
            ['parts.iris', 'iris_size'],
            ['parts.pupil', 'pupil_size'],
            ['parts.fibers', 'fibers'],
            ['bowl.height', 'iris_depth'],
            ['cornea.roughness', 'roughness'],
            ['cornea.ior', 'ior'],
            ['body.radius', 'radius'],
            ['world.value', 'scale'],
            ['solid.axis', 'axis'],
        ],
    },
);

/**
 * `material.wax` — cera (parafina de vela): IOR 1,44 (parafina sólida, n_D 1,44), rugosidade 0,3; sem medida tabelada do
 * espalhamento — albedo (0,9, 0,82, 0,62) e caminho livre médio (2,8, 2,0, 1,2) mm estimados para que uma vela de 2 cm
 * deixe passar cerca de 7 % do vermelho e quase nada do azul (o corpo claro, laranja na contraluz). Parâmetros: os de
 * `skin`.
 */
export const wax = scattering('material.wax', {
    color: [0.9, 0.82, 0.62],
    radius: [2.8, 2.0, 1.2],
    roughness: 0.3,
    ior: 1.44,
});

/**
 * `material.jade` — jade (nefrita) polido: IOR 1,61, rugosidade 0,08; sem medida tabelada — albedo (0,36, 0,62, 0,38) e
 * caminho livre médio (0,9, 1,8, 1,0) mm estimados: o verde é o canal que espalha mais longe (a placa fina acende verde
 * na contraluz). Parâmetros: os de `skin`.
 */
export const jade = scattering('material.jade', {
    color: [0.36, 0.62, 0.38],
    radius: [0.9, 1.8, 1.0],
    roughness: 0.08,
    ior: 1.61,
});

/**
 * `material.milk` — leite integral: IOR 1,35, rugosidade 0,03; albedo (0,91, 0,88, 0,76) e caminho livre médio (0,39,
 * 0,31, 0,26) mm — o "wholemilk" de Jensen et al. 2001 (σ_s′ 2,55, 3,21, 3,77 e σ_a 0,0011, 0,0024, 0,014 /mm). Quase sem
 * absorção: nesse albedo o perfil de Burley perde a cauda longa (a referência mede 6 % de desvio na fração acumulada).
 * Serve também de sabão branco ou plástico leitoso. Parâmetros: os de `skin`.
 */
export const milk = scattering('material.milk', {
    color: [0.91, 0.88, 0.76],
    radius: [0.39, 0.31, 0.26],
    roughness: 0.03,
    ior: 1.35,
});

/**
 * `material.marble` — mármore polido: IOR 1,5, albedo (0,83, 0,79, 0,75) e caminho livre médio (0,46, 0,38, 0,33) mm — o
 * mármore de Jensen et al. 2001 (σ_s′ 2,19, 2,62, 3,00 e σ_a 0,0021, 0,0041, 0,0071 /mm, η 1,5); rugosidade 0,1. Os veios: as linhas em que um
 * `pattern.grain` de cinco oitavas (2,5 por unidade do padrão) passa por zero — finas, ramificadas, de cor `vein_color`
 * — sobre o corpo `color`, com nuvens largas do mesmo grão escurecendo de leve. Parâmetros: `color`, `vein_color`,
 * `radius` (mm), `scale` (unidades por metro), `roughness`, `ior`, `pattern_scale`.
 */
export const marble = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            flow: pattern.grain.with({ scale: [2.5, 2.5], octaves: 5, gain: 0.55, seed: 21 }),
            distance: math.abs,
            vein: map.range.with({ in_min: 0, in_max: 0.07, out_min: 0.85, out_max: 0 }),
            cloud: map.range.with({ in_min: -1, in_max: 1, out_min: 0.86, out_max: 1.08 }),
            stone: math.value3.with({ value: [0.83, 0.79, 0.75] }),
            clouded: math.scale3,
            veined: math.mix3,
            vein_color: math.value3.with({ value: [0.2, 0.2, 0.23] }),
            body: bsdf.subsurface.with({ radius: [0.46, 0.38, 0.33] }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.1 }),
            out: closure.add,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('flow'),
            ['flow.value', 'distance.x'],
            ['distance.value', 'vein.x'],
            ['flow.value', 'cloud.x'],
            ['stone.value', 'clouded.v'],
            ['cloud.value', 'clouded.s'],
            ['clouded.value', 'veined.a'],
            ['vein_color.value', 'veined.b'],
            ['vein.value', 'veined.t'],
            ['veined.value', 'body.color'],
            ['specular.value', 'out.a'],
            ['body.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.marble',
        ...SAMPLE_INPUT,
        expose: [
            ['stone.value', 'color'],
            ['vein_color.value', 'vein_color'],
            ['body.radius', 'radius'],
            ['body.scale', 'scale'],
            ['specular.roughness', 'roughness'],
            ['specular.ior', 'ior'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.porcelain` — porcelana esmaltada: corpo vitrificado levemente translúcido — albedo (0,9, 0,9, 0,87) e
 * caminho livre médio curto e quase neutro, (0,3, 0,27, 0,22) mm, estimado (sem medida tabelada): só a borda fina de uma
 * xícara deixa passar luz — sob um esmalte liso de IOR 1,5 (vidro de silicato), rugosidade 0,05. Parâmetros: os de
 * `skin`.
 */
export const porcelain = scattering('material.porcelain', {
    color: [0.9, 0.9, 0.87],
    radius: [0.3, 0.27, 0.22],
    roughness: 0.05,
    ior: 1.5,
});

/**
 * `material.glass` — vidro de janela (sodo-cálcico): reflexão de dielétrico somada à transmissão com refração do que
 * está atrás, as duas com o mesmo IOR 1,52 e a mesma rugosidade (0 = liso); número de Abbe 58 (`research.md` R11) — a
 * dispersão; `depth` 0 = sem absorção (com `depth` > 0, `color` é a cor a essa distância de percurso). Parâmetros:
 * `ior`, `roughness`, `color`, `depth`, `abbe`.
 */
export const glass = Subgraph.point(
    new NodeGraph({
        nodes: {
            ior: math.value.with({ value: 1.52 }),
            roughness: math.value.with({ value: 0 }),
            reflection: bsdf.dielectric,
            refraction: bsdf.transmission.with({ abbe: 58 }),
            out: closure.add,
        },
        links: [
            ['ior.value', 'reflection.ior'],
            ['ior.value', 'refraction.ior'],
            ['roughness.value', 'reflection.roughness'],
            ['roughness.value', 'refraction.roughness'],
            ['reflection.value', 'out.a'],
            ['refraction.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.glass',
        expose: [
            ['ior.value', 'ior'],
            ['roughness.value', 'roughness'],
            ['refraction.color', 'color'],
            ['refraction.depth', 'depth'],
            ['refraction.abbe', 'abbe'],
        ],
    },
);
