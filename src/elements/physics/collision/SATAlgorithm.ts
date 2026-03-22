import type { CollisionAlgorithm }  from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider }             from '../../../scene/components/physics/Collider';
import type { CollisionManifold }    from '../../../scene/systems/collision/CollisionManifold';
import { vec3 }                      from 'gl-matrix';
import type { mat4 }                 from 'gl-matrix';

/**
 * SAT (Separating Axis Theorem) para OBB vs OBB.
 *
 * Testa 15 eixos separadores:
 *   — 3 normais de face de A
 *   — 3 normais de face de B
 *   — 9 produtos vetoriais de arestas de A × arestas de B
 *
 * Se qualquer eixo separa os dois OBBs, não há colisão.
 * O eixo com menor sobreposição determina normal e profundidade do contato.
 *
 * Geração do manifold:
 *   — Eixo de face  → recorte (Sutherland-Hodgman) da face incidente contra a face de referência.
 *   — Eixo de aresta → ponto mais próximo entre as duas arestas contribuintes.
 *
 * Requer que ambos os Collider implementem getLocalHalfExtents().
 * Se qualquer um não implementar, retorna null.
 */
export class SATAlgorithm implements CollisionAlgorithm {
    private static readonly CROSS_EPS    = 1e-6;
    /**
     * Espessura de contato (contact skin) — mesma lógica do PlaneBoxCollision.
     * Vértices dentro desta distância da face de referência são aceitos como
     * contato mesmo após depenetração (quando d ≈ 0), mantendo o manifold
     * ativo entre substeps e garantindo atrito contínuo.
     */
    private static readonly CONTACT_SKIN = 0.005;

    public detect(
        a: Collider, aWM: mat4,
        b: Collider, bWM: mat4,
    ): CollisionManifold | null {
        const heA = a.getLocalHalfExtents?.();
        const heB = b.getLocalHalfExtents?.();
        if (!heA || !heB) return null;

        const obbA = SATAlgorithm.extractOBB(aWM, heA);
        const obbB = SATAlgorithm.extractOBB(bWM, heB);
        const T    = vec3.subtract(vec3.create(), obbB.center, obbA.center);

        let minOverlap = Infinity;
        let minNormal  = vec3.create();
        let contactType: 'faceA' | 'faceB' | 'edge' = 'faceA';
        let edgeIdxA = 0;
        let edgeIdxB = 0;

        // ── 3 eixos de face de A ─────────────────────────────────────────────
        for (let i = 0; i < 3; i++) {
            const ax      = obbA.axes[i]!;
            const overlap = SATAlgorithm.project(ax, obbA, obbB, T);
            if (overlap <= 0) return null;
            if (overlap < minOverlap) {
                minOverlap  = overlap;
                const d     = vec3.dot(ax, T);
                minNormal   = d >= 0 ? vec3.clone(ax) : vec3.negate(vec3.create(), ax);
                contactType = 'faceA';
            }
        }

        // ── 3 eixos de face de B ─────────────────────────────────────────────
        for (let i = 0; i < 3; i++) {
            const ax      = obbB.axes[i]!;
            const overlap = SATAlgorithm.project(ax, obbA, obbB, T);
            if (overlap <= 0) return null;
            if (overlap < minOverlap) {
                minOverlap  = overlap;
                const d     = vec3.dot(ax, T);
                minNormal   = d >= 0 ? vec3.clone(ax) : vec3.negate(vec3.create(), ax);
                contactType = 'faceB';
            }
        }

        // ── 9 eixos de arestas cruzadas ──────────────────────────────────────
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const cross = vec3.cross(vec3.create(), obbA.axes[i]!, obbB.axes[j]!);
                const len   = vec3.length(cross);
                if (len < SATAlgorithm.CROSS_EPS) continue;     // eixos paralelos — ignorar
                vec3.scale(cross, cross, 1 / len);

                const overlap = SATAlgorithm.project(cross, obbA, obbB, T);
                if (overlap <= 0) return null;
                if (overlap < minOverlap) {
                    minOverlap  = overlap;
                    const d     = vec3.dot(cross, T);
                    minNormal   = d >= 0 ? vec3.clone(cross) : vec3.negate(vec3.create(), cross);
                    contactType = 'edge';
                    edgeIdxA    = i;
                    edgeIdxB    = j;
                }
            }
        }

        // ── Geração do manifold ──────────────────────────────────────────────
        if (contactType === 'edge') {
            const cp = SATAlgorithm.edgeContact(obbA, edgeIdxA, obbB, edgeIdxB, minNormal);
            if (!cp) return null;
            return {
                contactPoints: [new Float32Array(cp) as unknown as vec3],
                normal: new Float32Array(minNormal) as unknown as vec3,
                depth:  minOverlap,
            };
        }

        const contactPoints = contactType === 'faceA'
            ? SATAlgorithm.faceContact(obbA, obbB,  minNormal)
            : SATAlgorithm.faceContact(obbB, obbA,  vec3.negate(vec3.create(), minNormal));

        if (contactPoints.length === 0) return null;

        return {
            contactPoints,
            normal: new Float32Array(minNormal) as unknown as vec3,
            depth:  minOverlap,
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers internos
    // ──────────────────────────────────────────────────────────────────────────

    private static extractOBB(wm: mat4, localHe: [number, number, number]): OBB {
        const sx = Math.hypot(wm[0]!, wm[1]!, wm[2]!);
        const sy = Math.hypot(wm[4]!, wm[5]!, wm[6]!);
        const sz = Math.hypot(wm[8]!, wm[9]!, wm[10]!);
        return {
            center: vec3.fromValues(wm[12]!, wm[13]!, wm[14]!),
            axes: [
                vec3.fromValues(wm[0]! / sx, wm[1]! / sx, wm[2]! / sx),
                vec3.fromValues(wm[4]! / sy, wm[5]! / sy, wm[6]! / sy),
                vec3.fromValues(wm[8]! / sz, wm[9]! / sz, wm[10]! / sz),
            ],
            he: [localHe[0] * sx, localHe[1] * sy, localHe[2] * sz],
        };
    }

    /** Sobreposição dos dois OBBs projetada sobre `axis` (positivo = overlap). */
    private static project(axis: vec3, obbA: OBB, obbB: OBB, T: vec3): number {
        const d  = Math.abs(vec3.dot(axis, T));
        const rA = obbA.he[0]! * Math.abs(vec3.dot(axis, obbA.axes[0]!))
                 + obbA.he[1]! * Math.abs(vec3.dot(axis, obbA.axes[1]!))
                 + obbA.he[2]! * Math.abs(vec3.dot(axis, obbA.axes[2]!));
        const rB = obbB.he[0]! * Math.abs(vec3.dot(axis, obbB.axes[0]!))
                 + obbB.he[1]! * Math.abs(vec3.dot(axis, obbB.axes[1]!))
                 + obbB.he[2]! * Math.abs(vec3.dot(axis, obbB.axes[2]!));
        return rA + rB - d;
    }

    /** Vértice de suporte de um OBB na direção d. */
    private static support(obb: OBB, d: vec3): vec3 {
        const pt = vec3.clone(obb.center);
        for (let i = 0; i < 3; i++) {
            const sign = vec3.dot(d, obb.axes[i]!) >= 0 ? 1 : -1;
            vec3.scaleAndAdd(pt, pt, obb.axes[i]!, sign * obb.he[i]!);
        }
        return pt;
    }

    /**
     * Ponto de contato aresta-aresta: ponto médio da aproximação mais próxima
     * entre as duas arestas contribuintes (linhas infinitas).
     */
    private static edgeContact(
        obbA: OBB, axIdxA: number,
        obbB: OBB, axIdxB: number,
        normal: vec3,
    ): vec3 | null {
        const dirA = obbA.axes[axIdxA]!;
        const dirB = obbB.axes[axIdxB]!;

        // Ponto de suporte de cada caixa na direção da normal (A: contra, B: favor)
        const ptA = SATAlgorithm.support(obbA, vec3.negate(vec3.create(), normal));
        const ptB = SATAlgorithm.support(obbB, normal);

        // Linhas: ptA + t*dirA  e  ptB + s*dirB
        // Solução: minimizar |ptA + t*dirA - ptB - s*dirB|²
        const w    = vec3.subtract(vec3.create(), ptA, ptB);
        const a    = vec3.dot(dirA, dirA);
        const e    = vec3.dot(dirB, dirB);
        const f    = vec3.dot(dirB, w);
        const bv   = vec3.dot(dirA, dirB);
        const dv   = vec3.dot(dirA, w);
        const den  = a * e - bv * bv;

        const t = Math.abs(den) > 1e-10 ? (bv * f - e * dv) / den : 0;
        const s = (bv * t + f) / e;

        const closeA = vec3.scaleAndAdd(vec3.create(), ptA, dirA, t);
        const closeB = vec3.scaleAndAdd(vec3.create(), ptB, dirB, s);
        return vec3.scale(
            vec3.create(),
            vec3.add(vec3.create(), closeA, closeB),
            0.5,
        ) as vec3;
    }

    /**
     * Contato face-face: recorte da face incidente (em `inc`) pela face de referência (em `ref`).
     *
     * `refNormal` aponta de `ref` para `inc`.
     * Retorna os vértices recortados que penetram a face de referência.
     */
    private static faceContact(ref: OBB, inc: OBB, refNormal: vec3): vec3[] {
        // Face de referência: face de `ref` mais alinhada com refNormal
        let refAxisIdx = 0;
        let maxDot     = -Infinity;
        for (let i = 0; i < 3; i++) {
            const d = Math.abs(vec3.dot(refNormal, ref.axes[i]!));
            if (d > maxDot) { maxDot = d; refAxisIdx = i; }
        }
        const refSign       = vec3.dot(refNormal, ref.axes[refAxisIdx]!) >= 0 ? 1 : -1;
        const refFaceCenter = vec3.scaleAndAdd(
            vec3.create(), ref.center, ref.axes[refAxisIdx]!, refSign * ref.he[refAxisIdx]!,
        );

        // Face incidente: face de `inc` mais anti-paralela a refNormal.
        // Usa Math.abs para encontrar o eixo mais alinhado (independente do sinal),
        // depois escolhe o sinal negativo para obter a face oposta a refNormal.
        // Sem Math.abs, quando todos os dot products são positivos (ex: cubo rotacionado
        // 30° em Z sobre plataforma horizontal), o código escolhia o eixo Z (dot=0)
        // em vez do eixo Y local (dot=0.866 → face negativa = -0.866 = mais anti-paralela).
        let incAxisIdx = 0;
        let maxAbsDot  = -Infinity;
        for (let i = 0; i < 3; i++) {
            const d = Math.abs(vec3.dot(refNormal, inc.axes[i]!));
            if (d > maxAbsDot) { maxAbsDot = d; incAxisIdx = i; }
        }
        const incSign       = vec3.dot(refNormal, inc.axes[incAxisIdx]!) <= 0 ? 1 : -1;
        const incFaceCenter = vec3.scaleAndAdd(
            vec3.create(), inc.center, inc.axes[incAxisIdx]!, incSign * inc.he[incAxisIdx]!,
        );

        // 4 vértices da face incidente
        const ia = (incAxisIdx + 1) % 3;
        const ib = (incAxisIdx + 2) % 3;
        const aA = vec3.scale(vec3.create(), inc.axes[ia]!,  inc.he[ia]!);
        const aB = vec3.scale(vec3.create(), inc.axes[ia]!, -inc.he[ia]!);
        const bA = vec3.scale(vec3.create(), inc.axes[ib]!,  inc.he[ib]!);
        const bB = vec3.scale(vec3.create(), inc.axes[ib]!, -inc.he[ib]!);

        let polygon: vec3[] = [
            vec3.add(vec3.create(), vec3.add(vec3.create(), incFaceCenter, aA), bA),
            vec3.add(vec3.create(), vec3.add(vec3.create(), incFaceCenter, aA), bB),
            vec3.add(vec3.create(), vec3.add(vec3.create(), incFaceCenter, aB), bB),
            vec3.add(vec3.create(), vec3.add(vec3.create(), incFaceCenter, aB), bA),
        ];

        // Recorte pelos 4 planos laterais da face de referência
        const ra = (refAxisIdx + 1) % 3;
        const rb = (refAxisIdx + 2) % 3;
        const cDotRa = vec3.dot(ref.axes[ra]!, ref.center);
        const cDotRb = vec3.dot(ref.axes[rb]!, ref.center);

        const sidePlanes: Array<{ n: vec3; offset: number }> = [
            { n: ref.axes[ra]!,                                offset:  ref.he[ra]! + cDotRa },
            { n: vec3.negate(vec3.create(), ref.axes[ra]!),    offset:  ref.he[ra]! - cDotRa },
            { n: ref.axes[rb]!,                                offset:  ref.he[rb]! + cDotRb },
            { n: vec3.negate(vec3.create(), ref.axes[rb]!),    offset:  ref.he[rb]! - cDotRb },
        ];

        for (const plane of sidePlanes) {
            polygon = SATAlgorithm.clipPolygon(polygon, plane.n, plane.offset);
            if (polygon.length === 0) return [];
        }

        // Mantém vértices que penetram ou estão dentro do contact skin da face de referência.
        // Sem skin, após depenetração d ≈ 0 e o manifold é perdido → sem atrito → deslize.
        const refOffset = vec3.dot(refNormal, refFaceCenter);
        const result: vec3[] = [];
        for (const v of polygon) {
            if (refOffset - vec3.dot(refNormal, v) >= -SATAlgorithm.CONTACT_SKIN) {
                result.push(new Float32Array(v) as unknown as vec3);
            }
        }
        return result;
    }

    /** Sutherland-Hodgman: recorta polígono pelo semiespaço n·x ≤ offset. */
    private static clipPolygon(polygon: vec3[], n: vec3, offset: number): vec3[] {
        if (polygon.length === 0) return [];
        const result: vec3[] = [];
        for (let i = 0; i < polygon.length; i++) {
            const curr  = polygon[i]!;
            const next  = polygon[(i + 1) % polygon.length]!;
            const dCurr = vec3.dot(n, curr) - offset;
            const dNext = vec3.dot(n, next) - offset;
            if (dCurr <= 0) result.push(curr);
            if ((dCurr < 0) !== (dNext < 0)) {
                const t = dCurr / (dCurr - dNext);
                result.push(vec3.lerp(vec3.create(), curr, next, t) as vec3);
            }
        }
        return result;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ──────────────────────────────────────────────────────────────────────────────

interface OBB {
    center: vec3;
    axes:   [vec3, vec3, vec3];
    he:     [number, number, number];  // semi-extensões em espaço de mundo
}
