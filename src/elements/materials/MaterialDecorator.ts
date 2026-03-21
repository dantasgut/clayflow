import { Material } from '../../scene/components/Material';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';

/**
 * Base do Decorator para Material (GoF Decorator Pattern).
 * Delega toda alocação GPU ao material interno e permite que
 * subclasses sobrescrevam apenas as propriedades que precisam mudar
 * (ex: topology, blending, doubleSided) sem herança de subclasses.
 *
 * @example
 * class WireframeDecorator extends MaterialDecorator {
 *     constructor(inner: Material) {
 *         super(inner);
 *         this.topology = 'line-list';
 *     }
 * }
 */
export abstract class MaterialDecorator extends Material {
    protected readonly _inner: Material;

    constructor(inner: Material) {
        super();
        this._inner = inner;
        this.shaderId         = inner.shaderId;
        this.bindGroupSchema  = inner.bindGroupSchema;
        this.rawUniforms      = inner.rawUniforms;
        this.transparent      = inner.transparent;
        this.doubleSided      = inner.doubleSided;
        this.topology         = inner.topology;
    }

    public allocateResource(resourceManager: ResourceManager): void {
        this._inner.allocateResource(resourceManager);
        this.bindGroupIds = this._inner.bindGroupIds;
        this.state        = this._inner.state;
    }

    public updateResource(resourceManager: ResourceManager): void {
        this._inner.updateResource(resourceManager);
        this.state = this._inner.state;
    }

    public disposeResource(resourceManager: ResourceManager): void {
        this._inner.disposeResource(resourceManager);
        this.bindGroupIds = [];
        this.state        = this._inner.state;
    }
}
