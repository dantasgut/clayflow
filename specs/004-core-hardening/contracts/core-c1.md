# Contrato C1 — identidade, imutabilidade, posse e dispositivo

## `EngineCore.create` / `createAsync`

```ts
/**
 * Cria (ou reutiliza, por conteúdo) o objeto de GPU descrito por `spec` e devolve `spec`.
 * A spec passa a ser IMUTÁVEL em profundidade: qualquer atribuição posterior lança TypeError.
 * Specs aninhadas (shader em pipeline, layout/buffers em bind group) também ficam congeladas.
 * Cada chamada registra `spec` como dona do objeto de GPU; `destroy(spec)` remove só essa posse.
 */
create<S extends ResourceSpec>(spec: S): S;
createAsync<S extends ResourceSpec>(spec: S): Promise<S>;

/** Remove a posse de `spec`; o objeto de GPU é destruído quando nenhuma spec dona resta. */
destroy(spec: ResourceSpec): void;
```

Garantias:

- `specHash(spec)` é calculado no máximo uma vez por objeto de spec; usos seguintes são consulta.
- Specs de conteúdo igual (inclusive aninhado) → mesmo hash → mesmo objeto de GPU.
- Funções (`BundleSpec.body`) entram no hash por identidade de referência — corpos diferentes nunca colidem.
- Spec descartada → entrada de hash coletada junto (sem crescimento de memória).

## `EngineCore.initialize`

```ts
initialize(canvas?: HTMLCanvasElement, canvasOptions?: CanvasOptions, device?: DeviceOptions): Promise<void>;
```

- `device.requiredFeatures` indisponível → rejeita com `Error` que nomeia a feature.
- Features opcionais do motor (`timestamp-query`) e `device.optionalFeatures` são pedidas se disponíveis.
- Limites de escala do motor são pedidos no máximo do adaptador; `device.requiredLimits` acima do máximo → máximo,
  registrado em `capabilities().clampedLimits`.
- `requestRecover` e reconfiguração do canvas reaplicam as mesmas `CanvasOptions` e `DeviceOptions`.

## `EngineCore.canvasSize`

```ts
/** Tamanho atual do canvas anexado, ou `undefined` sem canvas (texturas `sizeFromCanvas` da C2). */
canvasSize(): { readonly width: number; readonly height: number } | undefined;
```

## `EngineCore.capabilities`

```ts
/** Capacidades efetivas do device atual (ver data-model). Lança se não inicializado. */
capabilities(): DeviceCapabilities;
```

## `Dispatcher` (passes de computação)

```ts
/**
 * Despacha grupos suficientes para `count` invocações com grupos de `workgroupSize`, distribuídos em x/y dentro de
 * `maxComputeWorkgroupsPerDimension`. O shader indexa por `gid.x + gid.y * num_workgroups.x * workgroupSize` e guarda
 * `i >= count`. `count === 0` não despacha.
 */
invocations(count: number, workgroupSize: number): this;

/** Lança RangeError (nomeando `maxComputeWorkgroupsPerDimension`) se alguma dimensão exceder o limite do device. */
workgroups(x: number, y?: number, z?: number): this;
```

C4 expõe `app.capabilities` (getter) e `ApplicationOptions.device?: DeviceOptions` — sem importar `core/gpu`.
