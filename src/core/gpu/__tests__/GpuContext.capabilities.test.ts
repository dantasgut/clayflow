import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGpuContext } from '../GpuContext';

const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');

interface FakeAdapterInit {
    readonly features?: readonly string[];
    readonly limits?: Record<string, number>;
    readonly isFallbackAdapter?: boolean;
}

const ADAPTER_LIMITS: Record<string, number> = {
    maxBufferSize: 4_294_967_296,
    maxStorageBufferBindingSize: 4_294_967_292,
    maxStorageBuffersPerShaderStage: 31,
    maxBindGroups: 8,
    maxComputeWorkgroupStorageSize: 32_768,
    maxComputeInvocationsPerWorkgroup: 1024,
    maxUniformBufferBindingSize: 65_536,
    minUniformBufferOffsetAlignment: 256,
};

function installGpu(init: FakeAdapterInit = {}): {
    requestAdapter: ReturnType<typeof vi.fn>;
    requestDevice: ReturnType<typeof vi.fn>;
} {
    const adapterLimits = init.limits ?? ADAPTER_LIMITS;
    const requestDevice = vi.fn((desc: GPUDeviceDescriptor) => {
        // Device reflete o que foi pedido: features pedidas e limites pedidos sobre os defaults.
        const limits: Record<string, number> = { ...adapterLimits };
        const defaults: Record<string, number> = {
            maxBufferSize: 268_435_456,
            maxStorageBufferBindingSize: 134_217_728,
            maxStorageBuffersPerShaderStage: 8,
            maxBindGroups: 4,
            maxComputeWorkgroupStorageSize: 16_384,
            maxComputeInvocationsPerWorkgroup: 256,
            maxUniformBufferBindingSize: 65_536,
            minUniformBufferOffsetAlignment: 256,
        };
        for (const k of Object.keys(limits)) {
            limits[k] = desc.requiredLimits?.[k] ?? defaults[k] ?? limits[k]!;
        }
        return Promise.resolve({
            queue: {},
            features: new Set(desc.requiredFeatures ?? []),
            limits,
            lost: new Promise(() => undefined),
        });
    });
    const adapter = {
        features: new Set(init.features ?? []),
        limits: adapterLimits,
        info: {
            vendor: 'apple',
            architecture: 'metal-3',
            device: '',
            description: 'Apple M',
            isFallbackAdapter: init.isFallbackAdapter ?? false,
        },
        requestDevice,
    };
    const requestAdapter = vi.fn(() => Promise.resolve(adapter));
    Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: { requestAdapter, getPreferredCanvasFormat: () => 'bgra8unorm' },
    });
    return { requestAdapter, requestDevice };
}

afterEach(() => {
    if (originalGpu !== undefined) Object.defineProperty(navigator, 'gpu', originalGpu);
    else Reflect.deleteProperty(navigator, 'gpu');
});

describe('createGpuContext — capacidades', () => {
    it('devolve adaptador, features obtidas e limites efetivos do device', async () => {
        installGpu({ features: ['timestamp-query', 'float32-filterable'] });
        const { capabilities } = await createGpuContext();
        expect(capabilities.adapter).toEqual({
            vendor: 'apple',
            architecture: 'metal-3',
            device: '',
            description: 'Apple M',
            isFallbackAdapter: false,
        });
        expect(capabilities.powerPreference).toBe('default');
        expect(capabilities.features).toEqual(['timestamp-query']);
        expect(capabilities.missingFeatures).toEqual([]);
        expect(capabilities.limits.minUniformBufferOffsetAlignment).toBe(256);
        expect(capabilities.clampedLimits).toEqual([]);
    });

    it('timestamp-query é pedido só se disponível; ausente vira missingFeatures', async () => {
        const { requestDevice } = installGpu({ features: [] });
        const { capabilities } = await createGpuContext();
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredFeatures).toEqual([]);
        expect(capabilities.missingFeatures).toEqual(['timestamp-query']);
    });

    it('isFallbackAdapter vem do adaptador', async () => {
        installGpu({ isFallbackAdapter: true });
        const { capabilities } = await createGpuContext();
        expect(capabilities.adapter.isFallbackAdapter).toBe(true);
    });

    it('capacidades são congeladas (só dados)', async () => {
        installGpu();
        const { capabilities } = await createGpuContext();
        expect(Object.isFrozen(capabilities)).toBe(true);
        expect(Object.isFrozen(capabilities.limits)).toBe(true);
    });
});

describe('createGpuContext — DeviceOptions', () => {
    it('powerPreference é repassada a requestAdapter e ao relatório', async () => {
        const { requestAdapter } = installGpu();
        const { capabilities } = await createGpuContext({ powerPreference: 'high-performance' });
        expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
        expect(capabilities.powerPreference).toBe('high-performance');
    });

    it('sem powerPreference, requestAdapter recebe descritor vazio', async () => {
        const { requestAdapter } = installGpu();
        await createGpuContext();
        expect(requestAdapter).toHaveBeenCalledWith({});
    });

    it('requiredFeatures indisponível rejeita nomeando a feature', async () => {
        installGpu({ features: ['timestamp-query'] });
        await expect(createGpuContext({ requiredFeatures: ['shader-f16'] })).rejects.toThrow(
            /shader-f16/,
        );
    });

    it('requiredFeatures disponível é pedida', async () => {
        const { requestDevice } = installGpu({ features: ['shader-f16'] });
        const { capabilities } = await createGpuContext({ requiredFeatures: ['shader-f16'] });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredFeatures).toContain('shader-f16');
        expect(capabilities.features).toContain('shader-f16');
    });

    it('optionalFeatures indisponível só aparece em missingFeatures', async () => {
        const { requestDevice } = installGpu({ features: ['timestamp-query'] });
        const { capabilities } = await createGpuContext({
            optionalFeatures: ['float32-filterable'],
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredFeatures).toEqual(['timestamp-query']);
        expect(capabilities.missingFeatures).toEqual(['float32-filterable']);
    });

    it('limites de escala do motor são pedidos no máximo do adaptador', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext();
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits).toEqual({
            maxBufferSize: ADAPTER_LIMITS.maxBufferSize,
            maxStorageBufferBindingSize: ADAPTER_LIMITS.maxStorageBufferBindingSize,
            maxStorageBuffersPerShaderStage: ADAPTER_LIMITS.maxStorageBuffersPerShaderStage,
            maxBindGroups: ADAPTER_LIMITS.maxBindGroups,
            maxComputeWorkgroupStorageSize: ADAPTER_LIMITS.maxComputeWorkgroupStorageSize,
            maxComputeInvocationsPerWorkgroup: ADAPTER_LIMITS.maxComputeInvocationsPerWorkgroup,
        });
        expect(capabilities.limits.maxBufferSize).toBe(ADAPTER_LIMITS.maxBufferSize);
    });

    it('requiredLimits acima do máximo usa o máximo e registra em clampedLimits', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext({
            requiredLimits: { maxUniformBufferBindingSize: 1_000_000, maxBindGroups: 4 },
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxUniformBufferBindingSize).toBe(65_536);
        // pedido abaixo do que o motor já pede: prevalece o maior
        expect(desc.requiredLimits?.maxBindGroups).toBe(8);
        expect(capabilities.clampedLimits).toEqual([
            { name: 'maxUniformBufferBindingSize', requested: 1_000_000, granted: 65_536 },
        ]);
    });

    it('limite `min*` pedido abaixo do mínimo do adaptador é ajustado ao adaptador', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext({
            requiredLimits: { minUniformBufferOffsetAlignment: 64 },
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.minUniformBufferOffsetAlignment).toBe(256);
        expect(capabilities.clampedLimits).toEqual([
            { name: 'minUniformBufferOffsetAlignment', requested: 64, granted: 256 },
        ]);
    });

    it('limite desconhecido do adaptador lança', async () => {
        installGpu();
        await expect(createGpuContext({ requiredLimits: { maxNada: 1 } })).rejects.toThrow(
            /maxNada/,
        );
    });

    it('limitsCeiling baixa o limite de escala ao piso pedido (validar o piso de outra GPU)', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext({
            limitsCeiling: { maxStorageBuffersPerShaderStage: 10 },
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxStorageBuffersPerShaderStage).toBe(10);
        expect(desc.requiredLimits?.maxBindGroups).toBe(ADAPTER_LIMITS.maxBindGroups);
        expect(capabilities.limits.maxStorageBuffersPerShaderStage).toBe(10);
    });

    it('limitsCeiling vence o requiredLimits maior e rejeita limite mínimo ou desconhecido', async () => {
        const { requestDevice } = installGpu();
        await createGpuContext({
            requiredLimits: { maxStorageBuffersPerShaderStage: 20 },
            limitsCeiling: { maxStorageBuffersPerShaderStage: 10 },
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxStorageBuffersPerShaderStage).toBe(10);
        installGpu();
        await expect(
            createGpuContext({ limitsCeiling: { minUniformBufferOffsetAlignment: 512 } }),
        ).rejects.toThrow(/mínimo/);
        await expect(createGpuContext({ limitsCeiling: { maxNada: 1 } })).rejects.toThrow(
            /maxNada/,
        );
    });
});
