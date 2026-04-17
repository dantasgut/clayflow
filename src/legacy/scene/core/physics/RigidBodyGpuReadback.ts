/** Contrato de readback GPU → CPU para um RigidBody (saída do buffer bodies). */
export interface RigidBodyGpuReadback {
    gpuRbIndex: number;
    position:   readonly [number, number, number];
    rotation:   readonly [number, number, number, number];
}
