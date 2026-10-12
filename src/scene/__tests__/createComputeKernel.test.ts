import { describe, expect, it, vi } from 'vitest';
import { createComputeKernel, destroyComputeKernel } from '../flows/createComputeKernel';
import { fakeResourceCore } from './helpers/fakeResourceCore';
import { wgslModule } from '../shaders/WgslModule';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import type {
    BindGroupSpec,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    ShaderModuleSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';

function recordingCore(): {
    core: EngineCore;
    creates: { kind: string; subkind?: string; discriminator?: string }[];
    asyncCreates: { kind: string; discriminator?: string }[];
} {
    const creates: { kind: string; subkind?: string; discriminator?: string }[] = [];
    const asyncCreates: { kind: string; discriminator?: string }[] = [];
    const core = {
        create: vi.fn(<S>(spec: S) => {
            const s = spec as unknown as { kind: string; subkind?: string; discriminator?: string };
            const entry: { kind: string; subkind?: string; discriminator?: string } = {
                kind: s.kind,
            };
            if (s.subkind !== undefined) entry.subkind = s.subkind;
            if (s.discriminator !== undefined) entry.discriminator = s.discriminator;
            creates.push(entry);
            return spec;
        }),
        createAsync: vi.fn(<S>(spec: S) => {
            const s = spec as unknown as { kind: string; discriminator?: string };
            const entry: { kind: string; discriminator?: string } = { kind: s.kind };
            if (s.discriminator !== undefined) entry.discriminator = s.discriminator;
            asyncCreates.push(entry);
            return Promise.resolve(spec);
        }),
        setFrameProfiling: vi.fn(),
        lastFrameStats: vi.fn(() => ({ drawCalls: 0, dispatches: 0, passes: 0 })),
    } as unknown as EngineCore;
    return { core, creates, asyncCreates };
}

const TRIVIAL_SHADER = wgslModule({
    name: 'trivial',
    source: `
@compute @workgroup_size(1)
fn main() {}
`,
});

describe('createComputeKernel', () => {
    it('cria layout + shader + pipeline + bindgroup em 1 chamada (sync)', () => {
        const { core, creates, asyncCreates } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'test_ubo',
            byteSize: 16,
        };
        const k = createComputeKernel(core, {
            discriminator: 'k1',
            shader: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [{ binding: 0, type: 'uniform', buffer: ubo }],
        });
        expect(k.pipeline.kind).toBe('pipeline');
        expect(k.pipeline.subkind).toBe('compute');
        expect(k.layout.kind).toBe('layout');
        expect(k.bindGroup.kind).toBe('bindgroup');
        expect(creates.map((c) => c.kind).sort()).toEqual([
            'bindgroup',
            'layout',
            'pipeline',
            'shader',
        ]);
        expect(asyncCreates).toHaveLength(0);
    });

    it('preferAsync=true usa createAsync para o pipeline', () => {
        const { core, creates, asyncCreates } = recordingCore();
        const sbo: StorageBufferSpec = {
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'test_sbo',
            byteSize: 64,
        };
        createComputeKernel(core, {
            discriminator: 'k_async',
            shader: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [{ binding: 0, type: 'storage', buffer: sbo }],
            preferAsync: true,
        });
        // Pipeline foi via createAsync, não via create.
        expect(creates.find((c) => c.kind === 'pipeline')).toBeUndefined();
        expect(asyncCreates).toHaveLength(1);
        expect(asyncCreates[0]?.kind).toBe('pipeline');
    });

    it('discriminadores compostos prefixados pelo opts.discriminator', () => {
        const { core, creates } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'u',
            byteSize: 16,
        };
        createComputeKernel(core, {
            discriminator: 'kPrefix',
            shader: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [{ binding: 0, type: 'uniform', buffer: ubo }],
        });
        const layoutDisc = creates.find((c) => c.kind === 'layout')?.discriminator;
        const shaderDisc = creates.find((c) => c.kind === 'shader')?.discriminator;
        const pipelineDisc = creates.find((c) => c.kind === 'pipeline')?.discriminator;
        const bgDisc = creates.find((c) => c.kind === 'bindgroup')?.discriminator;
        expect(layoutDisc).toBe('kPrefix_layout');
        expect(shaderDisc).toBe('wgsl:trivial'); // identidade do shader = módulo montado
        expect(pipelineDisc).toBe('kPrefix_pipeline');
        expect(bgDisc).toBe('kPrefix_bg');
    });

    it('shader inválido (call a fn ausente) lança no helper antes de chegar no core', () => {
        const { core } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'u',
            byteSize: 16,
        };
        const badShader = wgslModule({
            name: 'bad',
            source: `
            fn driver() {
                missing_helper(0.0);
            }
        `,
        });
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kBad',
                shader: badShader,
                entryPoint: 'driver',
                bindings: [{ binding: 0, type: 'uniform', buffer: ubo }],
            }),
        ).toThrowError(/missing_helper/);
    });

    it('múltiplas bindings → entradas no layout e bindgroup correspondentes', () => {
        const { core, creates } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'u',
            byteSize: 16,
        };
        const sbo: StorageBufferSpec = {
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 's',
            byteSize: 64,
        };
        const k = createComputeKernel(core, {
            discriminator: 'kMulti',
            shader: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [
                { binding: 0, type: 'uniform', buffer: ubo },
                { binding: 1, type: 'storage', buffer: sbo },
                { binding: 2, type: 'read-only-storage', buffer: sbo },
            ],
        });
        expect(k.layout.entries).toHaveLength(3);
        expect(k.bindGroup.bindings).toHaveLength(3);
        // dummy refs to avoid unused-var warnings
        void creates;
    });
});

// avoid unused import warning when noUnusedLocals is on (it's not, but be safe)
void ({} as ComputePipelineSpec);
void ({} as LayoutSpec);
void ({} as ShaderModuleSpec);
void ({} as BindGroupSpec);

describe('createComputeKernel — buffers de vértice, índice e indireto (FR-015)', () => {
    it.each([
        {
            kind: 'buffer',
            subkind: 'vertex',
            discriminator: 'vbo',
            byteSize: 64,
            stride: 16,
            count: 4,
        },
        {
            kind: 'buffer',
            subkind: 'index',
            discriminator: 'ibo',
            byteSize: 12,
            count: 6,
            format: 'uint16',
        },
        { kind: 'buffer', subkind: 'indirect', discriminator: 'args', byteSize: 20 },
    ] as const)('$subkind entra como binding de storage do kernel', (buffer) => {
        const { core } = recordingCore();
        const k = createComputeKernel(core, {
            discriminator: `k_${buffer.subkind}`,
            shader: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [{ binding: 0, type: 'storage', buffer }],
        });
        const entry = k.bindGroup.bindings[0];
        expect(entry?.kind).toBe('buffer');
        expect(entry?.kind === 'buffer' ? entry.buffer : undefined).toBe(buffer);
        expect(k.layout.entries[0]).toMatchObject({ kind: 'buffer', type: 'storage' });
    });
});

describe('destroyComputeKernel', () => {
    it('libera bind groups, pipeline, shader e layouts do kernel', () => {
        const { core } = fakeResourceCore();
        const buffer = {
            kind: 'buffer' as const,
            subkind: 'storage' as const,
            discriminator: 'b',
            byteSize: 16,
        };
        const kernel = createComputeKernel(core, {
            discriminator: 'k',
            shader: wgslModule({
                name: 'two_groups',
                source: '@compute @workgroup_size(1) fn main() {}',
            }),
            entryPoint: 'main',
            bindGroups: [
                { bindings: [{ binding: 0, type: 'storage', buffer }] },
                { bindings: [{ binding: 0, type: 'storage', buffer }] },
            ],
        });
        destroyComputeKernel(core, kernel);
        const destroyed = vi.mocked(core.destroy).mock.calls.map((c) => c[0]);
        expect(destroyed).toEqual([
            kernel.bindGroups[0],
            kernel.bindGroups[1],
            kernel.pipeline,
            kernel.pipeline.shader,
            kernel.layouts[0],
            kernel.layouts[1],
        ]);
    });

    it('entry point que não é função do módulo de entrada → erro legível', () => {
        const { core } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'u',
            byteSize: 16,
        };
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kEntry',
                shader: TRIVIAL_SHADER,
                entryPoint: 'nao_existe',
                bindings: [{ binding: 0, type: 'uniform', buffer: ubo }],
            }),
        ).toThrowError(/entry point 'nao_existe'.*'trivial'/);
    });

    it('erro de montagem propagado com o motivo', () => {
        const { core } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'u',
            byteSize: 16,
        };
        const a = wgslModule({ name: 'dup', source: 'fn x() {}' });
        const b = wgslModule({ name: 'dup', source: 'fn y() {}' });
        const entry = wgslModule({
            name: 'e',
            source: '@compute @workgroup_size(1) fn main() { x(); y(); }',
            requires: [a, b],
        });
        try {
            createComputeKernel(core, {
                discriminator: 'kDup',
                shader: entry,
                entryPoint: 'main',
                bindings: [{ binding: 0, type: 'uniform', buffer: ubo }],
            });
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(WgslCompositionError);
            expect((e as WgslCompositionError).kind).toBe('duplicate-module-name');
        }
    });

    it('cada kernel recebe a sua cópia da spec montada (posse independente), com o mesmo texto', () => {
        const { core } = recordingCore();
        const ubo: UniformBufferSpec = {
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: 'u',
            byteSize: 16,
        };
        const opts = {
            shader: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [{ binding: 0, type: 'uniform' as const, buffer: ubo }],
        };
        const k1 = createComputeKernel(core, { discriminator: 'kA', ...opts });
        const k2 = createComputeKernel(core, { discriminator: 'kB', ...opts });
        expect(k1.pipeline.shader).not.toBe(k2.pipeline.shader);
        expect(k1.pipeline.shader).toEqual(k2.pipeline.shader);
    });
});
