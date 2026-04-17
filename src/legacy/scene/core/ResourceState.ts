/**
 * Enumeração que gerencia o ciclo de vida rigoroso de componentes 
 * (como Geometry e Material) que necessitam de alocação física na Camada 1.
 */
export enum ResourceState {
    /** Recém-criado, dados crus estão na CPU, aguardando ResourceLoader alocar na GPU. */
    Uninitialized = 0,

    /** Promessa de compilação em andamento. Protege contra dupla alocação no ECS multithread. */
    Loading = 1,

    /** Dados subidos na VRAM com sucesso, IDs de buffer gerados e prontos para RenderExtractor. */
    Ready = 2,

    /** Desenvolvedor alterou vértices/texturas. O buffer na VRAM está defasado e requer update via writeBuffer. */
    Dirty = 3,

    /** Componente marcado para ser destruído da Cena. O ResourceLoader irá desalocar da GPU no próximo frame. */
    Disposed = 4,

    /** Estado terminal após disposeResource. O ResourceLoader ignora este estado. */
    Destroyed = 5,

    /**
     * O buffer de vértices é gerenciado por um compute shader GPU.
     * O ResourceLoader suprime qualquer upload CPU→GPU enquanto neste estado.
     * Transição: Ready → GpuManaged via Geometry.enterGpuManagedMode().
     * Saída:      GpuManaged → Dirty   via Geometry.exitGpuManagedMode().
     */
    GpuManaged = 6,
}
