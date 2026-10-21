import type { Frame } from '../../../scene/contracts/gpu';
import type { ResourceDirectory } from '../../../scene/contracts/ResourceDirectory';
import { Flow } from '../../../scene/flows/Flow';
import type { BoundFlow, TransitionContext } from '../../../scene/flows/FlowBinding';
import type { FlowContext } from '../../../scene/flows/FlowRegistry';
import type { FlowTransitions } from '../../../scene/flows/FlowTransitions';
import { slot, type EntitiesSlot, type PoolSlot, type SlotMap } from '../../../scene/flows/slots';
import { Geometry } from '../../geometry/Geometry';
import { Transform } from '../Transform';

/** Slots do estágio do histórico de movimento. */
export interface MotionHistorySlots extends SlotMap {
    /** Pool `WorldTransform` (o do quadro anterior, ainda intacto no início do quadro). */
    readonly worlds: PoolSlot<false>;
    /** Pool `PreviousWorldTransform` (saída: mesmo slot e layout). */
    readonly previous: PoolSlot<false>;
    /** Geometrias: as que têm vértices reescritos pela GPU guardam os do quadro anterior (`previousVertices`). */
    readonly geometries: EntitiesSlot;
}

const slots: MotionHistorySlots = {
    worlds: slot.pool(Transform.worldSchema.name),
    previous: slot.pool(Transform.previousWorldSchema.name),
    geometries: slot.entities({
        all: [Geometry],
        owns: [[Geometry, 'previousVertices']],
    }),
};

/**
 * Histórico de movimento (spec 034, R3): no início do quadro — fase `physics`, antes de qualquer solver ou do estágio de
 * transformação escreverem as matrizes de mundo — copia a `WorldTransform` de todos os slots para a
 * `PreviousWorldTransform`. Na geometria cujos vértices a GPU reescreve (superfícies, corpos moles, grafos), copia os
 * vértices para `previousVertices` antes de o produtor os reescrever, no quadro seguinte a cada um em que ele os produziu
 * (parada, os dois ficam iguais e a geometria não tem movimento). O passe de movimento do desenho compara as matrizes e
 * os vértices (vetores de movimento do antisserrilhado temporal). Cópias de buffer, sem kernel nem leitura de volta.
 */
export class MotionHistoryFlow extends Flow<MotionHistorySlots, 'idle'> {
    readonly type = 'MotionHistoryFlow';
    readonly slots = slots;
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<MotionHistorySlots>>;
    private readonly resources: ResourceDirectory;
    /** Geometrias cujos vértices anteriores ainda diferem dos atuais (produzidas no quadro passado ou recém-alocadas). */
    private stale = new Set<Geometry>();

    constructor(ctx: FlowContext) {
        super();
        this.resources = ctx.resources;
        this.transitions = {
            '*': {
                slotsResolved: 'ignore',
                entitiesChanged: 'ignore',
                slotLost: 'ignore',
                slotChanged: 'ignore',
                pipelinesCompiled: 'ignore',
                bindGroupReplaced: 'ignore',
                poolReallocated: 'ignore',
            },
        };
    }

    dispatch(frame: Frame, bound: BoundFlow<MotionHistorySlots>): void {
        const { worlds, previous, geometries } = bound.slots;
        const bytes = Math.min(worlds.count, previous.capacity) * worlds.stride;
        if (bytes > 0) frame.copy(worlds.buffer, previous.buffer, bytes, 0, 0);
        const stale = new Set<Geometry>();
        for (const entry of geometries.entries) {
            const geometry = entry.get(Geometry);
            if (!this.resources.hasGpuWriter(geometry, 'vertices')) continue;
            const known = this.resources.bufferOf(geometry, 'previousVertices');
            const history = known ?? this.resources.ensureAllocated(geometry, 'previousVertices');
            const vertices = this.resources.bufferOf(geometry, 'vertices');
            if (history?.subkind !== 'vertex' || vertices?.subkind !== 'vertex') continue;
            // Gravada antes do produtor, a cópia guarda os vértices do fim do quadro anterior. Só muda algo quando ele
            // os reescreveu no quadro passado; sem isso os anteriores já são os atuais.
            if (known === undefined || this.stale.has(geometry))
                frame.copy(vertices, history, Math.min(vertices.byteSize, history.byteSize), 0, 0);
            // As marcas de produção do quadro já estão feitas (todo `framePrepare` antes da gravação).
            if (this.resources.isProduced(geometry, 'vertices')) stale.add(geometry);
        }
        this.stale = stale;
    }
}
