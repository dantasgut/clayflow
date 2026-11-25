import { describe, expect, it } from 'vitest';
import { NodeGraph } from '../../../scene/graph/NodeGraph';
import { fromJSON, toJSON } from '../../../scene/graph/serialize';
import { subgraphOrigin } from '../../../scene/graph/Subgraph';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { defaultNodeRegistry, nodes } from '../../nodes/index';
import { Displacements } from '../Displacements';
import { Materials, type MaterialName } from '../Materials';
import { LOBES } from '../pbr/lobes';

// Biblioteca de materiais prontos (spec 011, US5, T090): as fábricas, os nós e os valores documentados, a mudança de
// um parâmetro, o uso como nó (entrada ligada) e a serialização.

const NAMES = [
    'woodRaw',
    'woodRough',
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
    'carPaintSilver',
    'gold',
    'goldLeaf',
    'copper',
    'brass',
    'chrome',
    'aluminiumAnodized',
    'metalHammered',
    'castIron',
    'bronzePatina',
    'concrete',
    'granite',
    'sandstone',
    'brick',
    'plaster',
    'asphalt',
    'tile',
    'terracotta',
    'driedMud',
    'sand',
    'woodOak',
    'woodWalnut',
    'woodPine',
    'woodMahogany',
    'woodOakVarnished',
    'woodFloorPlanks',
    'woodFloorHerringbone',
    'bark',
    'barkPine',
    'barkBirch',
    'cork',
    'corkStopper',
    'leaf',
    'leafDry',
    'leafMatte',
    'carPaintFlake',
    'woodAsh',
    'woodAshBrushed',
    'woodPineFine',
    'woodSolid',
    'skinDetailed',
    'eye',
    'lips',
    'roofTile',
    'roofSlate',
    'paper',
    'carbonFiber',
    'ice',
    'soap',
    'ivory',
    'motherOfPearl',
    'snow',
    'asphaltFine',
    'asphaltCoarse',
    'asphaltCracked',
    'pavementPortuguese',
    'grassPaver',
    'paverHerringbone',
    'concreteBlock',
    'concreteSlab',
    'stoneSetts',
    'stoneWall',
    'stackedSlate',
    'flagstone',
    'cobblestone',
    'bamboo',
] as const satisfies readonly MaterialName[];

/** Os nós de dentro do material pronto: identificador → nome da definição. */
function inner(name: MaterialName): Record<string, string> {
    const graph = subgraphOrigin(nodes.material[name])!.graph;
    return Object.fromEntries(
        graph.order().map((id) => [id, graph.node(id).definition?.name ?? 'argumento']),
    );
}

describe('Materials (spec 011, US5)', () => {
    it('a biblioteca tem os 92 materiais, cada um um nó registrado sem ligação obrigatória', () => {
        expect(Object.keys(Materials).sort()).toEqual([...NAMES].sort());
        for (const name of NAMES) {
            const def = nodes.material[name];
            expect(def.name).toBe(`material.${name}`);
            expect(def.outputs).toEqual({ value: 'Closure' });
            expect(defaultNodeRegistry.get(def.name)).toBe(def);
            // Toda entrada tem valor sem ligação: um parâmetro exposto, a amostra de superfície (`s`, a do ponto
            // `material`) nos materiais com padrão, ou o valor declarado da entrada (as entradas por região da pele).
            for (const input of Object.keys(def.inputs)) {
                if (input === 's') expect(def.defaults.s).toBe('s');
                else if (!(input in def.defaults)) expect(def.params).toHaveProperty(input);
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

    it('madeira envernizada = madeira sem especular próprio sob um dielétrico em camada que acompanha o poro', () => {
        for (const name of ['woodVarnishedGloss', 'woodVarnishedMatte'] as const) {
            expect(inner(name)).toMatchObject({
                rings: 'pattern.rings',
                pore: 'pattern.grain',
                body: 'bsdf.diffuse',
                coat: 'bsdf.dielectric',
                pore_relief: 'surface.bump',
                coat_fiber: 'surface.bump',
                coat_surface: 'closure.normal',
                out: 'closure.layer',
            });
            const graph = subgraphOrigin(nodes.material[name])!.graph;
            expect(graph.links).toEqual(
                expect.arrayContaining([
                    // A normal do verniz desce nos poros e ondula com a fibra fina.
                    ['open.gradient', 'pore_relief.gradient'],
                    ['thread.gradient', 'coat_fiber.gradient'],
                    ['pore_relief.value', 'coat_fiber.normal'],
                    ['coat_surface.value', 'out.top'],
                    ['grained.value', 'out.base'],
                ]),
            );
            // O verniz molha a madeira: a base não tem especular próprio (IOR 1).
            expect(graph.node('specular').values).toMatchObject({ ior: 1 });
            expect(Materials[name]().lobeMask & LOBES.coat).toBe(LOBES.coat);
        }
        const gloss = nodes.material.woodVarnishedGloss.params;
        const matte = nodes.material.woodVarnishedMatte.params;
        expect(gloss.coat_ior!.default).toBe(1.5);
        expect(gloss.coat_roughness!.default).toBeLessThanOrEqual(0.1);
        expect(matte.coat_roughness!.default).toBeGreaterThan(
            gloss.coat_roughness!.default as number,
        );
        expect(gloss.pore_relief!.default).toBeGreaterThan(0);
        for (const p of ['base_color', 'base_late_color', 'base_roughness', 'coat_color'])
            expect(gloss).toHaveProperty(p);
        // O anel é uma linha de pouco contraste: o lenho tardio tem mais de 60 % do tom do inicial.
        const early = gloss.base_color!.default as number[];
        const late = gloss.base_late_color!.default as number[];
        expect(late[0]! / early[0]!).toBeGreaterThan(0.6);
    });

    it('pintura de carro = pigmento difuso e flocos de condutor inclinados sob um dielétrico em camada, com a casca de laranja', () => {
        expect(inner('carPaint')).toMatchObject({
            flake: 'pattern.cells',
            tilt: 'surface.bump',
            flakes: 'bsdf.conductor',
            body: 'bsdf.diffuse',
            base: 'closure.mix',
            peel: 'pattern.grain',
            coat: 'bsdf.dielectric',
            out: 'closure.layer',
        });
        expect(subgraphOrigin(nodes.material.carPaint)!.graph.links).toEqual(
            expect.arrayContaining([
                // O espaço dos flocos: o do padrão vezes os flocos por unidade dele (o tamanho físico do floco).
                ['flake_scale.value', 'flake_uv.scale'],
                ['flake_uv.p', 'flake.p'],
                ['flake_uv.p', 'sparkle.p'],
                // Cada floco com a inclinação dele na normal da base, só quando ele aparece; o verniz com a normal
                // própria.
                ['flake.random', 'tilt.gradient'],
                ['resolved.value', 'seen_slope.b'],
                ['seen_slope.value', 'tilt.strength'],
                ['tilt.value', 'layer_of_flakes.normal'],
                ['wave.value', 'coat_surface.normal'],
                // O pigmento e os flocos dividem a base; o verniz por cima.
                ['body.value', 'base.a'],
                ['layer_of_flakes.value', 'base.b'],
                ['coat_surface.value', 'out.top'],
                ['base.value', 'out.base'],
            ]),
        );
        // Os flocos menores que o pixel: os brilhos pontuais sobre o condutor, antes da normal dos flocos.
        expect(inner('carPaint')).toMatchObject({
            sparkle: 'pattern.glints',
            glinting: 'closure.glints',
        });
        expect(subgraphOrigin(nodes.material.carPaint)!.graph.links).toEqual(
            expect.arrayContaining([
                ['flakes.value', 'glinting.c'],
                ['sparkle.cells', 'glinting.cells'],
                ['sparkle.count', 'glinting.count'],
                ['glinting.value', 'layer_of_flakes.c'],
            ]),
        );
        expect(Materials.carPaint().lobeMask).toBe(
            LOBES.diffuse | LOBES.specular | LOBES.anisotropy | LOBES.coat | LOBES.glint,
        );
        // Floco automotivo fino (de 10 a 30 µm), verniz espelhado e casca de laranja leve; o de floco grosso tem
        // plaquetas dez vezes maiores, mais inclinadas.
        const paint = nodes.material.carPaint.params;
        expect(paint.coat_roughness!.default).toBeLessThanOrEqual(0.05);
        expect(paint.orange_peel!.default).toBeLessThanOrEqual(0.001);
        for (const name of ['carPaint', 'carPaintSilver'] as const) {
            const size = nodes.material[name].params.flake_size!.default as number;
            expect(size).toBeGreaterThanOrEqual(10);
            expect(size).toBeLessThanOrEqual(30);
            expect(nodes.material[name].params.pattern_size!.default).toBeGreaterThan(0);
        }
        const coarse = nodes.material.carPaintFlake.params;
        expect(coarse.flake_size!.default).toBeGreaterThanOrEqual(
            10 * (paint.flake_size!.default as number),
        );
        expect(coarse.flake_tilt!.default).toBeGreaterThan(paint.flake_tilt!.default as number);
        expect(coarse.flake_density!.default).toBeLessThan(paint.flake_density!.default as number);
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
        expect(value('metalBrushed', 'anisotropy')).toBeGreaterThanOrEqual(0.1);
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
            wool: 'pattern.knit',
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
        // No couro, na lã e na madeira bruta o relevo é em milímetros (`surface.reliefNormal` sobre o relevo de
        // `nodes.relief`: o mesmo que a `DisplacementFunction` usa na geometria).
        const millimetres: readonly MaterialName[] = ['leather', 'wool', 'woodRough'];
        for (const name of Object.keys(promised) as MaterialName[])
            if (name !== 'marble')
                expect(
                    has(name, millimetres.includes(name) ? 'surface.reliefNormal' : 'surface.bump'),
                    name,
                ).toBe(true);
        for (const name of ['leather', 'wool', 'woodRough'] as const) {
            expect(has(name, `relief.${name}`), name).toBe(true);
            expect(nodes.material[name].params.scale).toEqual({ type: 'f32', default: 1 });
        }
        // As madeiras envernizadas herdam o padrão da crua (usada como nó) e repassam a escala.
        for (const name of ['woodVarnishedGloss', 'woodVarnishedMatte'] as const)
            expect(nodes.material[name].params.pattern_scale!.default).toEqual([1, 1]);
        // Jeans: sarja 3/1 de duas cores; seda: cetim com a tangente pela fibra do fio à vista (o fio torcido).
        const weave = (name: MaterialName) =>
            subgraphOrigin(nodes.material[name])!.graph.node('weave').values;
        expect(weave('denim')).toMatchObject({ over: 3, under: 1, shift: 1 });
        expect(weave('cotton')).toMatchObject({ over: 1, under: 1 });
        expect(weave('silk')).toMatchObject({ over: 4, under: 1, shift: 2 });
        expect(nodes.material.denim.params.color!.default).not.toEqual(
            nodes.material.denim.params.weft_color!.default,
        );
        expect(subgraphOrigin(nodes.material.silk)!.graph.links).toEqual(
            expect.arrayContaining([
                ['weave.fiber', 'fiber_direction.direction'],
                ['fiber_direction.value', 'threads.tangent'],
            ]),
        );
        expect(subgraphOrigin(nodes.material.metalBrushed)!.graph.links).toEqual(
            expect.arrayContaining([['along.value', 'metal.tangent']]),
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
    it('materiais novos (T117, T118): metais por canal, pintura de base metálica, madeiras, assoalhos, relevos, gelo, folha, rolha e telhados', () => {
        const has = (name: MaterialName, node: string): boolean =>
            Object.values(inner(name)).includes(node);
        const rgb = (name: MaterialName, p: string): number[] =>
            nodes.material[name].params[p]!.default as number[];
        // Os metais puros: um condutor só, com o F0 por canal (o cobre e o latão quentes; o cromo neutro). O ouro é o
        // condutor com o polimento desigual, e a folha de ouro, o mesmo em placas sobre o bolo.
        for (const name of ['copper', 'brass', 'chrome'] as const)
            expect(inner(name)).toEqual({ out: 'bsdf.conductor' });
        for (const name of ['gold', 'goldLeaf'] as const)
            expect(has(name, 'bsdf.conductor')).toBe(true);
        expect(has('goldLeaf', 'pattern.bricks') && has('goldLeaf', 'bsdf.diffuse')).toBe(true);
        for (const name of ['gold', 'copper', 'brass'] as const) {
            const [r, g, b] = rgb(name, 'color');
            expect(r).toBeGreaterThan(g!);
            expect(g).toBeGreaterThan(b!);
        }
        const chrome = rgb('chrome', 'color');
        expect(Math.max(...chrome) - Math.min(...chrome)).toBeLessThan(0.02);
        expect(rgb('gold', 'color')).toEqual([1, 0.71, 0.29]);
        expect(rgb('copper', 'color')).toEqual([0.955, 0.638, 0.538]);
        for (const name of [
            'aluminiumAnodized',
            'metalHammered',
            'castIron',
            'bronzePatina',
            'carbonFiber',
        ] as const)
            expect(has(name, 'bsdf.conductor'), name).toBe(true);
        expect(has('metalHammered', 'pattern.dents')).toBe(true);
        expect(inner('aluminiumAnodized')).toMatchObject({ out: 'closure.layer' });
        // A pintura de carro: a base é metal (o condutor cobre quase toda a base), nas duas cores.
        for (const name of ['carPaint', 'carPaintSilver'] as const) {
            expect(nodes.material[name].params.flake_weight!.default).toBeGreaterThanOrEqual(0.85);
            expect(nodes.material[name].params.flake_roughness!.default).toBeGreaterThanOrEqual(
                0.25,
            );
        }
        // O padrão que o nome promete.
        const promised: Readonly<Partial<Record<MaterialName, string>>> = {
            concrete: 'pattern.cells',
            granite: 'pattern.cells',
            sandstone: 'relief.sandstone',
            brick: 'pattern.bricks',
            tile: 'pattern.bricks',
            asphalt: 'pattern.cells',
            driedMud: 'relief.driedMud',
            sand: 'pattern.cells',
            bark: 'pattern.fissures',
            barkPine: 'pattern.fissures',
            barkBirch: 'relief.barkBirch',
            corkStopper: 'pattern.dents',
            leaf: 'pattern.veins',
            leafDry: 'pattern.veins',
            leafMatte: 'pattern.veins',
            woodAsh: 'relief.woodAsh',
            woodAshBrushed: 'relief.woodAshBrushed',
            woodPineFine: 'relief.woodPineFine',
            roofTile: 'pattern.shingles',
            roofSlate: 'pattern.shingles',
            cork: 'pattern.cells',
            woodPine: 'pattern.rings',
            woodFloorPlanks: 'pattern.planks',
            woodFloorHerringbone: 'pattern.planks',
            carbonFiber: 'pattern.weave',
            motherOfPearl: 'closure.thinFilm',
            paper: 'bsdf.translucent',
            snow: 'pattern.glints',
            asphaltFine: 'pattern.cells',
            asphaltCoarse: 'pattern.cells',
            asphaltCracked: 'pattern.cells',
            pavementPortuguese: 'pattern.cells',
            grassPaver: 'pattern.bricks',
            paverHerringbone: 'pattern.planks',
            concreteBlock: 'pattern.bricks',
            concreteSlab: 'pattern.bricks',
            stoneSetts: 'pattern.bricks',
            stoneWall: 'pattern.ashlar',
            stackedSlate: 'pattern.ashlar',
            flagstone: 'pattern.cells',
            cobblestone: 'pattern.dents',
            bamboo: 'pattern.planks',
        };
        for (const [name, node] of Object.entries(promised) as [MaterialName, string][])
            expect(has(name, node), name).toBe(true);
        // Os de relevo em milímetros têm a escala do mundo e o deslocamento de mesmo nome.
        for (const name of [
            'sandstone',
            'brick',
            'bark',
            'barkPine',
            'barkBirch',
            'driedMud',
            'roofTile',
            'roofSlate',
            'leaf',
            'leafMatte',
            'leafDry',
            'woodAsh',
            'woodAshBrushed',
            'woodPineFine',
        ] as const) {
            expect(has(name, 'surface.reliefNormal'), name).toBe(true);
            expect(nodes.material[name].params.scale).toEqual({ type: 'f32', default: 1 });
            expect(Displacements[name]().graph!.node('relief').definition).toBe(nodes.relief[name]);
        }
        // As madeiras: o pinho tem nós; o mogno e o carvalho escuro, verniz; os assoalhos leem a coordenada da tábua.
        expect(nodes.material.woodPine.params.knots!.default).toBeGreaterThan(0);
        expect(nodes.material.woodPine.params.coat_weight!.default).toBe(0);
        for (const name of ['woodMahogany', 'woodOakVarnished', 'woodFloorPlanks'] as const)
            expect(nodes.material[name].params.coat_weight!.default).toBe(1);
        expect(nodes.material.woodOakVarnished.params.pore_relief!.default).toBeGreaterThan(0);
        const planks = (name: MaterialName) => subgraphOrigin(nodes.material[name])!.graph;
        expect(planks('woodFloorPlanks').links).toEqual(
            expect.arrayContaining([['planks.p', 'rings.p']]),
        );
        expect(planks('woodFloorPlanks').node('planks').values).toMatchObject({ arrangement: 0 });
        expect(planks('woodFloorHerringbone').node('planks').values).toMatchObject({
            arrangement: 1,
        });
        // Os de subsuperfície novos; o marfim, curto e quente.
        for (const name of ['soap', 'ivory', 'snow'] as const)
            expect(has(name, 'bsdf.subsurface'), name).toBe(true);
        const ivory = rgb('ivory', 'radius');
        expect(Math.max(...ivory)).toBeLessThan(0.5);
        // O gelo é transparente (IOR 1,31): transmissão traçada, a absorção mais forte no vermelho, as falhas opacas
        // misturadas por máscara; o espalhamento do meio é parâmetro (0 por padrão).
        expect(inner('ice')).toMatchObject({
            refraction: 'bsdf.transmission',
            milky: 'closure.mediumScatter',
            frost: 'bsdf.diffuse',
            inside: 'closure.mix',
            specular: 'bsdf.dielectric',
        });
        expect(nodes.material.ice.params.ior!.default).toBe(1.31);
        const tint = rgb('ice', 'color');
        expect(tint[2]).toBeGreaterThan(tint[0]!);
        expect(rgb('ice', 'scatter')).toEqual([0, 0, 0]);
        expect(Materials.ice().lobeMask & LOBES.transmission).toBe(LOBES.transmission);
        // Os brilhos pontuais: a pintura, a neve e a areia ligam `pattern.glints` a `closure.glints`.
        for (const name of [
            'carPaint',
            'carPaintSilver',
            'carPaintFlake',
            'snow',
            'sand',
        ] as const) {
            expect(has(name, 'pattern.glints') && has(name, 'closure.glints'), name).toBe(true);
            expect(Materials[name]().lobeMask & LOBES.glint).toBe(LOBES.glint);
            expect(nodes.material[name].params.sparkle_roughness!.default).toBeLessThanOrEqual(0.3);
        }
        // O metal escovado é opaco: um condutor só, anisotrópico, sem transmissão.
        expect(Materials.metalBrushed().lobeMask & LOBES.transmission).toBe(0);
        // O acabamento acetinado: o lobo é largo e só moderadamente alongado (as passadas cruzadas alargam-no também
        // ao longo da escova); a tangente é a direção dos riscos no ponto.
        expect(nodes.material.metalBrushed.params.anisotropy!.default).toBeGreaterThanOrEqual(0.1);
        expect(nodes.material.metalBrushed.params.roughness!.default).toBeGreaterThanOrEqual(0.3);
        expect(subgraphOrigin(nodes.material.metalBrushed)!.graph.links).toEqual(
            expect.arrayContaining([
                ['scratch.direction', 'along.direction'],
                ['along.value', 'metal.tangent'],
            ]),
        );
        // O freixo escovado: a mesma madeira com os sulcos de um milímetro.
        expect(nodes.material.woodAshBrushed.params.furrow_depth!.default).toBeGreaterThanOrEqual(
            0.5,
        );
        expect(nodes.material.woodAshBrushed.params.furrow_depth!.default).toBeLessThanOrEqual(1.5);
        expect(nodes.material.woodAsh.params.furrow_depth!.default).toBe(0);
        // O pinho de veio fino: subsuperfície de raio curto (mais longo no vermelho), relevo à vista em milímetros,
        // com anéis e nós, sem poros; mais amarelo que o freixo.
        const pine = nodes.material.woodPineFine.params;
        const reach = pine.radius!.default as number[];
        expect(reach[0]).toBeGreaterThan(reach[2]!);
        expect(reach[0]).toBeLessThanOrEqual(1.5);
        expect(pine.ring_height!.default).toBeGreaterThanOrEqual(0.4);
        expect(pine.ring_height!.default).toBeLessThanOrEqual(1);
        // O relevo é o do campo dos anéis: sem um padrão de sulcos independente na geometria; e o que corre ao longo
        // da fibra lê a coordenada do veio (acompanha as curvas).
        expect(pine.furrow_depth!.default).toBe(0);
        expect(subgraphOrigin(nodes.material.woodPineFine)!.graph.links).toEqual(
            expect.arrayContaining([
                ['rings.along', 'fiber.p'],
                ['rings.bend', 'fiber.bend'],
                ['rings.along', 'pore.p'],
            ]),
        );
        expect(subgraphOrigin(nodes.relief.woodPineFine)!.graph.links).toEqual(
            expect.arrayContaining([
                ['rings.along', 'fiber.p'],
                ['rings.bend', 'fiber.bend'],
            ]),
        );
        // Os anéis, a medula e os nós são um valor só, ligado à cor e ao relevo.
        expect(pine.ring_count!.default).toBe(nodes.relief.woodPineFine.params.ring_count!.default);
        expect(pine.knot_density!.default).toBeGreaterThan(0);
        expect(subgraphOrigin(nodes.material.woodPineFine)!.graph.links).toEqual(
            expect.arrayContaining([
                ['count.value', 'rings.scale'],
                ['count.value', 'height.ring_count'],
                ['knots.value', 'rings.knots'],
                ['knots.value', 'height.knot_density'],
                ['pith.value', 'rings.depth'],
                ['pith.value', 'height.pith_depth'],
            ]),
        );
        expect(pine.pore_depth!.default).toBe(0);
        expect(Materials.woodPineFine().lobeMask & LOBES.subsurface).toBe(LOBES.subsurface);
        expect(has('woodPineFine', 'pattern.rings')).toBe(true);
        expect(has('woodPineFine', 'bsdf.subsurface')).toBe(true);
        const honey = rgb('woodPineFine', 'color');
        const cream = rgb('woodAsh', 'color');
        expect(honey[0]! / honey[2]!).toBeGreaterThan(cream[0]! / cream[2]!);
        // A folha é parede fina (a luz de trás atravessa) sob a cutícula de rugosidade variável (lisa no meio das
        // almofadas, fosca nas vênulas), com o relevo em milímetros; a seca é mais fosca e a fosca não tem realce.
        for (const name of ['leaf', 'leafMatte', 'leafDry'] as const) {
            expect(inner(name)).toMatchObject({
                through: 'bsdf.translucent',
                cuticle: 'bsdf.dielectric',
                pad: 'pattern.areoles',
                height: `relief.${name}`,
                normal: 'surface.reliefNormal',
            });
            expect(subgraphOrigin(nodes.material[name])!.graph.links).toEqual(
                expect.arrayContaining([
                    ['pad.height', 'gloss.x'],
                    ['rough.value', 'cuticle.roughness'],
                    ['height.value', 'normal.relief'],
                ]),
            );
            const p = nodes.material[name].params;
            expect(p.translucency!.default).toBeGreaterThan(0.2);
            expect(p.vein_roughness!.default).toBeGreaterThan(p.roughness!.default as number);
            for (const height of ['vein_height', 'bulge_height', 'pad_height', 'wave_height'])
                expect(p, `${name}.${height}`).toHaveProperty(height);
        }
        expect(nodes.material.leafDry.params.roughness!.default).toBeGreaterThan(
            nodes.material.leaf.params.roughness!.default as number,
        );
        expect(nodes.material.leaf.params.roughness!.default).toBeLessThan(0.3);
        expect(nodes.material.leafMatte.params.roughness!.default).toBeGreaterThan(0.75);
        expect(has('leafMatte', 'bsdf.sheen')).toBe(true);
        expect(has('leaf', 'bsdf.sheen')).toBe(false);
        // Na face de cima as nervuras são sulcos; na folha seca, salientes.
        expect(nodes.material.leaf.params.vein_height!.default).toBeLessThan(0);
        expect(nodes.material.leafDry.params.vein_height!.default).toBeGreaterThan(0);
        // O freixo cru: o corpo é subsuperfície (raio curto, mais longo no vermelho), fosco, com o relevo em
        // milímetros e o lobo alongado pela fibra.
        expect(inner('woodAsh')).toMatchObject({
            rings: 'pattern.rings',
            body: 'bsdf.subsurface',
            specular: 'bsdf.dielectric',
            height: 'relief.woodAsh',
            normal: 'surface.reliefNormal',
        });
        const ash = nodes.material.woodAsh.params;
        const radius = ash.radius!.default as number[];
        expect(radius[0]).toBeGreaterThan(radius[1]!);
        expect(radius[1]).toBeGreaterThan(radius[2]!);
        expect(radius[0]).toBeLessThanOrEqual(1.5);
        expect(radius[2]).toBeGreaterThanOrEqual(0.3);
        expect(ash.roughness!.default).toBeGreaterThan(0.5);
        expect(ash.anisotropy!.default).toBeGreaterThan(0);
        expect(Materials.woodAsh().lobeMask & LOBES.subsurface).toBe(LOBES.subsurface);
        const light = (name: MaterialName): number =>
            rgb(name, 'color').reduce((sum, c) => sum + c, 0);
        expect(light('woodAsh')).toBeGreaterThan(light('woodOak'));
        const green = rgb('leaf', 'color');
        expect(green[1]).toBeGreaterThan(2 * green[0]!);
        const dry = rgb('leafDry', 'color');
        expect(dry[0]).toBeGreaterThan(2 * dry[1]!);
        // Os telhados: a telha de barro tem o perfil de capa e canal; a ardósia é plana, com as juntas desencontradas.
        const courses = (name: MaterialName) =>
            subgraphOrigin(nodes.material[name])!.graph.node('courses').values;
        expect(courses('roofTile').profile).toBeGreaterThan(0);
        expect(courses('roofTile').shift).toBe(0);
        expect(courses('roofSlate')).toMatchObject({ profile: 0, shift: 0.5 });
        // O tecido fino tem cobertura parcial nos vãos.
        expect(has('sheerFabric', 'closure.opacity')).toBe(true);
    });
});
