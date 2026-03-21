import { SDFCollider } from '../SDFCollider';
import type { AABB }   from '../../../scene/components/physics/Collider';
import type { mat4 }   from 'gl-matrix';

/**
 * Forma de colisão cúbica. (Camada 3)
 *
 * SDF (Inigo Quilez):
 *   q = |p| - h
 *   d = |max(q, 0)| + min(max(qx, qy, qz), 0)
 *
 * Substitui getAABB herdado da SDFCollider (esférico, conservador demais)
 * por uma AABB justa — centro ± halfExtents * escala por eixo.
 * Sem isso, BoxBoxCollision detecta colisões fantasma ~70% antes do contato real.
 */
export class BoxShape extends SDFCollider {
    private readonly hw: number;
    private readonly hh: number;
    private readonly hd: number;

    constructor(
        halfWidth:  number = 0.5,
        halfHeight: number = 0.5,
        halfDepth:  number = 0.5,
    ) {
        const hw = halfWidth, hh = halfHeight, hd = halfDepth;
        super({
            sdf: (p) => {
                const qx = Math.abs(p[0]!) - hw;
                const qy = Math.abs(p[1]!) - hh;
                const qz = Math.abs(p[2]!) - hd;
                return (
                    Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2) +
                    Math.min(Math.max(qx, qy, qz), 0)
                );
            },
            boundingRadius: Math.sqrt(hw ** 2 + hh ** 2 + hd ** 2),
            shape: 'Box',
        });
        this.hw = halfWidth;
        this.hh = halfHeight;
        this.hd = halfDepth;
    }

    public override computeInertiaTensor(mass: number): [number, number, number] {
        return [
            mass * (this.hh ** 2 + this.hd ** 2) / 12,
            mass * (this.hw ** 2 + this.hd ** 2) / 12,
            mass * (this.hw ** 2 + this.hh ** 2) / 12,
        ];
    }

    /**
     * AABB justa por eixo: extrai a escala por coluna da worldMatrix e
     * multiplica pelos half-extents locais. Válido para caixas não rotacionadas.
     */
    public override getAABB(worldMatrix: mat4): AABB {
        const center = this.getWorldCenter(worldMatrix);
        const sx = Math.sqrt(worldMatrix[0]! ** 2 + worldMatrix[1]! ** 2 + worldMatrix[2]!  ** 2);
        const sy = Math.sqrt(worldMatrix[4]! ** 2 + worldMatrix[5]! ** 2 + worldMatrix[6]!  ** 2);
        const sz = Math.sqrt(worldMatrix[8]! ** 2 + worldMatrix[9]! ** 2 + worldMatrix[10]! ** 2);
        return {
            min: new Float32Array([center[0]! - this.hw * sx, center[1]! - this.hh * sy, center[2]! - this.hd * sz]),
            max: new Float32Array([center[0]! + this.hw * sx, center[1]! + this.hh * sy, center[2]! + this.hd * sz]),
        };
    }
}
