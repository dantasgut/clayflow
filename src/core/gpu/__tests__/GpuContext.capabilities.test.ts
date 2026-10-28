import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGpuContext, ENGINE_PORTABLE_LIMITS } from '../GpuContext';
import { WebPlatformAdapter } from '../../../platform/web/WebPlatformAdapter';

const web = new WebPlatformAdapter();

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
        const { capabilities } = await createGpuContext(web);
        expect(capabilities.adapter).toEqual({
            vendor: 'apple',
            architecture: 'metal-3',
            device: '',
            description: 'Apple M',
            isFallbackAdapter: false,
        });
        expect(capabilities.powerPreference).toBe('default');
        expect(capabilities.features).toEqual(['timestamp-query', 'float32-filterable']);
        expect(capabilities.missingFeatures).toEqual([]);
        expect(capabilities.limits.minUniformBufferOffsetAlignment).toBe(256);
        expect(capabilities.clampedLimits).toEqual([]);
    });

    it('timestamp-query e float32-filterable pedidos só se disponíveis; ausentes viram missingFeatures', async () => {
        const { requestDevice } = installGpu({ features: [] });
        const { capabilities } = await createGpuContext(web);
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredFeatures).toEqual([]);
        expect(capabilities.missingFeatures).toEqual(['timestamp-query', 'float32-filterable']);
    });

    it('isFallbackAdapter vem do adaptador', async () => {
        installGpu({ isFallbackAdapter: true });
        const { capabilities } = await createGpuContext(web);
        expect(capabilities.adapter.isFallbackAdapter).toBe(true);
    });

    it('capacidades são congeladas (só dados)', async () => {
        installGpu();
        const { capabilities } = await createGpuContext(web);
        expect(Object.isFrozen(capabilities)).toBe(true);
        expect(Object.isFrozen(capabilities.limits)).toBe(true);
    });
});

describe('createGpuContext — DeviceOptions', () => {
    it('powerPreference é repassada a requestAdapter e ao relatório', async () => {
        const { requestAdapter } = installGpu();
        const { capabilities } = await createGpuContext(web, {
            powerPreference: 'high-performance',
        });
        expect(requestAdapter).toHaveBeenCalledWith({ powerPreference: 'high-performance' });
        expect(capabilities.powerPreference).toBe('high-performance');
    });

    it('sem powerPreference, requestAdapter recebe descritor vazio', async () => {
        const { requestAdapter } = installGpu();
        await createGpuContext(web);
        expect(requestAdapter).toHaveBeenCalledWith({});
    });

    it('requiredFeatures indisponível rejeita nomeando a feature', async () => {
        installGpu({ features: ['timestamp-query'] });
        await expect(createGpuContext(web, { requiredFeatures: ['shader-f16'] })).rejects.toThrow(
            /shader-f16/,
        );
    });

    it('requiredFeatures disponível é pedida', async () => {
        const { requestDevice } = installGpu({ features: ['shader-f16'] });
        const { capabilities } = await createGpuContext(web, { requiredFeatures: ['shader-f16'] });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredFeatures).toContain('shader-f16');
        expect(capabilities.features).toContain('shader-f16');
    });

    it('optionalFeatures indisponível só aparece em missingFeatures', async () => {
        const { requestDevice } = installGpu({ features: ['timestamp-query'] });
        const { capabilities } = await createGpuContext(web, {
            optionalFeatures: ['float32-filterable'],
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredFeatures).toEqual(['timestamp-query']);
        expect(capabilities.missingFeatures).toEqual(['float32-filterable']);
    });

    it('limites de escala no máximo do adaptador; os portáteis no mínimo comum (spec 037), nunca o máximo', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext(web);
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits).toEqual({
            maxBufferSize: ADAPTER_LIMITS.maxBufferSize,
            maxStorageBufferBindingSize: ADAPTER_LIMITS.maxStorageBufferBindingSize,
            // O adaptador tem 31: o motor pede o portátil.
            maxStorageBuffersPerShaderStage: ENGINE_PORTABLE_LIMITS.maxStorageBuffersPerShaderStage,
            maxBindGroups: ADAPTER_LIMITS.maxBindGroups,
            maxComputeWorkgroupStorageSize: ADAPTER_LIMITS.maxComputeWorkgroupStorageSize,
            maxComputeInvocationsPerWorkgroup: ADAPTER_LIMITS.maxComputeInvocationsPerWorkgroup,
        });
        expect(capabilities.limits.maxBufferSize).toBe(ADAPTER_LIMITS.maxBufferSize);
    });

    it('adaptador abaixo de um limite portátil: fica com o que tem (o pipeline que precisar de mais falha na montagem)', async () => {
        const { requestDevice } = installGpu({
            limits: { ...ADAPTER_LIMITS, maxStorageBuffersPerShaderStage: 8 },
        });
        await createGpuContext(web);
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxStorageBuffersPerShaderStage).toBe(8);
    });

    it('o usuário pode pedir acima do portátil (até o adaptador)', async () => {
        const { requestDevice } = installGpu();
        await createGpuContext(web, { requiredLimits: { maxStorageBuffersPerShaderStage: 16 } });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxStorageBuffersPerShaderStage).toBe(16);
    });

    it('ENGINE_PORTABLE_LIMITS é o mínimo comum das fixtures dos adaptadores de referência', () => {
        const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../__smokes__/fixtures');
        const fixtures = readdirSync(dir)
            .filter((f) => f.startsWith('adapter-limits-') && f.endsWith('.json'))
            .map(
                (f) =>
                    JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
                        limits: Record<string, number>;
                    },
            );
        expect(fixtures.length).toBeGreaterThan(0);
        for (const [name, value] of Object.entries(ENGINE_PORTABLE_LIMITS)) {
            expect(value, name).toBe(Math.min(...fixtures.map((f) => f.limits[name]!)));
        }
    });

    it('requiredLimits acima do máximo usa o máximo e registra em clampedLimits', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext(web, {
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
        const { capabilities } = await createGpuContext(web, {
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
        await expect(createGpuContext(web, { requiredLimits: { maxNada: 1 } })).rejects.toThrow(
            /maxNada/,
        );
    });

    it('limitsCeiling baixa o limite de escala ao piso pedido (validar o piso de outra GPU)', async () => {
        const { requestDevice } = installGpu();
        const { capabilities } = await createGpuContext(web, {
            limitsCeiling: { maxStorageBuffersPerShaderStage: 10 },
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxStorageBuffersPerShaderStage).toBe(10);
        expect(desc.requiredLimits?.maxBindGroups).toBe(ADAPTER_LIMITS.maxBindGroups);
        expect(capabilities.limits.maxStorageBuffersPerShaderStage).toBe(10);
    });

    it('limitsCeiling vence o requiredLimits maior e rejeita limite mínimo ou desconhecido', async () => {
        const { requestDevice } = installGpu();
        await createGpuContext(web, {
            requiredLimits: { maxStorageBuffersPerShaderStage: 20 },
            limitsCeiling: { maxStorageBuffersPerShaderStage: 10 },
        });
        const desc = requestDevice.mock.calls[0]![0] as GPUDeviceDescriptor;
        expect(desc.requiredLimits?.maxStorageBuffersPerShaderStage).toBe(10);
        installGpu();
        await expect(
            createGpuContext(web, { limitsCeiling: { minUniformBufferOffsetAlignment: 512 } }),
        ).rejects.toThrow(/mínimo/);
        await expect(createGpuContext(web, { limitsCeiling: { maxNada: 1 } })).rejects.toThrow(
            /maxNada/,
        );
    });
});
