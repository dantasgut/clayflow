import { vi } from 'vitest';
import type { EngineCore, ResourceSpec } from '../../../../scene/contracts/gpu';
import { createScene, type SceneContext } from '../../../../scene/SceneContext';
import { defaultCapabilities } from '../../../../scene/__tests__/helpers/defaultCapabilities';
import type { WriteCall } from '../../../../scene/__tests__/helpers/fakeResourceCore';
import { ELEMENT_CONSUMERS } from '../../../consumers';
import { recordingFrame, type RecordedPass } from './recordingFrame';

/**
 * Cena real (C2) para testar um solver no modelo de slots: core falso (`create` devolve o spec, `write` registra
 * bytes, `record` grava os passes num `recordingFrame`), resolvers da C3, `Time` inserido e `step(dt)` avançando o
 * relógio como `Application.step` (`time.advance` + `frameTick`). `step` devolve os passes gravados no quadro;
 * `createdWhileRecording()` conta criações feitas durante a gravação (deve ficar 0). Acessos por função: o objeto pode
 * ser espalhado (`{ ...s }`) sem congelar os valores.
 */
export async function solverScene(): Promise<{
    scene: SceneContext;
    core: EngineCore;
    writes: WriteCall[];
    step(dt?: number): RecordedPass[];
    /** Passes e `clear` do último quadro, em ordem (`pass:<rótulo>`, `clear:<discriminator>[@offset]`). */
    sequence(): readonly string[];
    /** Cópias gravadas no último quadro. */
    copies(): number;
    /** Conteúdo devolvido por `core.readback` (padrão: buffer vazio). */
    readbackWith(produce: (spec: unknown) => ArrayBuffer): void;
    /** Objetos de GPU criados durante a gravação de algum quadro (deve ficar 0). */
    createdWhileRecording(): number;
}> {
    const writes: WriteCall[] = [];
    let recording = false;
    let createdWhileRecording = 0;
    let passes: RecordedPass[] = [];
    let sequence: readonly string[] = [];
    let copies = 0;
    let produce: (spec: unknown) => ArrayBuffer = () => new ArrayBuffer(0);
    const created = (spec: unknown) => {
        if (recording) createdWhileRecording++;
        return spec;
    };
    const core = {
        create: vi.fn(<S>(spec: S) => created(spec) as S),
        shaderMessages: vi.fn(() => Promise.resolve([])),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(created(spec) as S)),
        write: vi.fn((spec: ResourceSpec, data: ArrayBufferView, offset?: number) => {
            const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
            writes.push({ spec, bytes, offset: offset ?? 0 });
        }),
        destroy: vi.fn(),
        record: vi.fn((label: unknown, body?: unknown) => {
            const fn = (typeof label === 'function' ? label : body) as (frame: unknown) => void;
            const rec = recordingFrame();
            recording = true;
            try {
                fn(rec.frame);
            } finally {
                recording = false;
            }
            passes = rec.passes;
            sequence = rec.sequence;
            copies = rec.copies;
        }),
        readback: vi.fn((spec: unknown) => Promise.resolve(produce(spec))),
        submit: vi.fn(),
        initialize: vi.fn(() => Promise.resolve()),
        reconfigureCanvas: vi.fn(),
        requestRecover: vi.fn(() => Promise.resolve()),
        onDeviceLost: vi.fn(() => () => undefined),
        shutdown: vi.fn(),
        withErrorScope: vi.fn(<T>(_f: unknown, body: () => T) => Promise.resolve(body())),
        memoryUsage: vi.fn(() => ({ bufferBytes: 0, textureBytes: 0, totalBytes: 0, top: [] })),
        canvasFormat: 'bgra8unorm',
        canvasOutput: { format: 'bgra8unorm', toneMapping: 'standard' },
        canvasOptions: {},
        profiler: { isSupported: false, timestampWritesFor: () => undefined },
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
        takeFrameTimings: vi.fn(() => []),
        capabilities: vi.fn(defaultCapabilities),
        canvasSize: vi.fn(() => ({ width: 800, height: 600 })),
        framesInFlight: vi.fn(() => 0),
        onFrameRetired: vi.fn(() => () => undefined),
    } as unknown as EngineCore;
    const scene = createScene({ core });
    await scene.initialize();
    for (const resolver of ELEMENT_CONSUMERS) scene.consumers.registerDefault(resolver);
    let frame = 0;
    return {
        scene,
        core,
        writes,
        step(dt = 1 / 60) {
            frame++;
            scene.time.advance(dt);
            passes = [];
            scene.events.emit('frameTick', { dt, realDt: dt, elapsed: scene.time.elapsed, frame });
            return passes;
        },
        sequence: () => sequence,
        copies: () => copies,
        readbackWith(fn) {
            produce = fn;
        },
        createdWhileRecording: () => createdWhileRecording,
    };
}
