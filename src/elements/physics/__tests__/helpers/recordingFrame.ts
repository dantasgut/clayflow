import type { Frame } from '../../../../scene/contracts/gpu';

/**
 * Trecho de computação gravado: um passe, ou dentro dele cada trecho aberto por `marker` (os despachos de um passe
 * com vários kernels) — rótulo, offsets dinâmicos de cada `setBindGroup` e despachos.
 */
export interface RecordedPass {
    readonly label: string;
    readonly offsets: readonly (readonly number[] | undefined)[];
    readonly dispatches: readonly (readonly number[])[];
}

/**
 * Frame que registra cada passe de computação, os offsets dinâmicos ligados e as cópias; `sequence` traz passes e
 * `clear` na ordem gravada (`pass:<rótulo>`, `clear:<discriminator>` ou `clear:<discriminator>@<offset>`).
 */
export function recordingFrame(): {
    frame: Frame;
    passes: RecordedPass[];
    sequence: string[];
    readonly copies: number;
} {
    const passes: RecordedPass[] = [];
    const sequence: string[] = [];
    const state = { copies: 0 };
    const frame = {
        compute: (label: string, body: (pass: unknown) => void) => {
            let current = {
                label,
                offsets: [] as (readonly number[] | undefined)[],
                dispatches: [] as (readonly number[])[],
            };
            const segments = [current];
            const bind = {
                setPipeline: () => bind,
                setBindGroup: (_i: number, _bg: unknown, dyn?: readonly number[]) => {
                    current.offsets.push(dyn);
                    return bind;
                },
            };
            const dispatch = {
                workgroups: (...args: number[]) => {
                    current.dispatches.push(args);
                    return dispatch;
                },
                invocations: (...args: number[]) => {
                    current.dispatches.push(args);
                    return dispatch;
                },
                workgroupsIndirect: (_spec: unknown, offset?: number) => {
                    current.dispatches.push([-1, offset ?? 0]);
                    return dispatch;
                },
            };
            const marker = (name: string): void => {
                current = { label: name, offsets: [], dispatches: [] };
                segments.push(current);
            };
            body({ bind, dispatch, marker });
            // O passe só conta pelo próprio rótulo quando despacha antes do primeiro marcador.
            for (const [k, seg] of segments.entries()) {
                if (k === 0 && segments.length > 1 && seg.dispatches.length === 0) continue;
                passes.push(seg);
                sequence.push(`pass:${seg.label}`);
            }
        },
        copy: () => {
            state.copies++;
        },
        clear: (buffer: { discriminator?: string }, offset?: number) => {
            const at = offset === undefined ? '' : `@${offset}`;
            sequence.push(`clear:${buffer.discriminator ?? '?'}${at}`);
        },
        marker: (_label: string, body: () => void) => {
            body();
        },
    } as unknown as Frame;
    return {
        frame,
        passes,
        sequence,
        get copies() {
            return state.copies;
        },
    };
}

/** Quantos passes com o rótulo dado. */
export function countPasses(passes: readonly RecordedPass[], label: string): number {
    return passes.filter((p) => p.label === label).length;
}

/**
 * Primeiro offset dinâmico ligado no passe (região de parâmetros) — no grupo que o leva, qualquer que seja o índice
 * (spec 031: o grupo vem da frequência do recurso).
 */
export function paramsOffset(pass: RecordedPass): number | undefined {
    return pass.offsets.find((o) => o !== undefined)?.[0];
}
