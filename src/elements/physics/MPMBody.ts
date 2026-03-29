import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { PhysicsBody }          from '../../scene/components/physics/PhysicsBody';
import type { MPMBufferIds }    from './mpm/MPMBufferLayout';

export type MPMMaterialType = 'elastic' | 'snow' | 'fluid' | 'sand';

export interface MPMParticleData {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
}

export interface MPMBodyOptions {
    mass?:     number;
    material?: MPMMaterialType;
    /** Módulo de Young (Pa). Default: 1e5. */
    E?:        number;
    /** Coeficiente de Poisson. Default: 0.2. */
    nu?:       number;
    /** Coeficiente de hardening exponencial (neve). Default: 10. */
    hardening?: number;
    /** Limite de compressão crítica (neve). Default: 2.5e-2. */
    thetaC?:    number;
    /** Limite de extensão crítica (neve). Default: 7.5e-3. */
    thetaS?:    number;
    /** Viscosidade dinâmica (fluido). Default: 0. */
    viscosity?: number;
}

/**
 * Corpo MPM — malha de partículas simulada pelo Material Point Method (MLS-MPM).
 *
 * Suporta múltiplos modelos de material (Neo-Hookean, neve, fluido).
 * A grade euleriana é gerenciada globalmente pelo MPMComputePass.
 *
 * Os buffers GPU são alocados externamente (MPMComputePass), análogo a FEMBody.
 */
export class MPMBody extends PhysicsBody {
    public readonly type       = 'MPMBody';
    public readonly physicType = 'MPMBody';

    public readonly acceptedAlgorithms: readonly string[] = ['MPM'];

    /** IDs de buffers GPU alocados pelo MPMComputePass. */
    public bufferIds?: MPMBufferIds;

    public particles: MPMParticleData[] = [];

    constructor(options: MPMBodyOptions = {}) {
        super();
        this.set('mass',      options.mass      ?? 1.0);
        this.set('material',  options.material  ?? 'elastic');
        this.set('E',         options.E         ?? 1e5);
        this.set('nu',        options.nu        ?? 0.2);
        this.set('hardening', options.hardening ?? 10.0);
        this.set('thetaC',    options.thetaC    ?? 2.5e-2);
        this.set('thetaS',    options.thetaS    ?? 7.5e-3);
        this.set('viscosity', options.viscosity ?? 0.0);
    }

    protected override async doAllocate(_resourceManager: ResourceManager): Promise<void> {
        // Buffers alocados pelo MPMComputePass — no-op aqui.
    }

    protected override doDispose(_resourceManager: ResourceManager): void {
        // Buffers liberados pelo MPMComputePass — no-op aqui.
    }
}
