import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/** Parâmetros da imagem do mundo (`EnvironmentMap`): a intensidade, o giro e se é o fundo visível. */
export const EnvironmentMapSchema = new StructSchema('EnvironmentMap', {
    intensity: FieldType.f32,
    yaw: FieldType.f32,
    background: FieldType.u32,
    _pad0: FieldType.u32,
});
