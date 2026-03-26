/**
 * Enum dos métodos de resolução de colisão disponíveis.
 *
 * | Tipo                | Características                                                         |
 * |---------------------|-------------------------------------------------------------------------|
 * | IMPULSE             | 1 pass por substep. Rápido; pilhas podem tremer.                        |
 * | SEQUENTIAL_IMPULSE  | K iterações por substep (PGS). Estável para pilhas e stacks.            |
 * | XPBD                | Extended PBD com compliance α. Suave e incondicionalmente estável.      |
 * | XPBD_SOFT           | Pipeline XPBD para corpos deformáveis (SoftBody). Sem colisão rígida.  |
 */
export enum ResolutionType {
    IMPULSE            = 'IMPULSE',
    SEQUENTIAL_IMPULSE = 'SEQUENTIAL_IMPULSE',
    XPBD               = 'XPBD',
    XPBD_SOFT          = 'XPBD_SOFT',
    /** LCP/PGS com warm start — executa no pipeline GPU GpuLcpPipeline. */
    LCP                = 'LCP',
}
