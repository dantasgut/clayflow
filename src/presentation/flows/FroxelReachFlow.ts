import type { Frame } from '../../scene/contracts/gpu';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { Flow } from '../../scene/flows/Flow';
import {
    slot,
    type ChannelSlot,
    type SingletonSlot,
    type SlotMap,
    type TextureSlot,
} from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { ResourceDirectory } from '../../scene/contracts/ResourceDirectory';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import { Froxels } from '../../elements/media/Froxels';
import { froxelReachDepth, froxelReachKernel, froxelReachSlot } from '../../elements/media/shaders';
import { FrameTargets } from '../app/FrameTargets';

/** Slots da redução do alcance. */
export interface FroxelReachSlots extends SlotMap {
    /** Os froxels da cena (o uniforme: a câmera, a névoa; a palavra do máximo). */
    readonly froxels: SingletonSlot<false>;
    /** Os alvos do quadro (as amostras da profundidade). */
    readonly targets: SingletonSlot<true>;
    /** A profundidade da cena depois de todas as superfícies. */
    readonly depth: TextureSlot<true>;
    /** O alcance: a série escrita aqui e lida pela grade do quadro seguinte (spec 037). */
    readonly froxelReach: ChannelSlot<false>;
}

type Ctx = TransitionContext<FroxelReachSlots>;

/** Ids dos pipelines (a redução e a decisão) pelas amostras da profundidade. */
const kernelIds = (multisampled: boolean): readonly [string, string] => [
    `froxel_reach_reduce${multisampled ? '_ms' : ''}`,
    `froxel_reach_final${multisampled ? '_ms' : ''}`,
];

/**
 * FroxelReachFlow — o alcance da câmera (spec 041, R21; Camada 4, fase `forward`, depois da última superfície que
 * escreve profundidade). A maior distância da câmera ativa até a profundidade da cena (o fundo: infinita) e, com ela, a
 * decisão da GPU sobre o meio contínuo nos froxels do quadro seguinte (`Froxels.reach`, série da 037): numa sala fechada
 * o ar do caminho mais longo tem profundidade ótica de 10⁻⁷ e a grade não refaz a atmosfera (grava a tabela); com o céu
 * ou uma paisagem à vista, refaz. Só com a grade em uso.
 */
export class FroxelReachFlow extends Flow<FroxelReachSlots, 'idle'> {
    readonly type = 'FroxelReachFlow';
    readonly slots: FroxelReachSlots = {
        froxels: slot.singleton(Froxels.schema),
        targets: slot.singleton(FrameTargets.schema, { optional: true }),
        depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        ...froxelReachSlot,
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly resources: ResourceDirectory;
    private readonly prepared = new Set<string>();
    private current: readonly [string, string] | undefined;
    private boundDepth: unknown;

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                poolReallocated: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
            },
        };
    }

    /** A redução da profundidade e a decisão, num passe; a série gira. */
    dispatch(frame: Frame, bound: BoundFlow<FroxelReachSlots>): void {
        const depth = bound.slots.depth;
        if (this.current === undefined || depth === undefined) return;
        const reduce = bound.pipelines.get(this.current[0]);
        const final = bound.pipelines.get(this.current[1]);
        if (
            reduce?.role !== 'compute'
            || !reduce.ready
            || final?.role !== 'compute'
            || !final.ready
        )
            return;
        const { width, height } = depth.texture;
        frame.compute('FroxelReachFlow', (pass) => {
            pass.bind.setPipeline(reduce.spec);
            reduce.bindTo(pass.bind);
            // Um bloco de 4 × 4 pixels por invocação (`FROXEL_REACH_BLOCK`).
            pass.dispatch.invocations(
                Math.ceil(width / 4) * Math.ceil(height / 4),
                WORKGROUP_SIZE.value,
            );
            pass.bind.setPipeline(final.spec);
            final.bindTo(pass.bind);
            pass.dispatch.invocations(1, 1);
        });
        bound.slots.froxelReach.written();
    }

    /** Com a grade em uso e a profundidade: liga a profundidade e prepara a redução pelas amostras dela. */
    private prepare(c: Ctx): void {
        this.current = undefined;
        const froxels = c.bound.slots.froxels.resource as Froxels;
        const targets = c.bound.slots.targets?.resource as FrameTargets | undefined;
        const depth = c.bound.slots.depth;
        if (!froxels.lookup || targets === undefined || depth === undefined) return;
        this.resources.ensureAllocated(froxels, 'reach');
        const multisampled = targets.samples > 1;
        if (depth.view !== this.boundDepth) {
            c.bind(
                new Map<WgslResource, BindingSource>([
                    [
                        multisampled ? froxelReachDepth.multisampled : froxelReachDepth.single,
                        depth.view,
                    ],
                ]),
            );
            this.boundDepth = depth.view;
        }
        const ids = kernelIds(multisampled);
        ids.forEach((id, k) => {
            if (this.prepared.has(id)) return;
            this.prepared.add(id);
            c.prepare({
                id,
                role: 'compute',
                shader: froxelReachKernel(multisampled),
                entryPoints: [k === 0 ? 'froxel_reach_reduce_main' : 'froxel_reach_final_main'],
            });
        });
        this.current = ids;
    }
}
