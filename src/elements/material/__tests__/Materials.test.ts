import { describe, expect, it } from 'vitest';
import { NodeGraph } from '../../../scene/graph/NodeGraph';
import { fromJSON, toJSON } from '../../../scene/graph/serialize';
import { subgraphOrigin } from '../../../scene/graph/Subgraph';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { defaultNodeRegistry, nodes } from '../../nodes/index';
import { Materials, type MaterialName } from '../Materials';
import { LOBES } from '../pbr/lobes';

// Biblioteca de materiais prontos (spec 011, US5, T090): as fábricas, os nós e os valores documentados, a mudança de
// um parâmetro, o uso como nó (entrada ligada) e a serialização.

const NAMES = [
    'woodRaw',
    'woodVarnishedGloss',
    'woodVarnishedMatte',
    'cotton',
    'wool',
    'velvet',
    'silk',
    'denim',
    'sheerFabric',
    'leather',
    'rubber',
    'ceramic',
    'porcelain',
    'plasticMatte',
    'plasticGloss',
    'metalPolished',
    'metalBrushed',
    'carPaint',
    'glass',
    'metalOxidized',
    'skin',
    'wax',
    'marble',
    'jade',
    'milk',
] as const satisfies readonly MaterialName[];

/** Os nós de dentro do material pronto: identificador → nome da definição. */
function inner(name: MaterialName): Record<string, string> {
    const graph = subgraphOrigin(nodes.material[name])!.graph;
    return Object.fromEntries(
        graph.order().map((id) => [id, graph.node(id).definition?.name ?? 'argumento']),
    );
}

describe('Materials (spec 011, US5)', () => {
    it('a biblioteca tem os 25 materiais, cada um um nó registrado sem ligação obrigatória', () => {
        expect(Object.keys(Materials).sort()).toEqual([...NAMES].sort());
        for (const name of NAMES) {
            const def = nodes.material[name];
            expect(def.name).toBe(`material.${name}`);
            expect(def.outputs).toEqual({ value: 'Closure' });
            expect(defaultNodeRegistry.get(def.name)).toBe(def);
            // Toda entrada tem valor sem ligação: um parâmetro exposto, ou a amostra de superfície (`s`, a do ponto
            // `material`) nos materiais com padrão.
            for (const input of Object.keys(def.inputs)) {
                if (input === 's') expect(def.defaults).toEqual({ s: 's' });
                else expect(def.params).toHaveProperty(input);
            }
            expect(Object.keys(def.params).length).toBeGreaterThan(0);
        }
    });

    it('cada fábrica devolve uma MaterialFunction de fechamento com o grafo de um nó', () => {
        for (const name of NAMES) {
            const fn = Materials[name]();
            expect(fn).toBeInstanceOf(MaterialFunction);
            expect(fn.returnsClosure).toBe(true);
            const graph = fn.graph!;
            expect(graph.order()).toEqual(['material', 'out']);
            expect(graph.node('material').definition).toBe(nodes.material[name]);
            expect(graph.node('out').definition).toBe(nodes.output.closure);
            // Os parâmetros da função são os expostos do nó, com os padrões documentados.
            const params = nodes.material[name].params;
            expect(Object.keys(fn.params).sort()).toEqual(
                Object.keys(params)
                    .map((p) => `material_${p}`)
                    .sort(),
            );
            for (const [p, { default: value }] of Object.entries(params))
                expect(fn.values[`material_${p}`]).toEqual(value);
        }
    });

    it('parâmetro mudado altera só ele, sem mudar o código', () => {
        for (const name of NAMES) {
            const base = Materials[name]();
            for (const [p, { type }] of Object.entries(nodes.material[name].params)) {
                const value =
                    type === 'vec3f' ? [0.11, 0.22, 0.33] : type === 'vec2f' ? [0.11, 0.22] : 0.123;
                const changed = Materials[name]({ [p]: value });
                expect(changed.module).toBe(base.module);
                for (const key of Object.keys(base.values)) {
                    if (key === `material_${p}`) {
                        const got = changed.values[key];
                        const list = typeof got === 'number' ? [got] : [...got!];
                        const want = typeof value === 'number' ? [value] : value;
                        list.forEach((v, k) => {
                            expect(v).toBeCloseTo(want[k]!, 6);
                        });
                    } else expect(changed.values[key]).toEqual(base.values[key]);
                }
            }
        }
        expect(() => Materials.woodRaw({ coat_color: [1, 0, 0] })).toThrow(/coat_color/);
    });

    it('madeira envernizada = madeira crua sob um dielétrico liso em camada', () => {
        for (const name of ['woodVarnishedGloss', 'woodVarnishedMatte'] as const) {
            expect(inner(name)).toEqual({
                s: 'argumento',
                wood: 'material.woodRaw',
                coat: 'bsdf.dielectric',
                out: 'closure.layer',
            });
            const graph = subgraphOrigin(nodes.material[name])!.graph;
            expect(graph.links).toEqual(
                expect.arrayContaining([
                    ['s.value', 'wood.s'],
                    ['coat.value', 'out.top'],
                    ['wood.value', 'out.base'],
                ]),
            );
            expect(Materials[name]().lobeMask & LOBES.coat).toBe(LOBES.coat);
        }
        const gloss = nodes.material.woodVarnishedGloss.params;
        const matte = nodes.material.woodVarnishedMatte.params;
        expect(gloss.coat_ior!.default).toBe(1.5);
        expect(gloss.coat_roughness!.default).toBeLessThanOrEqual(0.1);
        expect(matte.coat_roughness!.default).toBeGreaterThan(
            gloss.coat_roughness!.default as number,
        );
        // A base é a madeira crua, com os valores dela.
        expect(gloss.base_color!.default).toEqual(nodes.material.woodRaw.params.color!.default);
        expect(gloss.base_roughness!.default).toBe(
            nodes.material.woodRaw.params.roughness!.default,
        );
    });

    it('pintura de carro = flocos de condutor inclinados sob um dielétrico em camada, com a casca de laranja', () => {
        expect(inner('carPaint')).toMatchObject({
            flake: 'pattern.cells',
            tilt: 'surface.bump',
            flakes: 'bsdf.conductor',
            peel: 'pattern.grain',
            coat: 'bsdf.dielectric',
            out: 'closure.layer',
        });
        expect(subgraphOrigin(nodes.material.carPaint)!.graph.links).toEqual(
            expect.arrayContaining([
                // Cada floco com a inclinação dele na normal da base; o verniz com a normal própria.
                ['flake.random', 'tilt.gradient'],
                ['tilt.value', 'layer_of_flakes.normal'],
                ['wave.value', 'coat_surface.normal'],
                ['coat_surface.value', 'out.top'],
                ['layer_of_flakes.value', 'out.base'],
            ]),
        );
        expect(Materials.carPaint().lobeMask).toBe(LOBES.specular | LOBES.anisotropy | LOBES.coat);
    });

    it('nós de cada família: tecidos com brilho de fibra, metais condutores, vidro com transmissão, subsuperfície', () => {
        const has = (name: MaterialName, node: string): boolean =>
            Object.values(inner(name)).includes(node);
        for (const name of ['cotton', 'wool', 'velvet', 'silk', 'denim', 'sheerFabric'] as const)
            expect(has(name, 'bsdf.sheen')).toBe(true);
        expect(has('sheerFabric', 'bsdf.translucent')).toBe(true);
        for (const name of ['metalPolished', 'metalBrushed', 'carPaint', 'metalOxidized'] as const)
            expect(has(name, 'bsdf.conductor')).toBe(true);
        expect(inner('metalPolished')).toEqual({ out: 'bsdf.conductor' });
        expect(has('glass', 'bsdf.transmission') && has('glass', 'bsdf.dielectric')).toBe(true);
        for (const name of ['skin', 'wax', 'marble', 'porcelain', 'jade', 'milk'] as const)
            expect(has(name, 'bsdf.subsurface') && has(name, 'bsdf.dielectric')).toBe(true);
        for (const name of [
            'woodRaw',
            'leather',
            'rubber',
            'plasticMatte',
            'plasticGloss',
        ] as const)
            expect(inner(name)).toMatchObject({
                body: 'bsdf.diffuse',
                specular: 'bsdf.dielectric',
            });
        expect(inner('plasticGloss')).toEqual({
            body: 'bsdf.diffuse',
            specular: 'bsdf.dielectric',
            out: 'closure.add',
        });
        expect(inner('ceramic')).toMatchObject({
            body: 'bsdf.diffuse',
            glaze: 'bsdf.dielectric',
            out: 'closure.layer',
        });
        expect(Materials.glass().lobeMask & LOBES.transmission).toBe(LOBES.transmission);
        expect(Materials.woodRaw().lobeMask & LOBES.transmission).toBe(0);
    });

    it('valores físicos dentro das faixas publicadas', () => {
        const value = (name: MaterialName, p: string): number =>
            nodes.material[name].params[p]!.default as number;
        // IOR dos dielétricos: 1,3 a 1,7 (polímeros, celulose, vidros, tecidos moles).
        for (const name of NAMES) {
            const params = nodes.material[name].params;
            for (const p of ['ior', 'coat_ior'])
                if (p in params) {
                    expect(value(name, p)).toBeGreaterThanOrEqual(1.3);
                    expect(value(name, p)).toBeLessThanOrEqual(1.7);
                }
            for (const [p, { type, default: v }] of Object.entries(params))
                if (type === 'f32' && p.endsWith('roughness')) {
                    expect(v as number).toBeGreaterThanOrEqual(0);
                    expect(v as number).toBeLessThanOrEqual(1);
                }
        }
        expect(value('woodRaw', 'ior')).toBeCloseTo(1.53);
        expect(value('glass', 'ior')).toBeCloseTo(1.52);
        expect(value('glass', 'abbe')).toBe(58);
        expect(value('silk', 'anisotropy')).toBeCloseTo(0.8);
        // Madeira crua sem realce nítido; plástico brilhante e metal polido lisos; metal escovado anisotrópico.
        expect(value('woodRaw', 'roughness')).toBeGreaterThanOrEqual(0.5);
        expect(value('plasticGloss', 'roughness')).toBeLessThanOrEqual(0.1);
        expect(value('metalPolished', 'roughness')).toBeLessThanOrEqual(0.1);
        expect(value('metalPolished', 'anisotropy')).toBe(0);
        expect(value('metalBrushed', 'anisotropy')).toBeGreaterThanOrEqual(0.5);
        // Metais: F0 alto (o alumínio do OpenPBR); subsuperfície: o vermelho espalha mais longe.
        const f0 = nodes.material.metalPolished.params.color!.default as number[];
        f0.forEach((v, k) => {
            expect(v).toBeCloseTo([0.912, 0.914, 0.92][k]!, 6);
        });
        for (const name of ['skin', 'wax', 'marble', 'porcelain', 'milk'] as const) {
            const [r, g, b] = nodes.material[name].params.radius!.default as number[];
            expect(r).toBeGreaterThan(g!);
            expect(g).toBeGreaterThan(b!);
        }
        // O raio é o caminho livre médio em mm (décimos de milímetro a poucos milímetros) e a escala do mundo é 1.
        for (const name of ['skin', 'wax', 'marble', 'porcelain', 'jade', 'milk'] as const) {
            for (const mm of nodes.material[name].params.radius!.default as number[]) {
                expect(mm).toBeGreaterThan(0.1);
                expect(mm).toBeLessThan(5);
            }
            expect(value(name, 'scale')).toBe(1);
        }
        // O jade espalha mais longe no verde.
        const jade = nodes.material.jade.params.radius!.default as number[];
        expect(jade[1]).toBeGreaterThan(jade[0]!);
    });

    it('a estrutura de cada material é um padrão por pixel sobre o uv, com o relevo na normal', () => {
        const has = (name: MaterialName, node: string): boolean =>
            Object.values(inner(name)).includes(node);
        // O padrão que o nome promete.
        const promised: Readonly<Partial<Record<MaterialName, string>>> = {
            woodRaw: 'pattern.rings',
            cotton: 'pattern.weave',
            wool: 'pattern.weave',
            denim: 'pattern.weave',
            silk: 'pattern.weave',
            sheerFabric: 'pattern.weave',
            velvet: 'pattern.grain',
            leather: 'pattern.cells',
            rubber: 'pattern.grain',
            plasticMatte: 'pattern.grain',
            ceramic: 'pattern.cells',
            metalBrushed: 'pattern.grain',
            carPaint: 'pattern.cells',
            metalOxidized: 'pattern.grain',
            marble: 'pattern.grain',
        };
        for (const [name, node] of Object.entries(promised) as [MaterialName, string][]) {
            expect(has(name, node), name).toBe(true);
            expect(has(name, 'surface.uvSpace'), name).toBe(true);
            // A escala do padrão no uv é parâmetro; o padrão recebe a largura do pixel e o período do espaço.
            expect(nodes.material[name].params.pattern_scale).toEqual({
                type: 'vec2f',
                default: [1, 1],
            });
            const links = subgraphOrigin(nodes.material[name])!.graph.links;
            expect(
                links.some(([from]) => from === 'uv.width'),
                name,
            ).toBe(true);
            expect(
                links.some(([from]) => from === 'uv.wrap'),
                name,
            ).toBe(true);
            // Vale em todos os estágios (os acertos dos raios avaliam o mesmo material).
            expect(nodes.material[name].contexts).toEqual(['fragment', 'vertex', 'compute']);
            expect(Materials[name]().code).not.toMatch(/\bdpd[xy]\w*\s*\(/);
        }
        // Com relevo na normal dos lobos de base (o mármore polido e o esmalte da cerâmica não: o da cerâmica é do
        // esmalte).
        for (const name of Object.keys(promised) as MaterialName[])
            if (name !== 'marble') expect(has(name, 'surface.bump'), name).toBe(true);
        // As madeiras envernizadas herdam o padrão da crua (usada como nó) e repassam a escala.
        for (const name of ['woodVarnishedGloss', 'woodVarnishedMatte'] as const)
            expect(nodes.material[name].params.pattern_scale!.default).toEqual([1, 1]);
        // Jeans: sarja 3/1 de duas cores; seda: cetim com a tangente pelo fio à vista.
        const weave = (name: MaterialName) =>
            subgraphOrigin(nodes.material[name])!.graph.node('weave').values;
        expect(weave('denim')).toMatchObject({ over: 3, under: 1, shift: 1 });
        expect(weave('cotton')).toMatchObject({ over: 1, under: 1 });
        expect(weave('silk')).toMatchObject({ over: 4, under: 1, shift: 2 });
        expect(nodes.material.denim.params.color!.default).not.toEqual(
            nodes.material.denim.params.weft_color!.default,
        );
        expect(subgraphOrigin(nodes.material.silk)!.graph.links).toEqual(
            expect.arrayContaining([['thread_direction.value', 'threads.tangent']]),
        );
        expect(subgraphOrigin(nodes.material.metalBrushed)!.graph.links).toEqual(
            expect.arrayContaining([['uv.du', 'metal.tangent']]),
        );
    });

    it('como nó de um grafo maior: mistura por ruído e entrada ligada a outro nó', () => {
        const mixed = new NodeGraph({
            nodes: {
                s: nodes.input.surfaceSample(),
                a: nodes.material.woodRaw,
                b: nodes.material.metalBrushed,
                n: nodes.noise.gradient3.with({ scale: 3 }),
                x: nodes.closure.mix,
                out: nodes.output.closure,
            },
            links: [
                ['s.world_position', 'n.p'],
                ['a.value', 'x.a'],
                ['b.value', 'x.b'],
                ['n.value', 'x.t'],
                ['x.value', 'out.closure'],
            ],
            output: 'out.value',
        });
        const fn = new MaterialFunction({ graph: mixed });
        expect(fn.lobeMask).toBe(LOBES.diffuse | LOBES.specular | LOBES.anisotropy);
        expect(fn.params).toHaveProperty('a_color', 'vec3f');
        expect(fn.params).toHaveProperty('b_roughness', 'f32');
        // Entrada ligada: a rugosidade do plástico vem do ruído (a ligação no lugar do parâmetro).
        const linked = new NodeGraph({
            nodes: {
                s: nodes.input.surfaceSample(),
                n: nodes.noise.gradient3.with({ scale: 6 }),
                r: nodes.map.range.with({ in_min: -1, in_max: 1, out_min: 0.05, out_max: 0.6 }),
                p: nodes.material.plasticGloss,
                out: nodes.output.closure,
            },
            links: [
                ['s.world_position', 'n.p'],
                ['n.value', 'r.x'],
                ['r.value', 'p.roughness'],
                ['p.value', 'out.closure'],
            ],
            output: 'out.value',
        });
        const code = new MaterialFunction({ graph: linked }).code;
        expect(code).toMatch(/let v_p = sub_[0-9a-f]{8}\(data\.p_color, v_r, data\.p_ior,/);
        // Dois materiais de mesma forma no mesmo grafo: módulos distintos, sem choque de nome.
        const twins = new NodeGraph({
            nodes: {
                a: nodes.material.rubber,
                b: nodes.material.plasticMatte,
                x: nodes.closure.mix,
                out: nodes.output.closure,
            },
            links: [
                ['a.value', 'x.a'],
                ['b.value', 'x.b'],
                ['x.value', 'out.closure'],
            ],
            output: 'out.value',
        });
        expect(() => new MaterialFunction({ graph: twins }).module).not.toThrow();
        expect(nodes.material.rubber.fn).not.toBe(nodes.material.plasticMatte.fn);
    });

    it('serialização ida e volta de cada material (inteiro, com um valor mudado)', () => {
        for (const name of NAMES) {
            const [param, { type }] = Object.entries(nodes.material[name].params)[0]!;
            const graph = Materials[name]({
                [param]:
                    type === 'vec3f' ? [0.25, 0.5, 0.75] : type === 'vec2f' ? [0.25, 0.5] : 0.25,
            }).graph!;
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
});
