import type { CollisionAlgorithm } from '../../../scene/systems/collision/CollisionAlgorithm';
import type { Collider } from '../../../scene/components/physics/Collider';
import type { CollisionManifold } from '../../../scene/systems/collision/CollisionManifold';
import type { PlaneShape } from '../shapes/PlaneShape';
import { vec3, mat4 } from 'gl-matrix';

/**
 * Narrowphase exato para Caixa vs Plano.
 * O dispatcher chama sempre detect(Box, Plane) — ordem canônica alfabética (Box < Plane).
 * Retorna normal A→B: do primeiro arg (Box) em direção ao segundo (Plane).
 *
 * Ponto de contato: vértice mais profundo da caixa (support point em -worldN),
 * obtido via getClosestPoint da Collider interface. Isso garante que o vetor
 * r = contactPoint - bodyCenter seja não-nulo para caixas inclinadas,
 * produzindo torque real na resolução de colisões.
 */
export class PlaneBoxCollision implements CollisionAlgorithm {
    private static readonly GRAD_EPS = 1e-3;

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

        // Vértice mais profundo da caixa ao longo de -worldN (support point).
        // Passando um ponto muito distante em -worldN, getClosestPoint converge
        // para o vértice/aresta mais próximo dessa direção — exatamente o ponto
        // de contato. Isso produz r ≠ 0 para caixas inclinadas → torque real.
        const boxCenter = box.getWorldCenter(boxMat);
        const queryPt   = vec3.scaleAndAdd(vec3.create(), boxCenter, worldN, -1000);
        const contactPoint = box.getClosestPoint(boxMat, queryPt) as Float32Array;

        const depth = planeOffset - vec3.dot(worldN, contactPoint as unknown as vec3);
        if (depth <= 0) return null;

        // Verificação de limites: rejeita contato fora da área do plano.
        const planeShape = plane as unknown as PlaneShape;
        if (isFinite(planeShape.halfWidth) || isFinite(planeShape.halfDepth)) {
            const invPlane = mat4.invert(mat4.create(), planeMat) ?? mat4.create();
            const localContact = vec3.transformMat4(vec3.create(), contactPoint as unknown as vec3, invPlane);
            if (Math.abs(localContact[0]!) > planeShape.halfWidth ||
                Math.abs(localContact[2]!) > planeShape.halfDepth) return null;
        }

        return {
            contactPoint: new Float32Array(contactPoint),
            normal:       new Float32Array(vec3.negate(vec3.create(), worldN)),
            depth,
        };
    }
}
