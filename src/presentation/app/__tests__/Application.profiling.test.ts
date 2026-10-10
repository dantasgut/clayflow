import { describe, expect, it, vi } from 'vitest';
import type { EngineCore } from '../../../core/contracts/index';
import { createScene, type SceneContext } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import { Application } from '../Application';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
    releasePresentationDefaults: () => true,
}));

function fakeScene(): { scene: SceneContext; core: EngineCore } {
    const { core } = fakeSceneCore();
    return { scene: createScene({ core }), core };
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
