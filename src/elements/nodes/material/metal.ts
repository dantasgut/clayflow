import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';

// Metais (spec 011, R11): o especular de condutor (`bsdf.conductor`), com a refletância de frente F0 na cor e a tinta
// da borda F82. Alumínio: F0 (0,912, 0,914, 0,920) e F82 (0,970, 0,979, 0,988) — o exemplo
// `open_pbr_aluminum_brushed.mtlx` do MaterialX (OpenPBR). Outros metais pelos parâmetros, ex.: ouro F0 (0,944, 0,776,
// 0,373) e F82 (0,998, 0,981, 0,751) (`standard_surface_gold.mtlx`).

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
 * `material.metalPolished` — metal polido (alumínio): condutor de rugosidade 0,05, isotrópico. Parâmetros: `color`
 * (F0), `edge_tint` (F82), `roughness`, `anisotropy`, `tangent`.
 */
export const metalPolished = metal('material.metalPolished', 0.05, 0);

/**
 * `material.metalBrushed` — metal escovado (alumínio): rugosidade 0,2 e anisotropia 0,9 (os valores do exemplo
 * `open_pbr_aluminum_brushed.mtlx`) — o realce se alonga perpendicular às ranhuras. A tangente é a direção das ranhuras
 * (0 = a padrão da normal; ligue `geometry.tangentUv`). Parâmetros: os de `metalPolished`.
 */
export const metalBrushed = metal('material.metalBrushed', 0.2, 0.9);

/**
 * `material.carPaint` — pintura de carro metálica: um condutor (a camada de flocos de alumínio tingida pelo pigmento,
 * rugosidade 0,35) sob um dielétrico liso em camada (o verniz: IOR 1,6 e rugosidade 0,02, os valores do exemplo
 * `open_pbr_carpaint.mtlx` do MaterialX). Parâmetros: `base_color`, `base_edge_tint`, `base_roughness`, `coat_color`,
 * `coat_roughness`, `coat_ior`, `coat_weight`.
 */
export const carPaint = Subgraph.point(
    new NodeGraph({
        nodes: {
            flakes: bsdf.conductor.with({ color: [0.6, 0.02, 0.02], roughness: 0.35 }),
            coat: bsdf.dielectric.with({ ior: 1.6, roughness: 0.02 }),
            out: closure.layer,
        },
        links: [
            ['coat.value', 'out.top'],
            ['flakes.value', 'out.base'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.carPaint',
        expose: [
            ['flakes.color', 'base_color'],
            ['flakes.edge_tint', 'base_edge_tint'],
            ['flakes.roughness', 'base_roughness'],
            ['out.top_color', 'coat_color'],
            ['coat.roughness', 'coat_roughness'],
            ['coat.ior', 'coat_ior'],
            ['out.top_weight', 'coat_weight'],
        ],
    },
);

/**
 * `material.metalOxidized` — metal oxidado (ferro com ferrugem): o condutor (ferro, F0 (0,562, 0,565, 0,578) —
 * Akenine-Möller et al., "Real-Time Rendering" 4ª ed., tabela 9.2; rugosidade 0,45) misturado ao óxido (dielétrico
 * opaco: hematita/goethita em pó, difuso castanho-avermelhado sob uma interface muito rugosa) por `oxidation` em [0, 1]
 * (0,7; ligue um ruído para as manchas — a 012). Parâmetros: `color`, `roughness`, `oxide_color`, `oxide_roughness`,
 * `oxidation`.
 */
export const metalOxidized = Subgraph.point(
    new NodeGraph({
        nodes: {
            bare: bsdf.conductor.with({ color: [0.562, 0.565, 0.578], roughness: 0.45 }),
            rust: bsdf.diffuse.with({ color: [0.3, 0.11, 0.04], roughness: 1 }),
            rust_interface: bsdf.dielectric.with({ ior: 1.5, roughness: 0.9 }),
            oxide: closure.add,
            out: closure.mix.with({ t: 0.7 }),
        },
        links: [
            ['rust_interface.value', 'oxide.a'],
            ['rust.value', 'oxide.b'],
            ['bare.value', 'out.a'],
            ['oxide.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalOxidized',
        expose: [
            ['bare.color', 'color'],
            ['bare.roughness', 'roughness'],
            ['rust.color', 'oxide_color'],
            ['rust_interface.roughness', 'oxide_roughness'],
            ['out.t', 'oxidation'],
        ],
    },
);
