import type { ExtensionParamValue } from '../../scene/contracts/ExtensionParams';
import { NodeGraph } from '../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../scene/graph/NodeDefinition';
import { DisplacementFunction } from '../extension/DisplacementFunction';
import { relief } from '../nodes/material';
import { surface } from '../nodes/surface';

/** Nome de um relevo pronto da biblioteca (os nós de `nodes.relief`): o do material de mesmo nome. */
export type DisplacementName = keyof typeof relief;

/**
 * Fábrica de um deslocamento pronto: os valores dos parâmetros do relevo (os do material de mesmo nome: as alturas em
 * milímetros, `pattern_scale`) e a escala do mundo `scale` (unidades por metro; 1) → a `DisplacementFunction` que se
 * anexa à entidade da `ParametricSurface`.
 */
export type DisplacementFactory = (
    values?: Readonly<Record<string, ExtensionParamValue>>,
) => DisplacementFunction;

/** A fábrica do relevo `definition`: o nó do relevo ligado à saída de deslocamento (`surface.displacement`). */
function factory(definition: NodeDefinition): DisplacementFactory {
    return (values = {}) => {
        const { scale, ...heights } = values;
        return new DisplacementFunction({
            graph: new NodeGraph({
                nodes: {
                    relief: definition.with(heights),
                    out: surface.displacement.with(scale === undefined ? {} : { scale }),
                },
                links: [['relief.value', 'out.relief']],
                output: 'out.value',
            }),
        });
    };
}

/**
 * Deslocamentos prontos (spec 011, R17): o relevo dos materiais da biblioteca como geometria. Cada fábrica devolve a
 * `DisplacementFunction` cujo grafo é o relevo do material de mesmo nome (`nodes.relief.<nome>`: a mesma altura que
 * inclina a normal no material) ligado a `surface.displacement`. Anexada à entidade de uma `ParametricSurface` (de
 * preferência com a malha adaptativa: os triângulos acompanham o tamanho na tela), move os vértices na GPU — o desenho,
 * as sombras e os raios leem a geometria deslocada. Os valores são os do material (as alturas em milímetros, a escala
 * do mundo `scale` em unidades por metro, `pattern_scale`): passe os mesmos aos dois —
 * `Materials.woodRough(v)` e `Displacements.woodRough(v)`. Depois de criada, mudam sem recompilar por
 * `values.relief_<parâmetro>` e `values.out_scale`.
 *
 * @throws NodeGraphError (`node-signature`) valor para um parâmetro que o relevo não expõe.
 */
export const Displacements: Readonly<Record<DisplacementName, DisplacementFactory>> = Object.freeze(
    Object.fromEntries(
        Object.entries(relief).map(([name, definition]) => [name, factory(definition)]),
    ) as Record<DisplacementName, DisplacementFactory>,
);
