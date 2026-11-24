// Referência em f64 das vistas de sombra em perspectiva (spec 013, R4; só para testes): a aritmética de
// `shadow_virtual.wgsl` para a luz de foco (uma vista, o cone externo) e a pontual (seis vistas, as faces do cubo em
// volta da posição). Uma vista em perspectiva é um referencial (os eixos x, y e o eixo da vista z, pela direção, e a
// origem na luz) e a tangente do meio ângulo: o ponto do mundo vai às coordenadas do plano da vista q = (x, y) / (z ·
// tan) — o tronco é o quadrado [−1, 1]² — com a profundidade linear z ao longo do eixo. Os níveis são níveis de resolução
// do mesmo tronco: o nível k tem páginas de lado 2 · 2ᵏ / N (N páginas por lado no mais fino).

/** Vetor 3D. */
export type V3 = readonly [number, number, number];

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: V3): V3 => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** O referencial de uma vista: os eixos x e y do plano, o eixo da vista z (unitários, ortogonais) e a origem. */
export interface ShadowFrame {
    readonly x: V3;
    readonly y: V3;
    readonly z: V3;
    readonly origin: V3;
}

/**
 * O referencial da vista de eixo `direction` com origem em `origin` (`sv_frame`): o "para cima" é +y, trocado por +z
 * quando o eixo é quase vertical — a mesma base da luz direcional.
 */
export function shadowFrame(direction: V3, origin: V3 = [0, 0, 0]): ShadowFrame {
    const z = normalize(direction);
    const up: V3 = Math.abs(z[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    const x = normalize(cross(up, z));
    return { x, y: cross(z, x), z, origin };
}

/** O maior meio ângulo de uma vista em perspectiva (rad): além dele a tangente não cabe no mapa (`SV_CONE_MAX`). */
export const SHADOW_CONE_MAX = 1.4;

/** A tangente do meio ângulo da vista da luz de foco de cone externo `outerCone` (rad). */
export function shadowSpotTan(outerCone: number): number {
    return Math.tan(Math.min(Math.max(outerCone, 1e-3), SHADOW_CONE_MAX));
}

/**
 * O ponto `p` na vista (`sv_light`): as coordenadas do plano (x, y) e a profundidade linear z. Atrás da origem
 * (z ≤ 0), `undefined`.
 */
export function shadowProject(frame: ShadowFrame, tan: number, p: V3): V3 | undefined {
    const d: V3 = [p[0] - frame.origin[0], p[1] - frame.origin[1], p[2] - frame.origin[2]];
    const z = dot(frame.z, d);
    if (z <= 0) return undefined;
    return [dot(frame.x, d) / (z * tan), dot(frame.y, d) / (z * tan), z];
}

/** O ponto do mundo das coordenadas do plano `q` e da profundidade `z` da vista (`sp_unproject`, em `shadow_pages.wgsl`). */
export function shadowUnproject(frame: ShadowFrame, tan: number, l: V3): V3 {
    const v: V3 = [l[0] * l[2] * tan, l[1] * l[2] * tan, l[2]];
    return [
        frame.origin[0] + frame.x[0] * v[0] + frame.y[0] * v[1] + frame.z[0] * v[2],
        frame.origin[1] + frame.x[1] * v[0] + frame.y[1] * v[1] + frame.z[1] * v[2],
        frame.origin[2] + frame.x[2] * v[0] + frame.y[2] * v[1] + frame.z[2] * v[2],
    ];
}

/**
 * A face do cubo da direção `d` (`sv_cube_face`): a do eixo de maior módulo — 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z; no
 * empate, x antes de y antes de z.
 */
export function shadowCubeFace(d: V3): number {
    const a: V3 = [Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2])];
    if (a[0] >= a[1] && a[0] >= a[2]) return d[0] >= 0 ? 0 : 1;
    if (a[1] >= a[2]) return d[1] >= 0 ? 2 : 3;
    return d[2] >= 0 ? 4 : 5;
}

/** O eixo da face `face` do cubo (`sv_cube_axis`). */
export function shadowCubeAxis(face: number): V3 {
    const sign = face % 2 === 0 ? 1 : -1;
    const axis = Math.floor(face / 2);
    return [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0];
}

/** O referencial da face `face` da pontual em `origin`: 90° de abertura (tangente 1). */
export function shadowCubeFrame(face: number, origin: V3): ShadowFrame {
    return shadowFrame(shadowCubeAxis(face), origin);
}

/** Níveis de resolução de uma vista em perspectiva de `pagesPerLevel` páginas por lado: ⌊log₂ N⌋, no mínimo 1. */
export function shadowPerspectiveLevels(pagesPerLevel: number): number {
    return Math.max(1, Math.floor(Math.log2(pagesPerLevel)));
}

/** Lado de um texel do nível `k` no plano da vista (o tronco tem lado 2; páginas de 128 texels). */
export function shadowPerspectiveTexel(pagesPerLevel: number, k: number): number {
    return (2 * 2 ** k) / pagesPerLevel / 128;
}

/**
 * O nível de um ponto pela resolução na tela (`sv_level_at`): o mais fino cujo texel, no ponto (o texel do plano pela
 * profundidade `z` e a tangente), não é menor que o pixel da câmera lá (`footprint`, m) — o texel da sombra perto do
 * pixel da tela, sem desenhar mais fino do que a tela mostra.
 */
export function shadowPerspectiveLevel(o: {
    readonly footprint: number;
    readonly z: number;
    readonly tan: number;
    readonly pagesPerLevel: number;
}): number {
    const texel0 = shadowPerspectiveTexel(o.pagesPerLevel, 0) * o.z * o.tan;
    const k = Math.floor(Math.log2(Math.max(o.footprint / Math.max(texel0, 1e-12), 1)));
    return Math.min(Math.max(k, 0), shadowPerspectiveLevels(o.pagesPerLevel) - 1);
}
