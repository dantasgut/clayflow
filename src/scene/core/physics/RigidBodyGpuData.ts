/** Contrato de upload CPU → GPU para um RigidBody (entrada do buffer bodies). */
export interface RigidBodyGpuData {
    /** [x, y, z, invMass] */
    position:     readonly [number, number, number, number];
    /** [vx, vy, vz, 0] */
    velocity:     readonly [number, number, number, number];
    /** [wx, wy, wz, 0] — velocidade angular */
    omega:        readonly [number, number, number, number];
    /** [qx, qy, qz, qw] — quaternion */
    rotation:     readonly [number, number, number, number];
    /** [ix, iy, iz, 0] — inverso do tensor de inércia (diagonal) */
    inertiaInv:   readonly [number, number, number, number];
    /** [x, y, z, 0] — posição prevista */
    positionPred: readonly [number, number, number, number];
    /** [qx, qy, qz, qw] — rotação prevista */
    rotationPred: readonly [number, number, number, number];
    /** [restitution, friction, linearDamping, angularDamping] */
    materialProps:readonly [number, number, number, number];
    /** [shapeType, halfX, halfY, halfZ] — 0=Sphere, 1=Box */
    bodyShape:    readonly [number, number, number, number];
}
