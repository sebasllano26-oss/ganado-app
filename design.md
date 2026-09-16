# Gestión Ganadera — interfaz compartida

Una herramienta sobria para propietarios y equipos ganaderos. Género utilitario; la portada explica el producto y la aplicación prioriza los registros.

## Identidad

Gestión Ganadera usa un nombre descriptivo y neutral. Fraunces aparece en encabezados de presentación y Geist en controles, contenido y cifras. Los colores se concentran en verde bosque, papel cálido y superficies claras. El modo oscuro reutiliza los mismos roles.

## Composición

- Portada: texto a la izquierda, ilustración de campo y muestra identificada a la derecha; funciones como filas y planes comparables.
- Aplicación: navegación lateral, contexto de la ganadería, resumen numérico, gráficos y tablas.
- Formularios: etiquetas visibles, errores cerca del campo, botones deshabilitados durante envíos y foco visible.
- Móvil: menú lateral plegable, secciones apiladas y tablas con desplazamiento dentro de su contenedor.

## Tokens

La fuente de colores, tipografía, radios, espaciado y movimiento es `tokens.css`. `src/style.css` aplica estos tokens a las superficies nuevas y enlaza los nombres de variables de las vistas operativas anteriores. Las cifras se muestran en la tipografía de lectura.

## Contenido y movimiento

La demostración está identificada en todo momento. No se presentan métricas ficticias como resultados comerciales. Los planes no muestran precios inventados ni simulan cobros. No hay música ni animaciones decorativas. Se respeta la preferencia de movimiento reducido.

## Revisión

La portada y el resumen se verifican a 320, 375, 414 y 768 píxeles mediante Playwright. Las pantallas operativas conservan parte de la estructura del sistema original; no se afirma conformidad integral de las 69 reglas visuales sobre ese código heredado.
