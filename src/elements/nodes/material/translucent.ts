import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { math } from '../math';

// Materiais em que a luz entra no corpo (spec 011, R11): o vidro (transmissão com refração) e os de subsuperfície
// (pele, cera, mármore, porcelana) — um especular de dielétrico sobre `bsdf.subsurface`. O raio de espalhamento por
// canal é o livre caminho médio difuso l_d = 1/√(3 σ_a σ_t′) normalizado pelo maior canal, com os coeficientes medidos
// por Jensen et al. 2001 ("A Practical Model for Subsurface Light Transport", tabela 2) onde há medida.

/** Valores de um material de subsuperfície. */
interface SubsurfaceValues {
    readonly color: readonly [number, number, number];
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
                ['specular.roughness', 'roughness'],
                ['specular.ior', 'ior'],
            ],
        },
    );
}

/**
 * `material.skin` — pele: IOR 1,4 (epiderme; a faixa dos tecidos moles, 1,36–1,45), rugosidade 0,45; raio (1, 0,37,
 * 0,19) — o l_d da "skin1" de Jensen et al. 2001 (σ_s′ 0,74, 0,88, 1,01 e σ_a 0,032, 0,17, 0,48 /mm): o vermelho
 * espalha mais longe. Parâmetros: `color`, `radius`, `roughness`, `ior`.
 */
export const skin = scattering('material.skin', {
    color: [0.8, 0.55, 0.45],
    radius: [1, 0.37, 0.19],
    roughness: 0.45,
    ior: 1.4,
});

/**
 * `material.wax` — cera (parafina): IOR 1,44 (parafina sólida, n_D 1,44), rugosidade 0,3; sem medida tabelada do
 * espalhamento — o raio (1, 0,7, 0,45) é estimado (corpo claro, quente na contraluz). Parâmetros: os de `skin`.
 */
export const wax = scattering('material.wax', {
    color: [0.9, 0.82, 0.62],
    radius: [1, 0.7, 0.45],
    roughness: 0.3,
    ior: 1.44,
});

/**
 * `material.marble` — mármore polido: IOR 1,5 e raio (1, 0,65, 0,46) — o l_d do mármore de Jensen et al. 2001 (σ_s′
 * 2,19, 2,62, 3,00 e σ_a 0,0021, 0,0041, 0,0071 /mm, η 1,5); rugosidade 0,1. Parâmetros: os de `skin`.
 */
export const marble = scattering('material.marble', {
    color: [0.83, 0.79, 0.75],
    radius: [1, 0.65, 0.46],
    roughness: 0.1,
    ior: 1.5,
});

/**
 * `material.porcelain` — porcelana esmaltada: corpo vitrificado levemente translúcido (raio curto e quase neutro,
 * estimado: sem medida tabelada) sob um esmalte liso de IOR 1,5 (vidro de silicato), rugosidade 0,05. Parâmetros: os
 * de `skin`.
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
