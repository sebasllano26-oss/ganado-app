# Gestión Ganadera — interfaz compartida

Una herramienta sobria para propietarios y equipos ganaderos. Género utilitario; la portada explica el producto y la aplicación prioriza los registros.

## Identidad

Gestión Ganadera usa un nombre descriptivo y neutral. Fraunces aparece en encabezados de presentación y Geist en controles, contenido y cifras. Los colores se concentran en verde bosque, papel cálido y superficies claras. El modo oscuro reutiliza los mismos roles.

La dirección operativa toma como referencia el sistema entregado en `desing/`: verde bosque profundo, tarjetas tonales, jerarquía numérica visible, bordes definidos y controles grandes para uso en campo. Los prototipos fuente se conservan como material local de referencia y no forman parte del paquete de producción.

## Composición

- Portada: texto a la izquierda, ilustración de campo y muestra identificada a la derecha; funciones principales como filas claras.
- Aplicación: navegación lateral, contexto de la ganadería, resumen numérico, gráficos y tablas.
- Formularios: etiquetas visibles, campos de al menos 52 px, controles para mostrar la contraseña, errores cerca del campo, botones deshabilitados durante envíos y foco visible.
- Móvil: menú lateral plegable, secciones apiladas y tablas con desplazamiento dentro de su contenedor.

El registro explica sus tres pasos —cuenta, ganadería y entrada— y abre el espacio de trabajo al terminar.

## Tokens

La fuente de colores, tipografía, radios, espaciado y movimiento es `tokens.css`. `src/style.css` aplica estos tokens a las superficies nuevas y enlaza los nombres de variables de las vistas operativas anteriores. Las cifras se muestran en la tipografía de lectura.

`src/design-system.css` se carga al final y gobierna la aplicación entera desde una sola capa: redefine los `--color-*` según el sistema de `desing/` y los puentea a los alias que consumen las vistas heredadas. Sus decisiones:

- **Profundidad por capas tonales**, no por sombras. Papel `#FCF9F2` → zócalo `#F6F3EC` → agrupador `#F1EEE7` → tarjeta `#FFFFFF`, cada una con un borde nítido de 1 px teñido de verde. Una sombra difusa se borra bajo luz directa; un borde no.
- **Verde bosque `#1B4332` como único color de mando.** Ámbar tierra para sanidad y celo, terracota para retiros y alertas.
- **Relleno y texto son tokens distintos.** Un color de relleno se juzga contra el lienzo (3:1 basta); uno de texto, contra su propio fondo teñido (4.5:1). El ámbar `#D97706` sobre ámbar al 12 % rendía 2.68:1, así que el texto usa `--color-warning-text`.
- **Radio disciplinado:** 16 px en tarjetas, campos y paneles; 8 px en chips; píldora sólo en etiquetas.
- **Cifras en `tabular-nums`.** Una columna de pesos cuyos dígitos cambian de ancho es ilegible de un vistazo.
- **Objetivos de toque de 44 px** en cualquier puntero grueso. Los botones de icono de las tablas conservan su dibujo de 20 px y amplían el área sensible con una capa invisible, para no alterar la altura de la fila.

Los iconos son vectores de Phosphor. La aplicación no usa emoji como icono estructural: dependen de la fuente del sistema, cambian entre plataformas y no obedecen a los tokens de color ni de tamaño. Los símbolos ♂ y ♀ sí se conservan, porque son signos tipográficos de sexo, no pictogramas.

## Contenido y movimiento

La demostración está identificada en todo momento. No se presentan métricas ficticias como resultados comerciales. No hay música ni animaciones decorativas. Se respeta la preferencia de movimiento reducido.

El Asistente GanaX usa la misma arquitectura visual del espacio de trabajo: contexto a la izquierda, conversación como superficie principal, preguntas sugeridas y un compositor con objetivos táctiles de al menos 44 px. Las respuestas se presentan como texto seguro y la interfaz distingue claramente los mensajes del usuario, la guía y los errores.

## Revisión

La portada y el resumen se verifican a 320, 375, 414 y 768 píxeles mediante Playwright. Las pantallas operativas conservan parte de la estructura del sistema original; no se afirma conformidad integral de las 69 reglas visuales sobre ese código heredado.

Dos comprobaciones se corrieron sobre el navegador, en las ocho vistas del espacio de trabajo y en ambos temas:

- **Contraste.** Se resolvió el fondo real de cada nodo de texto subiendo por sus ancestros y mezclando las capas translúcidas. Se corrigieron los 79 grupos que no llegaban a 4.5:1 (o 3:1 en texto grande) hasta dejar cero. Conviene normalizar los colores con un lienzo antes de compararlos: leerlos con una expresión regular interpreta `oklch(0.98 0.009 none / 0.82)` como casi negro e inventa fallos.
- **Área de toque.** A 390 px se midió cada control contando la capa que amplía su zona sensible. Se corrigieron los 13 que quedaban por debajo de 44 × 44 px hasta dejar cero.

Ambas comprobaciones son de revisión, no parte de `npm test`.
