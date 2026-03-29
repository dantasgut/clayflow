import type { ResourceState } from '../ResourceState';

/**
 * Handler de estado de alocação GPU para recursos de cena (padrão State GoF).
 *
 * Cada estado do ciclo de vida — Uninitialized, Loading, Ready, Dirty,
 * Disposed, Destroyed, GpuManaged — possui uma instância imutável desta
 * interface. Os consumidores consultam as capacidades via métodos semânticos
 * em vez de comparar enums espalhados pelo código.
 */
export interface ResourceStateHandler {
    readonly stateId: ResourceState;

    /** true: recurso está na VRAM e pode ser submetido ao render pass (Ready, GpuManaged). */
    canRender():         boolean;

    /** true: ResourceLoader deve chamar allocateResource() (Uninitialized). */
    needsAllocation():   boolean;

    /** true: ResourceLoader deve chamar updateResource() (Dirty). */
    needsUpdate():       boolean;

    /** true: ResourceLoader deve chamar disposeResource() (Disposed). */
    needsDisposal():     boolean;

    /** true: GpuManaged — suprime qualquer upload CPU→GPU do ResourceLoader. */
    suppressCpuUpload(): boolean;

    /**
     * true: markDirty() é no-op neste estado.
     * Apenas Ready retorna false — é o único estado válido para iniciar uma
     * transição para Dirty.
     */
    ignoreDirtyMark():   boolean;

    /** Transições válidas a partir deste estado. */
    validTransitions():  readonly ResourceState[];
}
