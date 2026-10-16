import { describe, expect, it } from 'vitest';
import { TransformFlow } from '../flows/TransformFlow';
import { Transform } from '../Transform';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { createScene } from '../../../scene/SceneContext';
import { fakeSceneCore } from '../../../scene/__tests__/helpers/fakeSceneCore';
import type { BindGroupReplacedEvent } from '../../../scene/events/BindGroupReplacedEvent';
import { expectTransitionTable } from '../../../scene/__tests__/helpers/flowEvents';

function setup() {
    const { core, trace } = fakeSceneCore();
    const scene = createScene({ core });
    const reg = scene.flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    let n = 0;
    const frame = (): string[] => {
        trace.length = 0;
        n++;
        scene.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: n / 60, frame: n });
        return [...trace];
    };
    return { scene, flow: reg.flow!, frame, core };
}

const composes = (trace: readonly string[]): number =>
    trace.filter((c) => c === 'compute:TransformFlow').length;
const paramWrites = (trace: readonly string[]): number =>
    trace.filter((c) => c === 'write:transform_compose_params').length;

describe('TransformFlow (slots)', () => {
    it('fica pronto quando os pools existem (reconciliado antes da gravação do quadro); antes não grava', () => {
        const { scene, flow, frame } = setup();
        expect(flow.lifecycle).toBe('pending');
        expect(composes(frame())).toBe(0);
        scene.world.insert(new Transform());
        expect(composes(frame())).toBe(1);
        expect(flow.lifecycle).toBe('ready');
    });

    it('compõe uma vez após mudanças e não repete numa cena parada (stale → clean)', () => {
        const { scene, flow, frame } = setup();
        for (let i = 0; i < 3; i++) scene.world.insert(new Transform());
        expect(composes(frame())).toBe(1);
        expect(flow.state).toBe('clean');
        expect(composes(frame())).toBe(0);
    });

    it('mutação de um Transform (resourceReady) volta a compor no quadro seguinte', () => {
        const { scene, frame } = setup();
        const t = new Transform();
        scene.world.insert(t);
        frame();
        t.data.position[1] = 2;
        expect(composes(frame())).toBe(1);
    });

    it('remoção de entidade também recompõe (A6)', () => {
        const { scene, frame } = setup();
        const a = new Transform();
        scene.world.insert(a);
        scene.world.insert(new Transform());
        frame();
        scene.world.remove(a);
        expect(composes(frame())).toBe(1);
    });

    it('contagem escrita uma vez por quadro, só quando muda — inserir 1000 não escreve 1000 vezes', () => {
        const { scene, frame } = setup();
        for (let i = 0; i < 1000; i++) scene.world.insert(new Transform());
        const first = frame();
        expect(paramWrites(first)).toBe(1);
        const t = scene.world.rootOf(scene.world.queryBySchemaName('Transform')[0]!) as Transform;
        t.data.scale[0] = 2;
        expect(paramWrites(frame())).toBe(0);
    });

    it('pool realocado: a C2 religa o bind group e o estágio recompõe tudo', () => {
        const { scene, frame } = setup();
        scene.world.insert(new Transform());
        frame();
        const replaced: BindGroupReplacedEvent[] = [];
        scene.events.on('bindGroupReplaced', (e) => replaced.push(e));
        for (let i = 0; i < 20; i++) scene.world.insert(new Transform());
        expect(composes(frame())).toBe(1);
        // Os dois pipelines do estágio leem os pools: composição e nível da hierarquia.
        expect(replaced.map((e) => e.pipeline).sort()).toEqual([
            'transform_compose',
            'transform_link',
        ]);
        expect(
            replaced[0]!.newSpec.bindings.map((b) => (b.kind === 'buffer' ? b.buffer : null)),
        ).toContain(scene.resourceSystem.poolBufferSpec('WorldTransform'));
    });

    it('o shader monta sem erro e consome os pools certos', () => {
        const { flow } = setup();
        const [desc] = flow.pipelines;
        const composed = composeWgsl(desc!.shader);
        expect(composed.modules).toEqual([
            'quat',
            'linalg',
            'mat',
            'transform_local',
            'const:WORKGROUP_SIZE',
            'transforms',
            'worlds',
            'params',
            'transform_compose',
        ]);
        expect(composed.spec.source).toContain(Transform.schema.toWGSL());
        expect(composed.spec.source).toContain(Transform.worldSchema.toWGSL());
        // Os pools vêm dos fornecedores dos recursos declarados (spec 031).
        expect(composed.bindings.map((b) => [b.name, b.resource.resource.provider])).toEqual([
            ['params', 'private'],
            ['transforms', { pool: Transform.schema.name }],
            ['worlds', { pool: Transform.worldSchema.name }],
        ]);
    });

    it('dispose libera o uniform de parâmetros', () => {
        const { scene, core } = setup();
        scene.dispose();
        expect(core.destroy).toHaveBeenCalledWith(
            expect.objectContaining({ discriminator: 'transform_compose_params' }),
        );
    });
});

describe('TransformFlow — tabela de transições', () => {
    it('estados: stale (intenção pendente) → clean após frameRecorded; qualquer mudança volta a stale', () => {
        const { scene, flow, frame } = setup();
        expect(flow.state).toBe('stale');
        const t = new Transform();
        scene.world.insert(t);
        frame();
        expect(flow.state).toBe('clean');
        frame();
        expect(flow.state).toBe('clean');
        t.data.position = [1, 2, 3, 1];
        scene.events.emit('frameRecording', { elapsed: 0 });
        expect(flow.state).toBe('stale');
        frame();
        expect(flow.state).toBe('clean');
    });

    it('declara todo evento entregável e lança nos demais, em stale e em clean', () => {
        const { scene, flow, frame } = setup();
        expectTransitionTable(flow);
        scene.world.insert(new Transform());
        frame();
        expect(flow.state).toBe('clean');
        expectTransitionTable(flow);
    });
});
