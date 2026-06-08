import type {
    EngineCore,
    Frame,
    UniformBufferSpec,
    StorageBufferSpec,
    StagingBufferSpec,
} from '../../../core/contracts/index';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import type { Phase } from '../../../scene/flows/Flow';
import { createComputeKernel, type ComputeKernel } from '../../../scene/flows/createComputeKernel';
import type { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import type { World } from '../../../scene/world/World';
import type { GravityField } from '../forcefields/GravityField';
import type { Transform } from '../../scene/Transform';
import rigidBodyStruct from '../../gpu/wgsl/structs/rigid_body.wgsl?raw';
import rbSimParamsStruct from '../../gpu/wgsl/structs/rb_sim_params.wgsl?raw';
import rbContactStruct from '../../gpu/wgsl/structs/rb_contact.wgsl?raw';
import colliderDescStructs from '../../gpu/wgsl/structs/collider_desc.wgsl?raw';
import quatLib from '../../gpu/wgsl/math/quat.wgsl?raw';
import impulseLib from '../../gpu/wgsl/math/impulse.wgsl?raw';
import contactMathLib from '../../gpu/wgsl/math/contact_math.wgsl?raw';
import lcpLib from '../../gpu/wgsl/math/lcp.wgsl?raw';
import sdfLib from '../../gpu/wgsl/math/sdf.wgsl?raw';
import xpbdLib from '../../gpu/wgsl/math/xpbd.wgsl?raw';
import rbPredictKernel from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';
import rbNarrowphaseKernel from '../../gpu/wgsl/kernels/rb_narrowphase.wgsl?raw';
import rbBuildLcpKernel from '../../gpu/wgsl/kernels/rb_build_lcp.wgsl?raw';
import rbSolveLcpKernel from '../../gpu/wgsl/kernels/rb_solve_lcp.wgsl?raw';
import rbLcpCommitKernel from '../../gpu/wgsl/kernels/rb_lcp_commit.wgsl?raw';

const PREDICT_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    quatLib,
    impulseLib,
    rbPredictKernel,
].join('\n');

const NARROWPHASE_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    colliderDescStructs,
    quatLib,
    impulseLib,
    sdfLib,
    rbNarrowphaseKernel,
].join('\n');

const BUILD_LCP_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    quatLib,
    impulseLib,
    xpbdLib,
    contactMathLib,
    lcpLib,
    rbBuildLcpKernel,
].join('\n');

const SOLVE_LCP_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    quatLib,
    impulseLib,
    xpbdLib,
    contactMathLib,
    lcpLib,
    rbSolveLcpKernel,
].join('\n');

const COMMIT_SHADER = [
    rigidBodyStruct,
    rbSimParamsStruct,
    rbContactStruct,
    quatLib,
    impulseLib,
    xpbdLib,
    rbLcpCommitKernel,
].join('\n');

const RB_SIM_PARAMS_BYTE_SIZE = 80;
const NP_PARAMS_BYTE_SIZE = 16;
const RB_CONTACT_BYTE_SIZE = 80;
const LCP_BODY_STRIDE_F32 = 40; // 160B / 4

interface ShapePool {
    readonly poolKey: string;
    readonly bindingIndex: number;
    readonly entryPoint: string;
}

const SHAPE_POOLS: readonly ShapePool[] = [
    { poolKey: 'PlaneCollider', bindingIndex: 5, entryPoint: 'rb_narrowphase_plane_main' },
    { poolKey: 'BoxCollider', bindingIndex: 6, entryPoint: 'rb_narrowphase_box_main' },
    { poolKey: 'SphereCollider', bindingIndex: 7, entryPoint: 'rb_narrowphase_sphere_main' },
    { poolKey: 'MeshCollider', bindingIndex: 8, entryPoint: 'rb_narrowphase_mesh_main' },
];

export interface LCPFlowOptions {
    readonly bodiesPoolKey?: string;
    readonly fixedDt?: number;
    readonly substeps?: number;
    readonly solveIters?: number;
}

/**
 * LCPFlow — solver de RigidBody via LCP (Linear Complementarity Problem) com
 * 4 fases canônicas conforme arquitetura revisada: DetectContacts → AssembleA →
 * SolvePGS×K → Apply. Cada substep:
 *
 *   1. `rb_predict`        — integra gravidade + damping em `pos_pred`/`rot_pred`/`vel`
 *   2. narrowphase × N     — uma variante por pool de Collider (Plane/Box/Sphere/Mesh)
 *   3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato
 *   4. `rb_solve_lcp`      — warm-start + K Gauss-Seidel (single-threaded por design)
 *   5. `rb_lcp_commit`     — escreve velocidades corrigidas + correção posicional
 *
 * Ao fim do frame, faz CPU readback do pool de bodies e sincroniza `Transform.data`
 * de cada entity (ForwardFlow re-uploada como dirty no próximo frame).
 */
export class LCPFlow extends Flow {
    readonly type = 'LCPFlow';
    readonly bodyType = 'LCPSchema';
    readonly phase: Phase = 'physics';
    override priority = 10;

    private readonly bodiesPoolKey: string;
    private readonly fixedDt: number;
    private readonly substeps: number;
    private readonly solveIters: number;

    private paramsBuffer: UniformBufferSpec | null = null;
    private contactsBuffer: StorageBufferSpec | null = null;
    private bVecBuffer: StorageBufferSpec | null = null;
    private contactsCapacity = 0;
    private bodiesStaging: StagingBufferSpec | null = null;
    private bodiesStagingByteSize = 0;

    private predictKernel: ComputeKernel | null = null;
    private readonly narrowphaseKernels = new Map<string, ComputeKernel>();
    private buildLcpKernel: ComputeKernel | null = null;
    private solveLcpKernel: ComputeKernel | null = null;
    private commitKernel: ComputeKernel | null = null;

    private readonly npParamsBuffers = new Map<string, UniformBufferSpec>();
    private readonly bodyOwnersBuffers = new Map<string, StorageBufferSpec>();
    private readonly bodyOwnersCapacity = new Map<string, number>();

    private readbackInFlight = false;

    constructor(
        private readonly core: EngineCore,
        private readonly world: World,
        private readonly resources: ResourceSystem,
        options: LCPFlowOptions = {},
    ) {
        super();
        this.bodiesPoolKey = options.bodiesPoolKey ?? 'LCPSchema';
        this.fixedDt = options.fixedDt ?? 1 / 60;
        this.substeps = Math.max(1, options.substeps ?? 4);
        this.solveIters = Math.max(1, options.solveIters ?? 8);
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        const list: PipelineDescriptor[] = [
            {
                id: 'pipeline_lcp_predict',
                role: 'compute',
                shaderSource: PREDICT_SHADER,
                entryPoints: ['rb_predict_main'],
                consumes: ['LCPSchema', 'GravityField'],
            },
            {
                id: 'pipeline_lcp_build',
                role: 'compute',
                shaderSource: BUILD_LCP_SHADER,
                entryPoints: ['rb_build_lcp'],
                consumes: ['LCPSchema'],
            },
            {
                id: 'pipeline_lcp_solve',
                role: 'compute',
                shaderSource: SOLVE_LCP_SHADER,
                entryPoints: ['rb_solve_lcp_main'],
                consumes: ['LCPSchema'],
            },
            {
                id: 'pipeline_lcp_commit',
                role: 'compute',
                shaderSource: COMMIT_SHADER,
                entryPoints: ['rb_lcp_commit_main'],
                consumes: ['LCPSchema'],
            },
        ];
        for (const shape of SHAPE_POOLS) {
            list.push({
                id: `pipeline_lcp_narrowphase_${shape.poolKey.toLowerCase()}`,
                role: 'compute',
                shaderSource: NARROWPHASE_SHADER,
                entryPoints: [shape.entryPoint],
                consumes: ['LCPSchema', shape.poolKey],
            });
        }
        return list;
    }

    override isReady(): boolean {
        return this.resources.poolCount(this.bodiesPoolKey) > 0;
    }

    override onPoolReallocated(poolKey: string): void {
        if (poolKey === this.bodiesPoolKey) {
            this.invalidateAllKernels();
            this.contactsBuffer = null;
            this.bVecBuffer = null;
            this.contactsCapacity = 0;
            return;
        }
        if (SHAPE_POOLS.some((s) => s.poolKey === poolKey)) {
            this.narrowphaseKernels.delete(poolKey);
            this.contactsBuffer = null;
            this.bVecBuffer = null;
            this.contactsCapacity = 0;
            this.bodyOwnersCapacity.delete(poolKey);
        }
    }

    override onEntitiesRemoved(_ids: readonly number[]): void {
        // Mapas body_owners precisam ser regerados — slots podem mudar.
        for (const shape of SHAPE_POOLS) {
            this.bodyOwnersCapacity.delete(shape.poolKey);
        }
    }

    private invalidateAllKernels(): void {
        this.predictKernel = null;
        this.buildLcpKernel = null;
        this.solveLcpKernel = null;
        this.commitKernel = null;
        this.narrowphaseKernels.clear();
    }

    private ensureParamsBuffer(): UniformBufferSpec {
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: 'lcp_sim_params',
                byteSize: RB_SIM_PARAMS_BYTE_SIZE,
            });
        }
        return this.paramsBuffer;
    }

    private ensureContactsBuffer(
        bodyCount: number,
        totalCol: number,
    ): {
        contacts: StorageBufferSpec | null;
        bVec: StorageBufferSpec | null;
    } {
        const needed = Math.max(1, bodyCount * totalCol);
        if (this.contactsBuffer === null || this.contactsCapacity < needed) {
            this.contactsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_contacts_${needed}`,
                byteSize: needed * RB_CONTACT_BYTE_SIZE,
            });
            this.bVecBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_bvec_${needed}`,
                byteSize: needed * 4,
            });
            this.contactsCapacity = needed;
            this.invalidateAllKernels();
        }
        return { contacts: this.contactsBuffer, bVec: this.bVecBuffer };
    }

    private ensureNpParamsBuffer(poolKey: string): UniformBufferSpec {
        let buf = this.npParamsBuffers.get(poolKey);
        if (buf === undefined) {
            buf = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `lcp_np_params_${poolKey}`,
                byteSize: NP_PARAMS_BYTE_SIZE,
            });
            this.npParamsBuffers.set(poolKey, buf);
        }
        return buf;
    }

    private ensureBodyOwnersBuffer(poolKey: string, count: number): StorageBufferSpec {
        const minBytes = Math.max(16, count * 4);
        let buf = this.bodyOwnersBuffers.get(poolKey);
        const cap = this.bodyOwnersCapacity.get(poolKey) ?? 0;
        if (buf === undefined || cap < count) {
            buf = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `lcp_body_owners_${poolKey}_${count}`,
                byteSize: minBytes,
            });
            this.bodyOwnersBuffers.set(poolKey, buf);
            this.bodyOwnersCapacity.set(poolKey, count);
            this.narrowphaseKernels.delete(poolKey); // bind group precisa refazer
        }
        return buf;
    }

    /** Itera o pool de uma shape e escreve `body_owners[slot] = rb_idx` ou 0xFFFFFFFFu. */
    private rebuildBodyOwners(poolKey: string): number {
        const entityIds = this.world.queryBySchemaName(poolKey);
        const count = entityIds.length;
        if (count === 0) return 0;
        const buf = this.ensureBodyOwnersBuffer(poolKey, count);
        const owners = new Uint32Array(Math.max(4, count));
        owners.fill(0xffffffff);
        for (let i = 0; i < count; i++) {
            const eid = entityIds[i]!;
            const slotInPool = this.resources.poolSlotOf(poolKey, eid);
            if (slotInPool === undefined) continue;
            const rbSlot = this.resources.poolSlotOf(this.bodiesPoolKey, eid);
            if (rbSlot !== undefined) {
                owners[slotInPool] = rbSlot;
            }
        }
        this.core.write(buf, new Uint8Array(owners.buffer));
        return count;
    }

    private uploadSimParams(bodyCount: number, totalCol: number, dtSub: number): void {
        const buf = this.ensureParamsBuffer();
        const arr = new ArrayBuffer(RB_SIM_PARAMS_BYTE_SIZE);
        const f32 = new Float32Array(arr);
        const u32 = new Uint32Array(arr);
        const gravity = this.findGravityField();
        const accel = (gravity?.data.acceleration as readonly number[] | undefined) ?? [
            0, -9.81, 0, 0,
        ];
        f32[0] = accel[0] ?? 0;
        f32[1] = accel[1] ?? -9.81;
        f32[2] = accel[2] ?? 0;
        f32[3] = dtSub;
        u32[4] = bodyCount;
        u32[5] = totalCol;
        u32[6] = bodyCount * totalCol;
        u32[7] = this.solveIters;
        f32[8] = this.fixedDt;
        f32[9] = 0.2; // restitution global default
        f32[10] = 0.005; // penetration_slop
        f32[11] = 0.1; // linear_damping
        f32[12] = 0.1; // angular_damping
        f32[13] = 0; // _pad1d
        f32[14] = 0.02; // predictive_threshold
        f32[15] = 0.5; // restitution_threshold
        f32[16] = 0.05; // sleep_lin_threshold
        f32[17] = 0; // _pad2a
        f32[18] = 0.2; // baumgarte_beta
        f32[19] = 0.9; // warm_start_factor
        this.core.write(buf, new Uint8Array(arr));
    }

    private uploadNpParams(
        poolKey: string,
        poolCount: number,
        poolBase: number,
        totalCol: number,
    ): void {
        const buf = this.ensureNpParamsBuffer(poolKey);
        const arr = new ArrayBuffer(NP_PARAMS_BYTE_SIZE);
        const u32 = new Uint32Array(arr);
        u32[0] = poolCount;
        u32[1] = poolBase;
        u32[2] = totalCol;
        u32[3] = 0;
        this.core.write(buf, new Uint8Array(arr));
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

    private ensurePredictKernel(bodiesBuf: StorageBufferSpec, params: UniformBufferSpec): void {
        if (this.predictKernel !== null) return;
        this.predictKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_predict',
            shaderSource: PREDICT_SHADER,
            entryPoint: 'rb_predict_main',
            bindings: [
                { binding: 0, type: 'uniform', buffer: params },
                { binding: 1, type: 'storage', buffer: bodiesBuf },
            ],
        });
    }

    private ensureNarrowphaseKernel(
        shape: ShapePool,
        bodiesBuf: StorageBufferSpec,
        params: UniformBufferSpec,
        contacts: StorageBufferSpec,
    ): ComputeKernel | null {
        if (this.narrowphaseKernels.has(shape.poolKey)) {
            return this.narrowphaseKernels.get(shape.poolKey) ?? null;
        }
        const npParams = this.ensureNpParamsBuffer(shape.poolKey);
        const ownersBuf = this.bodyOwnersBuffers.get(shape.poolKey);
        const poolBuf = this.resources.poolBufferSpec(shape.poolKey);
        if (ownersBuf === undefined || poolBuf === undefined) return null;
        const kernel = createComputeKernel(this.core, {
            discriminator: `lcp_narrowphase_${shape.poolKey}`,
            shaderSource: NARROWPHASE_SHADER,
            entryPoint: shape.entryPoint,
            bindings: [
                { binding: 0, type: 'uniform', buffer: params },
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'uniform', buffer: npParams },
                { binding: 3, type: 'read-only-storage', buffer: ownersBuf },
                { binding: 4, type: 'storage', buffer: contacts },
                { binding: shape.bindingIndex, type: 'read-only-storage', buffer: poolBuf },
            ],
        });
        this.narrowphaseKernels.set(shape.poolKey, kernel);
        return kernel;
    }

    private ensureBuildLcpKernel(
        bodiesBuf: StorageBufferSpec,
        params: UniformBufferSpec,
        contacts: StorageBufferSpec,
        bVec: StorageBufferSpec,
    ): void {
        if (this.buildLcpKernel !== null) return;
        this.buildLcpKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_build_lcp',
            shaderSource: BUILD_LCP_SHADER,
            entryPoint: 'rb_build_lcp',
            bindings: [
                { binding: 0, type: 'uniform', buffer: params },
                { binding: 1, type: 'read-only-storage', buffer: bodiesBuf },
                { binding: 2, type: 'storage', buffer: contacts },
                { binding: 3, type: 'storage', buffer: bVec },
            ],
        });
    }

    private ensureSolveLcpKernel(
        bodiesBuf: StorageBufferSpec,
        params: UniformBufferSpec,
        contacts: StorageBufferSpec,
        bVec: StorageBufferSpec,
    ): void {
        if (this.solveLcpKernel !== null) return;
        this.solveLcpKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_solve_lcp',
            shaderSource: SOLVE_LCP_SHADER,
            entryPoint: 'rb_solve_lcp_main',
            bindings: [
                { binding: 0, type: 'uniform', buffer: params },
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'storage', buffer: contacts },
                { binding: 3, type: 'read-only-storage', buffer: bVec },
            ],
        });
    }

    private ensureCommitKernel(
        bodiesBuf: StorageBufferSpec,
        params: UniformBufferSpec,
        contacts: StorageBufferSpec,
    ): void {
        if (this.commitKernel !== null) return;
        this.commitKernel = createComputeKernel(this.core, {
            discriminator: 'lcp_commit',
            shaderSource: COMMIT_SHADER,
            entryPoint: 'rb_lcp_commit_main',
            bindings: [
                { binding: 0, type: 'uniform', buffer: params },
                { binding: 1, type: 'storage', buffer: bodiesBuf },
                { binding: 2, type: 'read-only-storage', buffer: contacts },
            ],
        });
    }

    dispatch(frame: Frame): void {
        const bodyCount = this.resources.poolCount(this.bodiesPoolKey);
        if (bodyCount === 0) return;
        const bodiesBuf = this.resources.poolBufferSpec(this.bodiesPoolKey);
        if (bodiesBuf === undefined) return;

        // Re-resolve body_owners por pool e calcula offsets cumulativos.
        const poolInfo: {
            shape: ShapePool;
            count: number;
            base: number;
        }[] = [];
        let totalCol = 0;
        for (const shape of SHAPE_POOLS) {
            const count = this.rebuildBodyOwners(shape.poolKey);
            poolInfo.push({ shape, count, base: totalCol });
            totalCol += count;
        }
        const params = this.ensureParamsBuffer();
        const { contacts, bVec } = this.ensureContactsBuffer(bodyCount, totalCol);
        if (contacts === null || bVec === null) return;
        this.ensurePredictKernel(bodiesBuf, params);
        if (this.predictKernel === null) return;
        const predict = this.predictKernel;

        const dtSub = this.fixedDt / this.substeps;
        const predictGroups = Math.ceil(bodyCount / 64);

        // Predict 1× por frame: vel += g*dtFrame (gravidade integrada uma vez)
        this.uploadSimParams(bodyCount, totalCol, this.fixedDt);
        frame.compute('LCPFlow.predict', (pass) => {
            pass.bind.setPipeline(predict.pipeline).setBindGroup(0, predict.bindGroup);
            pass.dispatch.workgroups(predictGroups);
        });

        if (totalCol > 0) {
            // Substeps refinam contact detection + solve — predict e commit ficam fora
            for (let s = 0; s < this.substeps; s++) {
                this.uploadSimParams(bodyCount, totalCol, dtSub);

                // Fase 1 — DetectContacts (uma variante por pool não vazio)
                for (const info of poolInfo) {
                    if (info.count === 0) continue;
                    this.uploadNpParams(info.shape.poolKey, info.count, info.base, totalCol);
                    const k = this.ensureNarrowphaseKernel(info.shape, bodiesBuf, params, contacts);
                    if (k === null) continue;
                    const threads = bodyCount * info.count;
                    const groups = Math.ceil(threads / 64);
                    const kernel = k;
                    const label = `LCPFlow.narrowphase.${info.shape.poolKey}`;
                    frame.compute(label, (pass) => {
                        pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroup);
                        pass.dispatch.workgroups(groups);
                    });
                }

                // Fase 2 — AssembleA
                this.ensureBuildLcpKernel(bodiesBuf, params, contacts, bVec);
                if (this.buildLcpKernel === null) continue;
                const build = this.buildLcpKernel;
                const buildGroups = Math.ceil((bodyCount * totalCol) / 64);
                frame.compute('LCPFlow.buildLcp', (pass) => {
                    pass.bind.setPipeline(build.pipeline).setBindGroup(0, build.bindGroup);
                    pass.dispatch.workgroups(buildGroups);
                });

                // Fase 3 — SolvePGS×K (single-threaded)
                this.ensureSolveLcpKernel(bodiesBuf, params, contacts, bVec);
                if (this.solveLcpKernel === null) continue;
                const solve = this.solveLcpKernel;
                frame.compute('LCPFlow.solveLcp', (pass) => {
                    pass.bind.setPipeline(solve.pipeline).setBindGroup(0, solve.bindGroup);
                    pass.dispatch.workgroups(1);
                });
            }
        }

        // Commit 1× por frame: pos += vel*dtFrame + corrigeção posicional
        this.uploadSimParams(bodyCount, totalCol, this.fixedDt);
        this.ensureCommitKernel(bodiesBuf, params, contacts);
        if (this.commitKernel !== null) {
            const commit = this.commitKernel;
            frame.compute('LCPFlow.commit', (pass) => {
                pass.bind.setPipeline(commit.pipeline).setBindGroup(0, commit.bindGroup);
                pass.dispatch.workgroups(predictGroups);
            });
        }

        this.schedulePosRotReadback(frame, bodiesBuf, bodyCount);
    }

    /**
     * Copia o pool de bodies → staging dentro do frame atual e dispara readback
     * que resolve após `core.submit()`. Aplica pos/rot em Transform.data e marca
     * dirty para o ForwardFlow re-uploadar no próximo frame. Uma readback por
     * frame (não acumula in-flight).
     */
    private schedulePosRotReadback(
        frame: Frame,
        bodiesBuf: StorageBufferSpec,
        bodyCount: number,
    ): void {
        if (this.readbackInFlight) return;
        const byteSize = bodyCount * LCP_BODY_STRIDE_F32 * 4;
        if (byteSize <= 0) return;
        if (this.bodiesStaging === null || this.bodiesStagingByteSize < byteSize) {
            this.bodiesStaging = this.core.create<StagingBufferSpec>({
                kind: 'buffer',
                subkind: 'staging',
                discriminator: `lcp_bodies_staging_${byteSize}`,
                byteSize,
            });
            this.bodiesStagingByteSize = byteSize;
        }
        const staging = this.bodiesStaging;
        frame.copy(bodiesBuf, staging, byteSize);
        this.readbackInFlight = true;
        // Defer ao próximo macrotask: garante que core.submit() do frame atual
        // tenha rodado antes do mapAsync (sem isso, readback lê zeros).
        setTimeout(() => {
            this.core
                .readback(staging)
                .then((ab) => {
                    this.applyTransformsFromReadback(ab);
                })
                .catch(() => {
                    /* swallow */
                })
                .finally(() => {
                    this.readbackInFlight = false;
                });
        }, 0);
    }

    private applyTransformsFromReadback(ab: ArrayBuffer): void {
        const view = new Float32Array(ab);
        const total = this.resources.poolCount(this.bodiesPoolKey);
        for (let slot = 0; slot < total; slot++) {
            const eid = this.resources.poolEntityBySlot(this.bodiesPoolKey, slot);
            if (eid === undefined) continue;
            const base = slot * LCP_BODY_STRIDE_F32;
            if (base + 16 > view.length) continue;
            const pos: [number, number, number, number] = [
                view[base + 0] ?? 0,
                view[base + 1] ?? 0,
                view[base + 2] ?? 0,
                1,
            ];
            const rawRx = view[base + 12] ?? 0;
            const rawRy = view[base + 13] ?? 0;
            const rawRz = view[base + 14] ?? 0;
            const rawRw = view[base + 15] ?? 1;
            const rotLen2 = rawRx * rawRx + rawRy * rawRy + rawRz * rawRz + rawRw * rawRw;
            const [qx, qy, qz, qw] =
                rotLen2 > 1e-12 ? ([rawRx, rawRy, rawRz, rawRw] as const) : ([0, 0, 0, 1] as const);
            const rot: [number, number, number, number] = [qx, qy, qz, qw];
            // Model matrix column-major = T(pos) * R(quat); scale = 1.
            const xx = qx * qx,
                yy = qy * qy,
                zz = qz * qz;
            const xy = qx * qy,
                xz = qx * qz,
                yz = qy * qz;
            const wx = qw * qx,
                wy = qw * qy,
                wz = qw * qz;
            const model: number[] = [
                1 - 2 * (yy + zz),
                2 * (xy + wz),
                2 * (xz - wy),
                0,
                2 * (xy - wz),
                1 - 2 * (xx + zz),
                2 * (yz + wx),
                0,
                2 * (xz + wy),
                2 * (yz - wx),
                1 - 2 * (xx + yy),
                0,
                pos[0],
                pos[1],
                pos[2],
                1,
            ];
            const resources = this.world.resourcesOf(eid);
            const transform = resources.find(
                (r) => (r.constructor as { name?: string }).name === 'Transform',
            ) as Transform | undefined;
            if (transform === undefined) continue;
            transform.data.position = pos;
            transform.data.rotation = rot;
            transform.data.model = model;
            this.markTransformDirty(transform);
        }
    }

    private markTransformDirty(transform: Transform): void {
        const events = (
            this.world as unknown as {
                events?: { emit?: (name: string, payload: unknown) => void };
            }
        ).events;
        events?.emit?.('resourceDirty', { payload: { resource: transform } });
    }
}
