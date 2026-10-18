import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Pool do material de água (spec 017), lido como `array<FluidSurfaceMaterial>` pelos estágios da superfície de água: a
 * suavização, as cáusticas e a composição óptica acham o material de cada pixel pelo slot gravado na superfície.
 */
export const FluidSurfaceMaterialSchema = new StructSchema('FluidSurfaceMaterial', {
    color: FieldType.vec4f,
    absorption: FieldType.vec4f,
    ambient: FieldType.vec4f,
    ior: FieldType.f32,
    reflectivity: FieldType.f32,
    shininess: FieldType.f32,
    particleRadius: FieldType.f32,
    smoothingRadius: FieldType.f32,
    depthThreshold: FieldType.f32,
    thicknessScale: FieldType.f32,
    refraction: FieldType.f32,
    caustics: FieldType.u32,
    causticIntensity: FieldType.f32,
    rippleStrength: FieldType.f32,
    rippleSize: FieldType.f32,
    rippleSpeed: FieldType.f32,
    roughness: FieldType.f32,
    abbe: FieldType.f32,
    _pad2: FieldType.f32,
});
