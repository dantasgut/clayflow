/**
 * createGpuPhysicsWorld — factory para criação do mundo de física GPU-only.
 *
 * Cria e conecta internamente: GpuComputePassRegistry, GpuPipelineEventBus,
 * PhysicsResourceLoader, LCPComputePass (RigidBody) e SoftBodyXPBDComputePass.
 *
 * Uso típico:
 * ```typescript
 * const world = createGpuPhysicsWorld({
 *     substeps: 4,
 *     rigidBody: { iterations: 10 },
 *     softBody:  { iterations: 15, restitution: 0.05 },
 * });
 * world.addForce(new ConstantForce('gravity', new Float32Array([0, -9.81, 0])));
 *
 * const renderer = new WebGPURenderer(world);
 * await renderer.initialize(canvas);
 * ```
 */

import type { Force }              from '../../scene/systems/forces/Force';
import type { PhysicsSceneConfig } from '../../scene/systems/PhysicsSceneConfig';
import { GpuComputePassRegistry }  from '../../scene/systems/gpu/GpuComputePassRegistry';
import { DefaultGpuPipelineEventBus } from '../../scene/systems/gpu/DefaultGpuPipelineEventBus';
import { PhysicsResourceLoader }   from '../../scene/rendering/PhysicsResourceLoader';
import { GpuPhysicsOrchestrator }  from '../../scene/rendering/GpuPhysicsOrchestrator';
import { LCPComputePass as RigidBodyLCPComputePass } from './rigidbody/LCPComputePass';
import { SoftBodyXPBDComputePass } from './softbody/XPBDComputePass';
import { FEMComputePass }          from './fem/FEMComputePass';
import { MPMComputePass }          from './mpm/MPMComputePass';

export function createGpuPhysicsWorld(config: PhysicsSceneConfig = {}): GpuPhysicsOrchestrator {
    const globalForces = new Map<string, Force>();

    // Closures reativas: lidas a cada frame, não capturadas como const.
    // Mutar config.rigidBody.substeps (ou config.substeps) em runtime tem efeito imediato.
    // Prioridade: algoritmo-específico → global → default do algoritmo.
    const getSubstepsRb  = (): number => config.rigidBody?.substeps ?? config.substeps ?? 2;
    const getSubstepsSb  = (): number => config.softBody?.substeps  ?? config.substeps ?? 4;

    const eventBus  = new DefaultGpuPipelineEventBus();
    const registry  = new GpuComputePassRegistry();
    const resLoader = new PhysicsResourceLoader<GpuPhysicsOrchestrator>(eventBus);

    // RigidBody pass — LCP/PGS (velocity-space, Catto 2005)
    registry.register(new RigidBodyLCPComputePass(
        globalForces,
        getSubstepsRb,
        config.rigidBody?.iterations ?? 25,
        config.rigidBody?.profilerLogInterval ?? 60,
        config.rigidBody,
        eventBus,
    ));

    // FEM pass — registrado apenas se config.fem for fornecido
    if (config.fem) {
        const fem = config.fem;
        const getSubstepsFem = (): number => fem.substeps ?? config.substeps ?? 6;
        registry.register(new FEMComputePass(
            globalForces,
            getSubstepsFem,
            fem.iterations ?? 10,
        ));
    }

    // SoftBody pass — registrado apenas se config.softBody for fornecido
    if (config.softBody) {
        const sb = config.softBody;
        registry.register(new SoftBodyXPBDComputePass(
            globalForces,
            getSubstepsSb,
            sb.restitution ?? 0.05,
            sb.iterations  ?? 15,
            sb.profilerLogInterval ?? 60,
        ));
    }

    // MPM pass — registrado apenas se config.mpm for fornecido
    if (config.mpm) {
        const mpm = config.mpm;
        const getSubstepsMpm = (): number => mpm.substeps ?? config.substeps ?? 20;
        registry.register(new MPMComputePass(
            globalForces,
            getSubstepsMpm,
            {
                gridDims:   mpm.gridDims   ?? [32, 32, 32],
                cellSize:   mpm.gridCellSize ?? (12 / 32),
                gridOrigin: mpm.gridOrigin ?? [-6, -1, -6],
            },
        ));
    }

    return new GpuPhysicsOrchestrator(config, registry, eventBus, resLoader, globalForces);
}
