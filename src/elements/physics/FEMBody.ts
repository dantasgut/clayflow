import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { PhysicsBody }           from '../../scene/components/physics/PhysicsBody';
import type { FEMBufferIds }     from './fem/FEMBufferLayout';

export interface FEMNode {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    /** 0 = fixado (cinemático), 1 = livre. */
    w: number;
}

export interface FEMTetrahedron {
    /** Índices dos 4 nós (order matters for winding). */
    n0: number; n1: number; n2: number; n3: number;
}

export interface FEMBodyOptions {
    mass?:            number;
    /** Módulo de cisalhamento de Lamé (rigidez a deformação). Default: 1e4 Pa. */
    mu?:              number;
    /** Módulo de bulk de Lamé (resistência a mudança de volume). Default: 1e4 Pa. */
    lambda?:          number;
    damping?:         number;
    collisionRadius?: number;
    restitution?:     number;
}

/**
 * Corpo deformável FEM — malha volumétrica de tetraedros T4.
 *
 * Os nós correspondem aos vértices do mesh; os elementos (FEMTetrahedron) definem
 * a conectividade volumétrica. O pipeline XPBD-FEM opera sobre `nodes` e `elements`,
 * resolvendo restrições hidrostática e desviadora por tetraedro.
 *
 * Os buffers GPU são alocados externamente (FEMComputePass), análogo a SoftBody.
 */
export class FEMBody extends PhysicsBody {
    public readonly type       = 'FEMBody';
    public readonly physicType = 'FEMBody';

    public readonly acceptedAlgorithms: readonly string[] = ['XPBD-FEM'];

    /** Conjunto de IDs de buffers GPU alocados para este corpo. */
    public bufferIds?: FEMBufferIds;

    public nodes:    FEMNode[]        = [];
    public elements: FEMTetrahedron[] = [];

    constructor(options: FEMBodyOptions = {}) {
        super();
        this.set('mass',            options.mass            ?? 1.0);
        this.set('mu',              options.mu              ?? 1e4);
        this.set('lambda',          options.lambda          ?? 1e4);
        this.set('damping',         options.damping         ?? 0.01);
        this.set('collisionRadius', options.collisionRadius ?? 0.0);
        this.set('restitution',     options.restitution     ?? 0.0);
    }

    protected override async doAllocate(_resourceManager: ResourceManager): Promise<void> {
        // Buffers alocados pelo FEMComputePass — no-op aqui.
    }

    protected override doDispose(_resourceManager: ResourceManager): void {
        // Buffers liberados pelo FEMComputePass — no-op aqui.
    }
}
