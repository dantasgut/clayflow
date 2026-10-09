import { describe, expect, it, vi } from 'vitest';
import { GpuEngineCore } from '../GpuEngineCore';
import type {
    ComputePipelineSpec,
    LayoutSpec,
    ShaderModuleSpec,
    StorageBufferSpec,
} from '../../contracts/index';

/** Device falso que registra criações e destruições. */
function fakeDevice() {
    const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
    let resolvePipeline: ((p: GPUComputePipeline) => void) | null = null;
    const device = {
        features: new Set<string>(),
        queue: { submit: vi.fn(), writeBuffer: vi.fn() },
        createBuffer: vi.fn(() => {
            const b = { destroy: vi.fn() };
            buffers.push(b);
            return b;
        }),
        createShaderModule: vi.fn(() => ({})),
        createBindGroupLayout: vi.fn(() => ({})),
        createPipelineLayout: vi.fn(() => ({})),
        createComputePipeline: vi.fn(() => ({})),
        createComputePipelineAsync: vi.fn(
            () =>
                new Promise<GPUComputePipeline>((resolve) => {
                    resolvePipeline = resolve;
                }),
        ),
        lost: new Promise(() => undefined),
        destroy: vi.fn(),
    };
    return {
        device: device as unknown as GPUDevice,
        raw: device,
        buffers,
        finishPipeline: () => resolvePipeline?.({} as GPUComputePipeline),
    };
}

class TestCore extends GpuEngineCore {
    attachFake(device: GPUDevice): void {
        const self = this as unknown as { context: unknown };
        self.context = {
            device,
            queue: device.queue,
            canvas: null,
            canvasContext: null,
            canvasFormat: 'bgra8unorm',
            capabilities: {},
        };
    }
}

function setup() {
    const fake = fakeDevice();
    const core = new TestCore();
    core.attachFake(fake.device);
    return { core, ...fake };
}

const buffer = (): StorageBufferSpec => ({
    kind: 'buffer',
    subkind: 'storage',
    discriminator: 'b',
    byteSize: 64,
});

const pipelineSpec = (): ComputePipelineSpec => {
    const shader: ShaderModuleSpec = { kind: 'shader', discriminator: 's', source: 'fn m() {}' };
    const layout: LayoutSpec = { kind: 'layout', discriminator: 'l', entries: [] };
    return {
        kind: 'pipeline',
        subkind: 'compute',
        discriminator: 'p',
        layouts: [layout],
        shader,
        entryPoint: 'm',
    };
};

describe('GpuEngineCore — identidade, imutabilidade e posse', () => {
    it('create congela a spec em profundidade e devolve o mesmo objeto', () => {
        const { core } = setup();
        const spec = buffer();
        expect(core.create(spec)).toBe(spec);
        expect(Object.isFrozen(spec)).toBe(true);
        expect(() => {
            (spec as { byteSize: number }).byteSize = 128;
        }).toThrow(TypeError);
    });

    it('specs aninhadas também ficam congeladas', () => {
        const { core } = setup();
        const p = pipelineSpec();
        core.create(p.shader);
        core.create(p.layouts[0]!);
        core.create(p);
        expect(Object.isFrozen(p.layouts)).toBe(true);
        expect(Object.isFrozen(p.shader)).toBe(true);
    });

    it('deduplica por conteúdo: duas specs iguais → um objeto de GPU', () => {
        const { core, raw } = setup();
        core.create(buffer());
        core.create(buffer());
        expect(raw.createBuffer).toHaveBeenCalledTimes(1);
    });

    it('destroy respeita a posse: o objeto só morre com o último dono', () => {
        const { core, buffers } = setup();
        const a = core.create(buffer());
        const b = core.create(buffer());
        core.destroy(a);
        expect(buffers[0]!.destroy).not.toHaveBeenCalled();
        expect(core.memoryUsage().bufferBytes).toBe(64);
        core.destroy(b);
        expect(buffers[0]!.destroy).toHaveBeenCalledOnce();
        expect(core.memoryUsage().bufferBytes).toBe(0);
    });

    it('destroy de spec que nunca foi criada não derruba a de mesmo conteúdo', () => {
        const { core, buffers } = setup();
        core.create(buffer());
        core.destroy(buffer());
        expect(buffers[0]!.destroy).not.toHaveBeenCalled();
    });

    it('create repetido com o mesmo objeto não duplica posse', () => {
        const { core, buffers } = setup();
        const a = buffer();
        core.create(a);
        core.create(a);
        core.destroy(a);
        expect(buffers[0]!.destroy).toHaveBeenCalledOnce();
    });

    it('createAsync congela, deduplica e registra posse', async () => {
        const { core, raw, finishPipeline } = setup();
        const p = pipelineSpec();
        core.create(p.shader);
        core.create(p.layouts[0]!);
        const pending = core.createAsync(p);
        finishPipeline();
        expect(await pending).toBe(p);
        expect(Object.isFrozen(p)).toBe(true);
        await core.createAsync(pipelineSpec());
        expect(raw.createComputePipelineAsync).toHaveBeenCalledTimes(1);
    });

    it('createAsync concorrente da mesma spec compila uma vez', async () => {
        const { core, raw, finishPipeline } = setup();
        const p1 = pipelineSpec();
        const p2 = pipelineSpec();
        core.create(p1.shader);
        core.create(p1.layouts[0]!);
        const a = core.createAsync(p1);
        const b = core.createAsync(p2);
        finishPipeline();
        await Promise.all([a, b]);
        expect(raw.createComputePipelineAsync).toHaveBeenCalledTimes(1);
        // Dois donos: destruir um mantém o pipeline vivo para o outro.
        core.destroy(p1);
        expect(() => {
            core.create(p2);
        }).not.toThrow();
        expect(raw.createComputePipeline).not.toHaveBeenCalled();
    });
});
