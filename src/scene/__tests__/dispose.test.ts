import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../SceneContext';
import { TransformFlow } from '../../elements/scene/flows/TransformFlow';
import { fakeSceneCore } from './helpers/fakeSceneCore';
import { ProbeBody, ProbeFlow, probeParams, probeScene } from './helpers/probeFlow';

describe('FlowRegistry.unregister', () => {
    it('remove o estágio da fase e da seleção por bodyType e chama dispose', async () => {
        const { scene, frame } = await probeScene();
        const reg = scene.flows.register(() => new ProbeFlow(probeParams), {
            type: 'probe',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        scene.world.insert(new ProbeBody());
        frame();
        const flow = reg.flow!;
        expect(scene.flows.flowsInPhase('physics')).toEqual([flow]);
        expect(scene.flows.unregister(reg)).toBe(true);
        expect(scene.flows.flowsInPhase('physics')).toEqual([]);
        expect(scene.flows.resolve('ProbeBody')).toBeUndefined();
        expect(flow.disposed).toBe(true);
    });

    it('registro de outra cena: devolve false e não o desfaz', async () => {
        const a = await probeScene();
        const b = await probeScene();
        const reg = a.scene.flows.register(() => new ProbeFlow(probeParams), {
            type: 'probe',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        expect(b.scene.flows.unregister(reg)).toBe(false);
        expect(a.scene.flows.resolve('ProbeBody')).toBe(reg);
    });
});

describe('SceneContext.dispose', () => {
    it('ouvintes do EventBus voltam a zero e todos os estágios são descartados', async () => {
        const { scene, counting, frame } = await probeScene();
        const core = counting.core;
        const probeReg = scene.flows.register(() => new ProbeFlow(probeParams), {
            type: 'probe',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        scene.world.insert(new ProbeBody());
        frame();
        const probe = probeReg.flow!;
        const reg = scene.flows.register((ctx) => new TransformFlow(ctx), {
            type: 'transform',
            phase: 'transform',
        });
        const transformDispose = vi.spyOn(reg.flow!, 'dispose');
        expect(scene.events.listenerCount()).toBeGreaterThan(0);
        scene.dispose();
        expect(scene.events.listenerCount()).toBe(0);
        expect(probe.disposed).toBe(true);
        expect(transformDispose).toHaveBeenCalledOnce();
        expect([...scene.flows.allFlows()]).toEqual([]);
        expect(core.shutdown).toHaveBeenCalledOnce();
    });

    it('é idempotente', () => {
        const { core } = fakeSceneCore();
        const scene = createScene({ core });
        scene.dispose();
        scene.dispose();
        expect(core.shutdown).toHaveBeenCalledOnce();
    });
});
