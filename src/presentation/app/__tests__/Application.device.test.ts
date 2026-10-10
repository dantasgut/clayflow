import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import { Application } from '../Application';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
}));

describe('Application — dispositivo', () => {
    it('options.device chega ao core.initialize junto com canvas e canvasOptions', async () => {
        const { core } = fakeSceneCore();
        const canvas = document.createElement('canvas');
        await Application.create({
            canvas,
            scene: createScene({ core }),
            autoResize: false,
            canvasOptions: { alphaMode: 'premultiplied' },
            device: { powerPreference: 'high-performance', optionalFeatures: ['shader-f16'] },
        });
        expect(core.initialize).toHaveBeenCalledWith(
            canvas,
            { alphaMode: 'premultiplied' },
            { powerPreference: 'high-performance', optionalFeatures: ['shader-f16'] },
        );
    });

    it('app.capabilities expõe o relatório do core', async () => {
        const { core } = fakeSceneCore();
        const app = await Application.create({
            canvas: document.createElement('canvas'),
            scene: createScene({ core }),
            autoResize: false,
        });
        expect(app.capabilities).toBe(vi.mocked(core.capabilities).mock.results[0]?.value);
        expect(app.capabilities.limits.minUniformBufferOffsetAlignment).toBe(256);
    });

    it('requestNewDevice recupera pelo core (que reaplica as opções guardadas) e emite deviceRecovered', async () => {
        const { core } = fakeSceneCore();
        const canvas = document.createElement('canvas');
        const app = await Application.create({
            canvas,
            scene: createScene({ core }),
            autoResize: false,
        });
        const recovered = vi.fn();
        app.events.on('deviceRecovered', recovered);
        await app.requestNewDevice();
        expect(core.requestRecover).toHaveBeenCalledWith(canvas);
        expect(recovered).toHaveBeenCalledOnce();
    });
});
