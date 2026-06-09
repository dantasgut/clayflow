import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { XPBDSoftSchema } from './schemas/XPBDSoftSchema';
import { FEMSchema } from './schemas/FEMSchema';
import { PhysicsBody } from './PhysicsBody';

/** Algoritmo de soft body, em vocabulário de domínio. */
export type SoftBodyAlgorithm = 'XPBD' | 'FEM';

const SOFT_SCHEMAS: Record<SoftBodyAlgorithm, StructSchema> = {
    XPBD: XPBDSoftSchema,
    FEM: FEMSchema,
};

/**
 * Opções de domínio do SoftBody — uma partícula deformável (um nó do corpo;
 * o corpo completo é composto por N partículas + constraints). O algoritmo
 * seleciona o schema; `pos.w` carrega o inverso da massa.
 */
export interface SoftBodyDomainOptions {
    /** Seleciona o schema/flow integrador (XPBD ou FEM). */
    readonly algorithm: SoftBodyAlgorithm;
    /** Posição inicial da partícula (mundo). Default [0,0,0]. */
    readonly position?: readonly [number, number, number];
    /** Massa da partícula (kg). 0/ausente ⇒ fixa (inv_mass = 0). */
    readonly mass?: number;
}

/** Opções cruas (avançado) — schema + data diretos. Retrocompat. */
export interface SoftBodyRawOptions {
    readonly schema: StructSchema;
    readonly data?: Record<string, unknown>;
}

export type SoftBodyOptions = SoftBodyDomainOptions | SoftBodyRawOptions;

function isRaw(o: SoftBodyOptions): o is SoftBodyRawOptions {
    return 'schema' in o;
}

/**
 * SoftBody — partícula de corpo deformável (cloth, jelly, nó FEM). Data class
 * pura governada pelo `schema`. Pool key = `schema.name` roteia para
 * XPBDFlow/FEMFlow.
 *
 *  - **Domínio**: `new SoftBody({ algorithm: 'XPBD', position, mass })`.
 *  - **Cru** (avançado): `new SoftBody({ schema, data })`.
 */
export class SoftBody extends PhysicsBody {
    private readonly schema: StructSchema;

    constructor(options: SoftBodyOptions) {
        super();
        if (isRaw(options)) {
            this.schema = options.schema;
            this.data = this.schema.applyDefaults(options.data ?? {});
            return;
        }
        const schema = SOFT_SCHEMAS[options.algorithm];
        if (schema === undefined) {
            throw new Error(`SoftBody: algoritmo desconhecido '${options.algorithm}'`);
        }
        if (options.mass !== undefined && options.mass < 0) {
            throw new Error('SoftBody: massa deve ser ≥ 0');
        }
        const [px, py, pz] = options.position ?? [0, 0, 0];
        const invMass = options.mass !== undefined && options.mass > 0 ? 1 / options.mass : 0;
        this.schema = schema;
        this.data = schema.applyDefaults({ pos: [px, py, pz, invMass] });
    }

    /** Pool storage para coalescer N SoftBodies do mesmo schema em 1 buffer GPU. */
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
