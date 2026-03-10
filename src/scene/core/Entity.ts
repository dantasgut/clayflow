import { EventDispatcher } from '../core/EventDispatcher';
import { Transform } from '../math/Transform';

/**
 * Interface base para qualquer Componente (Geometry, Material, Transform) 
 * anexado a uma Entidade Entity. (Padrão ECS)
 */
export interface IComponent {
    readonly type: string;
    onAttach?(entity: Entity): void;
    onDetach?(entity: Entity): void;
}

/**
 * A Entidade (Container ECS / Padrão Facade).
 * Responsabilidade Única: Segurar 'IComponents'.
 * A Matemática foi extraída para o Componente Obrigatório 'Transform'.
 */
export class Entity extends EventDispatcher {
    public isEntity: boolean = true;
    public visible: boolean = true;
    public name: string = "Entity";

    // Repositório de Componentes Lógicos (O coração do ECS)
    private _components: Map<string, IComponent> = new Map();

    constructor() {
        super();
        // Toda Entidade 3D nasce OBRIGATORIAMENTE com as Leis da Física/Espaço anexadas.
        this.addComponent(new Transform());
    }

    // ==========================================================
    // FACADE / DX (Developer Experience):
    // Atalhos para manipular o Transform como se fosse nativo, mantendo a API Familiar
    // ==========================================================
    get transform(): Transform {
        return this.getComponent<Transform>('Transform')!; // Garantido no constructor
    }

    get position() { return this.transform.position; }
    get rotation() { return this.transform.rotation; }
    get scale() { return this.transform.scale; }
    
    // Matrizes para o Extrator
    get localMatrix() { return this.transform.localMatrix; }
    get worldMatrix() { return this.transform.worldMatrix; }

    get parent(): Entity | null {
        // Se meu Transform tem pai, quem é o dono primário (Entidade Entity) dele?
        return this.transform.parent ? this.transform.parent.owner : null;
    }
    
    get children(): Entity[] {
        // Mapeia os filhos do Transform de volta para a Entidade Mãe correspondente
        return this.transform.children.map(t => t.owner).filter(entity => entity !== null) as Entity[];
    }

    /**
     * Adiciona Entidade filha (Delega a matemática de parentesco ao Transform)
     */
    public add(object: Entity): this {
        if (object === this) return this;
        
        this.transform.add(object.transform);
        this.dispatchEvent({ type: 'added', target: object });
        return this;
    }

    public remove(object: Entity): this {
        this.transform.remove(object.transform);
        this.dispatchEvent({ type: 'removed', target: object });
        return this;
    }

    /**
     * Dispara o cálculo em cascata no subsistema matemático.
     */
    public updateWorldMatrix(updateParents: boolean = false, updateChildren: boolean = true): void {
        this.transform.updateWorldMatrix(updateParents, updateChildren);
    }

    // ==========================================================
    // SISTEMA ECS: Gerenciamento real da Entidade
    // ==========================================================
    public addComponent(component: IComponent): this {
        this._components.set(component.type, component);
        if (component.onAttach) {
            component.onAttach(this);
        }
        return this;
    }

    public removeComponent(type: string): this {
        const component = this._components.get(type);
        if (component) {
            if (component.onDetach) component.onDetach(this);
            this._components.delete(type);
        }
        return this;
    }

    public getComponent<T extends IComponent>(type: string): T | undefined {
        return this._components.get(type) as T | undefined;
    }

    public hasComponent(type: string): boolean {
        return this._components.has(type);
    }

    /**
     * Travessia genérica na Árvore Espacial.
     */
    public traverse(callback: (entity: Entity) => void): void {
        callback(this);
        const children = this.children;
        for (let i = 0; i < children.length; i++) {
            if (children[i]) {
                children[i]!.traverse(callback);
            }
        }
    }
}
