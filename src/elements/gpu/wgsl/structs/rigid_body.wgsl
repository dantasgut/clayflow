// portado de legacy/elements/physics/gpu/wgsl/structs/rigid_body.wgsl.ts
struct RigidBody {
    pos:        vec4f,  // xyz=posição, w=inv_mass (0=cinemático)
    vel:        vec4f,  // xyz=velocidade linear, w=sleep_flag (0=awake, 1=sleeping)
    omega:      vec4f,  // xyz=velocidade angular, w=0
    rot:        vec4f,  // quaternion (x,y,z,w)
    I_inv:      vec4f,  // inércia inversa diagonal (frame local), w=0
    pos_pred:   vec4f,  // posição prevista
    rot_pred:   vec4f,  // rotação prevista (quat, renormalizar a cada substep)
    mat_props:  vec4f,  // x=restitution, y=friction, z=lin_damping, w=ang_damping
    body_shape: vec4f,  // x=shape_type (0=Sphere, 1=Box), yzw=half_extents
    _rb_pad:    vec4f,  // reservado
}
