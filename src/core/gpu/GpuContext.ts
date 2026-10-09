import type { ClampedLimit, DeviceCapabilities, DeviceOptions } from '../contracts/DeviceOptions';

export interface GpuContext {
    readonly device: GPUDevice;
    readonly queue: GPUQueue;
    canvas: HTMLCanvasElement | null;
    canvasContext: GPUCanvasContext | null;
    canvasFormat: GPUTextureFormat;
    /** Relatório do device deste contexto (recriado junto com o device). */
    readonly capabilities: DeviceCapabilities;
}

/** Features opcionais que o motor usa quando o adaptador oferece (profiling de GPU). */
const ENGINE_OPTIONAL_FEATURES: readonly GPUFeatureName[] = ['timestamp-query'];

/** Limites com que as cenas do motor escalam: pedidos no máximo do adaptador. */
const ENGINE_SCALE_LIMITS = [
    'maxBufferSize',
    'maxStorageBufferBindingSize',
    'maxStorageBuffersPerShaderStage',
    'maxBindGroups',
    'maxComputeWorkgroupStorageSize',
    'maxComputeInvocationsPerWorkgroup',
] as const;

/**
 * Nomes dos limites do WebGPU. `GPUSupportedLimits` expõe os valores como getters do protótipo (não
 * enumeráveis), então o relatório os lê por nome.
 */
const LIMIT_NAMES = [
    'maxTextureDimension1D',
    'maxTextureDimension2D',
    'maxTextureDimension3D',
    'maxTextureArrayLayers',
    'maxBindGroups',
    'maxBindGroupsPlusVertexBuffers',
    'maxBindingsPerBindGroup',
    'maxDynamicUniformBuffersPerPipelineLayout',
    'maxDynamicStorageBuffersPerPipelineLayout',
    'maxSampledTexturesPerShaderStage',
    'maxSamplersPerShaderStage',
    'maxStorageBuffersPerShaderStage',
    'maxStorageTexturesPerShaderStage',
    'maxUniformBuffersPerShaderStage',
    'maxUniformBufferBindingSize',
    'maxStorageBufferBindingSize',
    'minUniformBufferOffsetAlignment',
    'minStorageBufferOffsetAlignment',
    'maxVertexBuffers',
    'maxBufferSize',
    'maxVertexAttributes',
    'maxVertexBufferArrayStride',
    'maxInterStageShaderVariables',
    'maxColorAttachments',
    'maxColorAttachmentBytesPerSample',
    'maxComputeWorkgroupStorageSize',
    'maxComputeInvocationsPerWorkgroup',
    'maxComputeWorkgroupSizeX',
    'maxComputeWorkgroupSizeY',
    'maxComputeWorkgroupSizeZ',
    'maxComputeWorkgroupsPerDimension',
] as const;

/** Resultado da criação do device: objetos de GPU e o relatório de capacidades. */
export interface CreatedGpuContext {
    readonly device: GPUDevice;
    readonly queue: GPUQueue;
    readonly canvasFormat: GPUTextureFormat;
    readonly capabilities: DeviceCapabilities;
}

function readLimit(limits: GPUSupportedLimits, name: string): number | undefined {
    const value = (limits as unknown as Record<string, unknown>)[name];
    return typeof value === 'number' ? value : undefined;
}

function readAllLimits(limits: GPUSupportedLimits): Record<string, number> {
    const out: Record<string, number> = {};
    for (const name of LIMIT_NAMES) {
        const v = readLimit(limits, name);
        if (v !== undefined) out[name] = v;
    }
    return out;
}

/**
 * Limites pedidos ao device: os de escala do motor no máximo do adaptador e os do usuário ajustados ao que o
 * adaptador permite (`min*` = quanto menor, mais capaz; os demais = quanto maior, mais capaz).
 */
function resolveLimits(
    adapterLimits: GPUSupportedLimits,
    requested: Readonly<Record<string, number>> | undefined,
): { required: Record<string, number>; clamped: ClampedLimit[] } {
    const required: Record<string, number> = {};
    const clamped: ClampedLimit[] = [];
    for (const name of ENGINE_SCALE_LIMITS) {
        const max = readLimit(adapterLimits, name);
        if (max !== undefined) required[name] = max;
    }
    for (const [name, value] of Object.entries(requested ?? {})) {
        const best = readLimit(adapterLimits, name);
        if (best === undefined) {
            throw new Error(
                `DeviceOptions.requiredLimits: limite desconhecido do adaptador: ${name}`,
            );
        }
        const isMin = name.startsWith('min');
        const granted = isMin ? Math.max(value, best) : Math.min(value, best);
        if (granted !== value) clamped.push({ name, requested: value, granted });
        const current = required[name];
        required[name] =
            current === undefined
                ? granted
                : isMin
                  ? Math.min(current, granted)
                  : Math.max(current, granted);
    }
    return { required, clamped };
}

function describeAdapter(adapter: GPUAdapter): DeviceCapabilities['adapter'] {
    const info = (adapter as { info?: Partial<GPUAdapterInfo> & { isFallbackAdapter?: boolean } })
        .info;
    const legacyFallback = (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter;
    return Object.freeze({
        vendor: info?.vendor ?? '',
        architecture: info?.architecture ?? '',
        device: info?.device ?? '',
        description: info?.description ?? '',
        isFallbackAdapter: info?.isFallbackAdapter ?? legacyFallback ?? false,
    });
}

/**
 * Cria adaptador e device aplicando `DeviceOptions` (potência, features, limites) e devolve o relatório de
 * capacidades efetivas. Rejeita se WebGPU não existe, se não há adaptador ou se uma feature obrigatória falta.
 */
export async function createGpuContext(options: DeviceOptions = {}): Promise<CreatedGpuContext> {
    if (!('gpu' in navigator)) {
        throw new Error('WebGPU not supported in this browser.');
    }
    const adapterOptions: GPURequestAdapterOptions =
        options.powerPreference !== undefined ? { powerPreference: options.powerPreference } : {};
    const adapter = await navigator.gpu.requestAdapter(adapterOptions);
    if (!adapter) throw new Error('Failed to acquire GPUAdapter.');

    const missingRequired = (options.requiredFeatures ?? []).filter(
        (f) => !adapter.features.has(f),
    );
    if (missingRequired.length > 0) {
        throw new Error(
            `DeviceOptions.requiredFeatures indisponíveis no adaptador: ${missingRequired.join(', ')}`,
        );
    }
    const wanted = [
        ...(options.requiredFeatures ?? []),
        ...ENGINE_OPTIONAL_FEATURES,
        ...(options.optionalFeatures ?? []),
    ].filter((f, i, all) => all.indexOf(f) === i);
    const requiredFeatures = wanted.filter((f) => adapter.features.has(f));
    const missingFeatures = wanted.filter((f) => !adapter.features.has(f));

    const { required: requiredLimits, clamped } = resolveLimits(
        adapter.limits,
        options.requiredLimits,
    );
    const device = await adapter.requestDevice({ requiredFeatures, requiredLimits });
    const queue = device.queue;
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    const capabilities: DeviceCapabilities = Object.freeze({
        adapter: describeAdapter(adapter),
        powerPreference: options.powerPreference ?? 'default',
        features: Object.freeze([...device.features] as GPUFeatureName[]),
        missingFeatures: Object.freeze(missingFeatures),
        limits: Object.freeze(readAllLimits(device.limits)),
        clampedLimits: Object.freeze(clamped.map((c) => Object.freeze(c))),
    });
    return { device, queue, canvasFormat, capabilities };
}
