import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebPlatformAdapter } from '../WebPlatformAdapter';

const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');

afterEach(() => {
    if (originalGpu !== undefined) Object.defineProperty(navigator, 'gpu', originalGpu);
    else Reflect.deleteProperty(navigator, 'gpu');
});

describe('WebPlatformAdapter (spec 038)', () => {
    it('o adaptador e o formato preferido vêm do navigator.gpu', async () => {
        const adapter = {} as GPUAdapter;
        const requestAdapter = vi.fn(() => Promise.resolve(adapter));
        Object.defineProperty(navigator, 'gpu', {
            configurable: true,
            value: { requestAdapter, getPreferredCanvasFormat: () => 'bgra8unorm' },
        });
        const web = new WebPlatformAdapter();
        await expect(web.requestAdapter({ powerPreference: 'low-power' })).resolves.toBe(adapter);
        expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'low-power' });
        expect(web.preferredFormat()).toBe('bgra8unorm');
    });

    it('sem WebGPU, a mensagem de sempre', async () => {
        Reflect.deleteProperty(navigator, 'gpu');
        await expect(new WebPlatformAdapter().requestAdapter()).rejects.toThrow(
            'WebGPU not supported in this browser.',
        );
    });

    it('a superfície segue o tamanho do canvas e pede o contexto webgpu só no primeiro uso', () => {
        const context = { configure: vi.fn() };
        const canvas = document.createElement('canvas');
        const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context as never);
        const surface = new WebPlatformAdapter().getContext(canvas);
        expect(getContext).not.toHaveBeenCalled();
        canvas.width = 320;
        canvas.height = 200;
        expect([surface.width, surface.height]).toEqual([320, 200]);
        expect(surface.context).toBe(context);
        expect(surface.context).toBe(context);
        expect(getContext).toHaveBeenCalledOnce();
        expect(getContext).toHaveBeenCalledWith('webgpu');
    });

    it('canvas sem contexto webgpu: erro no uso', () => {
        const canvas = document.createElement('canvas');
        vi.spyOn(canvas, 'getContext').mockReturnValue(null);
        const surface = new WebPlatformAdapter().getContext(canvas);
        expect(() => surface.context).toThrow('failed to get webgpu canvas context');
    });
});
