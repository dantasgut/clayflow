import { vi } from 'vitest';
import type {
    BindGroupSpec,
    EngineCore,
    Frame,
    RenderPipelineSpec,
    ResourceSpec,
    StorageBufferSpec,
} from '../../../../core/contracts/index';
import type { PoolDirectory } from '../../../../scene/contracts/PoolDirectory';
import type { EntityId } from '../../../../scene/world/EntityId';

/** Uma chamada de desenho capturada pelo pass falso. */
export interface DrawCall {
    readonly pipeline: RenderPipelineSpec;
    readonly bindGroups: ReadonlyMap<number, BindGroupSpec>;
    readonly indexCount: number;
    readonly firstInstance: number | undefined;
}

/**
 * Infra de teste para estágios de render: core falso (create devolve o spec), pool
 * directory controlável e frame que captura as chamadas de desenho por quadro.
 */
export function renderHarness() {
    const creates: ResourceSpec[] = [];
    const writes: ResourceSpec[] = [];
    const core = {
        create: vi.fn(<S>(spec: S) => {
            creates.push(spec as ResourceSpec);
            return spec;
        }),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(spec)),
        write: vi.fn((spec: ResourceSpec) => {
            writes.push(spec);
        }),
        destroy: vi.fn(),
        canvasFormat: 'bgra8unorm',
        profiler: { isSupported: false, timestampWritesFor: () => undefined },
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
    } as unknown as EngineCore;

    const worldBuffer = {
        current: {
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'pool:WorldTransform',
            byteSize: 112 * 16,
        } as StorageBufferSpec,
    };
    const slots = new Map<EntityId, number>();
    const pools: PoolDirectory = {
        poolBufferSpec: (key) => (key === 'WorldTransform' ? worldBuffer.current : undefined),
        poolCount: () => slots.size,
        poolSlotOf: (key, id) => (key === 'WorldTransform' ? slots.get(id) : undefined),
        poolKeyForResource: () => undefined,
    };

    let draws: DrawCall[] = [];
    const frame = {
        canvasView: { kind: 'textureview', discriminator: 'canvas' },
        render: vi.fn((_target: unknown, _label: string, body: (pass: unknown) => void) => {
            let pipeline: RenderPipelineSpec | null = null;
            const bound = new Map<number, BindGroupSpec>();
            const pass = {
                bind: {
                    setPipeline: (p: RenderPipelineSpec) => {
                        pipeline = p;
                        return pass.bind;
                    },
                    setBindGroup: (i: number, bg: BindGroupSpec) => {
                        bound.set(i, bg);
                        return pass.bind;
                    },
                },
                geometry: {
                    vertex: () => pass.geometry,
                    index: () => pass.geometry,
                },
                draw: {
                    indexed: (
                        count: number,
                        _instances?: number,
                        _firstIndex?: number,
                        _baseVertex?: number,
                        firstInstance?: number,
                    ) => {
                        draws.push({
                            pipeline: pipeline!,
                            bindGroups: new Map(bound),
                            indexCount: count,
                            firstInstance,
                        });
                        return pass.draw;
                    },
                },
                marker: () => undefined,
            };
            body(pass);
        }),
    } as unknown as Frame;

    return {
        core,
        pools,
        frame,
        slots,
        worldBuffer,
        creates,
        writes,
        /** Desenhos do último quadro, zerando a captura. */
        takeDraws(): DrawCall[] {
            const out = draws;
            draws = [];
            return out;
        },
    };
}

/** Discriminator de um spec (ou string vazia). */
export function discOf(spec: unknown): string {
    return (spec as { discriminator?: string }).discriminator ?? '';
}
