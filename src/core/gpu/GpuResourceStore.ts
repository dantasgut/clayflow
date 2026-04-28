type StoredGpuObject =
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

export class GpuResourceStore {
    private readonly entries = new Map<string, StoredGpuObject>();

    has(hash: string): boolean {
        return this.entries.has(hash);
    }

    get<T extends StoredGpuObject>(hash: string): T | undefined {
        return this.entries.get(hash) as T | undefined;
    }

    require<T extends StoredGpuObject>(hash: string, kind: string): T {
        const obj = this.entries.get(hash);
        if (obj === undefined) throw new Error(`GpuResourceStore: missing ${kind} for hash ${hash}`);
        return obj as T;
    }

    set(hash: string, obj: StoredGpuObject): void {
        this.entries.set(hash, obj);
    }

    delete(hash: string): boolean {
        return this.entries.delete(hash);
    }

    clear(): void {
        for (const obj of this.entries.values()) {
            const destroyable = obj as { destroy?: () => void };
            if (typeof destroyable.destroy === 'function') {
                try {
                    destroyable.destroy();
                } catch {
                    /* ignore — best-effort teardown */
                }
            }
        }
        this.entries.clear();
    }
}
