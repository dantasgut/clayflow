import { describe, expect, it } from 'vitest';
import { matches, read, sourceFiles } from './scanRepo';

// Varreduras do contrato de shader estruturado (spec 031, SC-001–SC-004): nenhum binding escrito à mão, nenhum índice
// de grupo no código dos estágios, nenhuma importação entre estágios, nenhuma constante compartilhada repetida.

/** Onde o texto `@group(`/`@binding(` é o próprio contrato (a emissão das linhas e a documentação dele). */
const CONTRACT_FILES = new Set([
    'scene/shaders/composeWgsl.ts',
    'scene/shaders/WgslResource.ts',
    'scene/shaders/scanWgslSymbols.ts',
    'scene/shaders/WgslModule.ts',
    'scene/systems/LayoutInferencer.ts',
    'scene/systems/flowBinding/FlowRuntime.ts',
    'scene/systems/flowBinding/PipelineState.ts',
    'scene/flows/createComputeKernel.ts',
    'scene/flows/FlowBinding.ts',
    'scene/flows/FlowBindingError.ts',
    'scene/flows/FlowTransitions.ts',
    'scene/events/BindGroupReplacedEvent.ts',
    'scene/descriptors/GPUDescriptor.ts',
    'core/contracts/specs/BindGroupSpec.ts',
    'core/contracts/specs/PipelineSpec.ts',
    // Página de desenvolvimento da C1 (`EngineCore` direto, abaixo do contrato de módulos).
    'main.ts',
]);

describe('contrato de shader estruturado (spec 031)', () => {
    it('SC-001: nenhum @group/@binding escrito à mão em WGSL nem em WGSL embutido no TypeScript', () => {
        const found = [
            ...sourceFiles('.wgsl').flatMap((f) =>
                matches(f, read(f), /@group\s*\(|@binding\s*\(/),
            ),
            ...sourceFiles('.ts')
                .filter((f) => !CONTRACT_FILES.has(f))
                .flatMap((f) => matches(f, read(f), /@group\s*\(\s*\d|@binding\s*\(\s*\d/)),
        ];
        expect(found).toEqual([]);
    });

    it('SC-001: nenhum índice de grupo literal no código dos estágios e elementos', () => {
        const found = sourceFiles('.ts')
            .filter((f) => f.startsWith('elements/') || f.startsWith('presentation/'))
            .flatMap((f) => matches(f, read(f), /setBindGroup\(\s*\d/));
        expect(found).toEqual([]);
    });

    it('SC-001: nenhuma ligação privada por nome em texto (`nome:` ou `pipeline:nome`) nos estágios', () => {
        const found = sourceFiles('.ts')
            .filter((f) => f.startsWith('elements/') || f.startsWith('presentation/'))
            .flatMap((f) => matches(f, read(f), /ctx\.bind\(\{|\.bind\(\{\s*\[`/));
        expect(found).toEqual([]);
    });

    it('SC-003: nenhum estágio importa outro estágio', () => {
        const found: string[] = [];
        for (const f of sourceFiles('.ts')) {
            if (!f.endsWith('Flow.ts')) continue;
            const text = read(f);
            for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
                const target = m[1]!;
                if (
                    /\/\w+Flow'?$/.test(target)
                    && !/scene\/flows\/(Flow|RenderFlow)$/.test(target)
                ) {
                    found.push(`${f} → ${target}`);
                }
            }
        }
        expect(found).toEqual([]);
    });

    it('SC-003: o forward não referencia água, sombra nem luz pelo nome', () => {
        const forward = read('presentation/flows/ForwardFlow.ts');
        expect(forward).not.toMatch(
            /WaterSurface|caustic|ShadowMap|castingShadowMap|\blights\b|Light\b/,
        );
        const shader = read('elements/gpu/wgsl/forward.wgsl');
        expect(shader).not.toMatch(/water|caustic|shadow_map|shadow_matrices|\blights\b/);
    });

    it('SC-004: constantes compartilhadas definidas uma vez (sentinela, tamanho de grupo, profundidade da água, luz)', () => {
        const wgsl = sourceFiles('.wgsl');
        const found = [
            // Sentinela "nenhum" (`NONE`) e tamanho de grupo; o máximo inicial de um `atomicMin` não é sentinela.
            ...wgsl
                .flatMap((f) => matches(f, read(f), /0xFFFFFFFF|@workgroup_size\(\s*64\s*\)/i))
                .filter((m) => !/atomicStore\([^)]*0xffffffffu\)/i.test(m)),
            ...wgsl.flatMap((f) =>
                matches(f, read(f), /vec3f\(\s*0\.4\s*,\s*-1\.0\s*,\s*0\.6\s*\)/),
            ),
            ...sourceFiles('.ts')
                .filter((f) => !f.includes('engineConstants') && !f.endsWith('/constants.ts'))
                .flatMap((f) =>
                    matches(f, read(f), /\bconst\s+\w+\s*=\s*(0xffffffff|64|1e9)\s*;/i).filter(
                        (m) => /NONE|NO_|WORKGROUP|DEPTH/i.test(m),
                    ),
                ),
        ];
        expect(found).toEqual([]);
    });

    it('FR-009: nenhum remendo de fonte WGSL por substituição de texto', () => {
        const found = sourceFiles('.ts')
            .filter((f) => f.startsWith('elements/') || f.startsWith('presentation/'))
            .flatMap((f) => matches(f, read(f), /Source\.replace\(/));
        expect(found).toEqual([]);
    });
});
