import { vi } from 'vitest';
import type { EngineCore, Frame, ResourceSpec } from '../../../core/contracts/index';
import { defaultCapabilities } from './defaultCapabilities';

/** Contagens acumuladas pelo `countingCore`. */
export interface CoreCounts {
    /** `create`/`createAsync` por chave `kind[/subkind]` (ex.: `buffer/uniform`, `bindgroup`). */
    readonly creates: ReadonlyMap<string, number>;
    /** `write` por discriminator desde o último `resetFrame()`. */
    readonly writes: ReadonlyMap<string, number>;
    /** Specs criados durante a gravação (`frame.compute`/`frame.render`) — violação de "dispatch só grava". */
    readonly createdWhileRecording: readonly ResourceSpec[];
    /** Total de `create`/`createAsync`. */
    readonly totalCreates: number;
}

/**
 * EngineCore de contagem (double da C1) para os critérios da 006: conta criações por tipo de spec e escritas por
 * spec, e registra qualquer criação feita enquanto um passe está sendo gravado. `create` devolve o spec, como os
 * demais doubles; o quadro executa os corpos de passe com um pass inerte.
 */
export function countingCore(): {
    core: EngineCore;
    frame: Frame;
    stats(): CoreCounts;
    /** Zera as escritas (início de quadro). As criações acumulam até `reset()`. */
    resetFrame(): void;
    reset(): void;
} {
    const creates = new Map<string, number>();
    const writes = new Map<string, number>();
    const createdWhileRecording: ResourceSpec[] = [];
    let recording = 0;
    let totalCreates = 0;

    const keyOf = (spec: unknown): string => {
        const s = spec as { kind?: string; subkind?: string };
        return s.subkind === undefined ? (s.kind ?? '?') : `${s.kind ?? '?'}/${s.subkind}`;
    };
    const countCreate = (spec: unknown): void => {
        totalCreates++;
        const key = keyOf(spec);
        creates.set(key, (creates.get(key) ?? 0) + 1);
        if (recording > 0) createdWhileRecording.push(spec as ResourceSpec);
    };
    const disc = (spec: unknown): string =>
        (spec as { discriminator?: string }).discriminator ?? '?';

    const pass = {
        bind: {
            setPipeline: () => pass.bind,
            setBindGroup: () => pass.bind,
        },
        dispatch: {
            workgroups: () => pass.dispatch,
            invocations: () => pass.dispatch,
            workgroupsIndirect: () => pass.dispatch,
        },
        geometry: { vertex: () => pass.geometry, index: () => pass.geometry },
        draw: { indexed: () => pass.draw, vertices: () => pass.draw },
        marker: () => undefined,
    };
    const inPass = (body: (p: unknown) => void): void => {
        recording++;
        try {
            body(pass);
        } finally {
            recording--;
        }
    };
    const frame = {
        canvasView: { kind: 'textureview', discriminator: 'canvas' },
        compute: (_label: string, body: (p: unknown) => void) => {
            inPass(body);
        },
        render: (_target: unknown, _label: string, body: (p: unknown) => void) => {
            inPass(body);
        },
        copy: () => undefined,
        clear: () => undefined,
    } as unknown as Frame;

    const core = {
        create: vi.fn(<S>(spec: S) => {
            countCreate(spec);
            return spec;
        }),
        createAsync: vi.fn(<S>(spec: S) => {
            countCreate(spec);
            return Promise.resolve(spec);
        }),
        write: vi.fn((spec: ResourceSpec) => {
            const d = disc(spec);
            writes.set(d, (writes.get(d) ?? 0) + 1);
        }),
        destroy: vi.fn(),
        record: vi.fn((label: unknown, body?: unknown) => {
            const fn = typeof label === 'function' ? label : body;
            (fn as (f: Frame) => void)(frame);
        }),
        submit: vi.fn(),
        initialize: vi.fn(() => Promise.resolve()),
        reconfigureCanvas: vi.fn(),
        requestRecover: vi.fn(() => Promise.resolve()),
        onDeviceLost: vi.fn(() => () => undefined),
        shutdown: vi.fn(),
        memoryUsage: vi.fn(() => ({ bufferBytes: 0, textureBytes: 0, totalBytes: 0, top: [] })),
        canvasFormat: 'bgra8unorm',
        profiler: { isSupported: false, timestampWritesFor: () => undefined },
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
        capabilities: vi.fn(defaultCapabilities),
        canvasSize: vi.fn(() => ({ width: 800, height: 600 })),
        framesInFlight: vi.fn(() => 0),
        onFrameRetired: vi.fn(() => () => undefined),
    } as unknown as EngineCore;

    return {
        core,
        frame,
        stats: () => ({
            creates: new Map(creates),
            writes: new Map(writes),
            createdWhileRecording: [...createdWhileRecording],
            totalCreates,
        }),
        resetFrame: () => {
            writes.clear();
        },
        reset: () => {
            creates.clear();
            writes.clear();
            createdWhileRecording.length = 0;
            totalCreates = 0;
        },
    };
}
