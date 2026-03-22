import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import type { PlaneShape } from '../shapes/PlaneShape';
import { vec3, mat4 } from 'gl-matrix';

/**
 * Narrowphase exato para Caixa vs Plano — manifold multi-ponto.
 *
 * Usa Collider.getWorldVertices?() (interface, sem cast concreto) para obter
 * os vértices do OBB e filtra os que penetram o plano.
 *
 * Retornar N vértices de contato é essencial para dissipação de yaw:
 * com contato único no centro da face, ω×r = 0 → atrito zero para yaw.
 * Com N cantos, cada um tem velocidade tangencial não-nula → atrito dissipa
 * todos os eixos de rotação.
 *
 * Se getWorldVertices não estiver disponível (forma não-poliédrica), cai de
 * volta para contato único via getClosestPoint (comportamento anterior).
 */
export class PlaneBoxCollision implements CollisionAlgorithm {
    private static readonly GRAD_EPS = 1e-3;
    /**
     * Espessura de contato (contact skin).
     * Vértices dentro desta distância da superfície do plano são considerados
     * em contato, mesmo sem penetração real. Isso mantém o manifold ativo
     * entre substeps após a depenetração (quando o vértice fica exatamente
     * em d=0), garantindo que atrito seja aplicado continuamente.
     */
    private static readonly CONTACT_SKIN = 0.005;

    public detect(
        box:   Collider, boxMat:   mat4,
        plane: Collider, planeMat: mat4,
    ): CollisionManifold | null {
        if (!plane.sdf) return null;

        // Normal do plano em espaço de mundo
        const e = PlaneBoxCollision.GRAD_EPS;
        const gx = plane.sdf(vec3.fromValues( e, 0, 0)) - plane.sdf(vec3.fromValues(-e, 0, 0));
        const gy = plane.sdf(vec3.fromValues(0,  e, 0)) - plane.sdf(vec3.fromValues(0, -e, 0));
        const gz = plane.sdf(vec3.fromValues(0, 0,  e)) - plane.sdf(vec3.fromValues(0, 0, -e));
        const localN = vec3.normalize(vec3.create(), vec3.fromValues(gx, gy, gz));

        const rotMat = mat4.clone(planeMat);
        rotMat[12] = rotMat[13] = rotMat[14] = 0;
        const worldN = vec3.normalize(vec3.create(), vec3.transformMat4(vec3.create(), localN, rotMat));

        const planeOriginWorld = vec3.transformMat4(vec3.create(), vec3.create(), planeMat);
        const planeOffset = vec3.dot(worldN, planeOriginWorld);

        // Limite do plano (PlaneShape finito)
        const planeShape = plane as unknown as PlaneShape;
        const bounded = isFinite(planeShape.halfWidth) || isFinite(planeShape.halfDepth);
        const invPlane = bounded ? (mat4.invert(mat4.create(), planeMat) ?? mat4.create()) : null;

        const negWorldN = vec3.negate(vec3.create(), worldN);

        // Multi-ponto: usa getWorldVertices da interface Collider (sem cast concreto)
        const vertices = box.getWorldVertices?.(boxMat);
        if (vertices && vertices.length > 0) {
            const contactPoints: vec3[] = [];
            let maxDepth = 0;

            for (const v of vertices) {
                const d = planeOffset - vec3.dot(worldN, v);
                if (d < -PlaneBoxCollision.CONTACT_SKIN) continue;

                if (invPlane) {
                    const lc = vec3.transformMat4(vec3.create(), v, invPlane);
                    if (Math.abs(lc[0]!) > planeShape.halfWidth ||
                        Math.abs(lc[2]!) > planeShape.halfDepth) continue;
                }

                contactPoints.push(new Float32Array(v) as unknown as vec3);
                if (d > maxDepth) maxDepth = d;
            }

            if (contactPoints.length === 0) return null;

            return {
                contactPoints,
                normal: new Float32Array(negWorldN) as unknown as vec3,
                depth:  maxDepth,
            };
        }

        // Fallback: contato único via getClosestPoint (para Colliders sem getWorldVertices)
        const boxCenter  = box.getWorldCenter(boxMat);
        const queryPt    = vec3.scaleAndAdd(vec3.create(), boxCenter, worldN, -1000);
        const contactPoint = box.getClosestPoint(boxMat, queryPt) as Float32Array;

        const depth = planeOffset - vec3.dot(worldN, contactPoint as unknown as vec3);
        if (depth <= 0) return null;

        if (invPlane) {
            const lc = vec3.transformMat4(vec3.create(), contactPoint as unknown as vec3, invPlane);
            if (Math.abs(lc[0]!) > planeShape.halfWidth ||
                Math.abs(lc[2]!) > planeShape.halfDepth) return null;
        }

        return {
            contactPoints: [new Float32Array(contactPoint) as unknown as vec3],
            normal:        new Float32Array(negWorldN) as unknown as vec3,
            depth,
        };
    }
}
