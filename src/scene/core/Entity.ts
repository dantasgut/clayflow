import { EventDispatcher } from '../core/EventDispatcher';
import { Transform } from '../math/Transform';
import type { Component } from './Component';
import type { Physic } from './Physic';

/**
 * A Entidade (Container ECS / Padrão Facade).
 * Responsabilidade Única: Segurar 'Components'.
 * A Matemática foi extraída para o Componente Obrigatório 'Transform'.
 */
export class Entity extends EventDispatcher {
    private static _nextId: number = 0;
    public readonly id: number = ++Entity._nextId;

    public isEntity: boolean = true;
    public visible: boolean = true;
    public name: string = "Entity";

    // O Array de gavetas! Índice 0 = Visuais, Índice 1 = Físicas
    private _layers: Map<string, any>[] = [
        new Map(), // ResourceType.VISUAL_COMPONENT
        new Map(), // ResourceType.PHYSICS_MECHANIC
    ];

    constructor() {
        super();
        // Toda Entidade 3D nasce OBRIGATORIAMENTE com as Leis da Física/Espaço anexadas.
        const transform = new Transform();
        (transform as any).isComponent = true; // Força rotar como componente no ECS interno
        this.add(transform);
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
     * Adiciona Entidade filha ou Componente. (Roteamento Automático ECS)
     */
    public add(object: any): this {
        if (object === this as any) return this;

        // ROTEAMENTO ORIENTADO A DADOS
        if ('layer' in object && this._layers[object.layer]) {
            this._layers[object.layer]!.set(object.type, object);
            if (object.onAttach) object.onAttach(this);
            // Se o objeto for uma Entidade por si só (como RigidBody), adiciona na topologia espacial
            if (object.isEntity) {
                this.transform.add(object.transform);
            }
        }
        // ROTEAMENTO: É um Nó Espacial Puro (Entidade vazia/grupo)
        else if (object.isEntity) {
            this.transform.add(object.transform);
            this.dispatchEvent({ type: 'added', target: object });
        }

        return this;
    }

    public remove(object: any): this {
        if ('layer' in object && this._layers[object.layer]) {
            if (this._layers[object.layer]!.has(object.type)) {
                if (object.onDetach) object.onDetach(this);
                this._layers[object.layer]!.delete(object.type);
            }
            if (object.isEntity) {
                this.transform.remove(object.transform);
            }
        }
        else if (object.isEntity) {
            this.transform.remove(object.transform);
            this.dispatchEvent({ type: 'removed', target: object });
        }
        return this;
    }

    /**
     * Dispara o cálculo em cascata no subsistema matemático.
     */
    public updateWorldMatrix(updateParents: boolean = false, updateChildren: boolean = true): void {
        this.transform.updateWorldMatrix(updateParents, updateChildren);
    }

    // Note: addComponent e removeComponent foram removidos da API pública 
    // a pedido da arquitetura, pois add() roteia isso agora nativamente.

    public getComponent<T extends Component>(type: string): T | undefined {
        return this._layers[0]?.get(type) as T | undefined;
    }

    public getComponents(): IterableIterator<Component> {
        return this._layers[0]!.values();
    }

    public getPhysics(): IterableIterator<Physic> {
        return this._layers[1]!.values();
    }

    public hasComponent(type: string): boolean {
        return this._layers[0]!.has(type);
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
