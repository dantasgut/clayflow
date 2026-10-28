import { describe, expect, it, vi } from 'vitest';
import { TextureSurface } from '../TextureSurface';

/** Device falso: cada textura criada guarda o descritor e o descarte. */
function fakeDevice() {
    const created: { descriptor: GPUTextureDescriptor; destroy: ReturnType<typeof vi.fn> }[] = [];
    const device = {
        createTexture: vi.fn((descriptor: GPUTextureDescriptor) => {
            const destroy = vi.fn();
            created.push({ descriptor, destroy });
            return { descriptor, destroy } as unknown as GPUTexture;
        }),
    } as unknown as GPUDevice;
    return { device, created };
}

describe('TextureSurface (spec 038)', () => {
    it('configure cria a textura do tamanho e formato pedidos, com o uso de alvo de desenho somado', () => {
        const { device, created } = fakeDevice();
        const surface = new TextureSurface(640, 360);
        surface.context.configure({ device, format: 'rgba16float', usage: 0x01 });
        expect(created).toHaveLength(1);
        expect(created[0]!.descriptor.size).toEqual({ width: 640, height: 360 });
        expect(created[0]!.descriptor.format).toBe('rgba16float');
        expect(created[0]!.descriptor.usage).toBe(0x01 | 0x10);
        expect(surface.context.getCurrentTexture()).toBe(
            vi.mocked(device.createTexture).mock.results[0]!.value,
        );
        expect(surface.context.getConfiguration?.()).toMatchObject({ format: 'rgba16float' });
    });

    it('resize muda o tamanho; a textura nova sai na próxima configuração e a anterior é liberada', () => {
        const { device, created } = fakeDevice();
        const surface = new TextureSurface(4, 4);
        surface.context.configure({ device, format: 'bgra8unorm' });
        surface.resize(8, 2);
        expect([surface.width, surface.height]).toEqual([8, 2]);
        expect(created).toHaveLength(1);
        surface.context.configure({ device, format: 'bgra8unorm' });
        expect(created[0]!.destroy).toHaveBeenCalledOnce();
        expect(created[1]!.descriptor.size).toEqual({ width: 8, height: 2 });
    });

    it('sem configurar não há textura; unconfigure libera; tamanho inválido lança', () => {
        const { device, created } = fakeDevice();
        const surface = new TextureSurface(2, 2);
        expect(() => surface.context.getCurrentTexture()).toThrow(/configure/);
        surface.context.configure({ device, format: 'rgba8unorm' });
        surface.context.unconfigure();
        expect(created[0]!.destroy).toHaveBeenCalledOnce();
        expect(surface.context.getConfiguration?.()).toBeNull();
        expect(() => new TextureSurface(0, 2)).toThrow(RangeError);
        expect(() => {
            surface.resize(2.5, 2);
        }).toThrow(RangeError);
    });
});
