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
 * `relief` (sem ligação, zero) soma um relevo em milímetros ao dos poros: os vincos e as rugas, de
 * `surface.solidRelief`.
 * `sallow` em [0, 1] é o quanto o amarelado desigual entra (0,2).
 * Parâmetros: `melanin`, `blood`, `freckles`, `oil`, `sallow`, `fuzz_color`, `light_color`, `dark_color`, `flush_color`, `radius`,
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
            // O relevo a mais de quem monta o rosto (os vincos, as rugas: a saída de `surface.solidRelief`), somado.
            relief: graphArgument('relief'),
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
            yellow_amount: map.range.with({ in_min: -0.3, in_max: 0.4, out_min: 0, out_max: 0.2 }),
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
            folded: math.add3,
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
            ['height.value', 'folded.a'],
            ['relief.value', 'folded.b'],
            ['folded.value', 'normal.relief'],
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
        inputs: {
            s: 'SurfaceSample',
            blood_mask: 'f32',
            oil_mask: 'f32',
            tint: 'vec3f',
            relief: 'vec3f',
        },
        defaults: {
            s: 's',
            blood_mask: '1.0',
            oil_mask: '1.0',
            tint: 'vec3f(1.0)',
            relief: 'vec3f(0.0)',
        },
        expose: [
            ['melanin.value', 'melanin'],
            ['blood.value', 'blood'],
            ['freckles.value', 'freckles'],
            ['oil.value', 'oil'],
            ['yellow_amount.out_max', 'sallow'],
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

/** Os padrões do relevo dos lábios, comuns ao material (`lips`, a normal) e à altura (`lipsHeight`, a geometria). */
const LIP = {
    lines: { scale: [270, 13, 13], octaves: 2, gain: 0.6, seed: 81 },
    folds: { scale: [120, 4.5, 4.5], octaves: 2, gain: 0.45, seed: 83 },
    gomo: { low: -0.42, high: -0.06 },
    net: { scale: [150, 48], jitter: 1, crease: 0.22, seed: 85 },
    hatch: { low: -0.5, high: -0.18 },
    hatchScale: [200, 22, 22],
    hatchTurn: 0.62,
    tub: { scale: [85, 85, 85], octaves: 3, gain: 0.55, seed: 91 },
    upper: { in_min: -0.004, in_max: 0.004, out_min: 1, out_max: 1.5 },
    netPart: { in_min: -0.004, in_max: 0.004, out_min: 0.12, out_max: 1.2 },
    hatchPart: { in_min: -0.004, in_max: 0.004, out_min: 0.45, out_max: 1.3 },
    tubPart: { in_min: 1, in_max: 0.35, out_min: 0, out_max: 1 },
    /** Fundos e alturas em milímetros. */
    height: { line: 0.07, fold: 0.28, dome: 0.12, net: 0.12, hatch: 0.14 },
} as const;

/**
 * `material.lips` — os lábios: a pele fina e sem pigmento do vermelhão, por onde se vê o sangue. Rosa escuro
 * (`color`), manchado de leve, com as linhas finas que cruzam o lábio de cima a baixo (os sulcos verticais: um grão
 * maciço alongado na vertical, `line_height` 0,06 mm de fundo, mais escuros no fundo), os gomos — as almofadas largas
 * separadas por vincos estreitos de cima a baixo, que se juntam como as nervuras de uma folha (`fold_height`, 0,28 mm
 * de fundo) — e o brilho de uma superfície
 * úmida — dois lobos da interface (IOR 1,4): o seco (`roughness`, 0,5) e o molhado (`wet_roughness`, 0,1),
 * misturados por `gloss` em [0, 1], que some dentro dos sulcos. O corpo é subsuperfície, de raio mais longo que o da
 * pele ((1,8; 0,75; 0,5) mm, estimado: a camada de cima é fina e o vermelho atravessa mais), com `scale` unidades do
 * mundo por metro. Os padrões são maciços (a posição no objeto, `pattern_scale` por unidade; as linhas correm ao longo
 * do eixo y do objeto: o lábio de uma cabeça em pé). Num rosto, mistura-se à pele por uma máscara (`closure.mix`).
 * Os vincos e as linhas são arcos: verticais na linha entre os lábios e fechando para o meio ao se afastar dela,
 * como parênteses de cada lado (`centre`, o meio da boca na coordenada dos padrões; `fan`, a curvatura: 0 dá retas
 * paralelas, o padrão — numa cabeça de 1,4 unidade, 140).
 * Parâmetros: `color`, `line_color`, `centre`, `fan`, `line_height`, `fold_height`, `upper_gain`, `network_scale`, `network_crease`,
 * `network_height`, `network_lower`, `network_seed` (a trama de sulcos que se cruzam), `hatch_turn`, `hatch_scale`, `hatch_height`,
 * `hatch_lower` (os sulcos inclinados que fecham losangos), `tubercle`, `tubercle_radius`, `tubercle_height` (o volume
 * de pregas embaralhadas do meio do lábio superior), `dome_height` (0,12 mm: o abaulado de cada gomo, que
 * dá a cada um o seu realce), `gloss`, `roughness`, `wet_roughness`, `ior`, `radius`, `scale`,
 * `pattern_scale`.
 */
export const lips = Subgraph.point(
    new NodeGraph({
        nodes: {
            s: input.surfaceSample(),
            solid: surface.solidSpace,
            tile: math.value.with({ value: 1 }),
            world: math.value.with({ value: 1 }),
            // Os vincos de um lábio não são retas: são arcos, verticais na linha da boca e fechando para o meio ao se
            // afastar dela. A coordenada dos padrões é a posição relativa ao meio da boca (`centre`) com o x multiplicado por
            // 1 + `fan` · y²: as linhas de fase constante são arcos x = c / (1 + fan · y²), mais largos na linha entre
            // os lábios (`fan` 0: retas).
            centre: math.value3.with({ value: [0, 0, 0] }),
            fan: math.value.with({ value: 0 }),
            rel: math.sub3,
            axes: math.split3,
            y2: math.mul,
            spread: math.mul,
            one: math.value.with({ value: 1 }),
            den: math.add,
            qx: math.mul,
            bent: math.combine3,
            // As derivadas da coordenada curvada ao longo de u e de v (o jacobiano da curvatura sobre ∂p/∂u, ∂p/∂v):
            // com elas o relevo de cada padrão inclina a normal pelo sulco curvo, não pelo reto.
            two: math.value.with({ value: 2 }),
            fan_y: math.mul,
            fan_2y: math.mul,
            lean: math.mul,
            du_axes: math.split3,
            du_wide: math.mul,
            du_lean: math.mul,
            du_x: math.add,
            bent_du: math.combine3,
            dv_axes: math.split3,
            dv_wide: math.mul,
            dv_lean: math.mul,
            dv_x: math.add,
            bent_dv: math.combine3,
            // Os sulcos secundários: mais finos e mais curtos, entre os principais.
            lines: pattern.grain3.with(LIP.lines),
            // Os sulcos: muitos, finos e rasos, de cima a baixo, irregulares e que se juntam (um grão maciço alongado na
            // vertical, recortado por um limiar estreito: 1 fora, 0 no fundo do sulco). Por cima, o grão fino (`lines`),
            // quase sem direção: os riscos miúdos que cruzam os sulcos.
            // A frequência em z é baixa como a em y: o lábio superior recua enquanto sobe, e uma frequência alta em z
            // picava os sulcos em pedaços inclinados ali.
            folds: pattern.grain3.with(LIP.folds),
            gomo: pattern.threshold3.with(LIP.gomo),
            crease: map.range.with({ in_min: 0.6, in_max: 0, out_min: 0, out_max: 0.22 }),
            deep: math.max,
            // O lábio superior fica de costas para a luz de cima e quase não pega realce: os sulcos dele são mais fundos
            // e mais marcados (`upper_gain`, o fator acima da linha da boca; 1 iguala os dois lábios).
            upper: map.range.with(LIP.upper),
            crease_gain: math.mul,
            fold_gain: math.scale3,
            fold_relief: surface.solidRelief.with({ height: LIP.height.fold, level: 1 }),
            // O gomo é abaulado (a almofada sobe do vinco ao meio): cada um pega o seu próprio realce da luz.
            dome_relief: surface.solidRelief.with({ height: LIP.height.dome }),
            dome_height: math.add3,
            height: math.add3,
            // A trama: o lábio não é só riscos de cima a baixo — uma rede de sulcos que se ramificam e se cruzam o
            // divide em placas miúdas, mais altas do que largas (um Voronoi com frequência por eixo, na posição de
            // frente: x já curvado, y). `network_scale` placas por unidade em x e em y, `network_crease` a largura do
            // sulco (em placas), `network_height` o fundo em mm, `network_seed`; forte no lábio superior e fraca no
            // inferior (`network_lower`, a fração abaixo da linha da boca).
            front: math.combine2,
            net: pattern.fissures.with(LIP.net),
            net_axes: math.split2,
            flat: math.value.with({ value: 0 }),
            net_gradient: math.combine3,
            net_relief: surface.solidRelief.with({ height: LIP.height.net, level: 1 }),
            net_part: map.range.with(LIP.netPart),
            net_gain: math.scale3,
            net_height: math.add3,
            net_dark: map.range.with({ in_min: 0.6, in_max: 0, out_min: 0, out_max: 0.3 }),
            net_shade: math.mul,
            net_deep: math.max,
            // Os sulcos inclinados: duas famílias de sulcos curtos, uma para cada lado (± `hatch_turn` radianos da
            // vertical), que cruzam os de cima a baixo e fecham losangos entre eles (`hatch_scale`, `hatch_height` em
            // mm; `hatch_lower` a fração no lábio inferior).
            hatch_turn: math.value.with({ value: LIP.hatchTurn }),
            minus: math.value.with({ value: -1 }),
            hatch_back: math.mul,
            hatch_scale: math.value3.with({ value: LIP.hatchScale }),
            hatch_a: pattern.creases3.with({ seed: 87, ...LIP.hatch }),
            hatch_b: pattern.creases3.with({ seed: 89, ...LIP.hatch }),
            hatch_sum: math.add,
            hatch_gradient: math.add3,
            hatch_relief: surface.solidRelief.with({ height: LIP.height.hatch, level: 2 }),
            hatch_part: map.range.with(LIP.hatchPart),
            hatch_gain: math.scale3,
            hatch_height: math.add3,
            hatch_dark: map.range.with({ in_min: 1.7, in_max: 1, out_min: 0, out_max: 0.2 }),
            hatch_shade: math.mul,
            hatch_deep: math.max,
            // O tubérculo: o volume do meio do lábio superior, de pregas embaralhadas, sem direção — um grão maciço
            // igual nos três eixos numa mancha em volta de `tubercle` (posição relativa a `centre`), de raio
            // `tubercle_radius` e relevo `tubercle_height` em mm (0, o padrão: sem tubérculo).
            tub_at: math.value3.with({ value: [0, 0.03, 0] }),
            tub_far: math.distance,
            tub_radius: math.value.with({ value: 0.03 }),
            tub_near: math.div,
            tub_part: map.range.with(LIP.tubPart),
            tub_grain: pattern.grain3.with(LIP.tub),
            tub_relief: surface.solidRelief.with({ height: 0 }),
            tub_gain: math.scale3,
            tub_height: math.add3,
            dull: math.mul,
            mottle: skinGrain(22, 2, 82),
            base: math.value3.with({ value: [0.5, 0.22, 0.22] }),
            dark: math.value3.with({ value: [0.3, 0.1, 0.1] }),
            // O fundo do sulco (o grão abaixo do nível) mais escuro, e a cor manchada ± 12 %.
            groove: map.range.with({ in_min: 0.05, in_max: -0.45, out_min: 0, out_max: 0.8 }),
            lined: math.mix3,
            uneven: map.range.with({ in_min: -0.5, in_max: 0.5, out_min: 0.88, out_max: 1.12 }),
            toned: math.scale3,
            body: bsdf.subsurface.with({ radius: [1.8, 0.75, 0.5] }),
            dry: bsdf.dielectric.with({ ior: 1.4, roughness: 0.5 }),
            wet: bsdf.dielectric.with({ ior: 1.4, roughness: 0.1 }),
            gloss: math.value.with({ value: 0.7 }),
            open: map.range.with({ in_min: 0.05, in_max: -0.45, out_min: 1, out_max: 0.1 }),
            shine: math.mul,
            specular: closure.mix,
            sum: closure.add,
            relief: surface.solidRelief.with({ height: LIP.height.line }),
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
            ['solid.p', 'rel.a'],
            ['centre.value', 'rel.b'],
            ['rel.value', 'axes.v'],
            ['axes.y', 'y2.a'],
            ['axes.y', 'y2.b'],
            ['fan.value', 'spread.a'],
            ['y2.value', 'spread.b'],
            ['one.value', 'den.a'],
            ['spread.value', 'den.b'],
            ['axes.x', 'qx.a'],
            ['den.value', 'qx.b'],
            ['qx.value', 'bent.x'],
            ['axes.y', 'bent.y'],
            ['axes.z', 'bent.z'],
            ['fan.value', 'fan_y.a'],
            ['axes.y', 'fan_y.b'],
            ['fan_y.value', 'fan_2y.a'],
            ['two.value', 'fan_2y.b'],
            ['axes.x', 'lean.a'],
            ['fan_2y.value', 'lean.b'],
            ['solid.du', 'du_axes.v'],
            ['du_axes.x', 'du_wide.a'],
            ['den.value', 'du_wide.b'],
            ['du_axes.y', 'du_lean.a'],
            ['lean.value', 'du_lean.b'],
            ['du_wide.value', 'du_x.a'],
            ['du_lean.value', 'du_x.b'],
            ['du_x.value', 'bent_du.x'],
            ['du_axes.y', 'bent_du.y'],
            ['du_axes.z', 'bent_du.z'],
            ['solid.dv', 'dv_axes.v'],
            ['dv_axes.x', 'dv_wide.a'],
            ['den.value', 'dv_wide.b'],
            ['dv_axes.y', 'dv_lean.a'],
            ['lean.value', 'dv_lean.b'],
            ['dv_wide.value', 'dv_x.a'],
            ['dv_lean.value', 'dv_x.b'],
            ['dv_x.value', 'bent_dv.x'],
            ['dv_axes.y', 'bent_dv.y'],
            ['dv_axes.z', 'bent_dv.z'],
            ['bent.value', 'lines.p'],
            ['solid.width', 'lines.width'],
            ['solid.p', 'mottle.p'],
            ['solid.width', 'mottle.width'],
            ['lines.value', 'groove.x'],
            ['base.value', 'lined.a'],
            ['dark.value', 'lined.b'],
            ['bent.value', 'folds.p'],
            ['solid.width', 'folds.width'],
            ['folds.value', 'gomo.value'],
            ['folds.gradient', 'gomo.gradient'],
            ['gomo.value', 'crease.x'],
            ['groove.value', 'deep.a'],
            ['axes.y', 'upper.x'],
            ['crease.value', 'crease_gain.a'],
            ['upper.value', 'crease_gain.b'],
            ['crease_gain.value', 'deep.b'],
            ['qx.value', 'front.x'],
            ['axes.y', 'front.y'],
            ['front.value', 'net.p'],
            ['solid.width', 'net.width'],
            ['net.gradient', 'net_axes.v'],
            ['net_axes.x', 'net_gradient.x'],
            ['net_axes.y', 'net_gradient.y'],
            ['flat.value', 'net_gradient.z'],
            ['net.height', 'net_relief.value'],
            ['net_gradient.value', 'net_relief.gradient'],
            ['bent_du.value', 'net_relief.du'],
            ['bent_dv.value', 'net_relief.dv'],
            ['axes.y', 'net_part.x'],
            ['net_relief.value', 'net_gain.v'],
            ['net_part.value', 'net_gain.s'],
            ['net.height', 'net_dark.x'],
            ['net_dark.value', 'net_shade.a'],
            ['net_part.value', 'net_shade.b'],
            ['deep.value', 'net_deep.a'],
            ['net_shade.value', 'net_deep.b'],
            ['hatch_turn.value', 'hatch_back.a'],
            ['minus.value', 'hatch_back.b'],
            ['bent.value', 'hatch_a.p'],
            ['solid.width', 'hatch_a.width'],
            ['hatch_scale.value', 'hatch_a.scale'],
            ['hatch_turn.value', 'hatch_a.turn'],
            ['bent.value', 'hatch_b.p'],
            ['solid.width', 'hatch_b.width'],
            ['hatch_scale.value', 'hatch_b.scale'],
            ['hatch_back.value', 'hatch_b.turn'],
            ['hatch_a.value', 'hatch_sum.a'],
            ['hatch_b.value', 'hatch_sum.b'],
            ['hatch_a.gradient', 'hatch_gradient.a'],
            ['hatch_b.gradient', 'hatch_gradient.b'],
            ['hatch_sum.value', 'hatch_relief.value'],
            ['hatch_gradient.value', 'hatch_relief.gradient'],
            ['bent_du.value', 'hatch_relief.du'],
            ['bent_dv.value', 'hatch_relief.dv'],
            ['axes.y', 'hatch_part.x'],
            ['hatch_relief.value', 'hatch_gain.v'],
            ['hatch_part.value', 'hatch_gain.s'],
            ['hatch_sum.value', 'hatch_dark.x'],
            ['hatch_dark.value', 'hatch_shade.a'],
            ['hatch_part.value', 'hatch_shade.b'],
            ['net_deep.value', 'hatch_deep.a'],
            ['hatch_shade.value', 'hatch_deep.b'],
            ['hatch_deep.value', 'lined.t'],
            ['mottle.value', 'uneven.x'],
            ['lined.value', 'toned.v'],
            ['uneven.value', 'toned.s'],
            ['toned.value', 'body.color'],
            ['world.value', 'body.scale'],
            ['lines.value', 'open.x'],
            ['gloss.value', 'shine.a'],
            ['open.value', 'shine.b'],
            // O brilho molhado some também dentro dos vincos.
            ['shine.value', 'dull.a'],
            ['gomo.value', 'dull.b'],
            ['dry.value', 'specular.a'],
            ['wet.value', 'specular.b'],
            ['dull.value', 'specular.t'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['lines.value', 'relief.value'],
            ['lines.gradient', 'relief.gradient'],
            ['bent_du.value', 'relief.du'],
            ['bent_dv.value', 'relief.dv'],
            ['gomo.value', 'fold_relief.value'],
            ['gomo.gradient', 'fold_relief.gradient'],
            ['bent_du.value', 'fold_relief.du'],
            ['bent_dv.value', 'fold_relief.dv'],
            ['folds.value', 'dome_relief.value'],
            ['folds.gradient', 'dome_relief.gradient'],
            ['bent_du.value', 'dome_relief.du'],
            ['bent_dv.value', 'dome_relief.dv'],
            ['fold_relief.value', 'fold_gain.v'],
            ['upper.value', 'fold_gain.s'],
            ['fold_gain.value', 'dome_height.a'],
            ['dome_relief.value', 'dome_height.b'],
            ['relief.value', 'height.a'],
            ['dome_height.value', 'height.b'],
            ['height.value', 'net_height.a'],
            ['net_gain.value', 'net_height.b'],
            ['net_height.value', 'hatch_height.a'],
            ['hatch_gain.value', 'hatch_height.b'],
            ['rel.value', 'tub_far.a'],
            ['tub_at.value', 'tub_far.b'],
            ['tub_far.value', 'tub_near.a'],
            ['tub_radius.value', 'tub_near.b'],
            ['tub_near.value', 'tub_part.x'],
            ['solid.p', 'tub_grain.p'],
            ['solid.width', 'tub_grain.width'],
            ['tub_grain.value', 'tub_relief.value'],
            ['tub_grain.gradient', 'tub_relief.gradient'],
            ['solid.du', 'tub_relief.du'],
            ['solid.dv', 'tub_relief.dv'],
            ['tub_relief.value', 'tub_gain.v'],
            ['tub_part.value', 'tub_gain.s'],
            ['hatch_height.value', 'tub_height.a'],
            ['tub_gain.value', 'tub_height.b'],
            ['tub_height.value', 'normal.relief'],
            ['world.value', 'normal.scale'],
            ['sum.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.lips',
        inputs: { s: 'SurfaceSample' },
        defaults: { s: 's' },
        expose: [
            ['base.value', 'color'],
            ['dark.value', 'line_color'],
            ['centre.value', 'centre'],
            ['fan.value', 'fan'],
            ['relief.height', 'line_height'],
            ['fold_relief.height', 'fold_height'],
            ['upper.out_max', 'upper_gain'],
            ['net.scale', 'network_scale'],
            ['net.crease', 'network_crease'],
            ['net.seed', 'network_seed'],
            ['net_relief.height', 'network_height'],
            ['net_part.out_min', 'network_lower'],
            ['hatch_turn.value', 'hatch_turn'],
            ['hatch_scale.value', 'hatch_scale'],
            ['hatch_relief.height', 'hatch_height'],
            ['hatch_part.out_min', 'hatch_lower'],
            ['tub_at.value', 'tubercle'],
            ['tub_radius.value', 'tubercle_radius'],
            ['tub_relief.height', 'tubercle_height'],
            ['dome_relief.height', 'dome_height'],
            ['gloss.value', 'gloss'],
            ['dry.roughness', 'roughness'],
            ['wet.roughness', 'wet_roughness'],
            ['dry.ior', 'ior'],
            ['body.radius', 'radius'],
            ['world.value', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.eye` — o globo ocular: a esclera branca, translúcida, com os vasos finos (`veins` em [0, 1],
 * `vein_color`), a íris — de `iris_color` junto da pupila a `iris_edge_color` na borda, riscada pelas fibras radiais do
 * estroma e fechada pelo anel escuro do limbo —, a pupila preta e, por cima de tudo, a córnea molhada: a interface lisa
 * (IOR 1,376, `roughness` 0,012: o filme de lágrima, liso como vidro), que dá o reflexo das luzes. A íris é sombreada como o disco fundo que é (`iris_depth`,
 * −1,6 mm no centro: a normal de uma tigela), e a esclera escurece e fica rosada dos cantos para trás. A geometria é uma esfera centrada na origem do
 * objeto, com o olhar ao longo de `axis` (+z); `iris_size` é o raio da íris na esfera unitária (0,49: 11,7 mm num
 * globo de 24 mm) e `pupil_size` o da pupila como fração do da íris. O corpo é subsuperfície (`radius`, (0,6; 0,45;
 * 0,35) mm, estimado; `scale` unidades do mundo por metro): a esclera não é opaca. O que falta à física do olho: a
 * córnea não tem a curvatura própria nem refrata a íris (a íris aparece na superfície do globo, sem a profundidade e
 * sem a cáustica dela). Parâmetros: `iris_color`, `iris_edge_color`, `sclera_color`, `vein_color`, `veins`,
 * `iris_size`, `pupil_size`, `fibers`, `roughness` (o filme sobre a córnea), `wet_roughness` (0,07: a conjuntiva
 * molhada sobre a esclera) e `film_height` (0,035 mm: a ondulação dela, que quebra o reflexo em manchas úmidas), `ior`,
 * `radius`, `scale`, `axis`.
 */
/**
 * `height.lips` — o relevo de `material.lips` como altura em função da posição no objeto: a entrada `height` de
 * `set.displace` (o relevo como geometria numa malha dada, `meshSource`). Os mesmos padrões, com os mesmos valores, do
 * material — que segue inclinando a normal pelo mesmo relevo até a largura do pixel —, filtrados por `width` (o passo
 * da malha, nas unidades do objeto: o que a malha não resolve fica só na normal). Saída: a altura nas unidades do mundo
 * (milímetros × `scale` unidades por metro ÷ 1000); negativa nos sulcos. Parâmetros: os do relevo de `material.lips`
 * (`centre`, `fan`, `line_height`, `fold_height`, `upper_gain`, `dome_height`, `network_*`, `hatch_*`, `tubercle*`,
 * `scale`) e `width`.
 */
export const lipsHeight = Subgraph.point(
    new NodeGraph({
        nodes: {
            pos: graphArgument('position'),
            width: math.value.with({ value: 0 }),
            world: math.value.with({ value: 1 }),
            centre: math.value3.with({ value: [0, 0, 0] }),
            fan: math.value.with({ value: 0 }),
            rel: math.sub3,
            axes: math.split3,
            y2: math.mul,
            spread: math.mul,
            one: math.value.with({ value: 1 }),
            den: math.add,
            qx: math.mul,
            bent: math.combine3,
            lines: pattern.grain3.with(LIP.lines),
            folds: pattern.grain3.with(LIP.folds),
            gomo: pattern.threshold3.with(LIP.gomo),
            upper: map.range.with(LIP.upper),
            front: math.combine2,
            net: pattern.fissures.with(LIP.net),
            net_part: map.range.with(LIP.netPart),
            hatch_turn: math.value.with({ value: LIP.hatchTurn }),
            minus: math.value.with({ value: -1 }),
            hatch_back: math.mul,
            hatch_scale: math.value3.with({ value: LIP.hatchScale }),
            hatch_a: pattern.creases3.with({ seed: 87, ...LIP.hatch }),
            hatch_b: pattern.creases3.with({ seed: 89, ...LIP.hatch }),
            hatch_part: map.range.with(LIP.hatchPart),
            tub_at: math.value3.with({ value: [0, 0.03, 0] }),
            tub_far: math.distance,
            tub_radius: math.value.with({ value: 0.03 }),
            tub_near: math.div,
            tub_part: map.range.with(LIP.tubPart),
            tub_grain: pattern.grain3.with(LIP.tub),
            // Cada parcela: (valor − nível) · altura em mm · a fração da região — a conta de `surface.solidRelief`.
            line_h: math.value.with({ value: LIP.height.line }),
            fold_h: math.value.with({ value: LIP.height.fold }),
            dome_h: math.value.with({ value: LIP.height.dome }),
            net_h: math.value.with({ value: LIP.height.net }),
            hatch_h: math.value.with({ value: LIP.height.hatch }),
            tub_h: math.value.with({ value: 0 }),
            line_mm: math.mul,
            fold_down: math.sub,
            fold_deep: math.mul,
            fold_mm: math.mul,
            dome_mm: math.mul,
            net_down: math.sub,
            net_deep: math.mul,
            net_mm: math.mul,
            hatch_sum: math.add,
            two: math.value.with({ value: 2 }),
            hatch_down: math.sub,
            hatch_deep: math.mul,
            hatch_mm: math.mul,
            tub_tall: math.mul,
            tub_mm: math.mul,
            sum_a: math.add,
            sum_b: math.add,
            sum_c: math.add,
            sum_d: math.add,
            sum_e: math.add,
            per_mm: math.value.with({ value: 0.001 }),
            unit: math.mul,
            out: math.mul,
        },
        links: [
            ['pos.value', 'rel.a'],
            ['centre.value', 'rel.b'],
            ['rel.value', 'axes.v'],
            ['axes.y', 'y2.a'],
            ['axes.y', 'y2.b'],
            ['fan.value', 'spread.a'],
            ['y2.value', 'spread.b'],
            ['one.value', 'den.a'],
            ['spread.value', 'den.b'],
            ['axes.x', 'qx.a'],
            ['den.value', 'qx.b'],
            ['qx.value', 'bent.x'],
            ['axes.y', 'bent.y'],
            ['axes.z', 'bent.z'],
            ['bent.value', 'lines.p'],
            ['width.value', 'lines.width'],
            ['bent.value', 'folds.p'],
            ['width.value', 'folds.width'],
            ['folds.value', 'gomo.value'],
            ['folds.gradient', 'gomo.gradient'],
            ['axes.y', 'upper.x'],
            ['qx.value', 'front.x'],
            ['axes.y', 'front.y'],
            ['front.value', 'net.p'],
            ['width.value', 'net.width'],
            ['axes.y', 'net_part.x'],
            ['hatch_turn.value', 'hatch_back.a'],
            ['minus.value', 'hatch_back.b'],
            ['bent.value', 'hatch_a.p'],
            ['width.value', 'hatch_a.width'],
            ['hatch_scale.value', 'hatch_a.scale'],
            ['hatch_turn.value', 'hatch_a.turn'],
            ['bent.value', 'hatch_b.p'],
            ['width.value', 'hatch_b.width'],
            ['hatch_scale.value', 'hatch_b.scale'],
            ['hatch_back.value', 'hatch_b.turn'],
            ['axes.y', 'hatch_part.x'],
            ['rel.value', 'tub_far.a'],
            ['tub_at.value', 'tub_far.b'],
            ['tub_far.value', 'tub_near.a'],
            ['tub_radius.value', 'tub_near.b'],
            ['tub_near.value', 'tub_part.x'],
            ['pos.value', 'tub_grain.p'],
            ['width.value', 'tub_grain.width'],
            ['lines.value', 'line_mm.a'],
            ['line_h.value', 'line_mm.b'],
            ['gomo.value', 'fold_down.a'],
            ['one.value', 'fold_down.b'],
            ['fold_down.value', 'fold_deep.a'],
            ['fold_h.value', 'fold_deep.b'],
            ['fold_deep.value', 'fold_mm.a'],
            ['upper.value', 'fold_mm.b'],
            ['folds.value', 'dome_mm.a'],
            ['dome_h.value', 'dome_mm.b'],
            ['net.height', 'net_down.a'],
            ['one.value', 'net_down.b'],
            ['net_down.value', 'net_deep.a'],
            ['net_h.value', 'net_deep.b'],
            ['net_deep.value', 'net_mm.a'],
            ['net_part.value', 'net_mm.b'],
            ['hatch_a.value', 'hatch_sum.a'],
            ['hatch_b.value', 'hatch_sum.b'],
            ['hatch_sum.value', 'hatch_down.a'],
            ['two.value', 'hatch_down.b'],
            ['hatch_down.value', 'hatch_deep.a'],
            ['hatch_h.value', 'hatch_deep.b'],
            ['hatch_deep.value', 'hatch_mm.a'],
            ['hatch_part.value', 'hatch_mm.b'],
            ['tub_grain.value', 'tub_tall.a'],
            ['tub_h.value', 'tub_tall.b'],
            ['tub_tall.value', 'tub_mm.a'],
            ['tub_part.value', 'tub_mm.b'],
            ['line_mm.value', 'sum_a.a'],
            ['fold_mm.value', 'sum_a.b'],
            ['sum_a.value', 'sum_b.a'],
            ['dome_mm.value', 'sum_b.b'],
            ['sum_b.value', 'sum_c.a'],
            ['net_mm.value', 'sum_c.b'],
            ['sum_c.value', 'sum_d.a'],
            ['hatch_mm.value', 'sum_d.b'],
            ['sum_d.value', 'sum_e.a'],
            ['tub_mm.value', 'sum_e.b'],
            ['world.value', 'unit.a'],
            ['per_mm.value', 'unit.b'],
            ['sum_e.value', 'out.a'],
            ['unit.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'height.lips',
        inputs: { position: 'vec3f' },
        expose: [
            ['width.value', 'width'],
            ['centre.value', 'centre'],
            ['fan.value', 'fan'],
            ['line_h.value', 'line_height'],
            ['fold_h.value', 'fold_height'],
            ['upper.out_max', 'upper_gain'],
            ['dome_h.value', 'dome_height'],
            ['net.scale', 'network_scale'],
            ['net.crease', 'network_crease'],
            ['net.seed', 'network_seed'],
            ['net_h.value', 'network_height'],
            ['net_part.out_min', 'network_lower'],
            ['hatch_turn.value', 'hatch_turn'],
            ['hatch_scale.value', 'hatch_scale'],
            ['hatch_h.value', 'hatch_height'],
            ['hatch_part.out_min', 'hatch_lower'],
            ['tub_at.value', 'tubercle'],
            ['tub_radius.value', 'tubercle_radius'],
            ['tub_h.value', 'tubercle_height'],
            ['world.value', 'scale'],
        ],
    },
);

export const eye = Subgraph.point(
    new NodeGraph({
        nodes: {
            s: input.surfaceSample(),
            solid: surface.solidSpace.with({ axis: [0, 0, 1] }),
            world: math.value.with({ value: 1 }),
            parts: pattern.iris.with({ iris: 0.43, pupil: 0.36, fibers: 64, soften: 0.11 }),
            // A íris: a cor do centro à borda, as fibras (± 45 %) e o limbo escuro.
            hue: color.ramp.with({
                color_a: [0.13, 0.062, 0.022],
                color_b: [0.04, 0.018, 0.008],
                low: 0,
                high: 1,
            }),
            streak: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.35, out_max: 1.65 }),
            // O anel claro em volta da pupila (a colarete) e a queda para a borda.
            lift: map.curve4.with({
                p0: [0, 0.35],
                p1: [0.22, 1.7],
                p2: [0.6, 0.95],
                p3: [1, 0.5],
            }),
            lifted: math.mul,
            ring: map.range.with({ out_min: 1, out_max: 0.12 }),
            shade: math.mul,
            stroma: math.scale3,
            // A esclera e os vasos.
            white: math.value3.with({ value: [0.46, 0.42, 0.39] }),
            vessel: math.value3.with({ value: [0.55, 0.12, 0.1] }),
            veins: math.value.with({ value: 0.55 }),
            vein_amount: math.mul,
            sclera: math.mix3,
            // A esclera escurece e fica rosada dos cantos para trás (a conjuntiva, mais vascular longe da íris).
            corner: math.value3.with({ value: [0.62, 0.36, 0.33] }),
            cornered: math.mul3,
            shaded: math.mix3,
            corner_amount: map.range.with({ out_min: 0, out_max: 0.9 }),
            fronted: math.mix3,
            black: math.value3.with({ value: [0.005, 0.005, 0.005] }),
            holed: math.mix3,
            body: bsdf.subsurface.with({ radius: [1.3, 0.9, 0.7] }),
            // A íris atrás da córnea é um disco fundo: o corpo recebe a normal da tigela (`iris_depth`, em mm), não a
            // do globo — a luz de lado acende a borda oposta da íris, como no olho; a córnea reflete pela do globo.
            bowl: surface.solidRelief.with({ height: -2.6 }),
            hollow: surface.reliefNormal,
            deep: closure.normal,
            cornea: bsdf.dielectric.with({ ior: 1.376, roughness: 0.012 }),
            // O filme de lágrima: liso como vidro sobre a córnea e, sobre a esclera, a conjuntiva molhada — um pouco mais
            // áspera (`wet_roughness`) e ondulada de leve (`film_height`, em mm), que quebra o reflexo em manchas úmidas
            // em vez do brilho de bola de plástico.
            smooth: math.value.with({ value: 0.012 }),
            moist: math.value.with({ value: 0.07 }),
            gloss: math.mix,
            ripple: pattern.grain3.with({ scale: [26, 26, 26], octaves: 2, gain: 0.5, seed: 91 }),
            film: surface.solidRelief.with({ height: 0.035 }),
            off_iris: map.range.with({ in_min: 0, in_max: 1, out_min: 1, out_max: 0 }),
            film_masked: math.scale3,
            wavy: surface.reliefNormal,
            wet: closure.normal,
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
            ['moist.value', 'gloss.a'],
            ['smooth.value', 'gloss.b'],
            ['parts.iris', 'gloss.t'],
            ['gloss.value', 'cornea.roughness'],
            ['solid.p', 'ripple.p'],
            ['solid.width', 'ripple.width'],
            ['ripple.value', 'film.value'],
            ['ripple.gradient', 'film.gradient'],
            ['solid.du', 'film.du'],
            ['solid.dv', 'film.dv'],
            ['parts.iris', 'off_iris.x'],
            ['film.value', 'film_masked.v'],
            ['off_iris.value', 'film_masked.s'],
            ['film_masked.value', 'wavy.relief'],
            ['world.value', 'wavy.scale'],
            ['cornea.value', 'wet.c'],
            ['wavy.value', 'wet.normal'],
            ['wet.value', 'out.a'],
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
            ['smooth.value', 'roughness'],
            ['moist.value', 'wet_roughness'],
            ['film.height', 'film_height'],
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
