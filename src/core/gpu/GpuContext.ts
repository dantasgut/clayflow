import type { ClampedLimit, DeviceCapabilities, DeviceOptions } from '../contracts/DeviceOptions';
import type {
    PlatformAdapter,
    PresentationContext,
    PresentationSurface,
} from '../contracts/PlatformAdapter';

export interface GpuContext {
    readonly device: GPUDevice;
    readonly queue: GPUQueue;
    /** A superfície de apresentação (spec 038: o canvas, a janela ou a textura, pelo adaptador de plataforma). */
    surface: PresentationSurface | null;
    canvasContext: PresentationContext | null;
    canvasFormat: GPUTextureFormat;
    /** Relatório do device deste contexto (recriado junto com o device). */
    readonly capabilities: DeviceCapabilities;
}

/** Features opcionais que o motor usa quando o adaptador oferece (profiling de GPU). */
/** Features opcionais do motor: medida de tempo da GPU e a filtragem de float32 (os históricos `full`, spec 037). */
const ENGINE_OPTIONAL_FEATURES: readonly GPUFeatureName[] = [
    'timestamp-query',
    'float32-filterable',
];

/** Limites com que as cenas do motor escalam: pedidos no máximo do adaptador. */
const ENGINE_SCALE_LIMITS = [
    'maxBufferSize',
    'maxStorageBufferBindingSize',
    'maxBindGroups',
    'maxComputeWorkgroupStorageSize',
    'maxComputeInvocationsPerWorkgroup',
] as const;

/**
 * Nomes dos limites do WebGPU. `GPUSupportedLimits` expõe os valores como getters do protótipo (não
 * enumeráveis), então o relatório os lê por nome.
 */
export const WEBGPU_LIMIT_NAMES = [
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

/**
 * Limites que o desenho do motor usa além dos de escala (spec 037, R7): pedidos no mínimo comum aos perfis de
 * referência (as fixtures `src/__smokes__/fixtures/adapter-limits-*.json`, gravadas pelo smoke `adapterLimits`), nunca o
 * máximo de um adaptador — o que cabe num perfil cabe no outro. Um adaptador abaixo deles fica com o que tem, e o
 * pipeline que precisar de mais falha na montagem (`limit-exceeded`), como antes.
 */
export const ENGINE_PORTABLE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
    // `adapter-limits-apple-metal-3.json` (2026-10-23); a RTX 4090 (`nvidia-lovelace`) entra no mínimo quando gravada.
    maxStorageBuffersPerShaderStage: 10,
    maxStorageTexturesPerShaderStage: 8,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 128,
});

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
    for (const name of WEBGPU_LIMIT_NAMES) {
        const v = readLimit(limits, name);
        if (v !== undefined) out[name] = v;
    }
    return out;
}

/**
 * Limites pedidos ao device: os de escala do motor no máximo do adaptador, os portáteis no mínimo comum
 * (`ENGINE_PORTABLE_LIMITS`, até o que o adaptador tem) e os do usuário ajustados ao que o adaptador permite (`min*` =
 * quanto menor, mais capaz; os demais = quanto maior, mais capaz).
 */
function resolveLimits(
    adapterLimits: GPUSupportedLimits,
    requested: Readonly<Record<string, number>> | undefined,
    ceiling?: Readonly<Record<string, number>>,
): { required: Record<string, number>; clamped: ClampedLimit[] } {
    const required: Record<string, number> = {};
    const clamped: ClampedLimit[] = [];
    for (const name of ENGINE_SCALE_LIMITS) {
        const max = readLimit(adapterLimits, name);
        if (max !== undefined) required[name] = max;
    }
    requirePortable(adapterLimits, required);
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
    for (const [name, cap] of Object.entries(ceiling ?? {})) {
        if (readLimit(adapterLimits, name) === undefined) {
            throw new Error(
                `DeviceOptions.limitsCeiling: limite desconhecido do adaptador: ${name}`,
            );
        }
        if (name.startsWith('min')) {
            throw new Error(
                `DeviceOptions.limitsCeiling: ${name} é um limite mínimo (alinhamento); o teto vale só para os máximos`,
            );
        }
        const current = required[name];
        // Sem pedido, o device fica no padrão do WebGPU, que já é o menor possível.
        if (current !== undefined) required[name] = Math.min(current, cap);
    }
    return { required, clamped };
}

/** Os limites portáteis no mínimo comum, até o que o adaptador tem (spec 037, R7). */
function requirePortable(
    adapterLimits: GPUSupportedLimits,
    required: Record<string, number>,
): void {
    for (const [name, portable] of Object.entries(ENGINE_PORTABLE_LIMITS)) {
        const max = readLimit(adapterLimits, name);
        if (max !== undefined) required[name] = Math.min(max, portable);
    }
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
 * Cria adaptador e device pelo adaptador de plataforma (spec 038) aplicando `DeviceOptions` (potência, features,
 * limites) e devolve o relatório de capacidades efetivas. Rejeita se o ambiente não tem adaptador ou se uma feature
 * obrigatória falta.
 */
export async function createGpuContext(
    platform: PlatformAdapter,
    options: DeviceOptions = {},
): Promise<CreatedGpuContext> {
    const adapterOptions: GPURequestAdapterOptions =
        options.powerPreference !== undefined ? { powerPreference: options.powerPreference } : {};
    const adapter = await platform.requestAdapter(adapterOptions);
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
        options.limitsCeiling,
    );
    const device = await adapter.requestDevice({ requiredFeatures, requiredLimits });
    const queue = device.queue;
    const canvasFormat = platform.preferredFormat();
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
