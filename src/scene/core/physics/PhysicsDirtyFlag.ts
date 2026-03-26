export enum PhysicsDirtyFlag {
    None       = 0,
    Shape      = 1 << 0,  // collider mudou → reupload collider buffer
    Mass       = 1 << 1,  // massa/inércia → reupload bodies buffer
    Transform  = 1 << 2,  // kinematic reposicionado → reupload position
    Constraint = 1 << 3,  // SoftBody constraints → reupload completo
    Material   = 1 << 4,  // fricção/restituição → reupload mat_props
}
