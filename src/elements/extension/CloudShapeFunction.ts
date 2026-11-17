import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../scene/contracts/ExtensionFunction';
import { cloudShapePoint } from '../media/clouds/shaders';

/** Opções da forma das nuvens: grafo de nós ou WGSL do ponto `cloud_shape`. */
export type CloudShapeOptions = ExtensionFunctionOptions;

/**
 * Função do ponto `cloud_shape` (spec 041, R3) — a forma das nuvens, em WGSL ou por um grafo de nós:
 *
 * ```wgsl
 * fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f
 * ```
 *
 * Os quatro canais do volume de ruído em `p` ∈ [0, 1)³ (periódico: o volume se repete pelo céu): R a forma base, G/B/A a
 * erosão em três frequências. Avaliada na GPU pelo `CloudNoiseFlow` nos volumes de forma e de detalhe quando muda (a
 * revisão sobe); mudar valores refaz os volumes sem recompilar. Os ruídos do grafo devem usar `period` para o volume
 * ladrilhar (sem ele, a costura aparece: aviso na criação). Resultado não finito vale 0; fora de [0, 1], saturado.
 */
export class CloudShapeFunction extends ExtensionFunction {
    constructor(options: CloudShapeOptions) {
        super(cloudShapePoint, options);
        warnUnperiodic(options);
    }
}

/** Avisa (uma vez por grafo) quando um nó de ruído do grafo de forma não tem `period`. */
function warnUnperiodic(options: CloudShapeOptions): void {
    if (options.graph === undefined) return;
    const plain = Object.entries(options.graph.nodes).filter(([, node]) => {
        const definition = 'definition' in node ? node.definition : node;
        const values = 'values' in node ? node.values : {};
        return (
            'name' in definition
            && definition.name.startsWith('noise.')
            && Number(values.period ?? 0) === 0
        );
    });
    if (plain.length > 0)
        console.warn(
            `CloudShapeFunction: ruído sem 'period' em ${plain.map(([id]) => id).join(', ')} — o volume das nuvens não ladrilha (costura visível).`,
        );
}
