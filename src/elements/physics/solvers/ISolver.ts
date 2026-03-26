/**
 * Interface ISolver — contrato unificado para todos os solvers de física rígida.
 *
 * Permite que PhysicsWorld instancie e use qualquer solver (CPU/GPU, SI/XPBD/LCP)
 * por meio de um contrato comum, viabilizando o padrão Strategy + Registry (GoF).
 *
 * Implementado por:
 *   - CpuSolverAdapter  (envolve CPURigidBodySolver ou pipelines CPU)
 *   - GpuSolverAdapter  (envolve GpuRigidBodyPipeline)
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */
export interface ISolver {
    /** Nome legível do solver (ex: 'cpu_sequential_impulse', 'gpu_lcp'). */
    readonly name: string;

    /** Backend de execução. */
    readonly backend: 'cpu' | 'gpu';

    /**
     * Inicializa o solver (compila pipelines, aloca buffers, etc.).
     * Idempotente — pode ser chamado múltiplas vezes sem efeito duplicado.
     * @param device GPUDevice opcional (obrigatório para backend='gpu').
     */
    initialize(device?: GPUDevice): Promise<void>;

    /**
     * Executa um passo de simulação.
     * @param dt Delta de tempo do substep (segundos).
     */
    step(dt: number): Promise<void>;

    /** Libera todos os recursos alocados pelo solver. */
    dispose(): void;
}
