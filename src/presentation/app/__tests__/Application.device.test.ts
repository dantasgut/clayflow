import { describe, expect, it, vi } from 'vitest';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import { Application } from '../../../platform/web/Application';
import { WebPlatformAdapter } from '../../../platform/web/WebPlatformAdapter';

vi.mock('../../flows/defaults', () => ({
    registerPresentationDefaults: () => ({}),
    releasePresentationDefaults: () => true,
}));

describe('Application — dispositivo', () => {
    it('options.device chega ao core.initialize junto com a superfície do canvas, canvasOptions e o adaptador do navegador (com indirect-first-instance, spec 010)', async () => {
        const { core } = fakeSceneCore();
        const canvas = document.createElement('canvas');
        const app = await Application.create({
            canvas,
            scene: createScene({ core }),
            autoResize: false,
            canvasOptions: { alphaMode: 'premultiplied' },
            device: { powerPreference: 'high-performance', optionalFeatures: ['shader-f16'] },
        });
        // A superfície por identidade (a comparação profunda leria o contexto do canvas, pedido só no core).
        const [surface, canvasOptions, device, platform] = vi.mocked(core.initialize).mock
            .calls[0]!;
        expect(surface).toBe(app.surface);
        expect(canvasOptions).toEqual({ alphaMode: 'premultiplied' });
        expect(device).toEqual({
            powerPreference: 'high-performance',
            optionalFeatures: ['shader-f16', 'indirect-first-instance'],
        });
        expect(platform).toBeInstanceOf(WebPlatformAdapter);
        // A superfície é a do canvas (o tamanho do backbuffer dele).
        expect(app.surface?.width).toBe(canvas.width);
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
        expect(vi.mocked(core.requestRecover).mock.calls[0]![0]).toBe(app.surface);
        expect(recovered).toHaveBeenCalledOnce();
    });
});
