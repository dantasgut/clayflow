import { Entity } from '../core/Entity';
import type { Geometry } from '../components/Geometry';
import type { Material } from '../components/Material';
import type { Physic } from '../core/Physic';

/**
 * Aggregate root da Camada 2 para objetos renderizáveis.
 * O desenvolvedor instancia Mesh — nunca Entity vazia.
 * Geometry, Material e corpos físicos são compostos internamente.
 *
 * @example
 * const mesh = new Mesh(new BoxGeometry(1, 1, 1), new StandardMaterial());
 * mesh.addPhysics(new SoftBody({ mass: 1 }));
 * scene.add(mesh);
 */
export class Mesh extends Entity {
    constructor(geometry: Geometry, material: Material) {
        super();
        this.add(geometry);
        this.add(material);
    }

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
