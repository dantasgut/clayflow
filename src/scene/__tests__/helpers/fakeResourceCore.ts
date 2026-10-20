import { vi } from 'vitest';
import type { EngineCore } from '../../../core/contracts/EngineCore';
import type { ResourceSpec } from '../../../core/contracts/index';
import { defaultCapabilities } from './defaultCapabilities';

/** Registro de uma escrita feita no core falso. */
export interface WriteCall {
    readonly spec: ResourceSpec;
    readonly bytes: Uint8Array;
    readonly offset: number;
}

/**
 * EngineCore falso para testes do ResourceSystem: `create` devolve o próprio spec,
 * `write` registra as chamadas (com cópia dos bytes) e `destroy` é um spy.
 */
export function fakeResourceCore(): {
    core: EngineCore;
    writes: WriteCall[];
    copies: { src: ResourceSpec; dst: ResourceSpec; size: number }[];
} {
    const writes: WriteCall[] = [];
    const copies: { src: ResourceSpec; dst: ResourceSpec; size: number }[] = [];
    const core = {
        create: vi.fn(<S>(spec: S) => spec),
        write: vi.fn((spec: ResourceSpec, data: ArrayBufferView, offset?: number) => {
            const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
            writes.push({ spec, bytes, offset: offset ?? 0 });
        }),
        destroy: vi.fn(),
        record: vi.fn((label: unknown, body?: unknown) => {
            const fn = (typeof label === 'function' ? label : body) as (frame: unknown) => void;
            fn({
                copy: (src: ResourceSpec, dst: ResourceSpec, size: number) => {
                    copies.push({ src, dst, size });
                },
            });
        }),
        submit: vi.fn(),
        canvasFormat: 'bgra8unorm',
        canvasOutput: { format: 'bgra8unorm', toneMapping: 'standard' },
        canvasOptions: {},
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
        takeFrameTimings: vi.fn(() => []),
        capabilities: vi.fn(defaultCapabilities),
        canvasSize: vi.fn(() => ({ width: 800, height: 600 })),
        framesInFlight: vi.fn(() => 0),
        onFrameRetired: vi.fn(() => () => undefined),
    } as unknown as EngineCore;
    return { core, writes, copies };
}

/** Lê o f32 na posição `index` dos bytes registrados. */
export function f32At(call: WriteCall, index: number): number {
    return new Float32Array(call.bytes.buffer, call.bytes.byteOffset, call.bytes.byteLength / 4)[
        index
    ]!;
}
