// Tipos do ponto `camera` (spec 009): o que a função devolve — vista e projeção.
// Requer: nada.

struct CameraOut {
    view: mat4x4f,
    projection: mat4x4f,
}
