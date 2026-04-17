import { Entity }    from '../core/Entity';
import { Transform }  from '../math/Transform';
import type { Geometry } from '../components/Geometry';
import type { Material } from '../components/Material';
import type { Physic }   from '../core/Physic';
import type { vec3, quat } from 'gl-matrix';

/**
 * Aggregate root da Camada 2 para objetos renderizáveis.
 * O desenvolvedor instancia Mesh — nunca Entity vazia.
 * Transform, Geometry, Material e corpos físicos são compostos internamente.
 *
 * @example
 * const mesh = new Mesh(new BoxGeometry(), new StandardMaterial());
 * mesh.position[1] = 2;
 * scene.add(mesh);
 */
export class Mesh extends Entity {
    private readonly _transform: Transform;

    constructor(geometry: Geometry, material: Material) {
        super();
        this._transform = new Transform();
        this.add(this._transform);
        this.add(geometry);
        this.add(material);
    }

    get position(): vec3 { return this._transform.position; }
    get rotation(): quat { return this._transform.rotation; }
    get scale():    vec3 { return this._transform.scale;    }

    public addPhysics(physic: Physic): this {
        this.add(physic);
        return this;
    }

    public get geometry(): Geometry {
        return this.getComponent<Geometry>('Geometry')!;
    }

    public get material(): Material {
        return this.getComponent<Material>('Material')!;
    }
}
