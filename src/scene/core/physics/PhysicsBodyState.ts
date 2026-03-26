export enum PhysicsBodyState {
    Inactive,   // não registrado no mundo
    Active,     // simulando normalmente
    Sleeping,   // abaixo do threshold de velocidade
    Kinematic,  // controlado externamente, não integrado
    Removed,    // aguardando desalocação
}
