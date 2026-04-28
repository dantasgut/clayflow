import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';
import { PhysicsBody } from './PhysicsBody';

export type FluidBodyAlgorithm = 'SPH' | 'PBF' | 'MPM';

export interface FluidBodyOptions {
    readonly algorithm?: FluidBodyAlgorithm;
}

export class FluidBody extends PhysicsBody {
    static readonly schema = new StructSchema('FluidBody', {
        pos: FieldType.vec4f,
        vel: FieldType.vec4f,
        density: FieldType.f32,
        pressure: FieldType.f32,
        mass: FieldType.f32,
        material_id: FieldType.u32,
    });

    static readonly defaultAlgorithm: FluidBodyAlgorithm = 'SPH';

    private readonly algorithm: FluidBodyAlgorithm;

    constructor(values: Record<string, unknown> = {}, options: FluidBodyOptions = {}) {
        super();
        this.algorithm = options.algorithm ?? FluidBody.defaultAlgorithm;
        this.data = FluidBody.schema.applyDefaults({
            pos: values['position'] ?? [0, 0, 0, 1],
            vel: values['velocity'] ?? [0, 0, 0, 0],
            density: values['density'] ?? 1000.0,
            pressure: 0,
            mass: values['mass'] ?? 1.0,
            material_id: (values['materialId'] ?? 0) as number,
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{
            id: 'body',
            role: 'storage-rw',
            schema: FluidBody.schema,
            storage: 'pool',
        }];
    }

    getFlowDescriptors(): readonly FlowDescriptor[] {
        return [{ algorithm: this.algorithm, bodyType: 'FluidBody' }];
    }
}
