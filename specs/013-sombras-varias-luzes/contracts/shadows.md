# Contrato: sombras de várias luzes

## Autoria

```ts
new DirectionalLight({ direction, intensity, castShadow: true });
new SpotLight({ position, direction, innerCone, outerCone, range, castShadow: true });
new PointLight({ position, range, castShadow: true });
new RectLight({ position, direction, right, size, intensity, castShadow: true });

app.events.on('shadowUnavailable', ({ light, reason }) => {
  /* 'limit' | 'kind' */
});
app.defaults.renderer.profile; // os tetos: RENDER_PROFILES[perfil].shadows
```

- `castShadow` vale em qualquer número de luzes; as que passam do teto iluminam sem sombra e geram o evento.
- A ordem de quem fica com sombra é a de inserção.
- As opções de sombra por luz (`shadow: { size, bias, normalBias, penumbraSamples, firstLevelRadius }`) continuam.

## Pontos de cena (WGSL)

```wgsl
fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32;   // 1 = sem sombra; por luz, de qualquer tipo
fn light_thickness(light: u32, p: vec3f, n: vec3f) -> vec2f;  // (espessura, cosseno de entrada); x < 0: desconhecida
fn light_transmission(light: u32, p: vec3f) -> vec3f;         // inalterado
```

- Cada contribuição responde só pela sua luz; para as demais devolve o neutro (1 na visibilidade, desconhecida na
  espessura).
- `light_visibility` de uma luz de área lê a série filtrada; fora da tela (froxels, sondas), 1 ou o raio do próprio
  consumidor.

## Garantias

- A sombra de uma luz não depende das outras (FR-002).
- Com uma luz com sombra, a imagem é a de antes (FR-004).
- Sem página fina, a visibilidade vem do nível mais grosso; a espessura fica desconhecida (nunca zero).
- O trabalho por quadro tem teto constante; o que não coube fica para o quadro seguinte como sombra menos fina.
