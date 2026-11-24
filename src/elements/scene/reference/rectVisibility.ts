// Referência em f64 da sombra de uma luz de área retangular (spec 013, R5; só para testes): a fração do retângulo que
// um ponto vê, com oclusores de forma fechada no caminho — por quadratura sobre o retângulo (a regra do ponto médio numa
// grade), o segmento do ponto a cada amostra testado contra cada oclusor. É a grandeza que o passe por raios do motor
// estima sorteando pontos no retângulo.

type Vec3 = readonly [number, number, number];

/** O retângulo da fonte: o centro, a normal do lado que emite, o eixo da largura (unitários) e a largura e a altura. */
export interface RectSource {
    readonly center: Vec3;
    readonly normal: Vec3;
    readonly axis: Vec3;
    readonly size: readonly [number, number];
}

/**
 * Um oclusor: a esfera, ou o meio-plano — a parte do plano por `point` de normal `normal` em que
 * (x − point) · `inside` ≤ 0 (a borda reta passa por `point`, perpendicular a `inside`).
 */
export type RectOccluder =
    | { readonly kind: 'sphere'; readonly center: Vec3; readonly radius: number }
    | {
          readonly kind: 'halfPlane';
          readonly point: Vec3;
          readonly normal: Vec3;
          readonly inside: Vec3;
      };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** O segmento de `from` a `to` (abertos nas pontas) cruza o oclusor? */
export function segmentBlocked(from: Vec3, to: Vec3, occluder: RectOccluder): boolean {
    const d = sub(to, from);
    if (occluder.kind === 'sphere') {
        const m = sub(from, occluder.center);
        const a = dot(d, d);
        const b = dot(m, d);
        const c = dot(m, m) - occluder.radius * occluder.radius;
        const disc = b * b - a * c;
        if (disc <= 0) return false;
        const root = Math.sqrt(disc);
        const t0 = (-b - root) / a;
        const t1 = (-b + root) / a;
        return t1 > 0 && t0 < 1;
    }
    const along = dot(d, occluder.normal);
    if (along === 0) return false;
    const t = dot(sub(occluder.point, from), occluder.normal) / along;
    if (t <= 0 || t >= 1) return false;
    const hit: Vec3 = [from[0] + d[0] * t, from[1] + d[1] * t, from[2] + d[2] * t];
    return dot(sub(hit, occluder.point), occluder.inside) <= 0;
}

/**
 * A fração da área do retângulo `rect` visível do ponto `point`, com os `occluders` no caminho: a média, numa grade de
 * `n` × `n` pontos médios, das amostras cujo segmento até o ponto não cruza nenhum oclusor. O ponto atrás do lado que
 * emite não vê nada (0).
 */
export function rectVisibleFraction(
    point: Vec3,
    rect: RectSource,
    occluders: readonly RectOccluder[],
    n = 256,
): number {
    if (dot(sub(point, rect.center), rect.normal) <= 0) return 0;
    const up = cross(rect.normal, rect.axis);
    let visible = 0;
    for (let j = 0; j < n; j++) {
        const v = ((j + 0.5) / n - 0.5) * rect.size[1];
        for (let i = 0; i < n; i++) {
            const u = ((i + 0.5) / n - 0.5) * rect.size[0];
            const q: Vec3 = [
                rect.center[0] + rect.axis[0] * u + up[0] * v,
                rect.center[1] + rect.axis[1] * u + up[1] * v,
                rect.center[2] + rect.axis[2] * u + up[2] * v,
            ];
            if (!occluders.some((o) => segmentBlocked(point, q, o))) visible++;
        }
    }
    return visible / (n * n);
}
