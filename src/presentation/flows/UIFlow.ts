import type { EngineCore, Frame, RenderTarget } from '../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import type { BindingSource, BoundFlow, TransitionContext } from '../../scene/flows/FlowBinding';
import type { FlowContext } from '../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../scene/flows/FlowTransitions';
import { RenderFlow } from '../../scene/flows/RenderFlow';
import { slot, type SlotMap, type TargetSlot } from '../../scene/flows/slots';
import type { WgslResource } from '../../scene/shaders/WgslResource';
import { UiTree } from '../ui/UiTree';
import type { LoadedFont } from '../assets/FontLoader';
import { UiFlattener } from '../ui/flatten/UiFlattener';
import { UiTextLayout } from '../ui/flatten/UiTextLayout';
import { UiGpuPipeline } from '../ui/UiGpuPipeline';
import { ui, uiResources } from './shaders';

/** Slots da UI. */
export interface UISlots extends SlotMap {
    /** O canvas do quadro (a UI carrega o conteúdo e desenha por cima). */
    readonly target: TargetSlot;
}

const slots: UISlots = {
    target: slot.target('canvas'),
};

type Ctx = TransitionContext<UISlots>;

const PIPELINE = 'ui:quads';

/**
 * UIFlow — desenha a árvore de UI (`UiTree`) por cima do canvas (carrega o conteúdo, `loadOp: 'load'`).
 *
 * Coordenação: a árvore é achatada em quads (`UiFlattener`/`UiTextLayout`) e enviada em `framePrepare`; o atlas da
 * fonte, quando muda, é religado na mesma transição. Os recursos (tela, quads, atlas, sampler) são privados
 * (`UiGpuPipeline`), ligados pelos recursos declarados (`uiResources`); o pipeline e o bind group são da C2.
 */
export class UIFlow extends RenderFlow<UISlots, 'idle'> {
    readonly type = 'UIFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource>;
    override readonly pipelines: readonly PipelineDescriptor[];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<UISlots>>;

    private readonly core: EngineCore;
    private readonly tree = new UiTree();
    private readonly flattener = new UiFlattener();
    private readonly gpu: UiGpuPipeline;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.gpu = new UiGpuPipeline(ctx.core);
        this.bindings = this.gpu.sources();
        this.pipelines = [
            {
                id: PIPELINE,
                role: 'render',
                shader: ui,
                entryPoints: ['vs_main', 'fs_main'],
                topology: 'triangle-list',
                colorTargets: [
                    {
                        format: ctx.core.canvasFormat,
                        blend: {
                            color: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                        },
                    },
                ],
            },
        ];
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.prepare(c);
                    },
                },
                slotsResolved: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                canvasReconfigured: 'ignore',
            },
        };
    }

    /** Acesso à árvore de UI — adicione panels/labels/buttons via `ui.add(...)`. */
    get ui(): UiTree {
        return this.tree;
    }

    /**
     * Define a fonte usada pelo UI (atlas + texture). Chamado uma vez
     * após carregar a fonte via `Application.assets.loadFont(url)`.
     */
    setFont(font: LoadedFont): this {
        this.gpu.setFont(font);
        this.flattener.setTextLayout(new UiTextLayout(font));
        return this;
    }

    /** Grava os quads enviados em `framePrepare`. */
    dispatch(frame: Frame, bound: BoundFlow<UISlots>): void {
        const count = this.gpu.quadCount;
        const canvas = this.colorView(frame, bound.slots.target);
        const prepared = bound.pipelines.get(PIPELINE);
        if (count === 0 || canvas === undefined || prepared?.role !== 'render' || !prepared.ready)
            return;
        const target: RenderTarget = {
            colorAttachments: [{ view: canvas, loadOp: 'load', storeOp: 'store' }],
        };
        frame.render(target, 'UIFlow', (pass) => {
            pass.bind.setPipeline(prepared.spec);
            prepared.bindTo(pass.bind);
            pass.draw.vertices(count * 6);
        });
    }

    /** Libera os objetos de GPU da UI. */
    override dispose(): void {
        this.gpu.dispose();
    }

    /** Antes da gravação: atlas novo religado, árvore achatada e enviada. */
    private prepare(ctx: Ctx): void {
        const atlas = this.gpu.takeAtlasChange();
        if (atlas !== undefined) ctx.bind(new Map([[uiResources.atlas, atlas]]));
        const quads = this.tree.root.children.length === 0 ? [] : this.flattener.flatten(this.tree);
        const size = this.core.canvasSize();
        this.gpu.upload(quads, [size?.width ?? 0, size?.height ?? 0]);
    }
}
