// Intenção de posicionamento — mesma forma de `Transform.schema` (elements/scene/Transform.ts).
struct Transform {
    position: vec4f,  // xyz = posição, w = 1
    rotation: vec4f,  // quaternion (x, y, z, w)
    scale:    vec4f,  // xyz = escala por eixo, w = 1
}
