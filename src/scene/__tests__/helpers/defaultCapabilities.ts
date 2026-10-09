import type { DeviceCapabilities } from '../../../core/contracts/index';

/** Capacidades de um device com os limites padrão do WebGPU — usadas pelos doubles de `EngineCore`. */
export function defaultCapabilities(): DeviceCapabilities {
    return {
        adapter: {
            vendor: 'test',
            architecture: '',
            device: '',
            description: 'fake',
            isFallbackAdapter: false,
        },
        powerPreference: 'default',
        features: [],
        missingFeatures: [],
        limits: {
            maxBindGroups: 4,
            maxBufferSize: 268_435_456,
            maxStorageBufferBindingSize: 134_217_728,
            maxUniformBufferBindingSize: 65_536,
            minUniformBufferOffsetAlignment: 256,
            minStorageBufferOffsetAlignment: 256,
            maxComputeWorkgroupsPerDimension: 65_535,
        },
        clampedLimits: [],
    };
}
