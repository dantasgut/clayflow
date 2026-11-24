/**
 * Spec 009 (US3): superfície paramétrica — grade e índices fixos, validação, e o `SurfaceFlow` avaliando quando a
 * superfície entra, quando muda e a cada quadro só com `animated`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Transform } from '../../scene/Transform';
import { ParametricSurface } from '../ParametricSurface';
import { SurfaceFlow } from '../SurfaceFlow';
import {
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { Camera } from '../../scene/Camera';
import { DirectionalLight } from '../../scene/DirectionalLight';
import { Displacements } from '../../material/Displacements';
import { relief } from '../../nodes/material';
import { displacementPoint, surfaceAdapt, surfaceEval, surfaceEvalDiff } from '../shaders';
import { bindPoints, type BindablePoint } from '../../../scene/shaders/bindPoints';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import type { WgslModule } from '../../../scene/shaders/WgslModule';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ParametricSurface (spec 009)', () => {
    it('grade nu × nv: dois triângulos por célula, face da frente para du × dv', () => {
        const s = new ParametricSurface({ resolution: [3, 2] });
        expect(s.vertexCount).toBe(6);
        expect(s.indexCount).toBe(12);
        expect([...s.data.indices!.slice(0, 6)]).toEqual([0, 1, 3, 1, 4, 3]);
        expect(s.contentKey).toBeUndefined();
        expect(s.getDescriptors()[0]).toMatchObject({
            id: 'vertices',
            role: 'vertex',
            upload: 'never',
        });
    });

    it('domínio e parâmetros padrão pela pronta; validação da resolução e do domínio', () => {
        const sphere = new ParametricSurface({ preset: 'sphere' });
        expect(sphere.data.domain).toEqual([0, 2 * Math.PI, 0, Math.PI]);
        expect(sphere.data.params).toEqual([1]);
        expect(() => new ParametricSurface({ resolution: [1, 4] })).toThrow(/resolução/);
        expect(() => new ParametricSurface({ domain: [0, 0, 0, 1] })).toThrow(/domínio/);
    });
});

describe('SurfaceFlow (spec 009)', () => {
    async function scene(animated: boolean) {
        const s = await renderScene();
        s.scene.flows.register((ctx) => new SurfaceFlow(ctx), {
            type: 'surface',
            phase: 'transform',
        });
        const surface = new ParametricSurface({ preset: 'torus', resolution: [8, 8], animated });
        s.scene.world.insert(surface.add(new StandardMaterial()).add(new Transform()));
        const evals = () => s.computes().filter((l) => l === 'SurfaceFlow').length;
        return { ...s, surface, evals };
    }

    it('avalia quando a superfície entra e quando muda; parada, não repete', async () => {
        const s = await scene(false);
        s.step();
        expect(s.evals()).toBe(1);
        s.step();
        expect(s.evals()).toBe(0);
        s.surface.data.params = [2, 0.5];
        s.step();
        expect(s.evals()).toBe(1);
    });

    it('marca os vértices como produzidos nos quadros em que avalia (spec 033: a estrutura de raios reajusta)', async () => {
        const s = await scene(false);
        const produced = (): boolean => s.scene.resourceSystem.isProduced(s.surface, 'vertices');
        s.step();
        expect(produced()).toBe(true);
        s.step();
        expect(produced()).toBe(false);
        s.surface.data.params = [2, 0.5];
        s.step();
        expect(produced()).toBe(true);
        const animated = await scene(true);
        for (let i = 0; i < 3; i++) {
            animated.step();
            expect(animated.scene.resourceSystem.isProduced(animated.surface, 'vertices')).toBe(
                true,
            );
        }
    });

    it('com animated, avalia a cada quadro', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        expect(s.evals()).toBe(1);
        s.step();
        expect(s.evals()).toBe(1);
    });
});

describe('geometria diferencial (spec 010)', () => {
    it('differential declara o pool SurfaceDiff (um registro por vértice, só da GPU)', () => {
        const plain = new ParametricSurface({ resolution: [4, 3] });
        expect(plain.getDescriptors().some((d) => d.id === 'diff')).toBe(false);
        const diff = new ParametricSurface({ resolution: [4, 3], differential: true });
        expect(diff.getDescriptors().find((d) => d.id === 'diff')).toMatchObject({
            storage: 'pool',
            upload: 'never',
            count: 12,
        });
    });

    it('superfície com e sem geometria diferencial é desenhada (campo opcional do registro sem o descritor)', async () => {
        for (const differential of [false, true]) {
            const s = await renderScene();
            registerStages(s.scene, { forward: 'scene' });
            s.scene.flows.register((ctx) => new SurfaceFlow(ctx), {
                type: 'surface',
                phase: 'transform',
                priority: -40,
            });
            s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 3, 1] })));
            const surface = new ParametricSurface({
                preset: 'sphere',
                resolution: [8, 6],
                differential,
            });
            s.scene.world.insert(surface.add(new StandardMaterial()).add(new Transform()));
            s.step();
            expect(s.computes()).toContain('SurfaceFlow');
            s.step();
            expect(s.draws().some((d) => d.indexCount === surface.indexCount)).toBe(true);
        }
    });
});

describe('malha adaptativa (spec 010)', () => {
    it('capacidades do nível máximo, descritores só da GPU, registro indireto e periodicidade pela pronta', () => {
        const s = new ParametricSurface({
            preset: 'torus',
            adaptive: { patches: [4, 2], maxLevel: 2 },
        });
        const a = s.adaptive!;
        expect(s.differential).toBe(true);
        expect(a.side).toBe(5);
        expect(a.vertexCapacity).toBe(8 * 25);
        expect(a.indexCapacity).toBe(8 * 6 * 16);
        expect(a.edgeIndexCapacity).toBe(8 * (6 * 16 + 4 * 4));
        expect(a.periodic).toEqual([true, true]);
        expect(s.data.resolution).toEqual([17, 9]);
        const byId = new Map(s.getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('indices')).toMatchObject({ upload: 'never', indexFormat: 'uint32' });
        expect(byId.get('wireEdges')).toMatchObject({ upload: 'never', indexFormat: 'uint32' });
        expect(byId.get('indirect')).toMatchObject({ role: 'indirect', count: 2 });
        expect(byId.get('diff')).toMatchObject({ storage: 'pool', count: a.vertexCapacity });
        expect(
            new ParametricSurface({ preset: 'sphere', adaptive: {} }).adaptive!.periodic,
        ).toEqual([true, false]);
    });

    it('validação: retalhos, nível, orçamento e tolerâncias', () => {
        expect(() => new ParametricSurface({ adaptive: { patches: [100, 100] } })).toThrow(
            /retalhos/,
        );
        expect(() => new ParametricSurface({ adaptive: { maxLevel: 7 } })).toThrow(/nível/);
        expect(() => new ParametricSurface({ adaptive: { budget: 1 } })).toThrow(/orçamento/);
        expect(() => new ParametricSurface({ adaptive: { tolerance: 0 } })).toThrow(/tolerância/);
    });

    async function adaptiveScene(features: readonly GPUFeatureName[]) {
        const s = await renderScene({ features });
        registerStages(s.scene, { forward: 'scene', shadow: true });
        s.scene.flows.register((ctx) => new SurfaceFlow(ctx), {
            type: 'surface',
            phase: 'transform',
            priority: -40,
        });
        const cameraTransform = new Transform({ position: [0, 1, 3, 1] });
        s.scene.world.insert(new Camera().add(cameraTransform));
        const light = new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true });
        s.scene.world.insert(light);
        const surface = new ParametricSurface({
            preset: 'terrain',
            adaptive: { patches: [4, 4], maxLevel: 2, refreshDistance: 0.1 },
        });
        s.scene.world.insert(surface.add(new StandardMaterial()).add(new Transform()));
        const adapt = () => s.computes().filter((l) => l.startsWith('SurfaceFlow.adapt'));
        return { ...s, surface, cameraTransform, adapt, light };
    }

    it('gera na entrada (4 passadas), não repete parada, refaz quando a câmera anda além do limiar', async () => {
        const s = await adaptiveScene(['indirect-first-instance']);
        s.step();
        expect(s.adapt()).toEqual([
            'SurfaceFlow.adapt.level',
            'SurfaceFlow.adapt.budget',
            'SurfaceFlow.adapt.scan',
            'SurfaceFlow.adapt.emit',
        ]);
        // A vista da luz entra (o estágio de sombra a pede, spec 041): os descritores dela realocam o pool da geometria
        // diferencial e a malha da câmera é refeita uma vez, igual.
        s.step();
        expect(s.adapt()).toHaveLength(4);
        expect(s.computes().filter((l) => l === 'SurfaceFlow.view')).toHaveLength(1);
        s.step();
        expect(s.adapt()).toEqual([]);
        s.cameraTransform.data.position = [0.05, 1, 3, 1];
        s.step();
        expect(s.adapt()).toEqual([]);
        s.cameraTransform.data.position = [0.5, 1, 3, 1];
        s.step();
        expect(s.adapt()).toHaveLength(4);
    });

    it('vista da luz (spec 041, R20): pedida pela sombra, refeita só quando a luz ou a câmera mudam; o mapa a desenha', async () => {
        const s = await adaptiveScene(['indirect-first-instance']);
        const views = () => s.computes().filter((l) => l === 'SurfaceFlow.view');
        s.step();
        s.step();
        expect(s.surface.views.map((v) => [v.key, v.kind, v.error, v.segment])).toEqual([
            ['light:0', 'light', 0.5, 1],
        ]);
        const descriptors = new Map(s.surface.getDescriptors().map((d) => [d.id, d]));
        const a = s.surface.adaptive!;
        expect(descriptors.get('view:light:0:vertices')).toMatchObject({
            role: 'vertex',
            count: Math.min(a.vertexCapacity, 2 * a.viewBudget),
            upload: 'never',
        });
        expect(descriptors.get('view:light:0:indices')).toMatchObject({
            role: 'index',
            count: Math.min(a.indexCapacity, 3 * a.viewBudget),
        });
        expect(descriptors.get('view:light:0:indirect')).toMatchObject({
            role: 'indirect',
            count: 2,
        });
        // Parada: nem a câmera nem a vista.
        s.step();
        expect(views()).toEqual([]);
        expect(s.adapt()).toEqual([]);
        // A luz gira: só a vista dela (a malha da câmera fica).
        s.light.data.direction = [0.3, -1, 0, 0];
        s.step();
        expect(views()).toHaveLength(1);
        expect(s.adapt()).toEqual([]);
        s.step();
        expect(views()).toEqual([]);
        // O mapa desenha a vista: os vértices do desenho da sombra são os da vista.
        const viewVertices = s.scene.resourceSystem.bufferOf(s.surface, 'view:light:0:vertices');
        const cameraVertices = s.scene.resourceSystem.bufferOf(s.surface, 'vertices');
        const shadowVertices = s.draws('ShadowFlow').map((d) => d.vertex);
        expect(shadowVertices.length).toBeGreaterThan(0);
        expect(shadowVertices.every((v) => v === viewVertices)).toBe(true);
        expect(shadowVertices.some((v) => v === cameraVertices)).toBe(false);
    });

    it('vista da luz por vista de sombra (spec 013): uma malha por vista até o teto; acima dele, a malha da câmera', async () => {
        // Arrange: cinco luzes com sombra (a da cena e mais quatro) — uma a mais que o teto de malhas por superfície.
        const s = await adaptiveScene(['indirect-first-instance']);
        for (let i = 1; i <= 4; i++)
            s.scene.world.insert(
                new DirectionalLight({ direction: [0.2 * i, -1, 0, 0], castShadow: true }),
            );
        // Act
        for (let i = 0; i < 6; i++) s.step();
        // Assert: a superfície tem a malha das quatro primeiras vistas.
        expect(s.surface.views.map((v) => v.key)).toEqual([
            'light:0',
            'light:1',
            'light:2',
            'light:3',
        ]);
        // O mapa desenha cada vista com a malha dela e a quinta com a malha da câmera, num passe só.
        const rs = s.scene.resourceSystem;
        const expected = [
            ...[0, 1, 2, 3].map((v) => rs.bufferOf(s.surface, `view:light:${v}:vertices`)),
            rs.bufferOf(s.surface, 'vertices'),
        ];
        expect(expected.every((b) => b !== undefined)).toBe(true);
        expect(s.draws('ShadowFlow').map((d) => d.vertex)).toEqual(expected);
    });

    it('forward e sombra desenham pelo registro indireto (contagem copiada antes do passe)', async () => {
        const s = await adaptiveScene(['indirect-first-instance']);
        s.step();
        s.step();
        const passes = new Set(
            s
                .draws()
                .filter((d) => d.indirect !== undefined)
                .map((d) => d.pass),
        );
        expect([...passes].sort()).toEqual(['ForwardFlow', 'ShadowFlow']);
        expect(s.computes().some((l) => l.startsWith('copy:') && l.includes('indirect'))).toBe(
            true,
        );
    });

    it("sem 'indirect-first-instance': desenho direto pela capacidade e adaptiveUnavailable uma vez", async () => {
        const s = await adaptiveScene([]);
        const events: unknown[] = [];
        s.scene.events.on('adaptiveUnavailable', (e) => events.push(e));
        s.step();
        s.step();
        expect(events).toHaveLength(1);
        // O forward desenha direto; a sombra virtual desenha sempre pelos seus argumentos (os pares das páginas), com a
        // contagem de índices da capacidade.
        expect(s.draws('ForwardFlow').some((d) => d.indirect !== undefined)).toBe(false);
        expect(s.draws().some((d) => d.indexCount === s.surface.adaptive!.indexCapacity)).toBe(
            true,
        );
        expect(
            s.draws('ShadowFlow').every((d) => d.indexCount === s.surface.adaptive!.indexCapacity),
        ).toBe(true);
    });
});

describe('deslocamento (spec 011, T115)', () => {
    it('o ponto: a pronta devolve zero; o relevo de um material compila no ponto com os valores em milímetros', () => {
        expect(displacementPoint.ready.source).toMatch(/return 0\.0;/);
        const fn = Displacements.leather({ height: 0.5, scale: 5.5, pattern_scale: [2, 1] });
        expect(fn.code).toMatch(
            /fn displacement_fn\(s: SurfaceSample, data: DisplacementFnParams\) -> f32/,
        );
        expect(fn.params).toMatchObject({ relief_height: 'f32', out_scale: 'f32' });
        expect(fn.values.relief_height).toBe(0.5);
        expect(fn.values.out_scale).toBe(5.5);
        // Um deslocamento por relevo da biblioteca (`relief.*`).
        expect(Object.keys(Displacements).sort()).toEqual(Object.keys(relief).sort());
        expect(Object.keys(Displacements)).toEqual(
            expect.arrayContaining(['leather', 'woodRough', 'wool', 'woodPineFine']),
        );
        expect(() => Displacements.wool({ crack_depth: 1 })).toThrow(/crack_depth/);
    });

    it('os kernels da superfície (grade, geometria diferencial, adaptativa) montam com a função no lugar da pronta', () => {
        const fn = Displacements.woodRough({ scale: 5.5 });
        for (const kernel of [surfaceEval, surfaceEvalDiff, surfaceAdapt]) {
            // Sem a função: o ponto deslocado com altura zero (o mesmo ponto de antes).
            const plain = composeWgsl(kernel).spec.source;
            expect(plain).toContain('fn surface_displaced_at');
            expect(plain).toMatch(/fn displacement_fn\([^)]*\) -> f32 \{\s*return 0\.0;/);
            // Com ela: o grafo do relevo (os padrões e `surface.displacement`) dentro do kernel, a pronta fora.
            const bound = composeWgsl(
                bindPoints(
                    kernel,
                    new Map<BindablePoint, WgslModule>([[displacementPoint, fn.module]]),
                ),
            ).spec.source;
            expect(bound).toContain('node_surface_displacement');
            expect(bound).toContain('node_pattern_rings');
            expect(bound).not.toMatch(/fn displacement_fn\([^)]*\) -> f32 \{\s*return 0\.0;/);
        }
    });
});
