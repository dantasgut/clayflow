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
    /** Specs (objetos) que criaram ou reutilizaram a entrada; vazia → objeto destruído. */
    readonly owners: Set<object>;
}

export type { MemoryUsageReport } from '../contracts/EngineCore';

/**
 * Objetos de GPU indexados por hash de spec, com **posse por spec**: specs de conteúdo igual compartilham o objeto
 * (deduplicação), e o objeto só é destruído quando a última spec dona o libera.
 */
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

    /** Registra o objeto recém-criado para `hash`, com `owner` como primeira spec dona. */
    set(
        hash: string,
        owner: object,
        obj: StoredGpuObject,
        kind: StoredKind = 'other',
        bytes = 0,
        label?: string,
    ): void {
        const prev = this.entries.get(hash);
        if (prev !== undefined) {
            throw new Error(`GpuResourceStore: entrada ${hash} já existe — use retain()`);
        }
        const owners = new Set<object>([owner]);
        const entry: StoredEntry =
            label !== undefined
                ? { obj, kind, bytes, label, owners }
                : { obj, kind, bytes, owners };
        this.entries.set(hash, entry);
        this.creditBytes(entry, 1);
    }

    /** Acrescenta `owner` à entrada existente (idempotente). Devolve `false` se não há entrada para `hash`. */
    retain(hash: string, owner: object): boolean {
        const entry = this.entries.get(hash);
        if (entry === undefined) return false;
        entry.owners.add(owner);
        return true;
    }

    /**
     * Remove a posse de `owner`. Quando nenhuma spec dona resta, destrói o objeto de GPU (se destrutível) e remove a
     * entrada. Devolve `true` se a entrada foi removida. `owner` que não é dono não altera nada.
     */
    release(hash: string, owner: object): boolean {
        const entry = this.entries.get(hash);
        if (!entry?.owners.delete(owner)) return false;
        if (entry.owners.size > 0) return false;
        const destroyable = entry.obj as { destroy?: () => void };
        if (typeof destroyable.destroy === 'function') destroyable.destroy();
        this.creditBytes(entry, -1);
        this.entries.delete(hash);
        return true;
    }

    /** Quantidade de specs donas da entrada (0 se ausente) — diagnóstico e testes. */
    ownerCount(hash: string): number {
        return this.entries.get(hash)?.owners.size ?? 0;
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
