import { vi, type Mock } from 'vitest';
import { FieldType } from '../../descriptors/FieldType';
import { StructSchema } from '../../descriptors/StructSchema';
import { wgslModule } from '../../shaders/WgslModule';
import { POINT_PARAMS } from '../../shaders/WgslPoint';
import {
    defineSetNode,
    setPointInput,
    setType,
    type SetNodeContext,
    type SetNodeInstance,
} from '../SetNode';

// Nós de conjunto de prova (spec 031, US3): uma fonte, um mapa com entrada de ponto e um filtro com contagem da GPU.

export const ProbeNumSchema = new StructSchema('ProbeNum', { v: FieldType.f32 });
export const NUMS = setType('nums', { values: ProbeNumSchema });
export const OTHER = setType('other', { values: ProbeNumSchema });

/** O que cada instância criada recebeu e gravou. */
export interface ProbeInstance extends SetNodeInstance {
    readonly ctx: SetNodeContext;
    readonly update: Mock<() => void>;
    readonly record: Mock<(frame: unknown) => void>;
    readonly dispose: Mock<() => void>;
}

export const created: ProbeInstance[] = [];

function instance(ctx: SetNodeContext): ProbeInstance {
    const i: ProbeInstance = {
        ctx,
        update: vi.fn<() => void>(),
        record: vi.fn<(frame: unknown) => void>(),
        dispose: vi.fn<() => void>(),
    };
    created.push(i);
    return i;
}

export const source = defineSetNode({
    name: 'probe.source',
    outputs: { out: NUMS },
    params: { n: { type: 'u32', default: 8 } },
    capacity: ({ values }) => ({ 'out.values': values.n as number }),
    create: instance,
});

/** Ponto do peso por elemento: `probe_weight_fn(x, data) -> f32`; o kernel chama `probe_weight(x)`. */
export const weightTarget = {
    name: 'probe_weight',
    required: {
        name: 'probe_weight_fn',
        params: ['f32', POINT_PARAMS],
        returns: 'f32',
        names: ['x', 'data'],
    },
    context: 'compute' as const,
    paramsAlias: 'ProbeWeightParams',
};
export const weightAt = {
    name: 'probe_weight_at',
    ready: wgslModule({
        name: 'probe_weight_ready',
        source: 'fn probe_weight(x: f32) -> f32 { return 1.0; }',
    }),
};

export const map = defineSetNode({
    name: 'probe.map',
    inputs: { in: NUMS, weight: setPointInput(weightTarget, weightAt, 'probe_weight') },
    outputs: { out: NUMS },
    capacity: (c) => ({ 'out.values': c.input('in', 'values') }),
    counts: { 'out.values': { same: 'in.values' } },
    create: instance,
});

export const filter = defineSetNode({
    name: 'probe.filter',
    inputs: { in: NUMS },
    outputs: { out: NUMS },
    params: { keep: { type: 'f32', default: 0.5 } },
    capacity: (c) => ({ 'out.values': c.input('in', 'values') }),
    counts: { 'out.values': 'gpu' },
    create: instance,
});

export const sink = defineSetNode({
    name: 'probe.sink',
    inputs: { in: NUMS },
    animated: false,
    create: instance,
});

export const clock = defineSetNode({
    name: 'probe.clock',
    outputs: { out: NUMS },
    capacity: () => ({ 'out.values': 4 }),
    animated: true,
    create: instance,
});

export const other = defineSetNode({
    name: 'probe.other',
    outputs: { out: OTHER },
    capacity: () => ({ 'out.values': 4 }),
    create: instance,
});
