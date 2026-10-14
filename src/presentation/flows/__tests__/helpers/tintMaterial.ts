import type { GPUDescriptor } from '../../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../../scene/descriptors/StructSchema';
import { StandardMaterial } from '../../../../elements/material/StandardMaterial';

/** Schema próprio (pool `TintMaterial`) no layout do `StandardMaterial`. */
const TintSchema = new StructSchema('TintMaterial', {
    albedo: FieldType.vec4f,
    roughness: FieldType.f32,
    metallic: FieldType.f32,
    _pad0: FieldType.f32,
    _pad1: FieldType.f32,
});

/**
 * Material de triângulos de teste com schema e pipeline próprios (o mesmo shader do forward, lido como
 * `StandardMaterial`): um segundo pipeline da mesma família de layout.
 */
export class TintMaterial extends StandardMaterial {
    static override readonly schema = TintSchema;

    override getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'material', role: 'storage-ro', schema: TintSchema, storage: 'pool' }];
    }

    override getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const [base] = super.getPipelineDescriptors();
        return [
            {
                ...base!,
                id: 'pipeline_tint',
                consumes: [
                    'CameraMatrices',
                    'WorldTransform',
                    'Renderable',
                    'RenderInstance',
                    { name: TintSchema.name, as: 'StandardMaterial' },
                ],
            },
        ];
    }
}
