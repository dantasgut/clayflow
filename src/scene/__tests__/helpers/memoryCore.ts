import { vi } from 'vitest';
import type { AnyBufferSpec, EngineCore, ResourceSpec } from '../../../core/contracts/index';
import { fakeResourceCore } from './fakeResourceCore';

/** Core falso com memória: `write` grava, `copy` copia e `readback` devolve o staging. */
export function memoryCore() {
    const fake = fakeResourceCore();
    const memory = new Map<ResourceSpec, Uint8Array>();
    const mem = (spec: ResourceSpec): Uint8Array => {
        let bytes = memory.get(spec);
        if (bytes === undefined) {
            bytes = new Uint8Array((spec as AnyBufferSpec).byteSize);
            memory.set(spec, bytes);
        }
        return bytes;
    };
    const copies: { size: number; srcOffset: number }[] = [];
    const core = fake.core as EngineCore & Record<string, unknown>;
    vi.mocked(core.write).mockImplementation((spec, data, offset) => {
        mem(spec).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset ?? 0);
    });
    vi.mocked(core.record).mockImplementation((label: unknown, body?: unknown) => {
        const fn = (typeof label === 'function' ? label : body) as (frame: unknown) => void;
        fn({
            copy: (src: ResourceSpec, dst: ResourceSpec, size: number, so = 0, d = 0) => {
                copies.push({ size, srcOffset: so });
                mem(dst).set(mem(src).subarray(so, so + size), d);
            },
        });
    });
    core.readback = vi.fn((spec: ResourceSpec) => Promise.resolve(mem(spec).slice().buffer));
    return { core, copies, bytesOf: mem };
}
