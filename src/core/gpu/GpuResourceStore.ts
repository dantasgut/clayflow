import type { MemoryUsageReport } from '../contracts/EngineCore';

export type StoredGpuObject =
    | GPUBuffer
    | GPUTexture
    | GPUTextureView
    | GPUSampler
    | GPUShaderModule
    | GPUBindGroupLayout
    | GPUBindGroup
    | GPUComputePipeline
    | GPURenderPipeline
    | GPURenderBundle;

export type StoredKind = 'buffer' | 'texture' | 'other';

interface StoredEntry {
    readonly obj: StoredGpuObject;
    readonly kind: StoredKind;
    readonly bytes: number;
    readonly label?: string;
}

export type { MemoryUsageReport } from '../contracts/EngineCore';

export class GpuResourceStore {
    private readonly entries = new Map<string, StoredEntry>();
    private bufferBytes = 0;
    private textureBytes = 0;

    has(hash: string): boolean {
        return this.entries.has(hash);
    }

    get<T extends StoredGpuObject>(hash: string): T | undefined {
        const e = this.entries.get(hash);
        return e === undefined ? undefined : (e.obj as T);
    }

    require<T extends StoredGpuObject>(hash: string, kind: string): T {
        const e = this.entries.get(hash);
        if (e === undefined) throw new Error(`GpuResourceStore: missing ${kind} for hash ${hash}`);
        return e.obj as T;
    }

    set(
        hash: string,
        obj: StoredGpuObject,
        kind: StoredKind = 'other',
        bytes = 0,
        label?: string,
    ): void {
        const prev = this.entries.get(hash);
        if (prev !== undefined) this.creditBytes(prev, -1);
        const entry: StoredEntry =
            label !== undefined ? { obj, kind, bytes, label } : { obj, kind, bytes };
        this.entries.set(hash, entry);
        this.creditBytes(entry, 1);
    }

    delete(hash: string): boolean {
        const prev = this.entries.get(hash);
        if (prev !== undefined) this.creditBytes(prev, -1);
        return this.entries.delete(hash);
    }

    clear(): void {
        for (const entry of this.entries.values()) {
            const destroyable = entry.obj as { destroy?: () => void };
            if (typeof destroyable.destroy === 'function') {
                try {
                    destroyable.destroy();
                } catch {
                    /* ignore — best-effort teardown */
                }
            }
        }
        this.entries.clear();
        this.bufferBytes = 0;
        this.textureBytes = 0;
    }

    memoryUsage(topN = 5): MemoryUsageReport {
        const sorted = [...this.entries.entries()]
            .filter(([, e]) => e.bytes > 0)
            .sort(([, a], [, b]) => b.bytes - a.bytes)
            .slice(0, topN)
            .map(([hash, e]) => {
                const base = { hash, kind: e.kind, bytes: e.bytes };
                return e.label !== undefined ? { ...base, label: e.label } : base;
            });
        return {
            bufferBytes: this.bufferBytes,
            textureBytes: this.textureBytes,
            totalBytes: this.bufferBytes + this.textureBytes,
            top: sorted,
        };
    }

    private creditBytes(entry: StoredEntry, sign: 1 | -1): void {
        if (entry.kind === 'buffer') this.bufferBytes += sign * entry.bytes;
        else if (entry.kind === 'texture') this.textureBytes += sign * entry.bytes;
    }
}
