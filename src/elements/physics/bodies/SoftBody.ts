import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Opções de criação do SoftBody.
 */
export interface SoftBodyOptions {
    /**
     * Schema que descreve o struct WGSL consumido pelo flow integrador.
     * Importado de `bodies/schemas/` (`XPBDSoftSchema`, `FEMSchema`,
     * `MPMSoftSchema`).
     */
    readonly schema: StructSchema;
    /**
     * Valores iniciais por field do schema. Fields ausentes recebem default
     * via `schema.applyDefaults`. Estrutura aceita está no schema.
     */
    readonly data?: Record<string, unknown>;
}

/**
 * SoftBody — corpo deformável discreto (cloth, jelly, finite element node).
 * Data class pura: estado runtime serializável governado pelo `schema`
 * recebido. Pool key = `schema.name` roteia para XPBDFlow/FEMFlow/MPMFlow
 * conforme o schema escolhido.
 */
export class SoftBody extends PhysicsBody {
    private readonly schema: StructSchema;

    constructor(options: SoftBodyOptions) {
        super();
        this.schema = options.schema;
        this.data = this.schema.applyDefaults(options.data ?? {});
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
