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
import { Sky } from '../../elements/scene/sky/Sky';
import { skySunTrackSlots } from '../../elements/scene/sky/shaders';
import { TemporalAntialiasing } from '../../elements/scene/TemporalAntialiasing';
import { FrameTargets } from '../app/FrameTargets';
import { skyReactive } from './shaders';

/** Slots da máscara reativa do disco do sol. */
export interface SkyReactiveSlots extends SlotMap {
    /** O céu (o sol de agora, o disco, a câmera). */
    readonly sky: SingletonSlot<false>;
    /** A direção do sol do quadro anterior (série `Sky.sunTrack`, spec 037). */
    readonly skySunTrack: ChannelSlot<false>;
    /** A máscara reativa (`FrameTargets.reactive`, só sem MSAA). Opcional: sem ela o estágio não roda. */
    readonly reactive: TextureSlot<true>;
    /** A profundidade da cena (o fundo é o que ficou no plano distante). */
    readonly depth: TextureSlot<true>;
    /** O antisserrilhado da cena: só o temporal guarda histórico. */
    readonly antialiasing: SingletonSlot<true>;
}

type Ctx = TransitionContext<SkyReactiveSlots>;

/** Id do pipeline. */
const PIPELINE = 'sky_reactive';

/**
 * SkyReactiveFlow — a máscara reativa do disco do sol (spec 041; Camada 4).
 *
 * O disco do sol anda no fundo sem vetor de movimento (o fundo é reprojetado pela câmera), e o histórico parado da
 * resolução temporal guardava por onde ele passou: um traço claro ao longo do caminho do sol (o vídeo `solposto`). Na
 * fase `forward`, depois do fundo, com o antisserrilhado temporal: um retângulo em volta do disco de agora e do disco do
 * quadro anterior (a série `Sky.sunTrack`) marca na máscara reativa (`FrameTargets.reactive`, mistura pelo máximo com
 * o que a refração marca) os pixels do fundo desses discos, com margem — sobre o disco de agora a resolução temporal
 * recorta o histórico como em movimento (as nuvens na frente dele seguem acumulando); onde só o anterior estava, o
 * histórico recomeça. Sem o temporal, sem a máscara ou sem disco, nada.
 */
export class SkyReactiveFlow extends Flow<SkyReactiveSlots, 'idle'> {
    readonly type = 'SkyReactiveFlow';
    readonly slots: SkyReactiveSlots = {
        sky: slot.singleton(Sky.schema),
        ...skySunTrackSlots,
        reactive: slot.texture(FrameTargets.schema, 'reactive', { optional: true }),
        depth: slot.texture(FrameTargets.schema, 'depth', { optional: true }),
        antialiasing: slot.singleton(TemporalAntialiasing.schema, { optional: true }),
    };
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    /** Pipeline preparado. */
    private prepared = false;
    /** A profundidade ligada (outra = religa: redimensionamento). */
    private boundDepth: unknown;

    constructor() {
        super();
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                poolReallocated: 'ignore',
                slotLost: 'ignore',
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

    /** Marca os discos de agora e do quadro anterior na máscara. */
    dispatch(frame: Frame, bound: BoundFlow<SkyReactiveSlots>): void {
        const aa = bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const mask = bound.slots.reactive;
        const prepared = bound.pipelines.get(PIPELINE);
        if (
            aa?.mode !== 'temporal'
            || mask === undefined
            || prepared?.role !== 'render'
            || !prepared.ready
        )
            return;
        frame.render(
            { colorAttachments: [{ view: mask.view, loadOp: 'load', storeOp: 'store' }] },
            'SkyReactiveFlow',
            (pass) => {
                pass.bind.setPipeline(prepared.spec);
                prepared.bindTo(pass.bind);
                pass.draw.vertices(6);
            },
        );
    }

    /** Com o antisserrilhado temporal e a máscara: liga a profundidade (quando muda) e prepara o pipeline. */
    private prepare(c: Ctx): void {
        const aa = c.bound.slots.antialiasing?.resource as TemporalAntialiasing | undefined;
        const depth = c.bound.slots.depth;
        if (aa?.mode !== 'temporal' || c.bound.slots.reactive === undefined || depth === undefined)
            return;
        if (depth.view !== this.boundDepth) {
            c.bind(new Map<WgslResource, BindingSource>([[skyReactive.depth, depth.view]]));
            this.boundDepth = depth.view;
        }
        if (this.prepared) return;
        this.prepared = true;
        c.prepare({
            id: PIPELINE,
            role: 'render',
            shader: skyReactive.module,
            entryPoints: ['sky_reactive_vs', 'sky_reactive_fs'],
            topology: 'triangle-list',
            cullMode: 'none',
            colorTargets: [
                {
                    format: 'r8unorm',
                    // O máximo com o que outro estágio marcou no quadro (a refração recomeça, o disco recorta).
                    blend: {
                        color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
                    },
                },
            ],
        });
    }
}
