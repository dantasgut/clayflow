import type { BindingSource, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { EngineCore, TextureSpec } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import { Flow } from '../../../scene/flows/Flow';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import { EnvironmentMap } from './EnvironmentMap';

/** Slots do estágio da imagem do mundo. */
export interface EnvironmentMapSlots extends SlotMap {
    /** A imagem do mundo da cena. */
    readonly environment: SingletonSlot<false>;
}

const slots: EnvironmentMapSlots = { environment: slot.singleton(EnvironmentMap.schema) };

type Ctx = TransitionContext<EnvironmentMapSlots>;

/** Bytes por pixel da textura (RGBA16F). */
const BYTES_PER_PIXEL = 4 * Uint16Array.BYTES_PER_ELEMENT;

/**
 * Estágio da imagem do mundo (spec 039 refeita): no preparo do quadro, grava os pixels do `EnvironmentMap` na textura
 * dele quando ela é nova (a primeira vez, ou realocada) — uma escrita só; nenhum despacho. Fase `transform`, antes de
 * quem a amostra (o desenho, o traçado, a luz global).
 */
export class EnvironmentMapFlow extends Flow<EnvironmentMapSlots, 'idle'> {
    readonly type = 'EnvironmentMapFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    private readonly core: EngineCore;
    private readonly resources: ResourceDirectory;
    /** A textura já gravada (outra = grava de novo). */
    private written: TextureSpec | undefined;

    constructor(ctx: FlowContext) {
        super();
        this.core = ctx.core;
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        this.upload(c.bound.slots.environment.resource as EnvironmentMap);
                    },
                },
                slotsResolved: 'ignore',
                slotChanged: 'ignore',
                slotLost: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
            },
        };
    }

    /** Nenhum despacho: a imagem é escrita no preparo. */
    dispatch(): void {}

    private upload(environment: EnvironmentMap): void {
        const texture = this.resources.textureOf(environment, 'image');
        if (texture === undefined || texture === this.written) return;
        this.core.writeTexture(
            texture,
            environment.halfPixels,
            { bytesPerRow: environment.width * BYTES_PER_PIXEL, rowsPerImage: environment.height },
            { width: environment.width, height: environment.height },
        );
        this.written = texture;
    }
}
