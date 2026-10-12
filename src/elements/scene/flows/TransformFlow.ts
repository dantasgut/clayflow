import type { EngineCore, Frame, UniformBufferSpec } from '../../../core/contracts/index';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import type { PoolDirectory } from '../../../scene/contracts/PoolDirectory';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { EventBus, Unsubscribe } from '../../../scene/events/EventBus';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { LegacyFlow as Flow } from '../../../scene/flows/LegacyFlow';
import type { Phase } from '../../../scene/flows/Phase';
import { Transform } from '../Transform';
import { transformCompose } from './shaders';
import { TransformParamsSchema } from './TransformParams';

const TRANSFORM_POOL = Transform.schema.name;
const WORLD_POOL = Transform.worldSchema.name;
const WORKGROUP_SIZE = 64;

/**
 * Estágio de transformação — produz, na GPU, a matriz de mundo e a matriz de normais de
 * cada `Transform` a partir da sua intenção (posição, rotação, escala), com a convenção
 * `M = T · R · S`. O resultado fica no pool `WorldTransform` (mesmo slot do `Transform`),
 * que os estágios de sombra e desenho leem por índice de instância.
 *
 * Reativo: só grava o compute quando algum `Transform` foi enviado (`resourceReady`) ou
 * quando os pools foram realocados; numa cena parada, não faz nada.
 *
 * Substituível: é o estágio padrão da fase `transform`. Registrar outro Flow nessa fase
 * permite outras regras de transformação — é a base para a hierarquia opcional, para a
 * função `transform` do usuário e para cadeias não euclidianas do roadmap.
 */
export class TransformFlow extends Flow {
    readonly type = 'transform';
    readonly bodyType = '';
    readonly phase: Phase = 'transform';

    private needsDispatch = true;
    private kernel: ComputeKernel | null = null;
    private paramsBuffer: UniformBufferSpec | null = null;
    private paramsCount = -1;
    private readonly unsubscribe: Unsubscribe;

    constructor(
        private readonly core: EngineCore,
        private readonly pools: PoolDirectory,
        events: EventBus,
    ) {
        super();
        this.unsubscribe = events.on('resourceReady', (e) => {
            if (this.pools.poolKeyForResource(e.payload.resource) === TRANSFORM_POOL) {
                this.needsDispatch = true;
            }
        });
    }

    /** Pipeline de compute do estágio (introspecção). */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [
            {
                id: 'transform_compose',
                role: 'compute',
                shader: transformCompose,
                entryPoints: ['transform_compose_main'],
                consumes: [TRANSFORM_POOL],
            },
        ];
    }

    /** Pools realocados invalidam o kernel; tudo é recalculado no próximo quadro. */
    override onPoolReallocated(poolKey: string): void {
        if (poolKey !== TRANSFORM_POOL && poolKey !== WORLD_POOL) return;
        if (this.kernel !== null) destroyComputeKernel(this.core, this.kernel);
        this.kernel = null;
        this.needsDispatch = true;
    }

    /** Grava o compute de composição quando houve mudança desde o último quadro. */
    dispatch(frame: Frame): void {
        if (!this.needsDispatch) return;
        const count = this.pools.poolCount(TRANSFORM_POOL);
        if (count === 0) {
            this.needsDispatch = false;
            return;
        }
        const kernel = this.ensureKernel();
        if (kernel === null) return;
        this.writeParams(count);
        frame.compute('TransformFlow', (pass) => {
            pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroup);
            pass.dispatch.invocations(count, WORKGROUP_SIZE);
        });
        this.needsDispatch = false;
    }

    /** Descarte do estágio: cancela a inscrição em eventos e libera kernel e buffer de parâmetros. */
    override dispose(): void {
        this.unsubscribe();
        if (this.kernel !== null) destroyComputeKernel(this.core, this.kernel);
        if (this.paramsBuffer !== null) this.core.destroy(this.paramsBuffer);
        this.kernel = null;
        this.paramsBuffer = null;
        this.paramsCount = -1;
        this.needsDispatch = true;
    }

    private ensureKernel(): ComputeKernel | null {
        if (this.kernel !== null) return this.kernel;
        const transforms = this.pools.poolBufferSpec(TRANSFORM_POOL);
        const worlds = this.pools.poolBufferSpec(WORLD_POOL);
        if (transforms === undefined || worlds === undefined) return null;
        this.paramsBuffer ??= this.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'transform_compose_params',
            byteSize: TransformParamsSchema.stride,
        });
        this.kernel = createComputeKernel(this.core, {
            discriminator: 'transform_compose',
            shader: transformCompose,
            entryPoint: 'transform_compose_main',
            bindings: [
                { binding: 0, type: 'read-only-storage', buffer: transforms },
                { binding: 1, type: 'storage', buffer: worlds },
                { binding: 2, type: 'uniform', buffer: this.paramsBuffer },
            ],
        });
        return this.kernel;
    }

    private writeParams(count: number): void {
        if (this.paramsBuffer === null || count === this.paramsCount) return;
        this.core.write(this.paramsBuffer, TransformParamsSchema.pack({ count }));
        this.paramsCount = count;
    }
}
