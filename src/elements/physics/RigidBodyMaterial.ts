/**
 * Propriedades de material de um RigidBody — configuração estática definida
 * na construção e raramente modificada em runtime.
 *
 * Substituí as chaves de property bag:
 *   'mass', 'restitution', 'friction', 'linearDamping', 'angularDamping'
 */
export interface RigidBodyMaterial {
    mass:           number;
    restitution:    number;
    friction:       number;
    linearDamping:  number;
    angularDamping: number;
}
