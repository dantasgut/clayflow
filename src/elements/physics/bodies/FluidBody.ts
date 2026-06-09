import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { SPHSchema } from './schemas/SPHSchema';
import { PBFSchema } from './schemas/PBFSchema';
import { MPMFluidSchema } from './schemas/MPMFluidSchema';
import { PhysicsBody } from './PhysicsBody';

/** Algoritmo de fluido, em vocabulário de domínio. */
export type FluidAlgorithm = 'SPH' | 'PBF' | 'MPM';

const FLUID_SCHEMAS: Record<FluidAlgorithm, StructSchema> = {
    SPH: SPHSchema,
    PBF: PBFSchema,
    MPM: MPMFluidSchema,
};

/**
 * Opções de domínio do FluidBody — uma partícula de fluido (o fluido completo
 * é N partículas no mesmo pool). O algoritmo seleciona o schema. Observação:
 * `pos.w` é específico do algoritmo (densidade no SPH, lambda no PBF) e NÃO é
 * massa — por isso só `pos.xyz` e `vel.xyz` são definidos aqui.
 */
export interface FluidBodyDomainOptions {
    /** Seleciona o schema/flow integrador (SPH, PBF ou MPM). */
    readonly algorithm: FluidAlgorithm;
    /** Posição inicial da partícula (mundo). Default [0,0,0]. */
    readonly position?: readonly [number, number, number];
    /** Velocidade inicial da partícula. Default [0,0,0]. */
    readonly velocity?: readonly [number, number, number];
}

/** Opções cruas (avançado) — schema + data diretos. Retrocompat. */
export interface FluidBodyRawOptions {
    readonly schema: StructSchema;
    readonly data?: Record<string, unknown>;
}

export type FluidBodyOptions = FluidBodyDomainOptions | FluidBodyRawOptions;

function isRaw(o: FluidBodyOptions): o is FluidBodyRawOptions {
    return 'schema' in o;
}

/**
 * FluidBody — partícula de fluido (water, smoke, gel). Data class pura
 * governada pelo `schema`. Pool key = `schema.name` roteia para
 * SPHFlow/PBFFlow/MPMFlow.
 *
 *  - **Domínio**: `new FluidBody({ algorithm: 'SPH', position, velocity })`.
 *  - **Cru** (avançado): `new FluidBody({ schema, data })`.
 */
export class FluidBody extends PhysicsBody {
    private readonly schema: StructSchema;

    constructor(options: FluidBodyOptions) {
        super();
        if (isRaw(options)) {
            this.schema = options.schema;
            this.data = this.schema.applyDefaults(options.data ?? {});
            return;
        }
        const schema = FLUID_SCHEMAS[options.algorithm];
        if (schema === undefined) {
            throw new Error(`FluidBody: algoritmo desconhecido '${options.algorithm}'`);
        }
        const [px, py, pz] = options.position ?? [0, 0, 0];
        const [vx, vy, vz] = options.velocity ?? [0, 0, 0];
        this.schema = schema;
        // pos.w / vel.w são específicos do algoritmo (densidade, pressão, lambda) —
        // deixados no default (0) para o solver inicializar.
        this.data = schema.applyDefaults({ pos: [px, py, pz, 0], vel: [vx, vy, vz, 0] });
    }

    /** Pool storage para coalescer N FluidBodies do mesmo schema em 1 buffer GPU. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'body',
                role: 'storage-rw',
                schema: this.schema,
                storage: 'pool',
            },
        ];
    }
}
