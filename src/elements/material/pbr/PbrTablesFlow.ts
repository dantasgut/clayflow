import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource, BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { Frame } from '../../../scene/contracts/gpu';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { Flow } from '../../../scene/flows/Flow';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type SingletonSlot, type SlotMap } from '../../../scene/flows/slots';
import { PBR_DFG_SIZE, PbrTables } from './PbrTables';
import { pbrDfgBuild, pbrDfgOutResource } from './shaders';

/** Slots do estágio das tabelas. */
export interface PbrTablesSlots extends SlotMap {
    /** As tabelas da cena. */
    readonly tables: SingletonSlot<false>;
}

const slots: PbrTablesSlots = { tables: slot.singleton(PbrTables.schema) };

type Ctx = TransitionContext<PbrTablesSlots>;

/** Kernel da integração. */
const BUILD: PipelineDescriptor = {
    id: 'pbr_dfg_build',
    role: 'compute',
    shader: pbrDfgBuild,
    entryPoints: ['pbr_dfg_build'],
};

/**
 * Estágio das tabelas do sombreamento físico (spec 011): integra a tabela DFG do `PbrTables` na GPU no primeiro quadro
 * em que o estágio grava com as tabelas presentes, e nunca mais — um `PbrTables` novo volta a pedir a integração. Fase
 * `transform`, antes de qualquer desenho.
 */
export class PbrTablesFlow extends Flow<PbrTablesSlots, 'idle'> {
    readonly type = 'PbrTablesFlow';
    readonly slots = slots;
    override readonly bindings: ReadonlyMap<WgslResource, BindingSource> = new Map();
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx>;

    /** A tabela ainda não foi integrada para a textura ligada. */
    private pending = true;
    /** Gravar a integração neste quadro (decidido no `framePrepare`). */
    private build = false;
    /** Textura da tabela ligada à saída do kernel (outra textura: integra de novo). */
    private bound: unknown;

    constructor() {
        super();
        this.transitions = {
            '*': {
                framePrepare: {
                    to: 'idle',
                    run: (_e, c) => {
                        const view = c.bound.slots.tables.textureViewOf('dfg');
                        if (view !== undefined && view !== this.bound) {
                            c.bind(new Map([[pbrDfgOutResource, view]]));
                            // Preparado depois da primeira ligação (a saída é privada e só existe com as tabelas).
                            if (this.bound === undefined) c.prepare(BUILD);
                            this.bound = view;
                            this.pending = true;
                        }
                        this.build = this.pending && this.bound !== undefined;
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

    /** Grava a integração da tabela (uma vez por `PbrTables`: gravada, deixa de estar pendente). */
    dispatch(frame: Frame, bound: BoundFlow<PbrTablesSlots>): void {
        const p = bound.pipelines.get(BUILD.id);
        if (!this.build || p?.role !== 'compute' || !p.ready) return;
        frame.compute('PbrTablesFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind);
            pass.dispatch.invocations(PBR_DFG_SIZE * PBR_DFG_SIZE, WORKGROUP_SIZE.value);
        });
        this.pending = false;
        this.build = false;
    }
}
