import { describe, expect, it } from 'vitest';
import { PbrTables, PBR_DFG_SIZE } from '../pbr/PbrTables';
import { PbrTablesFlow } from '../pbr/PbrTablesFlow';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';

// Tabelas do sombreamento físico (spec 011, T028): a DFG `rgba16float` 32×32 integrada na GPU uma vez por `PbrTables`.

describe('PbrTables e PbrTablesFlow (spec 011, T028)', () => {
    it('descritores: a tabela de storage rgba16float 32×32 e o amostrador linear sem repetição', () => {
        const [dfg, sampler] = new PbrTables().getDescriptors();
        expect(dfg).toMatchObject({
            id: 'dfg',
            role: 'storage-texture',
            textureShape: { format: 'rgba16float', width: PBR_DFG_SIZE, height: PBR_DFG_SIZE },
        });
        expect(sampler).toMatchObject({
            id: 'sampler',
            role: 'sampler',
            samplerShape: { magFilter: 'linear', addressModeU: 'clamp-to-edge' },
        });
    });

    it('integra no primeiro quadro em que grava e nunca mais; um PbrTables novo integra de novo', async () => {
        const s = await renderScene();
        s.scene.flows.register(() => new PbrTablesFlow(), {
            type: 'pbrTables',
            phase: 'transform',
        });
        const first = new PbrTables();
        s.scene.world.insert(first);
        const builds: number[] = [];
        for (let i = 0; i < 4; i++) {
            s.step();
            builds.push(s.computes().filter((c) => c === 'PbrTablesFlow').length);
        }
        expect(builds.reduce((a, b) => a + b, 0)).toBe(1);
        s.scene.world.remove(first);
        s.scene.world.insert(new PbrTables());
        let again = 0;
        for (let i = 0; i < 3; i++) {
            s.step();
            again += s.computes().filter((c) => c === 'PbrTablesFlow').length;
        }
        expect(again).toBe(1);
    });
});
