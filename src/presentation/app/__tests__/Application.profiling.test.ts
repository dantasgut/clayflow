import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { FlowRegistry } from '../../../scene/flows/FlowRegistry';
import { World } from '../../../scene/world/World';
import type { EngineCore } from '../../../core/contracts/index';
import type { SceneContext } from '../../../scene/SceneContext';
import { Application } from '../Application';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
}));

function fakeScene(): { scene: SceneContext; core: EngineCore } {
    const events = new DefaultEventBus();
    const core = {
        initialize: vi.fn(() => Promise.resolve()),
        setFrameProfiling: vi.fn(),
    } as unknown as EngineCore;
    const scene = {
        core,
        events,
        flows: new FlowRegistry(),
        world: new World(events),
        resourceSystem: {},
        executionSystem: { captureErrors: false },
        layoutInferencer: {},
        consumers: {},
        dispose: vi.fn(),
    } as unknown as SceneContext;
    return { scene, core };
}

describe('Application — opção profiling', () => {
    it('profiling: true liga o profiling por quadro com a capacidade informada', async () => {
        const { scene, core } = fakeScene();
        const canvas = document.createElement('canvas');
        await Application.create({
            canvas,
            scene,
            autoResize: false,
            profiling: true,
            profilingCapacity: 64,
        });
        expect(core.setFrameProfiling).toHaveBeenCalledWith(true, 64);
    });

    it('omitido, não liga o profiling', async () => {
        const { scene, core } = fakeScene();
        await Application.create({
            canvas: document.createElement('canvas'),
            scene,
            autoResize: false,
        });
        expect(core.setFrameProfiling).not.toHaveBeenCalled();
    });
});
