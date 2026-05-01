import type { EngineCore, Frame, UniformBufferSpec } from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import { createComputeKernel, type ComputeKernel } from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import type { GravityField } from '../forcefields/GravityField';
import simParamsStruct from '../../gpu/wgsl/structs/sim_params.wgsl?raw';
import particleStruct from '../../gpu/wgsl/structs/particle.wgsl?raw';
import distanceConstraintStruct from '../../gpu/wgsl/structs/distance_constraint.wgsl?raw';
import xpbdMath from '../../gpu/wgsl/math/xpbd.wgsl?raw';
import predictKernel from '../../gpu/wgsl/kernels/predict.wgsl?raw';
import velocityUpdateKernel from '../../gpu/wgsl/kernels/velocity_update.wgsl?raw';
import distanceSolveKernel from '../../gpu/wgsl/kernels/distance_solve.wgsl?raw';

export interface XPBDFlowOptions {
    readonly bodyType?: string;
    readonly constraintPoolKey?: string;
    readonly fixedDt?: number;
    readonly substeps?: number;
    readonly solverIters?: number;
}

export class XPBDFlow extends Flow {
    readonly type = 'XPBDFlow';
    readonly bodyType: string;
    readonly phase: Phase = 'physics';
    override priority = 5;

    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly solverIters: number;
    private readonly poolKey: string;
    private readonly constraintPoolKey: string | null;

    private paramsBuffer: UniformBufferSpec | null = null;
    private predictKernel: ComputeKernel | null = null;
    private velUpdateKernel: ComputeKernel | null = null;
    private distanceKernel: ComputeKernel | null = null;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: XPBDFlowOptions = {},
    ) {
        super();
        this.bodyType = options.bodyType ?? 'SoftBody:XPBD';
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 1);
        this.solverIters = Math.max(1, options.solverIters ?? 4);
        this.poolKey = this.bodyType;
        this.constraintPoolKey = options.constraintPoolKey ?? null;
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const list: PipelineDescriptor[] = [
            {
                id: 'pipeline_xpbd_predict',
                role: 'compute',
                shaderSource: [simParamsStruct, particleStruct, xpbdMath, predictKernel].join('\n'),
                entryPoints: ['predict_main'],
                consumes: [this.bodyType, 'GravityField'],
            },
            {
                id: 'pipeline_xpbd_velocity_update',
                role: 'compute',
                shaderSource: [simParamsStruct, particleStruct, velocityUpdateKernel].join('\n'),
                entryPoints: ['velocity_update_main'],
                consumes: [this.bodyType],
            },
        ];
        if (this.constraintPoolKey !== null) {
            list.push({
                id: 'pipeline_xpbd_distance_solve',
                role: 'compute',
                shaderSource: [
                    simParamsStruct,
                    particleStruct,
                    distanceConstraintStruct,
                    xpbdMath,
                    distanceSolveKernel,
                ].join('\n'),
                entryPoints: ['distance_solve_main'],
                consumes: [this.bodyType, this.constraintPoolKey],
            });
        }
        return list;
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.poolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.poolKey) {
            this.predictKernel = null;
            this.velUpdateKernel = null;
            this.distanceKernel = null;
        }
        if (poolKey === this.constraintPoolKey) {
            this.distanceKernel = null;
        }
    }

    private ensureGpuObjects(): void {
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'xpbd_sim_params',
                byteSize: 64,
            });
        }
        const bodiesBuf = this.resources.poolBufferSpec(this.poolKey);
        if (bodiesBuf === undefined) return;
        const baseBindings = [
            { binding: 0, type: 'uniform' as const, buffer: this.paramsBuffer },
            { binding: 1, type: 'storage' as const, buffer: bodiesBuf },
        ];
        if (this.predictKernel === null) {
            this.predictKernel = createComputeKernel(this.core, {
                discriminator: 'xpbd_predict',
                shaderSource: [simParamsStruct, particleStruct, xpbdMath, predictKernel].join('\n'),
                entryPoint: 'predict_main',
                bindings: baseBindings,
            });
        }
        if (this.velUpdateKernel === null) {
            this.velUpdateKernel = createComputeKernel(this.core, {
                discriminator: 'xpbd_velocity_update',
                shaderSource: [simParamsStruct, particleStruct, velocityUpdateKernel].join('\n'),
                entryPoint: 'velocity_update_main',
                bindings: baseBindings,
            });
        }
        if (this.constraintPoolKey !== null && this.distanceKernel === null) {
            const constraintsBuf = this.resources.poolBufferSpec(this.constraintPoolKey);
            if (constraintsBuf === undefined) return;
            this.distanceKernel = createComputeKernel(this.core, {
                discriminator: 'xpbd_distance_solve',
                shaderSource: [
                    simParamsStruct,
                    particleStruct,
                    distanceConstraintStruct,
                    xpbdMath,
                    distanceSolveKernel,
                ].join('\n'),
                entryPoint: 'distance_solve_main',
                bindings: [
                    ...baseBindings,
                    {
                        binding: 2,
                        type: 'read-only-storage' as const,
                        buffer: constraintsBuf,
                    },
                ],
            });
        }
    }

    private uploadParams(particleCount: number, dtSub: number): void {
        if (this.paramsBuffer === null) return;
        const gravity = this.findGravityField();
        const accel = (gravity?.data.acceleration as readonly number[] | undefined) ?? [
            0, -9.81, 0, 0,
        ];
        // SimParams (WGSL natural layout, vec3 size=12 align=16):
        //   gravity vec3f @ 0..12 (size 12)
        //   dt f32 @ 12..16
        //   restitution @ 16, damping @ 20, particle_radius @ 24
        //   particle_count u32 @ 28, constraint_count u32 @ 32, collider_count u32 @ 36
        //   shape_stiffness @ 40, collision_radius @ 44
        //   stride aligned to 16 = 48 (we allocate 64 for safety)
        const buf = new ArrayBuffer(64);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub; // dt @ offset 12
        f32[4] = 0.2; // restitution @ 16
        f32[5] = 0.05; // damping @ 20
        f32[6] = 0.05; // particle_radius @ 24
        u32[7] = particleCount; // particle_count @ 28
        u32[8] =
            this.constraintPoolKey !== null ? this.resources.poolCount(this.constraintPoolKey) : 0;
        u32[9] = 0; // collider_count @ 36
        f32[10] = 0; // shape_stiffness @ 40
        f32[11] = 0; // collision_radius @ 44
        this.core.write(this.paramsBuffer, new Uint8Array(buf));
    }

    private findGravityField(): GravityField | null {
        const ids = this.world.queryBySchemaName('GravityField');
        if (ids.length === 0) return null;
        const first = ids[0];
        if (first === undefined) return null;
        const resources = this.world.resourcesOf(first);
        return (resources.find(
            (r) => (r.constructor as { schema?: { name: string } }).schema?.name === 'GravityField',
        ) ?? null) as GravityField | null;
    }

    dispatch(frame: Frame): void {
        const count = this.resources.poolCount(this.poolKey);
        if (count === 0) return;
        this.ensureGpuObjects();
        if (this.predictKernel === null || this.velUpdateKernel === null) return;
        const predict = this.predictKernel;
        const velUpdate = this.velUpdateKernel;
        const distance = this.distanceKernel;
        const dtSub = this.fixedDt / this.substeps;
        const wgs = Math.ceil(count / 64);
        for (let s = 0; s < this.substeps; s++) {
            this.uploadParams(count, dtSub);
            frame.compute('XPBDFlow.predict', (pass) => {
                pass.bind.setPipeline(predict.pipeline).setBindGroup(0, predict.bindGroup);
                pass.dispatch.workgroups(wgs);
            });
            if (
                distance !== null
                && this.constraintPoolKey !== null
                && this.resources.poolCount(this.constraintPoolKey) > 0
            ) {
                for (let it = 0; it < this.solverIters; it++) {
                    frame.compute('XPBDFlow.distance_solve', (pass) => {
                        pass.bind
                            .setPipeline(distance.pipeline)
                            .setBindGroup(0, distance.bindGroup);
                        pass.dispatch.workgroups(1);
                    });
                }
            }
            frame.compute('XPBDFlow.velocity_update', (pass) => {
                pass.bind.setPipeline(velUpdate.pipeline).setBindGroup(0, velUpdate.bindGroup);
                pass.dispatch.workgroups(wgs);
            });
        }
    }
}
