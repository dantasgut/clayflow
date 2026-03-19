import type { PhysicsSolver } from './PhysicsSolver';
import type { PhysicsBody } from '../../components/physics/PhysicsBody';
import { RigidBody } from '../../components/physics/RigidBody';
import { vec3 } from 'gl-matrix';

/**
 * Solver CPU para corpos rígidos (integrador de Euler semi-implícito).
 * Implementa o lado "Implementação" do padrão Bridge.
 * Serve como fallback quando o WebGPU compute não está disponível,
 * ou como referência para testes de simulação.
 */
export class CPURigidBodySolver implements PhysicsSolver {
    public readonly id = 'cpu_rigid_body';

    private readonly _gravity: vec3;

    constructor(gravity: vec3 = vec3.fromValues(0, -9.81, 0)) {
        this._gravity = gravity;
    }

    public solve(body: PhysicsBody, _encoder: GPUCommandEncoder, dt: number): void {
        if (!(body instanceof RigidBody)) return;
        if (body.isKinematic) return;

        // Integração de Euler semi-implícita: v += g*dt, p += v*dt
        const g = this._gravity;
        const gx = g[0] ?? 0;
        const gy = g[1] ?? -9.81;
        const gz = g[2] ?? 0;
        body.velocity[0] = (body.velocity[0] ?? 0) + gx * dt;
        body.velocity[1] = (body.velocity[1] ?? 0) + gy * dt;
        body.velocity[2] = (body.velocity[2] ?? 0) + gz * dt;
    }
}
