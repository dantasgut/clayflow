import { describe, expect, it } from 'vitest';
import { NodeGraph, graphArgument, type GraphNode } from '../../../scene/graph/NodeGraph';
import { NodeGraphError } from '../../../scene/graph/NodeGraphError';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import type { PointTarget } from '../../../scene/graph/SetNode';
import { POINT_PARAMS } from '../../../scene/shaders/WgslPoint';
import { materialPoint } from '../../material/point/shaders';
import { surfacePoint, spacePoint } from '../../geometry/shaders';
import { fieldPoint } from '../../physics/shaders/fields';
import { emitPoint } from '../../particles/shaders';
import { cameraPoint, transformPoint } from '../../scene/flows/shaders';
import { displaceHeightTarget } from '../set/shaders';
import { compareOps, defaultNodeRegistry, nodes, pointNodes } from '../index';
import {
    caseSamples,
    colorRamp4,
    compare,
    fieldBuiltin,
    gradientNoise3,
    mapCurve4,
    mapRange,
    nodeCases,
    noiseCellular3,
    noiseFbm3,
    noiseGradient2,
    noiseGradient3,
    noiseValue3,
    smoothstep,
    spaceApplyNormal,
    spaceApplyPoint,
    spaceInverseAffine,
    spaceProjectPoint,
    surfaceCurvature,
    surfaceMetric,
    surfacePrincipal,
    type NodeValue,
} from '../reference/index';
import { hash3, hashSigned, valueNoise3 } from '../reference/noise';
import { patternChecker2, patternChecker3 } from '../reference/pattern';
import { FIELD_BUOYANCY, FIELD_DRAG, FIELD_GRAVITY_POINT } from '../../gpu/shaders/constants';
import { CLOSURE_SIZE } from '../../material/reference/closureNodes';

// Biblioteca base de nós de ponto (spec 031, T091): cada nó com um caso de teste (amostras, referência da CPU,
// tolerância documentada) cuja assinatura é a do nó; as referências contra valores conhecidos; cada nó compila num grafo;
// as entradas de contexto compilam nos pontos que têm o argumento. A comparação com a GPU é a do smoke `nodeGraphs`
// (parte f), com os mesmos casos.

/** Componentes de um tipo de porta ou parâmetro (escalar 1; struct: os campos). */
const SIZE: Readonly<Record<string, number>> = {
    f32: 1,
    u32: 1,
    i32: 1,
    vec2f: 2,
    vec3f: 3,
    vec4f: 4,
    mat4x4f: 16,
    SurfaceParams: 9,
    Closure: CLOSURE_SIZE,
};
const size = (v: NodeValue): number => (typeof v === 'number' ? 1 : v.length);
const close = (a: readonly number[], b: readonly number[], tol = 1e-9): void => {
    expect(a.length).toBe(b.length);
    a.forEach((x, k) => {
        expect(x).toBeCloseTo(b[k]!, -Math.log10(tol));
    });
};

describe('biblioteca base de nós (spec 031, T085–T091)', () => {
    it('um caso por nó de ponto registrado; todo caso nomeia um nó registrado', () => {
        const names = pointNodes.map((n) => n.name);
        const cased = nodeCases.map((c) => c.node);
        expect(new Set(cased).size).toBe(cased.length);
        expect([...cased].sort()).toEqual([...names].sort());
        for (const n of pointNodes) expect(defaultNodeRegistry.get(n.name)).toBe(n);
        expect(pointNodes.length).toBeGreaterThanOrEqual(60);
    });

    it.each(nodeCases.map((c) => [c.node, c] as const))(
        '%s: amostras e referência com a assinatura do nó; tolerância documentada',
        (name, c) => {
            const def = defaultNodeRegistry.get(name) as NodeDefinition;
            expect(c.tolerance).toBeGreaterThan(0);
            expect(c.tolerance).toBeLessThanOrEqual(5e-3);
            const ports = {
                ...def.inputs,
                ...Object.fromEntries(Object.entries(def.params).map(([k, p]) => [k, p.type])),
            };
            for (const x of caseSamples(c, 7).slice(0, 8)) {
                expect(Object.keys(x).sort()).toEqual(Object.keys(ports).sort());
                for (const [k, t] of Object.entries(ports)) expect(size(x[k]!)).toBe(SIZE[t]);
                const out = c.reference(x);
                expect(Object.keys(out).sort()).toEqual(Object.keys(def.outputs).sort());
                for (const [k, t] of Object.entries(def.outputs)) {
                    expect(size(out[k]!)).toBe(SIZE[t]);
                    const values = typeof out[k] === 'number' ? [out[k]] : (out[k] as number[]);
                    for (const v of values) expect(Number.isFinite(v)).toBe(true);
                }
            }
        },
    );

    it('funções WGSL com o prefixo da categoria (`node_<categoria>_`)', () => {
        for (const n of pointNodes) {
            const category = n.name.slice(0, n.name.indexOf('.'));
            expect(n.fn.startsWith(`node_${category}_`), n.name).toBe(true);
        }
    });

    it.each(pointNodes.map((n) => [n.name, n] as const))(
        '%s: compila num grafo (entradas por argumentos, um let) no estágio que vale',
        (_, def) => {
            const inputs = Object.entries(def.inputs);
            const graphNodes: Record<string, GraphNode> = { n: def };
            for (const [port] of inputs) graphNodes[`in_${port}`] = graphArgument(`a_${port}`);
            const [out, type] = Object.entries(def.outputs)[0]!;
            const target: PointTarget = {
                name: 'library_probe',
                context: def.contexts[0]!,
                paramsAlias: 'LibraryProbeParams',
                required: {
                    name: 'library_probe_fn',
                    params: [...inputs.map(([, t]) => t), POINT_PARAMS],
                    returns: type,
                    names: [...inputs.map(([p]) => `a_${p}`), 'data'],
                },
            };
            const graph = new NodeGraph({
                nodes: graphNodes,
                links: inputs.map(([p]) => [`in_${p}.value`, `n.${p}`] as const),
                output: `n.${out}`,
            });
            const code = graph.compile(target);
            expect(code).toContain(`let v_n = ${def.fn}(`);
            // Os parâmetros que são valor de uma entrada ligada não entram (spec 011: a ligação vence).
            for (const p of Object.keys(def.params))
                if (!(p in def.inputs)) expect(code).toContain(`data.n_${p}`);
        },
    );

    it('referências contra valores conhecidos: matemática, mapeamentos, condições', () => {
        expect(smoothstep(0, 1, 0.5)).toBe(0.5);
        expect(smoothstep(0, 1, -1)).toBe(0);
        expect(smoothstep(0, 1, 2)).toBe(1);
        expect(mapRange(5, 0, 10, 0, 1, 1)).toBe(0.5);
        expect(mapRange(20, 0, 10, 0, 1, 1)).toBe(1);
        expect(mapRange(20, 0, 10, 0, 1, 0)).toBe(2);
        const identity = [
            [0, 0],
            [1 / 3, 1 / 3],
            [2 / 3, 2 / 3],
            [1, 1],
        ];
        expect(mapCurve4(0.25, identity)).toBeCloseTo(0.25, 12);
        expect(mapCurve4(-1, identity)).toBe(0);
        expect(mapCurve4(2, identity)).toBe(1);
        const stops = [
            [0, 0, 0, 0],
            [1, 0, 0, 0.5],
            [1, 1, 0, 0.75],
            [1, 1, 1, 1],
        ];
        expect(colorRamp4(0.5, stops)).toEqual([1, 0, 0]);
        close(colorRamp4(0.625, stops), [1, 0.5, 0]);
        expect(colorRamp4(9, stops)).toEqual([1, 1, 1]);
        expect(compare(1, 2, compareOps.less, 0)).toBe(1);
        expect(compare(2, 1, compareOps.less, 0)).toBe(0);
        expect(compare(1, 1, compareOps.lessEqual, 0)).toBe(1);
        expect(compare(1, 1.05, compareOps.equal, 0.1)).toBe(1);
        expect(compare(1, 1.05, compareOps.notEqual, 0.01)).toBe(1);
    });

    it('ruídos: semente 0 = o ruído da biblioteca; mesma semente, mesma saída; outra semente, outro padrão', () => {
        const p = [0.375, -1.25, 2.5] as const; // exatos em f32
        expect(noiseGradient3(p, 1, [0, 0, 0], 0)).toBe(gradientNoise3(...p));
        expect(noiseValue3(p, 1, [0, 0, 0], 0)).toBe(valueNoise3(...p));
        expect(noiseGradient3(p, 2, [0.5, 0, 0], 9)).toBe(noiseGradient3(p, 2, [0.5, 0, 0], 9));
        expect(noiseGradient3(p, 2, [0.5, 0, 0], 9)).not.toBe(
            noiseGradient3(p, 2, [0.5, 0, 0], 10),
        );
        // Ruído de gradiente: zero nos nós da rede, com qualquer semente.
        expect(noiseGradient3([3, -2, 5], 1, [0, 0, 0], 12345)).toBe(0);
        expect(noiseGradient2([3, -2], 1, [0, 0], 77)).toBe(0);
        // Ruído de valor: no nó da rede, o hash da célula deslocada pela semente.
        const seed = 5;
        const cell = [3, Math.imul(seed, 0x85ebca77) >>> 0, Math.imul(seed, 0xc2b2ae3d) >>> 0];
        cell[0] = (3 + Math.imul(seed, 0x9e3779b1)) >>> 0;
        expect(noiseValue3([3, 0, 0], 1, [0, 0, 0], seed)).toBe(
            hashSigned(hash3(cell[0], cell[1]!, cell[2]!)),
        );
        // Celular sem jitter: o ponto no centro da célula (f1 = 0), os vizinhos a 1.
        const c = noiseCellular3([0.5, 0.5, 0.5], 1, [0, 0, 0], 3, 0);
        expect(c.f1).toBe(0);
        expect(c.f2).toBe(1);
        // fBm de uma oitava = o ruído de gradiente da mesma semente.
        expect(noiseFbm3(p, 2, [0, 0, 0], 4, 1, 2, 0.5)).toBe(noiseGradient3(p, 2, [0, 0, 0], 4));
    });

    it('padrão: xadrez exato alternado, o filtro igual ao exato no centro da casa e a média 0,5 ao longe', () => {
        // Casas de 0,1 (scale 10): (0,05; 0,05) par, a vizinha em x ímpar, a diagonal par.
        expect(patternChecker2([0.05, 0.05], 0, 10, [0, 0])).toBe(0);
        expect(patternChecker2([0.15, 0.05], 0, 10, [0, 0])).toBe(1);
        expect(patternChecker2([0.15, 0.15], 0, 10, [0, 0])).toBe(0);
        expect(patternChecker2([-0.05, 0.05], 0, 10, [0, 0])).toBe(1);
        expect(patternChecker3([0.05, 0.05, 0.15], 0, 10, [0, 0, 0])).toBe(1);
        // Pixel bem menor que a casa, no centro dela: o filtro dá o exato.
        expect(patternChecker2([0.05, 0.05], 0.01, 10, [0, 0])).toBeCloseTo(0, 12);
        expect(patternChecker2([0.15, 0.05], 0.01, 10, [0, 0])).toBeCloseTo(1, 12);
        // Pixel do tamanho de um número par de casas: a média.
        expect(patternChecker2([0.03, 0.07], 0.2, 10, [0, 0])).toBeCloseTo(0.5, 12);
        expect(patternChecker3([0.03, 0.07, 0.01], 0.4, 10, [0, 0, 0])).toBeCloseTo(0.5, 12);
    });

    it('espaço: identidade, inversa afim, normal sob escala, projeção nos planos', () => {
        const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        expect(spaceApplyPoint(id, [1, 2, 3])).toEqual([1, 2, 3]);
        // Escala (2, 1, 1) e translação (1, 2, 3).
        const m = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
        const inv = spaceInverseAffine(m);
        close(spaceApplyPoint(inv, spaceApplyPoint(m, [0.3, -0.7, 4])), [0.3, -0.7, 4]);
        // A normal de um plano inclinado a 45° escalado em x: inversa transposta.
        close(spaceApplyNormal(m, [1, 1, 0]), [1 / Math.sqrt(5), 2 / Math.sqrt(5), 0]);
        // Perspectiva com profundidade [0, 1]: o plano próximo vai a 0, o distante a 1.
        const near = 0.5;
        const far = 50;
        const nf = 1 / (near - far);
        const proj = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, far * nf, -1, 0, 0, near * far * nf, 0];
        expect(spaceProjectPoint(proj, [0, 0, -near])[2]).toBeCloseTo(0, 12);
        expect(spaceProjectPoint(proj, [0, 0, -far])[2]).toBeCloseTo(1, 12);
    });

    it('geometria diferencial: esfera, sela, plano; direções principais ortonormais', () => {
        const r = 2;
        const sphere = surfaceCurvature([1 / (r * r), 1 / r, 1 / r, 1 / r]);
        expect(sphere.shape_index).toBeCloseTo(1, 12);
        expect(sphere.curvedness).toBeCloseTo(1 / r, 12);
        expect(surfaceCurvature([-1, 0, 1, -1]).shape_index).toBeCloseTo(0, 12);
        expect(surfaceCurvature([1, -1, -1, -1]).shape_index).toBeCloseTo(-1, 12);
        expect(surfaceMetric([1, 0, 1]).area).toBe(1);
        expect(surfaceMetric([4, 1, 1]).area).toBeCloseTo(Math.sqrt(3), 12);
        const { d1, d2 } = surfacePrincipal([1, 1, 0], [0, 1, 0]);
        expect(d1).toEqual([1, 0, 0]);
        close(d2, [0, 0, -1]);
        expect(surfacePrincipal([0, 1, 0], [0, 1, 0]).d1).toEqual([0, 0, 0]);
    });

    it('campo da cena: gravidade pontual, arrasto e empuxo', () => {
        const none = [0, 0, 0, 0];
        const gravity = { kind: FIELD_GRAVITY_POINT.value, a: none, b: none, s: [2, 1e-6, 0, 0] };
        close(fieldBuiltin([gravity], [1, 0, 0], [0, 0, 0], 0, 0), [-2, 0, 0]);
        const drag = { kind: FIELD_DRAG.value, a: none, b: none, s: [0.5, 0, 0, 0] };
        close(fieldBuiltin([drag], [0, 0, 0], [1, 0, 0], 0, 0), [-0.5, 0, 0]);
        const buoyancy = { kind: FIELD_BUOYANCY.value, a: none, b: none, s: [1000, 0, 9.81, 0] };
        close(fieldBuiltin([buoyancy], [0, -1, 0], [0, 0, 0], 0, 500), [0, 19.62, 0]);
        close(fieldBuiltin([buoyancy], [0, 1, 0], [0, 0, 0], 0, 500), [0, 0, 0]);
    });

    it('entradas de contexto compilam nos pontos que têm o argumento; noutro ponto, erro nomeando-o', () => {
        const probe = (
            node: GraphNode,
            port: string,
            target: PointTarget,
            through: NodeDefinition,
        ): string => {
            const [first] = Object.keys(through.inputs);
            return new NodeGraph({
                nodes: { a: node, n: through },
                links: [[`a.${port}`, `n.${first}`]],
                output: 'n.value',
            }).compile(target);
        };
        const { input, math } = nodes;
        const lengthOf = math.length;
        const sinOf = math.sin;
        // Pontos com retorno vetorial: a saída escalar é convertida (repetida); os outros, retorno trocado na prova.
        const material = returning(materialPoint, 'vec3f');
        expect(probe(input.surfaceSample(), 'world_position', material, lengthOf)).toContain(
            '(s.world_position)',
        );
        expect(probe(input.worldPosition(), 'world_position', material, lengthOf)).toContain(
            '(s.world_position)',
        );
        expect(probe(input.material(), 'roughness', material, sinOf)).toContain('(m.roughness)');
        expect(probe(input.time(), 'value', surfacePoint, sinOf)).toContain('(time)');
        expect(probe(input.cell('u'), 'value', surfacePoint, sinOf)).toContain('(u)');
        expect(probe(input.time(), 'value', spacePoint, sinOf)).toContain('(time)');
        expect(probe(input.particle('x'), 'value', fieldPoint, lengthOf)).toContain('(x)');
        expect(probe(input.particle('body'), 'density', fieldPoint, sinOf)).toContain(
            'body.density',
        );
        expect(
            probe(input.vertexField('position'), 'value', displaceHeightTarget, lengthOf),
        ).toContain('(position)');
        expect(
            probe(input.camera('aspect'), 'value', returning(cameraPoint, 'f32'), math.sin),
        ).toContain('(aspect)');
        expect(probe(input.camera('c'), 'fov', returning(cameraPoint, 'f32'), math.sin)).toContain(
            '(c.fov)',
        );
        expect(probe(input.time(), 'value', returning(transformPoint, 'f32'), math.sin)).toContain(
            '(time)',
        );
        expect(
            probe(input.particle('seed'), 'value', returning(emitPoint, 'f32'), math.toFloat),
        ).toContain('(seed)');
        expect(
            probe(input.particle('i'), 'value', returning(emitPoint, 'f32'), math.toFloat),
        ).toContain('(i)');
        // Um argumento que o ponto não tem: erro `target`.
        try {
            probe(input.cell('u'), 'value', fieldPoint, sinOf);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(NodeGraphError);
            expect((e as NodeGraphError).kind).toBe('target');
            expect((e as Error).message).toContain("'u'");
        }
    });
});

/** O ponto `point` com outro retorno (o grafo de prova devolve o valor do nó, não o tipo do ponto). */
function returning(point: PointTarget, returns: string): PointTarget {
    return {
        name: point.name,
        context: point.context,
        paramsAlias: point.paramsAlias,
        required: { ...point.required, returns },
    };
}
