import type { Frame } from '../../../../scene/contracts/gpu';

/** Passe de computação gravado: rótulo, offsets dinâmicos de cada `setBindGroup` e despachos. */
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
            const offsets: (readonly number[] | undefined)[] = [];
            const dispatches: (readonly number[])[] = [];
            const bind = {
                setPipeline: () => bind,
                setBindGroup: (_i: number, _bg: unknown, dyn?: readonly number[]) => {
                    offsets.push(dyn);
                    return bind;
                },
            };
            const dispatch = {
                workgroups: (...args: number[]) => {
                    dispatches.push(args);
                    return dispatch;
                },
                invocations: (...args: number[]) => {
                    dispatches.push(args);
                    return dispatch;
                },
            };
            body({ bind, dispatch });
            passes.push({ label, offsets, dispatches });
            sequence.push(`pass:${label}`);
        },
        copy: () => {
            state.copies++;
        },
        clear: (buffer: { discriminator?: string }, offset?: number) => {
            const at = offset === undefined ? '' : `@${offset}`;
            sequence.push(`clear:${buffer.discriminator ?? '?'}${at}`);
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

/** Primeiro offset dinâmico ligado no passe (região de parâmetros). */
export function paramsOffset(pass: RecordedPass): number | undefined {
    return pass.offsets[0]?.[0];
}
