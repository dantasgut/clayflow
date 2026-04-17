/**
 * Conjunto de IDs de buffers GPU alocados para um SoftBody.
 *
 * Substitui as 8+ chaves individuais do Property Bag
 * (`gpuParticlesId`, `gpuConstraintsId`, `gpuSimParamsId`, etc.)
 * por um objeto tipado, eliminando typos de string e facilitando o dispose.
 *
 * Armazenado em `SoftBody.gpuBufferSet` — null quando ainda não alocado.
 */
export interface SoftBodyGpuBufferSet {
    /** Storage buffer `Particle[]` (pos, pred, vel por partícula). */
    particlesId:    string;
    /** Storage buffer `DistanceConstraint[]`. */
    constraintsId:  string;
    /** Uniform buffer `SimParams` (atualizado por frame). */
    simParamsId:    string;
    /** Storage buffer de λ para warm-starting (f32 por constraint). */
    lambdaBufId:    string;
    /** Storage buffer de λ snapshot do frame anterior (warm-start inter-frame). */
    lambdaWarmId:   string;
    /** Storage buffer `atomic<i32>[pCount × 4]` para Jacobi XPBD. */
    jacobiAccumId:  string;
    /** IDs dos uniform buffers `ColorRange` por cor (graph coloring). */
    colorRangeIds:  string[];
    /** Número de constraints por cor. */
    colorCounts:    number[];

    // Shape Matching — presentes apenas quando useShapeMatching=true
    /** Storage buffer `rest_positions[]` (posições de repouso centradas). */
    restPosId?:    string;
    /** Storage buffer `goal_positions[]` (gerenciado pela GPU). */
    goalPosId?:    string;
    /** Storage buffer `shape_state[1]` (quaternion warm-start). */
    shapeStateId?: string;
}
