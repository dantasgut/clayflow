/**
 * GpuBufferRegistry — livro de registros de buffers GPU alocados.
 *
 * Mantém um catálogo de todos os buffers GPU ativos na engine, com tipo,
 * tamanho em bytes, domínio e proprietário. Funciona como fonte de verdade
 * sobre o que está alocado, substituindo o rastreamento implícito via
 * campos espalhados nos componentes.
 *
 * Responsabilidades:
 *   - Registrar buffers ao serem alocados.
 *   - Remover registros ao serem destruídos.
 *   - Devolver IDs de todos os buffers de um proprietário (para dispose em lote).
 *   - Fornecer snapshot para debugging e profiling de memória.
 *
 * Camada 2 — sem dependência de WebGPU direto (usa apenas strings e números).
 */

/** Tipo de binding do buffer no pipeline WebGPU. */
export type GpuBufferType = 'storage' | 'uniform';

/** Entrada no livro de registros para um buffer GPU. */
export interface GpuBufferEntry {
    /** ID único do buffer no ResourceManager. */
    id:          string;
    /** Tipo de binding — `storage` ou `uniform`. */
    type:        GpuBufferType;
    /** Tamanho alocado em bytes. */
    byteSize:    number;
    /** Domínio de física que detém o buffer (ex: `'softbody'`, `'rigidbody'`). */
    domain:      string;
    /**
     * UUID do componente proprietário.
     * `undefined` para buffers globais (ex: batch de RigidBodies).
     */
    ownerUuid?:  string;
}

export class GpuBufferRegistry {

    private readonly _entries = new Map<string, GpuBufferEntry>();

    /**
     * Registra um buffer recém-alocado.
     * Sobrescreve silenciosamente entradas com mesmo ID (realloc).
     */
    public register(entry: GpuBufferEntry): void {
        this._entries.set(entry.id, entry);
    }

    /** Remove a entrada de um buffer pelo ID. */
    public unregister(id: string): void {
        this._entries.delete(id);
    }

    /**
     * Remove todas as entradas de um proprietário e devolve os IDs removidos.
     * O chamador é responsável por destruir os buffers no `ResourceManager`.
     */
    public unregisterByOwner(uuid: string): string[] {
        const ids: string[] = [];
        for (const [id, entry] of this._entries) {
            if (entry.ownerUuid === uuid) {
                ids.push(id);
                this._entries.delete(id);
            }
        }
        return ids;
    }

    /** Retorna a entrada de um buffer pelo ID, ou `undefined` se não registrado. */
    public get(id: string): GpuBufferEntry | undefined {
        return this._entries.get(id);
    }

    /** Retorna todas as entradas de um proprietário. */
    public getByOwner(uuid: string): GpuBufferEntry[] {
        const result: GpuBufferEntry[] = [];
        for (const entry of this._entries.values()) {
            if (entry.ownerUuid === uuid) result.push(entry);
        }
        return result;
    }

    /**
     * Snapshot imutável de todos os buffers registrados.
     * Útil para debugging e profiling de memória GPU.
     */
    public snapshot(): ReadonlyMap<string, GpuBufferEntry> {
        return this._entries;
    }

    /** Total de bytes registrados (estimativa de uso de memória GPU). */
    public get totalBytes(): number {
        let sum = 0;
        for (const e of this._entries.values()) sum += e.byteSize;
        return sum;
    }
}
