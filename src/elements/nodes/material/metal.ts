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

/** Sub-grafo de um metal nu: um `bsdf.conductor` com todos os parâmetros expostos. */
function metal(name: string, roughness: number, anisotropy: number): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                out: bsdf.conductor.with({
                    color: [...ALUMINIUM_F0],
                    edge_tint: [...ALUMINIUM_F82],
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

/**
 * `material.metalBrushed` — metal escovado (alumínio): anisotropia 0,8 com a tangente ao longo de u — a direção da
 * escova — e os riscos dela (`pattern.grain` alongado 125 : 1 ao longo de u): cada risco muda a rugosidade (de
 * `roughness`, 0,14, a `scratch_roughness`, 0,36) e inclina a normal através da escova (`relief`, a altura em unidades do padrão) — o realce
 * se alonga perpendicular aos riscos e se quebra em fios. Parâmetros: `color` (F0), `edge_tint` (F82), `roughness`,
 * `scratch_roughness`, `anisotropy`, `relief`, `pattern_scale`.
 */
export const metalBrushed = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            scratch: pattern.grain.with({ scale: [1.2, 150], octaves: 2, gain: 0.7, seed: 6 }),
            rough: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.14, out_max: 0.36 }),
            relief: surface.bump.with({ strength: 0.0006 }),
            metal: bsdf.conductor.with({
                color: [...ALUMINIUM_F0],
                edge_tint: [...ALUMINIUM_F82],
                anisotropy: 0.8,
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

/**
 * `material.carPaint` — pintura de carro metálica: a camada de flocos de alumínio tingida pelo pigmento (um condutor
 * de rugosidade 0,3) sob o verniz, um dielétrico liso em camada (IOR 1,6 e rugosidade 0,02, os valores do exemplo
 * `open_pbr_carpaint.mtlx` do MaterialX). Os flocos (`pattern.cells`: 150 por unidade do padrão) têm cada um a sua
 * inclinação (`flake_tilt`, a tangente do ângulo máximo) e o seu tom: brilhos pontuais que mudam com o ângulo, sob o
 * realce nítido do verniz; o verniz tem a casca de laranja (`pattern.grain` largo ondula a normal dele, `orange_peel`
 * a altura em unidades do padrão). Parâmetros: `base_color`, `base_edge_tint`, `base_roughness`, `flake_tilt`,
 * `coat_color`, `coat_roughness`, `coat_ior`, `coat_weight`, `orange_peel`, `pattern_scale`.
 */
export const carPaint = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            flake: pattern.cells.with({ scale: 150, jitter: 1, crease: 0.1, seed: 8 }),
            peel: pattern.grain.with({ scale: [14, 14], octaves: 2, seed: 9 }),
            pigment: math.value3.with({ value: [0.6, 0.02, 0.02] }),
            tone: map.range.with({ out_min: 0.8, out_max: 1.2 }),
            tinted: math.scale3,
            tilt: surface.bump.with({ strength: 0.1 }),
            flakes: bsdf.conductor.with({ roughness: 0.3 }),
            layer_of_flakes: closure.normal,
            wave: surface.bump.with({ strength: 0.0012 }),
            coat: bsdf.dielectric.with({ ior: 1.6, roughness: 0.02 }),
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
            ...bumpLinks('wave', 'peel.gradient'),
            ['coat.value', 'coat_surface.c'],
            ['wave.value', 'coat_surface.normal'],
            ['coat_surface.value', 'out.top'],
            ['layer_of_flakes.value', 'out.base'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.carPaint',
        ...SAMPLE_INPUT,
        expose: [
            ['pigment.value', 'base_color'],
            ['flakes.edge_tint', 'base_edge_tint'],
            ['flakes.roughness', 'base_roughness'],
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

/**
 * `material.metalOxidized` — metal oxidado (ferro com ferrugem): o condutor (ferro, F0 (0,562, 0,565, 0,578) —
 * Akenine-Möller et al., "Real-Time Rendering" 4ª ed., tabela 9.2; rugosidade 0,45) misturado ao óxido (dielétrico
 * opaco: hematita/goethita em pó, difuso do castanho-escuro ao alaranjado `oxide_color` sob uma interface muito rugosa)
 * em manchas: `pattern.grain` de quatro oitavas (4 manchas por unidade do padrão) mais o avanço `oxidation` em [0, 1]
 * (0,7: a ferrugem cobre a maior parte; 0 quase limpo, 1 tudo) é a máscara, e a ferrugem tem o relevo granulado dela
 * (`relief`, em unidades do padrão, pesado pela máscara). Parâmetros: `color`, `roughness`, `oxide_color`,
 * `oxide_roughness`, `oxidation`, `relief`, `pattern_scale`.
 */
export const metalOxidized = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            stain: pattern.grain.with({ scale: [4, 4], octaves: 4, gain: 0.55, seed: 13 }),
            crust: pattern.grain.with({ scale: [70, 70], octaves: 3, seed: 14 }),
            spread: map.range.with({
                in_min: -1,
                in_max: 1,
                out_min: -6,
                out_max: 6,
                clamped: 0,
            }),
            advance: math.value.with({ value: 0.7 }),
            bias: map.range.with({ out_min: -2, out_max: 3, clamped: 0 }),
            level: math.add,
            mask: math.clamp,
            powder: color.ramp.with({
                color_a: [0.04, 0.016, 0.01],
                color_b: [0.17, 0.058, 0.022],
                low: -0.5,
                high: 0.5,
            }),
            height: math.value.with({ value: 0.0022 }),
            grown: math.mul,
            relief: surface.bump,
            bare: bsdf.conductor.with({ color: [0.562, 0.565, 0.578], roughness: 0.45 }),
            rust: bsdf.diffuse.with({ roughness: 1 }),
            rust_interface: bsdf.dielectric.with({ ior: 1.5, roughness: 0.9 }),
            oxide: closure.add,
            mixed: closure.mix,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('stain', 'crust'),
            ['stain.value', 'spread.x'],
            ['advance.value', 'bias.x'],
            ['spread.value', 'level.a'],
            ['bias.value', 'level.b'],
            ['level.value', 'mask.x'],
            ['crust.value', 'powder.t'],
            ['powder.color', 'rust.color'],
            ['mask.value', 'grown.a'],
            ['height.value', 'grown.b'],
            ...bumpLinks('relief', 'crust.gradient'),
            ['grown.value', 'relief.strength'],
            ['rust_interface.value', 'oxide.a'],
            ['rust.value', 'oxide.b'],
            ['bare.value', 'mixed.a'],
            ['oxide.value', 'mixed.b'],
            ['mask.value', 'mixed.t'],
            ['mixed.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalOxidized',
        ...SAMPLE_INPUT,
        expose: [
            ['bare.color', 'color'],
            ['bare.roughness', 'roughness'],
            ['powder.color_b', 'oxide_color'],
            ['rust_interface.roughness', 'oxide_roughness'],
            ['advance.value', 'oxidation'],
            ['height.value', 'relief'],
            PATTERN_SCALE,
        ],
    },
);
