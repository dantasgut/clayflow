# Contrato — Flow com slots, registro e ciclo de vida

## `Flow<TSlots, S>` (C2, `scene/flows/Flow.ts`; exportado por `scene`)

```ts
export abstract class Flow<TSlots extends SlotMap = SlotMap, S extends string = 'idle'> {
  abstract readonly type: string;
  abstract readonly slots: TSlots;
  abstract readonly pipelines: readonly PipelineDescriptor[];
  protected abstract readonly transitions: FlowTransitions<S>;
  /** Eventos de domínio que o Flow quer receber (resourceReady por schema). */
  readonly listens: readonly Schema[] = [];
  get lifecycle(): FlowLifecycle; // 'pending' | 'preparing' | 'ready' | 'disposed'
  get state(): S;
  abstract dispatch(frame: Frame, bound: BoundFlow<TSlots>): void;
  dispose(): void;
}
```

Regras:

- `dispatch` só grava comandos (`frame.compute`/`frame.render`); preparar pipelines, layouts ou bind groups de dados
  consumidos dentro dele é erro de contrato (verificado em teste com um core que registra `create` durante a
  gravação).
- `state` muda só por `transitions`; `FlowTransitions<S> = Partial<Record<S, Partial<Record<FlowEventName,
{ to: S; run?: (event, ctx) => void } | 'ignore'>>>>`. Evento sem entrada → `FlowTransitionError(type, state,
event)`.
- `run` recebe `{ bound, rebind(pipelineId, bindings) }` para recriar recursos privados e religar.

## `slot` (C2, `scene/flows/slots.ts`)

```ts
slot.pool(poolKey: string, opts?: { optional?: boolean })
slot.bodies()
slot.pools(poolKeys: readonly string[])
slot.singleton(schema: Schema, opts?: { optional?: boolean })
slot.entities({ all: readonly Schema[] })
slot.texture(schema: Schema, descId: string)
slot.target('canvas' | { schema, descId, depth?: { schema, descId } })
```

## `FlowRegistry` (C2) — alterado

```ts
register<F extends Flow>(factory: (ctx: FlowContext) => F, options: RegisterOptions): FlowRegistration<F>
override<F extends Flow>(bodyType: string, factory: FlowFactory<F>, options?: Omit<RegisterOptions, 'bodyType'>): FlowRegistration<F>
unregister(registration: FlowRegistration): boolean
resolve(bodyType: string): FlowRegistration | undefined   // override → maior priority → último registrado
flowsInPhase(phase): readonly Flow[]                      // instâncias existentes, ordem da regra única
phasesInOrder(): readonly Phase[]
```

- Sem `bodyType`: instancia no registro e chama `resources.ensureFlowAllocated(flow, options)`.
- Com `bodyType`: instancia sob demanda (R4). `unregister` descarta as instâncias (`dispose`, objetos de GPU da C2
  ligados ao Flow, inscrições) e cancela preparação em curso (compilação concluída depois não o reativa).

## `ResourceSystem` (C2) — adições

```ts
ensureFlowAllocated(flow: Flow, options: RegisterOptions): void
releaseFlow(flow: Flow): void
```

- Resolve slots (R2), prepara pipelines (R3/R6), cria layouts e bind groups, entrega eventos ao Flow e emite
  `flowReady { type, bodyType }` ao entrar em `ready`.
- Ao alocar um Resource cujo pool tem chave = `bodyType` registrado sem instância, instancia pelo registro
  (`registry.resolve`) e aloca.
- Emite `bindGroupReplaced { source, oldSpec, newSpec }` (R7).

## `ExecutionSystem` (C2) — alterado

Mantém `activeFlows` por `flowReady` e pela saída de `ready`; grava por fase na ordem da regra única; sem broadcasts.

## Erros

| Erro                    | Quando                                                        | Mensagem nomeia                                             |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `FlowTransitionError`   | evento sem transição                                          | Flow, estado, evento                                        |
| `FlowBindingError`      | binding sem fonte; `consumes` sem resolver; tipo incompatível | binding, grupo, pipeline, Flow, nome, resolvers disponíveis |
| `FlowRegistrationError` | `type` repetido na mesma fase; `bodyType` vazio               | tipo, fase                                                  |
