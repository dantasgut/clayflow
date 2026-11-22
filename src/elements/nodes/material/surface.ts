import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';

// Materiais prontos opacos de uma interface só (spec 011, R11): um especular de dielétrico sobre um difuso — a luz que
// a interface não reflete entra, espalha no corpo e sai com a cor dele. Os valores são os padrões dos parâmetros
// expostos; cada parâmetro é também uma entrada (a 012 liga veios e poros às mesmas entradas).

/** Valores de um dielétrico opaco: cor do corpo, rugosidade e IOR da interface, rugosidade do difuso. */
interface OpaqueValues {
    readonly color: readonly [number, number, number];
    readonly roughness: number;
    readonly ior: number;
    readonly diffuse_roughness: number;
}

/** Sub-grafo de um dielétrico opaco: `bsdf.dielectric` somado a `bsdf.diffuse` (`closure.add`). */
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
 * `material.woodRaw` — madeira crua (carvalho lixado, sem acabamento): difuso áspero sob uma interface de celulose
 * muito rugosa, sem realce nítido. IOR 1,53 (celulose, n_D 1,53–1,55; `research.md` R11); rugosidade 0,7 (madeira
 * lixada); cor do carvalho claro. Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`.
 */
export const woodRaw = opaque('material.woodRaw', {
    color: [0.45, 0.28, 0.15],
    roughness: 0.7,
    ior: 1.53,
    diffuse_roughness: 0.6,
});

/**
 * `material.leather` — couro curtido com acabamento: IOR 1,5 (colágeno e o filme de acabamento, n ≈ 1,5), rugosidade
 * 0,5 (o grão espalha o realce). Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`.
 */
export const leather = opaque('material.leather', {
    color: [0.22, 0.1, 0.05],
    roughness: 0.5,
    ior: 1.5,
    diffuse_roughness: 0.5,
});

/**
 * `material.rubber` — borracha preta: IOR 1,519 (borracha natural, poli-isopreno, n_D 1,519), rugosidade 0,75, albedo
 * 0,03 (o negro de fumo absorve quase tudo). Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`.
 */
export const rubber = opaque('material.rubber', {
    color: [0.03, 0.03, 0.03],
    roughness: 0.75,
    ior: 1.519,
    diffuse_roughness: 0.3,
});

/**
 * `material.ceramic` — cerâmica esmaltada (grés): o esmalte é um vidro de silicato, IOR 1,5; rugosidade 0,25 (esmalte
 * acetinado). Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`.
 */
export const ceramic = opaque('material.ceramic', {
    color: [0.72, 0.62, 0.5],
    roughness: 0.25,
    ior: 1.5,
    diffuse_roughness: 0.2,
});

/**
 * `material.plasticMatte` — plástico fosco (polipropileno texturizado): IOR 1,49 (polipropileno e PMMA, n_D 1,49),
 * rugosidade 0,6. Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`.
 */
export const plasticMatte = opaque('material.plasticMatte', {
    color: [0.7, 0.08, 0.06],
    roughness: 0.6,
    ior: 1.49,
    diffuse_roughness: 0,
});

/**
 * `material.plasticGloss` — plástico brilhante (PMMA injetado, polido): IOR 1,49 (PMMA, n_D 1,49), rugosidade 0,08.
 * Parâmetros: `color`, `roughness`, `ior`, `diffuse_roughness`.
 */
export const plasticGloss = opaque('material.plasticGloss', {
    color: [0.05, 0.25, 0.7],
    roughness: 0.08,
    ior: 1.49,
    diffuse_roughness: 0,
});
