import { vi } from 'vitest';
import type { EngineCore, Frame, ResourceSpec } from '../../../core/contracts/index';

/**
 * EngineCore falso para testes de integração que precisam do quadro inteiro:
 * `create` devolve o spec; `write`, gravação de compute e de render ficam registrados
 * numa sequência única (`trace`) para verificar a ordem entre envio e estágios.
 */
export function fakeSceneCore(): { core: EngineCore; trace: string[] } {
    const trace: string[] = [];
    const disc = (spec: unknown): string =>
        (spec as { discriminator?: string }).discriminator ?? '?';
    const pass = {
        bind: {
            setPipeline: () => pass.bind,
            setBindGroup: () => pass.bind,
        },
        dispatch: { workgroups: () => pass.dispatch, workgroupsIndirect: () => pass.dispatch },
        geometry: { vertex: () => pass.geometry, index: () => pass.geometry },
        draw: { indexed: () => pass.draw, vertices: () => pass.draw },
        marker: () => undefined,
    };
    const frame = {
        canvasView: { kind: 'textureview', discriminator: 'canvas' },
        compute: (label: string, body: (p: unknown) => void) => {
            trace.push(`compute:${label}`);
            body(pass);
        },
        render: (_target: unknown, label: string, body: (p: unknown) => void) => {
            trace.push(`render:${label}`);
            body(pass);
        },
        copy: () => undefined,
    } as unknown as Frame;
    const core = {
        create: vi.fn(<S>(spec: S) => spec),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(spec)),
        write: vi.fn((spec: ResourceSpec) => {
            trace.push(`write:${disc(spec)}`);
        }),
        destroy: vi.fn(),
        record: vi.fn((label: unknown, body?: unknown) => {
            const fn = typeof label === 'function' ? label : body;
            (fn as (f: Frame) => void)(frame);
        }),
        submit: vi.fn(),
        canvasFormat: 'bgra8unorm',
        profiler: { isSupported: false, timestampWritesFor: () => undefined },
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
    } as unknown as EngineCore;
    return { core, trace };
}
