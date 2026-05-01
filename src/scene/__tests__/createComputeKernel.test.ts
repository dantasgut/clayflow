import { describe, expect, it, vi } from 'vitest';
import { createComputeKernel } from '../flows/createComputeKernel';
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
    } as unknown as EngineCore;
    return { core, creates, asyncCreates };
}

const TRIVIAL_SHADER = `
@compute @workgroup_size(1)
fn main() {}
`;

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
            shaderSource: TRIVIAL_SHADER,
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
            shaderSource: TRIVIAL_SHADER,
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
            shaderSource: TRIVIAL_SHADER,
            entryPoint: 'main',
            bindings: [{ binding: 0, type: 'uniform', buffer: ubo }],
        });
        const layoutDisc = creates.find((c) => c.kind === 'layout')?.discriminator;
        const shaderDisc = creates.find((c) => c.kind === 'shader')?.discriminator;
        const pipelineDisc = creates.find((c) => c.kind === 'pipeline')?.discriminator;
        const bgDisc = creates.find((c) => c.kind === 'bindgroup')?.discriminator;
        expect(layoutDisc).toBe('kPrefix_layout');
        expect(shaderDisc).toBe('kPrefix_shader');
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
        const badShader = `
            fn driver() {
                missing_helper(0.0);
            }
        `;
        expect(() =>
            createComputeKernel(core, {
                discriminator: 'kBad',
                shaderSource: badShader,
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
            shaderSource: TRIVIAL_SHADER,
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
