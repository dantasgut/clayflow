// Referência da CPU do nó de saída do ponto `material` (spec 031): monta os parâmetros de superfície (`SurfaceParams`:
// cor base com alfa, rugosidade, metalicidade, emissão). Tolerância 1e-6 (cópia de valores). O nó só vale em
// `fragment`; o caso dele é avaliado pelo teste da biblioteca e pelo smoke `nodeGraphs` (parte a, o grafo de material).
import { num, uniform, vec, vector, type NodeCase } from './cases';

/** Casos do nó `output.surfaceParams` (saída `value`: `[r, g, b, alfa, rugosidade, metalicidade, e_r, e_g, e_b]`). */
export const outputCases: readonly NodeCase[] = [
    {
        node: 'output.surfaceParams',
        tolerance: 1e-6,
        sample: (r) => ({
            base_color: vector(r, 3, 0, 1),
            alpha: uniform(r, 0, 1),
            roughness: uniform(r, 0, 1),
            metallic: uniform(r, 0, 1),
            emissive: vector(r, 3, 0, 2),
        }),
        reference: (x) => ({
            value: [
                ...vec(x.base_color),
                num(x.alpha),
                num(x.roughness),
                num(x.metallic),
                ...vec(x.emissive),
            ],
        }),
    },
];
