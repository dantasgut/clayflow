import { describe, expect, it, vi } from 'vitest';
import { FlowRegistrationError } from '../flows/FlowRegistry';
import type { FlowDescriptor } from '../descriptors/FlowDescriptor';
import {
    ProbeBody,
    ProbeCam,
    ProbeFlow,
    probeParams,
    probePipeline,
    probeScene,
} from './helpers/probeFlow';

/** Corpo com algoritmo declarado: pool `ProbeBody:FAST`. */
class FastBody extends ProbeBody {
    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: 'FAST', bodyType: 'Probe' }];
    }
}

function factory(created: ProbeFlow[], options?: ConstructorParameters<typeof ProbeFlow>[1]) {
    return () => {
        const flow = new ProbeFlow(probeParams, options);
        created.push(flow);
        return flow;
    };
}

describe('US3 — registro por factory e seleção pela C2', () => {
    it('cenário 1: sem corpo do tipo, nenhum Flow é instanciado', async () => {
        const { scene } = await probeScene();
        const created: ProbeFlow[] = [];
        const reg = scene.flows.register(factory(created), {
            type: 'ProbeFlow',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        expect(created).toHaveLength(0);
        expect(reg.flow).toBeUndefined();
        expect(scene.flows.flowsInPhase('physics')).toEqual([]);
    });

    it('cenário 2: primeiro corpo instancia, prepara e só então emite flowReady; antes disso não grava', async () => {
        const { scene, frame } = await probeScene();
        const created: ProbeFlow[] = [];
        const countAtReady: number[] = [];
        scene.events.on('flowReady', () =>
            countAtReady.push(scene.resourceSystem.poolCount('ProbeBody')),
        );
        scene.world.insert(new ProbeCam());
        scene.flows.register(factory(created), {
            type: 'ProbeFlow',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        scene.world.insert(new ProbeBody());
        expect(created).toHaveLength(1);
        expect(countAtReady).toEqual([1]);
        expect(created[0]!.events.map((e) => e.type)).toEqual([
            'slotsResolved',
            'pipelinesCompiled',
        ]);
        frame();
        expect(created[0]!.dispatched).toEqual([1]);
    });

    it('cenário 2 (compilação assíncrona): flowReady só depois de compilar; quadros anteriores não gravam', async () => {
        const { scene, frame } = await probeScene();
        const created: ProbeFlow[] = [];
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        scene.flows.register(
            factory(created, { pipelines: [probePipeline({ preferAsync: true })] }),
            {
                type: 'ProbeFlow',
                phase: 'physics',
                bodyType: 'ProbeBody',
            },
        );
        scene.world.insert(new ProbeBody());
        frame();
        expect(ready).not.toHaveBeenCalled();
        expect(created[0]!.lifecycle).toBe('preparing');
        expect(created[0]!.dispatched).toEqual([]);
        await Promise.resolve();
        frame();
        expect(ready).toHaveBeenCalledTimes(1);
        expect(created[0]!.dispatched).toEqual([1]);
    });

    it('cenário 3: dois Flows para o mesmo tipo — vence a maior prioridade; empate para o último registrado', async () => {
        const { scene } = await probeScene();
        const low: ProbeFlow[] = [];
        const high: ProbeFlow[] = [];
        const tie: ProbeFlow[] = [];
        scene.world.insert(new ProbeCam());
        scene.flows.register(factory(low), {
            type: 'Low',
            phase: 'physics',
            bodyType: 'ProbeBody',
            priority: 1,
        });
        scene.flows.register(factory(high), {
            type: 'High',
            phase: 'physics',
            bodyType: 'ProbeBody',
            priority: 5,
        });
        scene.flows.register(factory(tie), {
            type: 'Tie',
            phase: 'physics',
            bodyType: 'ProbeBody',
            priority: 5,
        });
        scene.world.insert(new ProbeBody());
        expect([low.length, high.length, tie.length]).toEqual([0, 0, 1]);
        expect(scene.flows.resolve('ProbeBody')?.options.type).toBe('Tie');
    });

    it('override vence a prioridade; novo vencedor depois de instanciado substitui a instância', async () => {
        const { scene } = await probeScene();
        const base: ProbeFlow[] = [];
        const custom: ProbeFlow[] = [];
        scene.world.insert(new ProbeCam());
        scene.flows.register(factory(base), {
            type: 'Base',
            phase: 'physics',
            bodyType: 'ProbeBody',
            priority: 9,
        });
        scene.world.insert(new ProbeBody());
        expect(base).toHaveLength(1);
        scene.flows.override('ProbeBody', factory(custom), { type: 'Custom', phase: 'physics' });
        expect(base[0]!.disposed).toBe(true);
        expect(base[0]!.lifecycle).toBe('disposed');
        expect(custom).toHaveLength(1);
        expect(custom[0]!.lifecycle).toBe('ready');
    });

    it('cenário 4: unregister libera objetos e inscrições; não roda mais; o próximo vencedor assume', async () => {
        const { scene, frame, counting } = await probeScene();
        const a: ProbeFlow[] = [];
        const b: ProbeFlow[] = [];
        scene.world.insert(new ProbeCam());
        scene.flows.register(factory(a), {
            type: 'A',
            phase: 'physics',
            bodyType: 'ProbeBody',
            priority: 1,
        });
        const regB = scene.flows.register(factory(b), {
            type: 'B',
            phase: 'physics',
            bodyType: 'ProbeBody',
            priority: 2,
        });
        scene.world.insert(new ProbeBody());
        frame();
        const flowB = b[0]!;
        const bound = scene.flows.resolve('ProbeBody')!;
        expect(bound).toBe(regB);
        const destroyedBefore = vi.mocked(counting.core.destroy).mock.calls.length;
        expect(scene.flows.unregister(regB)).toBe(true);
        expect(flowB.disposed).toBe(true);
        expect(vi.mocked(counting.core.destroy).mock.calls.length).toBeGreaterThan(destroyedBefore);
        expect(a).toHaveLength(1);
        frame();
        expect(flowB.dispatched).toEqual([1]);
        expect(a[0]!.dispatched).toEqual([1]);
        expect(scene.flows.unregister(regB)).toBe(false);
    });

    it('unregister durante a compilação: a compilação concluída depois não reativa', async () => {
        const { scene, frame } = await probeScene();
        const created: ProbeFlow[] = [];
        const ready = vi.fn();
        scene.events.on('flowReady', ready);
        scene.world.insert(new ProbeCam());
        const reg = scene.flows.register(
            factory(created, { pipelines: [probePipeline({ preferAsync: true })] }),
            {
                type: 'ProbeFlow',
                phase: 'physics',
                bodyType: 'ProbeBody',
            },
        );
        scene.world.insert(new ProbeBody());
        scene.flows.unregister(reg);
        await Promise.resolve();
        frame();
        expect(ready).not.toHaveBeenCalled();
        expect(created[0]!.dispatched).toEqual([]);
    });

    it('cenário 5: corpo com algoritmo declarado entra no pool schema:algoritmo e é atendido pelo Flow desse algoritmo', async () => {
        const { scene } = await probeScene();
        const plain: ProbeFlow[] = [];
        const fast: ProbeFlow[] = [];
        scene.world.insert(new ProbeCam());
        scene.consumers.register({
            name: 'ProbeBody:FAST',
            typeName: 'ProbeBody',
            resolve: (ctx) => {
                const info = ctx.resources.poolInfo('ProbeBody:FAST');
                return info === undefined ? undefined : { kind: 'buffer', buffer: info.buffer };
            },
        });
        scene.flows.register(factory(plain), {
            type: 'Plain',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        scene.flows.register(
            factory(fast, {
                pipelines: [probePipeline({ consumes: ['ProbeCam', 'ProbeBody:FAST'] })],
            }),
            { type: 'Fast', phase: 'physics', bodyType: 'ProbeBody:FAST' },
        );
        scene.world.insert(new FastBody());
        expect(scene.resourceSystem.poolCount('ProbeBody:FAST')).toBe(1);
        expect(scene.resourceSystem.poolCount('ProbeBody')).toBe(0);
        expect(plain).toHaveLength(0);
        expect(fast).toHaveLength(1);
        expect(fast[0]!.lifecycle).toBe('ready');
    });

    it('último corpo removido: o Flow continua registrado e não despacha com contagem 0', async () => {
        const { scene, frame } = await probeScene();
        const created: ProbeFlow[] = [];
        scene.world.insert(new ProbeCam());
        scene.flows.register(factory(created), {
            type: 'ProbeFlow',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        const body = new ProbeBody();
        scene.world.insert(body);
        scene.world.remove(body);
        frame();
        expect(created[0]!.lifecycle).toBe('ready');
        expect(created[0]!.dispatched).toEqual([1]);
    });

    it('erros de registro: type repetido na fase; bodyType vazio', async () => {
        const { scene } = await probeScene();
        scene.flows.register(factory([]), { type: 'Dup', phase: 'physics', bodyType: 'ProbeBody' });
        expect(() =>
            scene.flows.register(factory([]), {
                type: 'Dup',
                phase: 'physics',
                bodyType: 'ProbeBody',
            }),
        ).toThrow(FlowRegistrationError);
        expect(() =>
            scene.flows.register(factory([]), { type: 'Empty', phase: 'physics', bodyType: '' }),
        ).toThrow(/bodyType vazio/);
    });
});
