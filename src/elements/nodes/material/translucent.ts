import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
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
