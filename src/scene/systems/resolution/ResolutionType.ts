/**
 * Enum dos métodos de resolução de colisão disponíveis.
 *
 * | Tipo                | Características                                                  |
 * |---------------------|------------------------------------------------------------------|
 * | IMPULSE             | 1 pass por substep. Rápido; pilhas podem tremer.                 |
 * | SEQUENTIAL_IMPULSE  | K iterações por substep (PGS). Estável para pilhas e stacks.    |
 * | PBD                 | Projeção direta de posição. Incondicionalmente estável.          |
 */
export enum ResolutionType {
    IMPULSE            = 'IMPULSE',
    SEQUENTIAL_IMPULSE = 'SEQUENTIAL_IMPULSE',
    PBD                = 'PBD',
}
