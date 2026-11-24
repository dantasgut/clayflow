import { describe, expect, it } from 'vitest';
import {
    SHADOW_CONE_MAX,
    shadowCubeAxis,
    shadowCubeFace,
    shadowCubeFrame,
    shadowFrame,
    shadowPerspectiveLevel,
    shadowPerspectiveLevels,
    shadowPerspectiveTexel,
    shadowProject,
    shadowSpotTan,
    shadowUnproject,
    type V3,
} from '../shadowViews';

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('vistas de sombra em perspectiva (spec 013, T029)', () => {
    it('a vista da luz de foco: o eixo no centro, a profundidade linear ao longo dele e o cone externo inscrito no tronco', () => {
        // Arrange: uma luz de foco inclinada, de cone externo de 30°.
        const origin: V3 = [1, 4, -2];
        const direction: V3 = [0.3, -0.9, 0.2];
        const outer = Math.PI / 6;
        const frame = shadowFrame(direction, origin);
        const tan = shadowSpotTan(outer);
        // Assert: a base é ortonormal e o eixo da vista é a direção.
        expect(dot(frame.x, frame.y)).toBeCloseTo(0, 12);
        expect(dot(frame.x, frame.z)).toBeCloseTo(0, 12);
        expect(dot(frame.y, frame.z)).toBeCloseTo(0, 12);
        expect(dot(frame.x, frame.x)).toBeCloseTo(1, 12);
        expect(dot(frame.y, frame.y)).toBeCloseTo(1, 12);
        // Um ponto no eixo, a 5 m: o centro do plano, profundidade 5.
        const onAxis = shadowProject(frame, tan, add(origin, frame.z, 5))!;
        expect(onAxis[0]).toBeCloseTo(0, 12);
        expect(onAxis[1]).toBeCloseTo(0, 12);
        expect(onAxis[2]).toBeCloseTo(5, 12);
        // Pontos na borda do cone externo, a qualquer distância e em qualquer azimute: raio 1 no plano.
        for (const depth of [0.5, 3, 20])
            for (const a of [0, 1.1, 2.9, 4.4]) {
                const side = add(
                    add(origin, frame.z, depth),
                    add(
                        [0, 0, 0],
                        add(
                            [
                                frame.x[0] * Math.cos(a),
                                frame.x[1] * Math.cos(a),
                                frame.x[2] * Math.cos(a),
                            ],
                            frame.y,
                            Math.sin(a),
                        ),
                    ),
                    depth * Math.tan(outer),
                );
                const q = shadowProject(frame, tan, side)!;
                expect(Math.hypot(q[0], q[1])).toBeCloseTo(1, 10);
                expect(q[2]).toBeCloseTo(depth, 10);
            }
        // Atrás da luz, nada; a ida e a volta devolvem o ponto.
        expect(shadowProject(frame, tan, add(origin, frame.z, -1))).toBeUndefined();
        const p: V3 = [0.2, 1.5, -1.1];
        const back = shadowUnproject(frame, tan, shadowProject(frame, tan, p)!);
        back.forEach((c, i) => expect(c).toBeCloseTo(p[i]!, 10));
    });

    it('o eixo quase vertical troca o "para cima" (a base não degenera), e o cone aberto demais é preso', () => {
        const frame = shadowFrame([0, -1, 0]);
        expect(dot(frame.x, frame.x)).toBeCloseTo(1, 12);
        expect(dot(frame.y, frame.z)).toBeCloseTo(0, 12);
        expect(shadowSpotTan(Math.PI / 2)).toBeCloseTo(Math.tan(SHADOW_CONE_MAX), 12);
        expect(Number.isFinite(shadowSpotTan(Math.PI / 2))).toBe(true);
    });

    it('as seis faces da pontual: cada eixo no centro da sua face, e toda direção numa face só, dentro do tronco dela', () => {
        // Arrange
        const origin: V3 = [2, 1, -3];
        // Assert: o eixo de cada face cai no centro dela.
        for (let face = 0; face < 6; face++) {
            const axis = shadowCubeAxis(face);
            expect(shadowCubeFace(axis)).toBe(face);
            const q = shadowProject(shadowCubeFrame(face, origin), 1, add(origin, axis, 3))!;
            expect(q[0]).toBeCloseTo(0, 12);
            expect(q[1]).toBeCloseTo(0, 12);
            expect(q[2]).toBeCloseTo(3, 12);
        }
        // Direções quaisquer: a face escolhida vê o ponto à frente, dentro de [−1, 1]²; a profundidade é a maior
        // componente (a distância ao longo do eixo da face).
        let n = 0;
        for (let i = 0; i < 400; i++) {
            const d: V3 = [
                Math.sin(i * 12.9898) * 3,
                Math.sin(i * 78.233 + 1) * 3,
                Math.sin(i * 37.719 + 2) * 3,
            ];
            const face = shadowCubeFace(d);
            const q = shadowProject(shadowCubeFrame(face, origin), 1, add(origin, d))!;
            expect(Math.abs(q[0])).toBeLessThanOrEqual(1 + 1e-12);
            expect(Math.abs(q[1])).toBeLessThanOrEqual(1 + 1e-12);
            expect(q[2]).toBeCloseTo(Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])), 12);
            n++;
        }
        expect(n).toBe(400);
    });

    it('a face pela direção: na aresta entre duas faces o ponto está na borda das duas, à mesma profundidade (sem emenda)', () => {
        const origin: V3 = [0, 0, 0];
        // Uma direção a um passo da aresta entre +x e +z, dos dois lados.
        const eps = 1e-9;
        const near: V3 = [1 + eps, 0.3, 1];
        const far: V3 = [1, 0.3, 1 + eps];
        expect(shadowCubeFace(near)).toBe(0);
        expect(shadowCubeFace(far)).toBe(4);
        const a = shadowProject(shadowCubeFrame(0, origin), 1, near)!;
        const b = shadowProject(shadowCubeFrame(4, origin), 1, far)!;
        // Na borda do tronco de cada uma (|q| = 1 num eixo) e à mesma profundidade: a comparação não salta de uma face
        // para a outra.
        expect(Math.max(Math.abs(a[0]), Math.abs(a[1]))).toBeCloseTo(1, 8);
        expect(Math.max(Math.abs(b[0]), Math.abs(b[1]))).toBeCloseTo(1, 8);
        expect(a[2]).toBeCloseTo(b[2], 8);
        // No empate exato, x antes de y antes de z (uma face só).
        expect(shadowCubeFace([1, 1, 1])).toBe(0);
        expect(shadowCubeFace([-1, 1, 1])).toBe(1);
        expect(shadowCubeFace([0.5, -1, 1])).toBe(3);
        expect(shadowCubeFace([0.5, 0.5, -1])).toBe(5);
    });

    it('o nível pela resolução na tela: o mais fino cujo texel não é menor que o pixel da câmera no ponto', () => {
        // Arrange: 32 páginas por lado (4096² no nível mais fino), abertura de 90°.
        const pagesPerLevel = 32;
        expect(shadowPerspectiveLevels(pagesPerLevel)).toBe(5);
        expect(shadowPerspectiveLevels(16)).toBe(4);
        expect(shadowPerspectiveLevels(4)).toBe(2);
        const texel = (k: number, z: number): number =>
            shadowPerspectiveTexel(pagesPerLevel, k) * z;
        // Cada nível dobra o texel; o mais grosso cobre o tronco com 2 × 2 páginas.
        expect(texel(1, 1)).toBeCloseTo(2 * texel(0, 1), 15);
        expect(shadowPerspectiveTexel(pagesPerLevel, 4) * 128 * 2).toBeCloseTo(2, 12);
        // Act + Assert: o pixel menor que o texel mais fino fica no nível 0; maior, sobe um nível a cada dobro.
        const level = (footprint: number, z = 4): number =>
            shadowPerspectiveLevel({ footprint, z, tan: 1, pagesPerLevel });
        expect(level(0.5 * texel(0, 4))).toBe(0);
        expect(level(1.0 * texel(0, 4))).toBe(0);
        expect(level(2.1 * texel(0, 4))).toBe(1);
        expect(level(4.1 * texel(0, 4))).toBe(2);
        // O texel escolhido nunca passa do dobro do pixel (enquanto há nível): a sombra tem a resolução da tela.
        for (const f of [1.3, 2.7, 5.9, 11]) {
            const k = level(f * texel(0, 4));
            expect(texel(k, 4)).toBeLessThanOrEqual(f * texel(0, 4));
            expect(2 * texel(k, 4)).toBeGreaterThan(f * texel(0, 4));
        }
        // Mais longe da luz o texel cresce: o mesmo pixel pede um nível mais fino; além do mais grosso, o mais grosso.
        expect(level(4.1 * texel(0, 4), 8)).toBe(1);
        expect(level(1e6)).toBe(4);
    });
});
