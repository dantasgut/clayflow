import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Opções de criação do RigidBody.
 */
export interface RigidBodyOptions {
    /**
     * Schema que descreve o struct WGSL consumido pelo flow integrador.
     * Importado de `bodies/schemas/` (`LCPSchema`, `XPBDRigidSchema`).
     */
    readonly schema: StructSchema;
    /**
     * Valores iniciais por field do schema. Fields ausentes recebem default
     * via `schema.applyDefaults`. Estrutura aceita está no schema.
     */
    readonly data?: Record<string, unknown>;
}

/**
 * RigidBody — corpo rígido 6-DOF (3 translation + 3 rotation). Data class
 * pura: armazena estado serializável governado pelo `schema` recebido na
 * instanciação. O integrador (LCPFlow/XPBDFlow rigid) é selecionado pelo
 * schema escolhido — pool key = `schema.name` rota para o flow correspondente.
 */
export class RigidBody extends PhysicsBody {
    private readonly schema: StructSchema;

    constructor(options: RigidBodyOptions) {
        super();
        this.schema = options.schema;
        this.data = this.schema.applyDefaults(options.data ?? {});
    }

    /** Pool storage para coalescer N RigidBodies do mesmo schema em 1 buffer GPU. */
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
