import { describe, expect, it } from 'vitest';
import { NodeGraph } from '../../../scene/graph/NodeGraph';
import { fromJSON, toJSON } from '../../../scene/graph/serialize';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { forwardMaterialAdapter } from '../../material/point/shaders';
import { ALL_LOBES, LOBES } from '../../material/pbr/lobes';
import { defaultNodeRegistry, nodes } from '../index';

// Nós de material (spec 011, T059, T060, T063, T073): entradas com valor, marcas de lobo, especialização pelo grafo,
// serialização e o OpenPBR como sub-grafo.

/** Madeira envernizada: difuso sob um dielétrico liso, o verniz mais áspero por um valor ligado. */
function varnished(): NodeGraph {
    return new NodeGraph({
        nodes: {
            wood: nodes.bsdf.diffuse.with({ color: [0.45, 0.28, 0.15] }),
            r: nodes.math.value.with({ value: 0.08 }),
            coat: nodes.bsdf.dielectric.with({ ior: 1.5 }),
            l: nodes.closure.layer.with({ top_color: [1, 0.85, 0.6] }),
            out: nodes.output.closure,
        },
        links: [
            ['r.value', 'coat.roughness'],
            ['coat.value', 'l.top'],
            ['wood.value', 'l.base'],
            ['l.value', 'out.closure'],
        ],
        output: 'out.value',
    });
}

describe('nós de material (spec 011)', () => {
    it('entrada com valor: sem ligação usa o parâmetro; ligada, a ligação (e o valor fica no registro)', () => {
        const fn = new MaterialFunction({ graph: varnished() });
        expect(fn.params.wood_color).toBe('vec3f');
        expect(fn.code).toContain('data.wood_color');
        expect(fn.code).not.toContain('data.coat_roughness');
        expect(fn.code).toContain('node_bsdf_dielectric(data.coat_ior, data.coat_tint, v_r,');
        expect(fn.values.wood_color).toEqual([0.45, 0.28, 0.15]);
    });

    it('marcas: os lobos do grafo viram a máscara; o adaptador é o de fechamento', () => {
        const fn = new MaterialFunction({ graph: varnished() });
        expect(fn.returnsClosure).toBe(true);
        expect(fn.lobeMask).toBe(LOBES.diffuse | LOBES.specular | LOBES.anisotropy | LOBES.coat);
        const src = composeWgsl(forwardMaterialAdapter(fn.module)).spec.source;
        expect(src).toContain('closure_sanitize(material_fn(s, m, material_fn_params(fn_slot)))');
    });

    it('especialização: mudar valores não muda o módulo; mudar a ligação muda', () => {
        const a = new MaterialFunction({ graph: varnished() });
        const b = new MaterialFunction({
            graph: varnished(),
            values: { wood_color: [0.9, 0.1, 0.1] },
        });
        expect(b.module).toBe(a.module);
        const relinked = new NodeGraph({
            nodes: {
                wood: nodes.bsdf.diffuse,
                v: nodes.bsdf.sheen,
                x: nodes.closure.add,
                out: nodes.output.closure,
            },
            links: [
                ['wood.value', 'x.a'],
                ['v.value', 'x.b'],
                ['x.value', 'out.closure'],
            ],
            output: 'out.value',
        });
        const c = new MaterialFunction({ graph: relinked });
        expect(c.module).not.toBe(a.module);
        expect(c.lobeMask).toBe(LOBES.diffuse | LOBES.sheen);
    });

    it('serialização ida e volta do grafo de material e do OpenPBR', () => {
        for (const graph of [
            varnished(),
            new NodeGraph({
                nodes: {
                    p: nodes.material.openpbr.with({ base_metalness: 0.9, coat_weight: 1 }),
                    out: nodes.output.closure,
                },
                links: [['p.value', 'out.closure']],
                output: 'out.value',
            }),
        ]) {
            const json = JSON.parse(
                JSON.stringify(toJSON(graph, defaultNodeRegistry)),
            ) as Parameters<typeof fromJSON>[0];
            const back = fromJSON(json, defaultNodeRegistry);
            expect(new MaterialFunction({ graph: back }).code).toBe(
                new MaterialFunction({ graph }).code,
            );
            expect(back.values()).toEqual(graph.values());
        }
    });

    it('OpenPBR: um nó com os parâmetros da norma, todos os lobos, e valores por uso sem recompilar', () => {
        const p = nodes.material.openpbr;
        expect(Object.keys(p.inputs)).toEqual([]);
        expect(p.outputs).toEqual({ value: 'Closure' });
        for (const name of [
            'base_color',
            'base_metalness',
            'specular_ior',
            'coat_weight',
            'fuzz_color',
            'transmission_weight',
            'thin_film_thickness',
            'geometry_opacity',
            'base_diffuse_roughness',
        ])
            expect(p.params).toHaveProperty(name);
        const graph = (values: Record<string, number | number[]>) =>
            new NodeGraph({
                nodes: { p: p.with(values), out: nodes.output.closure },
                links: [['p.value', 'out.closure']],
                output: 'out.value',
            });
        const a = new MaterialFunction({ graph: graph({ base_metalness: 1 }) });
        const b = new MaterialFunction({ graph: graph({ coat_weight: 1, coat_roughness: 0.03 }) });
        expect(a.module).toBe(b.module);
        expect(a.lobeMask).toBe(ALL_LOBES & ~0);
        expect(a.values.p_base_metalness).toBe(1);
    });
});
