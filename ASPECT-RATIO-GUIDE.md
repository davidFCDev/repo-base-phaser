# Guía de Ajuste por Aspect Ratio para Juegos Remix

## Problema

Los juegos Remix están diseñados para un canvas **2:3 (720×1080)**, pero en dispositivos reales el viewport puede ser más alto (9:16, 9:19.5, etc.) debido a notches, barras de estado o simplemente pantallas más alargadas.

Esto causa que elementos UI posicionados con `top` fijo (como el badge del score) queden demasiado pegados al borde superior o tapados por el notch en pantallas más altas.

## Solución Implementada

Se usa **JavaScript en el resize handler** para detectar el aspect ratio real del contenedor y ajustar dinámicamente la posición de los elementos UI.

### ¿Por qué no CSS `@media (max-aspect-ratio)`?

Se intentó primero con CSS media queries:

```css
/* ❌ NO FUNCIONA BIEN — max-aspect-ratio: 2/3 incluye exactamente 2:3 */
@media (max-aspect-ratio: 2/3) {
  #score-wrapper {
    top: 50px;
  }
}
```

El problema es que `max-aspect-ratio: 2/3` usa `<=`, por lo que **incluye** el ratio 2:3 exacto. No hay forma en CSS puro de distinguir "exactamente 2:3" de "más alto que 2:3".

### Solución: JS en el resize handler

```typescript
function resizeRenderer(): void {
  // ... resize del renderer, cámara, canvas, etc.

  const w = container.clientWidth;
  const h = container.clientHeight;

  // Ajustar posición de elementos UI según aspect ratio
  const scoreWrapper = document.getElementById("score-wrapper");
  if (scoreWrapper) {
    const aspectRatio = w / h;
    const is2by3 = Math.abs(aspectRatio - 2 / 3) < 0.02; // tolerancia de ~0.02
    scoreWrapper.style.top = is2by3 || aspectRatio > 2 / 3 ? "18px" : "50px";
  }
}
```

### Lógica de decisión

| Condición | Aspect Ratio | `top` aplicado | Ejemplo |
|-----------|-------------|----------------|---------|
| Exactamente 2:3 (±0.02) | ~0.667 | `18px` | 720×1080 |
| Más ancho que 2:3 | > 0.667 | `18px` | Landscape, tablets |
| Más alto que 2:3 | < 0.647 | `50px` | 9:16, 9:19.5 (iPhone) |

La tolerancia `0.02` evita falsos positivos por redondeo de píxeles.

## Cómo aplicar en otros juegos

### Paso 1: CSS base (valor por defecto para 2:3)

En el `<style>` del `index.html`, define la posición para el caso estándar 2:3:

```css
#mi-elemento-ui {
  position: absolute;
  top: 18px; /* posición para 2:3 */
  left: 50%;
  transform: translateX(-50%);
}
```

### Paso 2: JS en el resize handler

Busca tu función de resize (normalmente `resizeRenderer`, `onResize`, o el listener de `window.resize`) y añade al final:

```typescript
// Dentro de tu función de resize
const w = container.clientWidth;  // o window.innerWidth
const h = container.clientHeight; // o window.innerHeight

const elemento = document.getElementById("mi-elemento-ui");
if (elemento) {
  const aspectRatio = w / h;
  const is2by3 = Math.abs(aspectRatio - 2 / 3) < 0.02;

  if (is2by3 || aspectRatio > 2 / 3) {
    // Pantalla 2:3 o más ancha → posición original
    elemento.style.top = "18px";
  } else {
    // Pantalla más alta que 2:3 → bajar para evitar notch
    elemento.style.top = "50px";
  }
}
```

### Paso 3: Llamar al resize inicial

Asegúrate de que la función se ejecuta al inicio y en cada resize:

```typescript
resizeRenderer(); // Ejecución inicial
window.addEventListener("resize", resizeRenderer);
```

## Patrón reutilizable para múltiples elementos

Si tienes varios elementos que ajustar, crea una función helper:

```typescript
interface ResponsiveUIRule {
  elementId: string;
  property: string;      // "top", "bottom", "fontSize", etc.
  standard: string;      // valor para 2:3
  tall: string;          // valor para pantallas más altas
}

const uiRules: ResponsiveUIRule[] = [
  { elementId: "score-wrapper", property: "top", standard: "18px", tall: "50px" },
  { elementId: "lives-display",  property: "top", standard: "60px", tall: "92px" },
  { elementId: "combo-display",  property: "top", standard: "30%",  tall: "35%" },
];

function adjustUIForAspectRatio(w: number, h: number): void {
  const aspectRatio = w / h;
  const isTall = aspectRatio < (2 / 3 - 0.02);

  for (const rule of uiRules) {
    const el = document.getElementById(rule.elementId);
    if (el) {
      (el.style as any)[rule.property] = isTall ? rule.tall : rule.standard;
    }
  }
}
```

## Ratios de referencia comunes

| Dispositivo | Ratio (w/h) | Decimal | Clasificación |
|-------------|------------|---------|---------------|
| Remix estándar | 2:3 | 0.667 | Base |
| iPhone 8 | 9:16 | 0.5625 | Más alto |
| iPhone 14 | 9:19.5 | 0.462 | Mucho más alto |
| iPhone 14 Pro Max | 9:19.5 | 0.462 | Mucho más alto |
| iPad | 3:4 | 0.75 | Más ancho |
| Android típico | 9:20 | 0.45 | Mucho más alto |

## Resumen

1. El CSS por defecto cubre el caso 2:3
2. El JS en el resize handler detecta pantallas más altas y ajusta
3. Se usa tolerancia `0.02` para evitar problemas de redondeo
4. Se recalcula en cada resize → funciona con cambios de orientación
