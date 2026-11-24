import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { PATTERN_SCALE } from './pattern';
import { species } from './woodSpecies';

// Madeira envernizada (spec 011, R11, US5 cenário 1): a madeira (os anéis, a fibra e os poros na cor de um difuso sem
// especular próprio — o verniz, de índice 1,5, casa com o da celulose, 1,53, e molha a madeira: a interface rugosa dela
// deixa de refletir, o que escurece e satura a cor) sob um dielétrico em camada (`closure.layer`) com a cor de absorção
// do verniz (âmbar). O verniz acompanha o poro aberto e a fibra: a normal dele desce em cada poro e o realce quebra em
// tracinhos ao longo do veio. A figura é a do corte tangencial de um carvalho claro: linhas de anel finas e de
// espaçamento irregular, com ovais e catedrais, e pouco contraste.

/** Sub-grafo da madeira envernizada: a rugosidade, a cor do verniz e a fundura do poro nele como padrões. */
function varnished(
    name: string,
    coatRoughness: number,
    coatColor: readonly [number, number, number],
    pore: number,
): NodeDefinition {
    return species(name, {
        color: [0.47, 0.3, 0.15],
        late_color: [0.35, 0.21, 0.095],
        knot_color: [0.1, 0.05, 0.022],
        offset: [0.33, -0.38],
        rings: {
            scale: 80,
            depth: 0.2,
            distortion: 0.3,
            distortion_scale: [0.75, 2.1],
            irregularity: 1,
            waviness: 0.009,
            waviness_scale: [1.2, 25],
            seed: 29,
            knots: 0,
        },
        late_start: 0.58,
        year: 0.1,
        broad: 0.16,
        figure: 0.1,
        streak: 0.18,
        fine: 0.16,
        pore_scale: [10, 210],
        pore: 0.85,
        fleck: 0.16,
        fleck_scale: [22, 260],
        roughness: 0.7,
        coat: { roughness: coatRoughness, color: coatColor, pore, fiber: 0.00022 },
        expose: [
            ['tone.color_a', 'base_color'],
            ['tone.color_b', 'base_late_color'],
            ['body.roughness', 'base_roughness'],
            ['out.top_color', 'coat_color'],
            ['coat.roughness', 'coat_roughness'],
            ['coat.ior', 'coat_ior'],
            ['out.top_weight', 'coat_weight'],
            ['pore_relief.strength', 'pore_relief'],
            PATTERN_SCALE,
        ],
    });
}

/**
 * `material.woodVarnishedGloss` — madeira com verniz brilhante (carvalho claro): as linhas finas e irregulares dos
 * anéis, as faixas de cor, a fibra e os poros alongados sob um dielétrico liso — verniz de poliuretano/alquídico, IOR
 * 1,5 (`research.md` R11), rugosidade 0,05, cor de absorção âmbar — que desce nos poros (`pore_relief`, a altura em
 * unidades do padrão) e acompanha a fibra. Parâmetros: `base_color`, `base_late_color`, `base_roughness` (a do
 * difuso), `coat_color`, `coat_roughness`, `coat_ior`, `coat_weight`, `pore_relief`, `pattern_scale`.
 */
export const woodVarnishedGloss = varnished(
    'material.woodVarnishedGloss',
    0.05,
    [1, 0.8, 0.5],
    0.0022,
);

/**
 * `material.woodVarnishedMatte` — madeira com verniz fosco (acetinado): o mesmo verniz (IOR 1,5) com agente
 * fosqueante, rugosidade 0,35, menos âmbar e o poro mais aberto. Parâmetros: os de `woodVarnishedGloss`.
 */
export const woodVarnishedMatte = varnished(
    'material.woodVarnishedMatte',
    0.35,
    [1, 0.9, 0.7],
    0.0032,
);
