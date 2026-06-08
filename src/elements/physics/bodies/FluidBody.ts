import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

/**
 * Opções de criação do FluidBody.
 */
export interface FluidBodyOptions {
    /**
     * Schema que descreve o struct WGSL consumido pelo flow integrador.
     * Importado de `bodies/schemas/` (`SPHSchema`, `PBFSchema`,
     * `MPMFluidSchema`).
     */
    readonly schema: StructSchema;
    /**
     * Valores iniciais por field do schema. Fields ausentes recebem default
     * via `schema.applyDefaults`. Estrutura aceita está no schema.
     */
    readonly data?: Record<string, unknown>;
}

/**
 * FluidBody — partícula de fluido (water, smoke, gel). Data class pura:
 * estado runtime serializável governado pelo `schema` recebido. Pool key =
 * `schema.name` roteia para SPHFlow/PBFFlow/MPMFlow conforme o schema
 * escolhido.
 */
export class FluidBody extends PhysicsBody {
    private readonly schema: StructSchema;

    constructor(options: FluidBodyOptions) {
        super();
        this.schema = options.schema;
        this.data = this.schema.applyDefaults(options.data ?? {});
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
