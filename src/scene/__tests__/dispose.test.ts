import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../SceneContext';
import { Flow, type Phase } from '../flows/Flow';
import { FlowRegistry } from '../flows/FlowRegistry';
import { TransformFlow } from '../../elements/scene/flows/TransformFlow';
import { fakeSceneCore } from './helpers/fakeSceneCore';
import type { Frame } from '../../core/contracts/index';

class ProbeFlow extends Flow {
    readonly type = 'Probe';
    readonly bodyType: string;
    readonly phase: Phase = 'physics';
    readonly disposed = vi.fn();
    constructor(bodyType = '') {
        super();
        this.bodyType = bodyType;
    }
    getPipelineDescriptors() {
        return [];
    }
    dispatch(_frame: Frame): void {}
    override dispose(): void {
        this.disposed();
    }
}

describe('FlowRegistry.unregister', () => {
    it('remove o estágio da fase e do índice por bodyType e chama dispose', () => {
        const flows = new FlowRegistry();
        const flow = new ProbeFlow('ProbeSchema');
        flows.register(flow);
        expect(flows.unregister(flow)).toBe(true);
        expect(flows.flowsInPhase('physics')).toEqual([]);
        expect(flows.resolve('ProbeSchema')).toBeUndefined();
        expect(flow.disposed).toHaveBeenCalledOnce();
    });

    it('flow não registrado: devolve false e não descarta', () => {
        const flow = new ProbeFlow();
        expect(new FlowRegistry().unregister(flow)).toBe(false);
        expect(flow.disposed).not.toHaveBeenCalled();
    });
});

describe('SceneContext.dispose', () => {
    it('ouvintes do EventBus voltam a zero e todos os estágios são descartados', async () => {
        const { core } = fakeSceneCore();
        const scene = createScene({ core });
        await scene.initialize();
        const probe = new ProbeFlow();
        scene.flows.register(probe);
        const transform = new TransformFlow(core, scene.resourceSystem, scene.events);
        const transformDispose = vi.spyOn(transform, 'dispose');
        scene.flows.register(transform);
        expect(scene.events.listenerCount()).toBeGreaterThan(0);
        scene.dispose();
        expect(scene.events.listenerCount()).toBe(0);
        expect(probe.disposed).toHaveBeenCalledOnce();
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
