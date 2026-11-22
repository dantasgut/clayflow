import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { input } from '../input';
import { SAMPLE_INPUT } from './pattern';
import { woodRaw } from './surface';

// Madeira envernizada (spec 011, R11, US5 cenário 1): a madeira crua (`material.woodRaw`, usada como nó: os anéis, a
// fibra e os poros dela) sob um dielétrico — o verniz — em camada (`closure.layer`), com a cor de absorção do verniz
// (âmbar). O verniz tem a normal da superfície (liso por cima do veio, o realce nítido dele separado do veio embaixo);
// molha a madeira — o índice dele (1,5) casa com o da celulose (1,53), e a interface rugosa da madeira deixa de
// refletir (`ior` 1 na base: sem especular próprio), o que escurece e satura a cor — e enche os poros (o relevo da base
// cai a um terço).

/** Sub-grafo da madeira envernizada: rugosidade e cor do verniz como padrões. */
function varnished(
    name: string,
    coatRoughness: number,
    coatColor: readonly [number, number, number],
): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                s: input.surfaceSample(),
                wood: woodRaw.with({ ior: 1, relief: 0.00001, fiber_relief: 0.00013 }),
                coat: bsdf.dielectric.with({ ior: 1.5, roughness: coatRoughness }),
                out: closure.layer.with({ top_color: [...coatColor] }),
            },
            links: [
                ['s.value', 'wood.s'],
                ['coat.value', 'out.top'],
                ['wood.value', 'out.base'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['wood.color', 'base_color'],
                ['wood.late_color', 'base_late_color'],
                ['wood.roughness', 'base_roughness'],
                ['out.top_color', 'coat_color'],
                ['coat.roughness', 'coat_roughness'],
                ['coat.ior', 'coat_ior'],
                ['out.top_weight', 'coat_weight'],
                ['wood.pattern_scale', 'pattern_scale'],
            ],
        },
    );
}

/**
 * `material.woodVarnishedGloss` — madeira com verniz brilhante: a madeira crua (anéis, fibra e poros) sob um dielétrico
 * liso. Verniz de poliuretano/alquídico, IOR 1,5 (`research.md` R11), rugosidade 0,04; cor de absorção âmbar.
 * Parâmetros: `base_color`, `base_late_color`, `base_roughness`, `coat_color`, `coat_roughness`, `coat_ior`,
 * `coat_weight`, `pattern_scale`.
 */
export const woodVarnishedGloss = varnished('material.woodVarnishedGloss', 0.04, [1, 0.8, 0.5]);

/**
 * `material.woodVarnishedMatte` — madeira com verniz fosco (acetinado): o mesmo verniz (IOR 1,5) com agente
 * fosqueante, rugosidade 0,35, e menos âmbar. Parâmetros: os de `woodVarnishedGloss`.
 */
export const woodVarnishedMatte = varnished('material.woodVarnishedMatte', 0.35, [1, 0.9, 0.7]);
