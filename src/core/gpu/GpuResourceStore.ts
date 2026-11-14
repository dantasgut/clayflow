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
    obj: StoredGpuObject;
    /** A materialização do objeto: muda a cada objeto novo da entrada (criação ou `replace`). */
    generation: number;
    /** As entradas que o objeto cita (as de um bind group, a textura de uma vista), com a materialização de então. */
    depends?: readonly { readonly hash: string; readonly generation: number }[];
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
    private generations = 0;
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
        const generation = ++this.generations;
        const entry: StoredEntry =
            label !== undefined
                ? { obj, generation, kind, bytes, label, owners }
                : { obj, generation, kind, bytes, owners };
        this.entries.set(hash, entry);
        this.creditBytes(entry, 1);
    }

    /**
     * As entradas que o objeto de `hash` cita (`hashes`), guardadas com a materialização atual de cada uma: quando uma
     * delas é destruída e criada de novo com o mesmo conteúdo (o mesmo hash), o objeto que a cita fica velho
     * (`stale`).
     */
    dependOn(hash: string, hashes: readonly string[]): void {
        const entry = this.entries.get(hash);
        if (entry === undefined) return;
        entry.depends = hashes.map((h) => ({
            hash: h,
            generation: this.entries.get(h)?.generation ?? 0,
        }));
    }

    /**
     * O objeto de `hash` cita uma materialização que não existe mais — a entrada citada foi destruída e criada de novo
     * (todas as citadas presentes, alguma com outra materialização)? Com uma citada ausente, não: ela não pode ser
     * materializada de novo agora.
     */
    stale(hash: string): boolean {
        const depends = this.entries.get(hash)?.depends;
        if (depends === undefined) return false;
        let changed = false;
        for (const d of depends) {
            const generation = this.entries.get(d.hash)?.generation;
            if (generation === undefined) return false;
            changed ||= generation !== d.generation;
        }
        return changed;
    }

    /** Troca o objeto da entrada de `hash` por `obj` (uma materialização nova; os donos ficam). */
    replace(hash: string, obj: StoredGpuObject): void {
        const entry = this.entries.get(hash);
        if (entry === undefined) return;
        entry.obj = obj;
        entry.generation = ++this.generations;
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
