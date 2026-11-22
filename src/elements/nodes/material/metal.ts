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

// Metais (spec 011, R11): o especular de condutor (`bsdf.conductor`), com a refletância de frente F0 na cor e a tinta
// da borda F82. Alumínio: F0 (0,912, 0,914, 0,920) e F82 (0,970, 0,979, 0,988) — o exemplo
// `open_pbr_aluminum_brushed.mtlx` do MaterialX (OpenPBR). Outros metais pelos parâmetros, ex.: ouro F0 (0,944, 0,776,
// 0,373) e F82 (0,998, 0,981, 0,751) (`standard_surface_gold.mtlx`). Os riscos da escova, os flocos da pintura e as
// manchas da ferrugem são calculados por pixel pelos nós de padrão sobre o uv (`pattern_scale` repetições por unidade
// de uv; numa esfera, (2, 1)).

const ALUMINIUM_F0 = [0.912, 0.914, 0.92] as const;
const ALUMINIUM_F82 = [0.97, 0.979, 0.988] as const;

type Rgb = readonly [number, number, number];

/** Sub-grafo de um metal nu: um `bsdf.conductor` (F0 `f0`, tinta da borda `f82`) com todos os parâmetros expostos. */
function metal(
    name: string,
    roughness: number,
    anisotropy: number,
    f0: Rgb = ALUMINIUM_F0,
    f82: Rgb = ALUMINIUM_F82,
): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                out: bsdf.conductor.with({
                    color: [...f0],
                    edge_tint: [...f82],
                    roughness,
                    anisotropy,
                }),
            },
            links: [],
            output: 'out.value',
        }),
        {
            name,
            expose: [
                ['out.color', 'color'],
                ['out.edge_tint', 'edge_tint'],
                ['out.roughness', 'roughness'],
                ['out.anisotropy', 'anisotropy'],
                ['out.tangent', 'tangent'],
            ],
        },
    );
}

/**
 * `material.metalPolished` — metal polido (alumínio): condutor de rugosidade 0,05, isotrópico; liso, sem padrão — o
 * que se vê nele é o reflexo do ambiente. Parâmetros: `color` (F0), `edge_tint` (F82), `roughness`, `anisotropy`,
 * `tangent`.
 */
export const metalPolished = metal('material.metalPolished', 0.05, 0);

// Os metais puros polidos: a refletância de frente F0 por canal (RGB linear) de Akenine-Möller et al., "Real-Time
// Rendering" 4ª ed., tabela 9.2 (o ouro, do exemplo `standard_surface_gold.mtlx` do MaterialX); a tinta da borda (o
// fator do Fresnel a 82°, o `specular_color` do OpenPBR) calculada das equações de Fresnel com o índice complexo a 650,
// 550 e 450 nm (valores aproximados de Johnson e Christy 1972 para o cobre e a prata, de Johnson e Christy 1974 para o
// cromo) dividido pelo Schlick do F0; a do latão é estimada (liga sem medida tabelada), entre a do cobre e a do ouro.

/**
 * `material.gold` — ouro polido: F0 (0,944, 0,776, 0,373), tinta da borda (0,998, 0,981, 0,751); rugosidade 0,05 —
 * espelho amarelo: o reflexo do ambiente tingido, mais branco na borda. Parâmetros: os de `metalPolished`.
 */
export const gold = metal('material.gold', 0.05, 0, [0.944, 0.776, 0.373], [0.998, 0.981, 0.751]);

/**
 * `material.copper` — cobre polido: F0 (0,955, 0,638, 0,538), tinta da borda (0,98, 0,96, 0,95); rugosidade 0,06 —
 * espelho rosado. Parâmetros: os de `metalPolished`.
 */
export const copper = metal('material.copper', 0.06, 0, [0.955, 0.638, 0.538], [0.98, 0.96, 0.95]);

/**
 * `material.brass` — latão polido (C260, 70 % cobre e 30 % zinco): F0 (0,910, 0,778, 0,423), tinta da borda
 * (0,99, 0,98, 0,9) estimada; rugosidade 0,07 — amarelo mais pálido e esverdeado que o ouro. Parâmetros: os de
 * `metalPolished`.
 */
export const brass = metal('material.brass', 0.07, 0, [0.91, 0.778, 0.423], [0.99, 0.98, 0.9]);

/**
 * `material.chrome` — cromo (a camada eletrodepositada): F0 (0,549, 0,556, 0,554) — reflete pouco mais da metade, o
 * espelho escuro e neutro —, tinta da borda (0,75, 0,75, 0,81): o cromo escurece antes de clarear na borda; rugosidade
 * 0,02. Parâmetros: os de `metalPolished`.
 */
export const chrome = metal('material.chrome', 0.02, 0, [0.549, 0.556, 0.554], [0.75, 0.75, 0.81]);

/**
 * `material.metalBrushed` — metal escovado (alumínio): anisotropia 0,9 com a tangente ao longo de u — a direção da
 * escova — e os riscos dela (`pattern.grain` alongado 125 : 1 ao longo de u): cada risco muda a rugosidade (de
 * `roughness`, 0,16, a `scratch_roughness`, 0,4) e inclina a normal através da escova (`relief`, a altura em unidades
 * do padrão) — o realce se alonga perpendicular aos riscos e se quebra em fios. O lobo é estreito ao longo da escova
 * (um espelho) e largo através dela: numa cena com a estrutura de raios, o reflexo do ambiente vem traçado, um raio
 * por pixel sorteado no eixo largo — o ambiente esticado perpendicular à escova. Parâmetros: `color` (F0), `edge_tint`
 * (F82), `roughness`, `scratch_roughness`, `anisotropy`, `relief`, `pattern_scale`.
 */
export const metalBrushed = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            scratch: pattern.grain.with({ scale: [1.2, 150], octaves: 2, gain: 0.7, seed: 6 }),
            rough: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.16, out_max: 0.4 }),
            relief: surface.bump.with({ strength: 0.001 }),
            metal: bsdf.conductor.with({
                color: [...ALUMINIUM_F0],
                edge_tint: [...ALUMINIUM_F82],
                anisotropy: 0.9,
            }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('scratch'),
            ['scratch.value', 'rough.x'],
            ['rough.value', 'metal.roughness'],
            ['uv.du', 'metal.tangent'],
            ...bumpLinks('relief', 'scratch.gradient'),
            ['metal.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalBrushed',
        ...SAMPLE_INPUT,
        expose: [
            ['metal.color', 'color'],
            ['metal.edge_tint', 'edge_tint'],
            ['rough.out_min', 'roughness'],
            ['rough.out_max', 'scratch_roughness'],
            ['metal.anisotropy', 'anisotropy'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/** Valores de uma pintura metálica: o F0 e a tinta da borda dos flocos tingidos e o pigmento do fundo. */
interface PaintValues {
    readonly color: Rgb;
    readonly edge_tint: Rgb;
    readonly base_color: Rgb;
}

/**
 * Sub-grafo da pintura de carro metálica: a base é metal — as plaquetas de alumínio no aglutinante tingido, um
 * condutor colorido de lobo médio que cobre `flake_weight` da base, sobre um resto de pigmento difuso escuro —, com a
 * normal de cada floco inclinada, e por cima o verniz, um dielétrico liso em camada com a normal própria.
 */
function paint(name: string, v: PaintValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                flake: pattern.cells.with({ scale: 230, jitter: 1, crease: 0.1, seed: 8 }),
                peel: pattern.grain.with({ scale: [7, 7], octaves: 2, seed: 9 }),
                pigment: math.value3.with({ value: [...v.color] }),
                tone: map.range.with({ out_min: 0.65, out_max: 1.35 }),
                tinted: math.scale3,
                tilt: surface.bump.with({ strength: 0.26 }),
                flakes: bsdf.conductor.with({ roughness: 0.36, edge_tint: [...v.edge_tint] }),
                layer_of_flakes: closure.normal,
                body: bsdf.diffuse.with({ color: [...v.base_color], roughness: 0.5 }),
                base: closure.mix.with({ t: 0.92 }),
                wave: surface.bump.with({ strength: 0.0005 }),
                coat: bsdf.dielectric.with({ ior: 1.5, roughness: 0.02 }),
                coat_surface: closure.normal,
                out: closure.layer,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('flake', 'peel'),
                ['flake.cell', 'tone.x'],
                ['pigment.value', 'tinted.v'],
                ['tone.value', 'tinted.s'],
                ['tinted.value', 'flakes.color'],
                ...bumpLinks('tilt', 'flake.random'),
                ['flakes.value', 'layer_of_flakes.c'],
                ['tilt.value', 'layer_of_flakes.normal'],
                ['body.value', 'base.a'],
                ['layer_of_flakes.value', 'base.b'],
                ...bumpLinks('wave', 'peel.gradient'),
                ['coat.value', 'coat_surface.c'],
                ['wave.value', 'coat_surface.normal'],
                ['coat_surface.value', 'out.top'],
                ['base.value', 'out.base'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['body.color', 'base_color'],
                ['pigment.value', 'flake_color'],
                ['flakes.edge_tint', 'flake_edge_tint'],
                ['flakes.roughness', 'flake_roughness'],
                ['base.t', 'flake_weight'],
                ['tilt.strength', 'flake_tilt'],
                ['out.top_color', 'coat_color'],
                ['coat.roughness', 'coat_roughness'],
                ['coat.ior', 'coat_ior'],
                ['out.top_weight', 'coat_weight'],
                ['wave.strength', 'orange_peel'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `material.carPaint` — pintura de carro metálica (vermelha): metal sob verniz, como nos modelos de pintura das outras
 * engines (o Principled BSDF do Blender com `metallic` 1 e `coat` 1 de normal própria; o verniz de duas normais da
 * Unreal; as três camadas — base, flocos, verniz — do V-Ray e do Arnold). A base são as plaquetas de alumínio no
 * aglutinante tingido: um condutor da cor da tinta (`flake_color`, o F0: o alumínio vezes a cor do aglutinante na ida e
 * na volta) de lobo médio (`flake_roughness`, 0,36) que cobre `flake_weight` (0,92) da base — o brilho largo e claro
 * que segue a luz, a cara de metal —, sobre um resto de pigmento difuso escuro (`base_color`). Cada floco
 * (`pattern.cells`: 230 por unidade do padrão) tem a normal inclinada alguns graus (`flake_tilt`, a tangente máxima
 * dividida pelo tamanho de uma unidade do padrão: até cerca de 8° numa esfera de raio 0,55) e o seu tom (± 35 %):
 * juntos alargam o lobo e dão o granulado que cintila pela peça toda. A cor muda com o ângulo (o flop): clara e
 * metálica perto da direção do reflexo; fora dela e no rasante, escura e saturada (`flake_edge_tint`, a tinta da borda
 * — o caminho mais longo no aglutinante). Por cima, o verniz: um dielétrico liso em camada (IOR 1,5, rugosidade 0,02: o
 * reflexo nítido do ambiente) com a normal própria — lisa, separada da dos flocos, com a casca de laranja muito leve
 * (`pattern.grain` largo, `orange_peel` a altura em unidades do padrão). Valores de partida do exemplo
 * `open_pbr_carpaint.mtlx` do MaterialX (a base de condutor sob o verniz). Parâmetros: `base_color`, `flake_color`,
 * `flake_edge_tint`, `flake_roughness`, `flake_weight`, `flake_tilt`, `coat_color`, `coat_roughness`, `coat_ior`,
 * `coat_weight`, `orange_peel`, `pattern_scale`.
 */
export const carPaint = paint('material.carPaint', {
    color: [0.56, 0.035, 0.03],
    edge_tint: [0.3, 0.01, 0.015],
    base_color: [0.2, 0.006, 0.008],
});

/**
 * `material.carPaintSilver` — pintura de carro prata metálica: a mesma receita de `carPaint` com o aglutinante quase
 * incolor — os flocos com o F0 do alumínio pouco tingido (0,72, 0,73, 0,75) e a tinta da borda cinza (0,45): claro de
 * frente para a luz, cinza-escuro fora do reflexo. Parâmetros: os de `carPaint`.
 */
export const carPaintSilver = paint('material.carPaintSilver', {
    color: [0.72, 0.73, 0.75],
    edge_tint: [0.45, 0.45, 0.47],
    base_color: [0.1, 0.1, 0.105],
});

/**
 * `material.metalOxidized` — metal oxidado (chapa de aço com ferrugem). O metal que sobra é o condutor liso e refletivo
 * (ferro, F0 (0,562, 0,565, 0,578) — Akenine-Möller et al., "Real-Time Rendering" 4ª ed., tabela 9.2; rugosidade 0,13),
 * que escurece e fica áspero perto da ferrugem (a mancha que a anuncia). A ferrugem é o óxido em pó (hematita e
 * goethita: difuso, sem brilho), de cor variada — do quase preto ao castanho, ao alaranjado `oxide_color` e a pontos
 * amarelados (uma rampa de quatro cores por dois grãos, um largo e um fino) — e em relevo: a crosta granulada (`relief`, em unidades
 * do padrão, pesada pela máscara) e a borda inchada, que sobe do metal para a crosta (`swell`, na faixa de transição).
 * A máscara soma as manchas largas (`pattern.grain` de cinco oitavas), os riscos que escorrem ao longo de v
 * (`pattern.grain` esticado: na esfera, de polo a polo) e os pites (`pattern.cells`: pontos no centro de algumas
 * células) ao avanço `oxidation` em [0, 1] (0,55: mais da metade tomada, com metal à vista; 0 quase limpo, só pites e
 * riscos; 1 tudo). Parâmetros: `color`, `roughness`, `oxide_color`, `oxide_roughness`, `oxidation`, `relief`, `swell`,
 * `pattern_scale`.
 */
export const metalOxidized = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            // A máscara: manchas largas, riscos ao longo de v e pites, mais o avanço.
            stain: pattern.grain.with({ scale: [3, 3], octaves: 5, gain: 0.55, seed: 13 }),
            drip: pattern.grain.with({ scale: [46, 2.2], octaves: 2, gain: 0.5, seed: 21 }),
            pit: pattern.cells.with({ scale: 110, jitter: 1, crease: 0.5, seed: 22 }),
            spread: map.range.with({ in_min: -1, in_max: 1, out_min: -4, out_max: 4, clamped: 0 }),
            run: map.range.with({ in_min: 0.12, in_max: 0.6, out_min: 0, out_max: 1.4 }),
            run_gate: map.range.with({ in_min: -0.25, in_max: 0.35 }),
            runs: math.mul,
            pit_core: map.range.with({ in_min: 0.35, in_max: 0.9, out_min: 0, out_max: 1 }),
            pit_some: map.range.with({ in_min: 0.7, in_max: 0.8, out_min: 0, out_max: 2.2 }),
            pits: math.mul,
            advance: math.value.with({ value: 0.55 }),
            bias: map.range.with({ out_min: -4.6, out_max: 4.2, clamped: 0 }),
            level_a: math.add,
            level_b: math.add,
            level: math.add,
            mask: map.range.with({ in_min: 0, in_max: 0.55 }),
            // A cor da ferrugem: um grão largo (as zonas) e um fino (os pontos) na rampa de quatro cores.
            zone: pattern.grain.with({ scale: [9, 9], octaves: 4, gain: 0.6, seed: 14 }),
            crust: pattern.grain.with({ scale: [80, 80], octaves: 3, seed: 15 }),
            zone_t: map.range.with({ in_min: -1, in_max: 1, out_min: 0.05, out_max: 0.8 }),
            speck_t: map.range.with({ in_min: -1, in_max: 1, out_min: -0.22, out_max: 0.22 }),
            tone: math.add,
            dark: color.ramp.with({
                color_a: [0.012, 0.006, 0.005],
                color_b: [0.075, 0.026, 0.012],
                low: 0.08,
                high: 0.36,
            }),
            orange: math.value3.with({ value: [0.26, 0.085, 0.022] }),
            to_orange: map.range.with({ in_min: 0.36, in_max: 0.68 }),
            warm: math.mix3,
            yellow: math.value3.with({ value: [0.4, 0.2, 0.05] }),
            to_yellow: map.range.with({ in_min: 0.68, in_max: 0.98 }),
            powder: math.mix3,
            // O metal perto da ferrugem: mais escuro (a mancha) e mais áspero.
            near: map.range.with({ in_min: -1.6, in_max: 0, out_min: 0, out_max: 1 }),
            clean: math.value3.with({ value: [0.562, 0.565, 0.578] }),
            tarnished: math.value3.with({ value: [0.2, 0.13, 0.085] }),
            metal_color: math.mix3,
            metal_rough: map.range.with({ out_min: 0.13, out_max: 0.5 }),
            // O relevo: a crosta granulada sobre a ferrugem e a borda inchada na transição.
            height: math.value.with({ value: 0.0026 }),
            grown: math.mul,
            relief: surface.bump,
            fall: map.range.with({ out_min: 1, out_max: 0 }),
            band: math.mul,
            lift: math.value.with({ value: 0.02 }),
            raised: math.mul,
            edge: surface.bump,
            bare: bsdf.conductor,
            rust: bsdf.diffuse.with({ roughness: 1 }),
            rust_interface: bsdf.dielectric.with({
                ior: 1.5,
                roughness: 0.95,
                tint: [0.3, 0.3, 0.3],
            }),
            oxide: closure.add,
            mixed: closure.mix,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('stain', 'drip', 'pit', 'zone', 'crust'),
            ['stain.value', 'spread.x'],
            ['drip.value', 'run.x'],
            ['pit.height', 'pit_core.x'],
            ['pit.cell', 'pit_some.x'],
            ['pit_core.value', 'pits.a'],
            ['pit_some.value', 'pits.b'],
            ['advance.value', 'bias.x'],
            ['spread.value', 'level_a.a'],
            ['run.value', 'runs.a'],
            ['zone.value', 'run_gate.x'],
            ['run_gate.value', 'runs.b'],
            ['runs.value', 'level_a.b'],
            ['level_a.value', 'level_b.a'],
            ['pits.value', 'level_b.b'],
            ['level_b.value', 'level.a'],
            ['bias.value', 'level.b'],
            ['level.value', 'mask.x'],
            ['zone.value', 'zone_t.x'],
            ['crust.value', 'speck_t.x'],
            ['zone_t.value', 'tone.a'],
            ['speck_t.value', 'tone.b'],
            ['tone.value', 'dark.t'],
            ['tone.value', 'to_orange.x'],
            ['tone.value', 'to_yellow.x'],
            ['dark.color', 'warm.a'],
            ['orange.value', 'warm.b'],
            ['to_orange.value', 'warm.t'],
            ['warm.value', 'powder.a'],
            ['yellow.value', 'powder.b'],
            ['to_yellow.value', 'powder.t'],
            ['powder.value', 'rust.color'],
            ['level.value', 'near.x'],
            ['clean.value', 'metal_color.a'],
            ['tarnished.value', 'metal_color.b'],
            ['near.value', 'metal_color.t'],
            ['metal_color.value', 'bare.color'],
            ['near.value', 'metal_rough.x'],
            ['metal_rough.value', 'bare.roughness'],
            ['mask.value', 'grown.a'],
            ['height.value', 'grown.b'],
            ...bumpLinks('relief', 'crust.gradient'),
            ['grown.value', 'relief.strength'],
            ['mask.value', 'fall.x'],
            ['mask.value', 'band.a'],
            ['fall.value', 'band.b'],
            ['band.value', 'raised.a'],
            ['lift.value', 'raised.b'],
            ...bumpLinks('edge', 'stain.gradient', 'relief.value'),
            ['raised.value', 'edge.strength'],
            ['rust_interface.value', 'oxide.a'],
            ['rust.value', 'oxide.b'],
            ['bare.value', 'mixed.a'],
            ['oxide.value', 'mixed.b'],
            ['mask.value', 'mixed.t'],
            ['mixed.value', 'out.c'],
            ['edge.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalOxidized',
        ...SAMPLE_INPUT,
        expose: [
            ['clean.value', 'color'],
            ['metal_rough.out_min', 'roughness'],
            ['orange.value', 'oxide_color'],
            ['rust_interface.roughness', 'oxide_roughness'],
            ['advance.value', 'oxidation'],
            ['height.value', 'relief'],
            ['lift.value', 'swell'],
            PATTERN_SCALE,
        ],
    },
);
