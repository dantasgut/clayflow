/**
 * Estados do lifecycle de um Resource. Transições válidas são definidas
 * pelos `ResourceStateHandler`s correspondentes em `scene/lifecycle/states/`.
 *
 * Diagrama:
 * ```
 * Uninitialized → Loading → Ready ⇄ Dirty
 *       ↑                      ↓
 *       │                 GpuManaged
 *       │                      ↓
 *       └──── Destroyed ← Disposed        (Destroyed → Uninitialized: reinserção após remoção)
 * ```
 */
export enum ResourceState {
    /** Estado inicial após `new Resource(...)`. ResourceSystem ainda não viu. */
    Uninitialized = 'uninitialized',
    /** ResourceSystem está alocando buffers/bindgroups + uploading inicial. */
    Loading = 'loading',
    /** Resource pronto para uso — buffers GPU populados, bindgroups válidos. */
    Ready = 'ready',
    /** App modificou `data` — ResourceSystem precisa fazer re-upload no próximo tick. */
    Dirty = 'dirty',
    /**
     * Resource é gerenciado direto na GPU (writes apenas via compute shader).
     * CPU não faz upload — `data` é só metadado read-only.
     */
    GpuManaged = 'gpu-managed',
    /** App removeu do World; ResourceSystem vai liberar recursos GPU. */
    Disposed = 'disposed',
    /**
     * GPU buffers liberados. A instância pode voltar ao World (reinserção após remoção): segue para
     * `Uninitialized` e é alocada de novo.
     */
    Destroyed = 'destroyed',
}
