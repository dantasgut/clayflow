// Produto do estágio de transformação — mesma forma de `Transform.worldSchema`
// (elements/scene/Transform.ts). Escrito só pela GPU (TransformFlow).
struct WorldTransform {
    world:  mat4x4f,  // T · R · S (column-major)
    normal: mat3x3f,  // R · S⁻¹ — inversa-transposta de R·S, para normais
}
