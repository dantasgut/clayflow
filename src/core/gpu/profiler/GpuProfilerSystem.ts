import type { Profiler, ProfilerTimestampWrites } from '../../contracts/Profiler';

export class GpuProfilerSystem implements Profiler {
    private device: GPUDevice | null = null;

    attach(device: GPUDevice): void {
        this.device = device;
    }

    detach(): void {
        this.device = null;
    }

    get isSupported(): boolean {
        if (this.device === null) return false;
        return this.device.features.has('timestamp-query');
    }

    timestampWritesFor(_first: number, _last: number): ProfilerTimestampWrites | undefined {
        return undefined;
    }

    async readRange(_first: number, count: number): Promise<BigInt64Array> {
        return new BigInt64Array(count);
    }
}
