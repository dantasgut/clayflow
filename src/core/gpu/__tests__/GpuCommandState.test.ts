import { describe, expect, it, vi } from 'vitest';
import { GpuCommandState } from '../GpuCommandState';

function fakeDevice(): { device: GPUDevice; cmdBuffer: GPUCommandBuffer } {
    const cmdBuffer = {} as GPUCommandBuffer;
    const encoder = {
        finish: () => cmdBuffer,
    } as unknown as GPUCommandEncoder;
    const device = {
        createCommandEncoder: vi.fn(() => encoder),
    } as unknown as GPUDevice;
    return { device, cmdBuffer };
}

describe('GpuCommandState', () => {
    it('open + finishAndClose cycle balanceado', () => {
        const s = new GpuCommandState();
        const { device, cmdBuffer } = fakeDevice();
        s.open(device);
        expect(s.requireEncoder()).toBeDefined();
        const result = s.finishAndClose();
        expect(result).toBe(cmdBuffer);
    });

    it('open duplo lança', () => {
        const s = new GpuCommandState();
        const { device } = fakeDevice();
        s.open(device);
        expect(() => {
            s.open(device);
        }).toThrow(/already open/);
    });

    it('requireEncoder sem open lança', () => {
        const s = new GpuCommandState();
        expect(() => s.requireEncoder()).toThrow(/no active encoder/);
    });

    it('finishAndClose sem open lança', () => {
        const s = new GpuCommandState();
        expect(() => s.finishAndClose()).toThrow(/no encoder to finish/);
    });

    it('passes não-balanceados detectados', () => {
        const s = new GpuCommandState();
        const { device } = fakeDevice();
        s.open(device);
        s.pushPass({ kind: 'compute', encoder: {} as GPUComputePassEncoder });
        expect(() => s.finishAndClose()).toThrow(/passes not closed/);
    });

    it('markers não-balanceados detectados', () => {
        const s = new GpuCommandState();
        const { device } = fakeDevice();
        s.open(device);
        s.enterMarker();
        expect(() => s.finishAndClose()).toThrow(/markers not balanced/);
    });

    it('popPass com tipo errado lança', () => {
        const s = new GpuCommandState();
        const { device } = fakeDevice();
        s.open(device);
        s.pushPass({ kind: 'compute', encoder: {} as GPUComputePassEncoder });
        expect(() => {
            s.popPass('render');
        }).toThrow(/pass stack mismatch/);
    });

    it('marker enter/leave balanceado', () => {
        const s = new GpuCommandState();
        const { device, cmdBuffer } = fakeDevice();
        s.open(device);
        s.enterMarker();
        s.leaveMarker();
        expect(s.finishAndClose()).toBe(cmdBuffer);
    });
});
