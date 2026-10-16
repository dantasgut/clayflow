import { beforeEach, describe, expect, it } from 'vitest';
import { probeScene } from '../../__tests__/helpers/probeFlow';
import { GraphFlow } from '../GraphFlow';
import { graphArgument, NodeGraph } from '../NodeGraph';
import { SetCountSchema } from '../SetCountSchema';
import { SetGraph } from '../SetGraph';
import { add } from './probeGraph';
import { clock, created, filter, map, sink, source } from './probeSetGraph';

const chain = (n = 100) =>
    new NodeGraph({
        nodes: {
            src: source.with({ n }),
            m: map,
            f: filter,
            snk: sink,
            x: graphArgument('x'),
            w: add,
        },
        links: [
            ['src.out', 'm.in'],
            ['m.out', 'f.in'],
            ['f.out', 'snk.in'],
            ['x.value', 'w.a'],
            ['w.value', 'm.weight'],
        ],
    });

async function scene(graph: NodeGraph) {
    const s = await probeScene();
    const registration = s.scene.flows.register((ctx) => new GraphFlow(ctx), {
        type: 'setGraph',
        phase: 'transform',
    });
    const set = new SetGraph({ graph });
    const id = s.scene.world.insert(set);
    const flow = registration.flow;
    return { ...s, set, id, flow };
}

const recorded = (): number[] => created.map((i) => i.record.mock.calls.length);

describe('GraphFlow (spec 031, T068)', () => {
    beforeEach(() => {
        created.length = 0;
    });

    it('cria uma instância por nó, com conjuntos, registros de contagem e grafo de ponto fundido', async () => {
        const s = await scene(chain());
        s.frame();
        expect(created).toHaveLength(4);
        const [src, m, f] = created;
        const so = src!.ctx.output('out', 'values');
        expect(so.capacity).toBe(100);
        expect(so.buffer.byteSize).toBe(100 * 4 > 16 ? 400 : 16);
        expect(m!.ctx.input('in', 'values')).toEqual(so);
        expect(m!.ctx.output('out', 'values').slot).toBe(so.slot);
        expect(f!.ctx.output('out', 'values').slot).toBe(1);
        expect(m!.ctx.point('weight')?.module.source).toContain('fn probe_weight(x: f32)');
        expect(src!.ctx.point('weight')).toBeUndefined();
        expect(src!.ctx.values()).toEqual({ n: 100 });
        expect(src!.ctx.counts.byteSize).toBe(2 * SetCountSchema.stride);
        expect(s.counting.stats().creates.get('buffer/indirect')).toBe(1);
        for (const i of created) expect(i.update).toHaveBeenCalledTimes(1);
    });

    it('grava em ordem só quando desatualizado; parado, nada é refeito; valor novo refaz sem recriar', async () => {
        const s = await scene(chain());
        s.frame();
        expect(recorded()).toEqual([1, 1, 1, 1]);
        const order = created.map((i) => i.record.mock.invocationCallOrder[0]!);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        s.frame();
        s.frame();
        expect(recorded()).toEqual([1, 1, 1, 1]);
        expect(s.flow!.isStale(s.id)).toBe(false);
        // Valor novo sem mudar capacidade (peso do filtro): as instâncias recebem update e o grafo é refeito.
        s.set.values.f_keep = 0.25;
        s.frame();
        expect(created).toHaveLength(4);
        expect(created[2]!.update).toHaveBeenCalledTimes(2);
        expect(recorded()).toEqual([2, 2, 2, 2]);
        s.frame();
        expect(recorded()).toEqual([2, 2, 2, 2]);
    });

    it('capacidade nova (valor) ou topologia nova (setGraph): instâncias recriadas e conjuntos realocados', async () => {
        const s = await scene(chain(100));
        s.frame();
        const first = [...created];
        s.set.values.src_n = 300;
        s.frame();
        expect(created).toHaveLength(8);
        for (const i of first) expect(i.dispose).toHaveBeenCalledTimes(1);
        expect(created[4]!.ctx.output('out', 'values').capacity).toBe(300);
        s.set.setGraph(
            new NodeGraph({ nodes: { a: source, b: sink }, links: [['a.out', 'b.in']] }),
        );
        s.frame();
        expect(created).toHaveLength(10);
        expect(created.slice(-2).map((i) => i.record.mock.calls.length)).toEqual([1, 1]);
    });

    it('nó dependente do tempo: refeito a cada quadro', async () => {
        const s = await scene(
            new NodeGraph({ nodes: { c: clock, k: sink }, links: [['c.out', 'k.in']] }),
        );
        s.frame();
        s.frame();
        s.frame();
        expect(recorded()).toEqual([3, 3]);
    });

    it('saída da entidade: instâncias liberadas', async () => {
        const s = await scene(chain());
        s.frame();
        s.scene.world.remove(s.set);
        s.frame();
        for (const i of created) expect(i.dispose).toHaveBeenCalledTimes(1);
    });
});
