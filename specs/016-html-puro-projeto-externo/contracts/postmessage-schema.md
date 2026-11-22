# Contrato: mensagens entre o pacote e a vitrine (`016`)

Único canal entre o conteúdo isolado e a página da vitrine (ADR 0010, FR-013). A vitrine **não**
envia mensagens ao pacote.

## Mensagem aceita: `vitrine:resize`

Enviada pelo pacote para informar a altura do próprio conteúdo:

```js
parent.postMessage({ type: 'vitrine:resize', height: document.documentElement.scrollHeight }, '*');
```

O alvo `'*'` é necessário porque o documento isolado tem origem opaca e não conhece a origem da
vitrine; a mensagem só carrega um número.

### Esquema

```json
{
  "type": "object",
  "additionalProperties": true,
  "required": ["type", "height"],
  "properties": {
    "type": { "const": "vitrine:resize" },
    "height": { "type": "number", "minimum": 120, "maximum": 4000 }
  }
}
```

Propriedades extras são ignoradas (não recusam a mensagem, mas nunca são lidas).

### Regras do receptor (`web/assets/html-frame.mjs`)

Uma mensagem só é aplicada quando **todas** valem:

1. `event.source === iframe.contentWindow` da moldura correspondente (procura entre as molduras da
   página; nenhuma → ignora).
2. `event.origin === "null"` (origem opaca; qualquer outra origem → ignora).
3. `event.data` é objeto simples, `type === "vitrine:resize"`.
4. `height` é número finito, `120 <= height <= 4000`; aplicado como `Math.round(height)` px.
5. A moldura está em modo "Altura do conteúdo" (`data-height-mode="content"`); nos modos "Altura
   da tela" e "Altura fixa" a mensagem é ignorada.
6. Até 10 mensagens por segundo por moldura (balde de 10 fichas, recarga de 10/s); o excesso é
   descartado.
7. Altura igual à atual (diferença menor que 1 px) é ignorada, para evitar laços de leiaute.

Mensagem fora das regras é descartada **sem erro visível e sem registro no console** (M-07,
edge case "Mensagem inválida do pacote").

### Exemplos

| Mensagem | Resultado |
| --- | --- |
| `{ type: "vitrine:resize", height: 640 }` da própria moldura, origem `null` | altura 640 px |
| `{ type: "vitrine:resize", height: 99999 }` | ignorada |
| `{ type: "vitrine:resize", height: "640" }` | ignorada (texto) |
| `{ type: "vitrine:navigate", url: "https://…" }` | ignorada |
| `"640"` (texto solto) | ignorada |
| 30 mensagens válidas em 1 s | as primeiras 10 aplicadas |
| Mensagem válida vinda de outra moldura ou de outra janela | ignorada |

## Estados de carregamento (sem mensagem)

| Estado | Gatilho | O que o visitante vê |
| --- | --- | --- |
| Carregando | moldura criada | camada com cores da vitrine e o título; moldura com opacidade 0 por cima |
| Pronto | evento `load` da moldura | moldura visível; camada escondida |
| Falha | 10 s sem `load` | "O conteúdo interativo não carregou", "Tentar novamente" (recarrega o `src` e reinicia os 10 s) e o botão de contato da vitrine |
| Sem JavaScript | — | moldura visível direto, sem camada |

Altura padrão sem mensagem: bloco 320 px; página em "Altura do conteúdo" usa a altura da tela até a
primeira mensagem. Com `prefers-reduced-motion: reduce`, a troca de camada não anima.
