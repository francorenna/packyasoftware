# Informe de Pre-Implementacion - Motor Documental PACKYA

Fecha: 2026-08-01
Estado: BLOQUEADO PARA IMPLEMENTACION

## 1. Alcance auditado

Se verificaron todas las fuentes SSOT solicitadas:

- [PACKYA_SYSTEM_DOCUMENTATION.md](PACKYA_SYSTEM_DOCUMENTATION.md)
- [PACKYA_BRAND_SYSTEM.md](PACKYA_BRAND_SYSTEM.md)
- [PACKYA_DOCUMENT_ARCHITECTURE.md](PACKYA_DOCUMENT_ARCHITECTURE.md)
- [README.md](README.md)
- [src/assets/componentesgraficos/layout.json](src/assets/componentesgraficos/layout.json)
- [src/assets/componentesgraficos/components.json](src/assets/componentesgraficos/components.json)
- [src/assets/componentesgraficos/tokens.json](src/assets/componentesgraficos/tokens.json)
- Todo el set SVG en [src/assets/componentesgraficos](src/assets/componentesgraficos)

## 2. Bloqueos criticos (impiden arrancar implementacion sin inventar)

1. Referencia a componente inexistente en layout
- [src/assets/componentesgraficos/layout.json](src/assets/componentesgraficos/layout.json#L50) referencia components/products-header.svg.
- Ese archivo no existe en el kit.
- El unico archivo relacionado es [src/assets/componentesgraficos/components/products-table.svg](src/assets/componentesgraficos/components/products-table.svg).
- Impacto: no se puede cumplir la regla de renderizar Products Header y repetirlo por pagina sin definir si products-table.svg reemplaza products-header.svg o si falta un SVG.

2. Referencias externas PNG rotas dentro de SVG
- [src/assets/componentesgraficos/Header.svg](src/assets/componentesgraficos/Header.svg#L54) referencia Header.png.
- [src/assets/componentesgraficos/isotipo.svg](src/assets/componentesgraficos/isotipo.svg#L11) referencia ../Marca Vector/Icono REDES 2.png.
- Esos PNG no existen dentro de [src/assets/componentesgraficos](src/assets/componentesgraficos).
- Impacto: render incompleto/no deterministico segun parser SVG usado.

3. Contrato de datos del kit no coincide con el modelo real del sistema
- Kit mapea order.number, customer.company, item.name, order.shipping en [src/assets/componentesgraficos/components.json](src/assets/componentesgraficos/components.json#L3), [src/assets/componentesgraficos/components.json](src/assets/componentesgraficos/components.json#L11), [src/assets/componentesgraficos/components.json](src/assets/componentesgraficos/components.json#L19), [src/assets/componentesgraficos/components.json](src/assets/componentesgraficos/components.json#L31).
- El sistema real de pedidos usa principalmente id, clientName/client, shippingCost, items con product/productName, unitPrice, total. Ver evidencia en [PACKYA_SYSTEM_DOCUMENTATION.md](PACKYA_SYSTEM_DOCUMENTATION.md#L202) y [src/state/useOrdersState.js](src/state/useOrdersState.js#L245).
- Impacto: no hay mapeo uno a uno confiable para completar campos dinamicos sin reglas adicionales.

4. Falta contrato para Payment Card
- El flujo exige dibujar Payment Card.
- [src/assets/componentesgraficos/components.json](src/assets/componentesgraficos/components.json) no define mapeo de datos para payment-card.
- Impacto: no se puede poblar dinamicamente aliases/titulares desde datos reales o config sin agregar reglas no especificadas.

5. Falta especificacion de anclajes de texto por componente
- El kit define que los SVG son estructura visual y que los datos dinamicos los escribe el motor.
- No existe archivo de anclajes por campo (x, y, ancho util, alineacion, max lineas, overflow) para document-info, client, row, totals, payment.
- Impacto: cualquier colocacion de texto requeriria inventar coordenadas o heuristicas, lo cual contradice tu instruccion.

6. Regla "Nunca escalar componentes" entra en conflicto con metadatos actuales
- El README del kit exige no escalar.
- [src/assets/componentesgraficos/layout.json](src/assets/componentesgraficos/layout.json) solo define alturas, no define anchos fisicos por componente ni DPI/unidades de los SVG.
- Los SVG tienen viewBox en unidades heterogeneas (ej. Header 2480x500, product-table 1546.23x108.9).
- Impacto: no hay forma deterministica de componer a ancho de pagina A4 sin una regla oficial de conversion/unidades.

7. Inconsistencia de margenes entre Brand System y layout del kit
- Brand System define Left/Right 16 mm y Top/Bottom 14 mm en [PACKYA_BRAND_SYSTEM.md](PACKYA_BRAND_SYSTEM.md#L96).
- Layout del kit define top 22, bottom 18, left 18, right 18 en [src/assets/componentesgraficos/layout.json](src/assets/componentesgraficos/layout.json#L7).
- Impacto: no existe una unica verdad para margenes operativos de composicion.

8. Falta el recurso explicito de iconos del sistema
- Requerimiento del kit menciona Badges, Iconos, Tipografias.
- En [src/assets/componentesgraficos](src/assets/componentesgraficos) hay badges y fuente Montserrat, pero no hay carpeta/recurso de iconos separado.
- Impacto: no hay contrato claro para iconografia dinamica fuera de los badges ya rasterizados/embebidos.

9. Tipografia incompleta para SSOT
- Brand system exige Montserrat + Inter en [PACKYA_BRAND_SYSTEM.md](PACKYA_BRAND_SYSTEM.md#L52).
- En [src/assets/componentesgraficos/Font](src/assets/componentesgraficos/Font) solo hay archivos Montserrat.
- [src/assets/componentesgraficos/tokens.json](src/assets/componentesgraficos/tokens.json#L23) declara Inter pero el recurso no esta en el kit.
- Impacto: no se puede garantizar fidelidad tipografica completa del texto dinamico.

## 3. Ambiguedades importantes (deben cerrarse antes de codificar)

1. Recipe del documento objetivo
- Tu secuencia operativa pide: Header, Document Info, Client, Products Header, Rows, Totals, Payment, Footer.
- Arquitectura oficial de Orden agrega StatusBadge, ProjectSummary, ObservationBlock, SignatureBlock en [PACKYA_DOCUMENT_ARCHITECTURE.md](PACKYA_DOCUMENT_ARCHITECTURE.md#L43) y [PACKYA_BRAND_SYSTEM.md](PACKYA_BRAND_SYSTEM.md#L257).
- Falta definir si esta primera entrega ignora esos bloques o si deben existir en el motor aunque no se rendericen.

2. Politica de estado del pedido
- Brand System usa En Diseno/Aprobado/En Produccion/Listo para Entrega/Entregado en [PACKYA_BRAND_SYSTEM.md](PACKYA_BRAND_SYSTEM.md#L208).
- El sistema real usa Pendiente/En Proceso/Listo/Entregado/Cancelado en [PACKYA_SYSTEM_DOCUMENTATION.md](PACKYA_SYSTEM_DOCUMENTATION.md#L67).
- Falta mapping oficial entre ambos vocabularios.

3. Watermark en flujo de render
- El asset existe en [src/assets/componentesgraficos/watermark.svg](src/assets/componentesgraficos/watermark.svg), pero no hay regla de uso/condicion/capa/z-index en layout.

4. Escenarios de validacion automatica sin datos ficticios
- Se piden escenarios 1/5/10/20/35 productos y a la vez se exige no usar datos ficticios.
- Falta definir dataset real autorizado para ejecutar esas pruebas repetibles.

## 4. Conclusiones

No corresponde iniciar implementacion del nuevo motor documental todavia.

Hay carencias criticas de recursos y contratos (componentes faltantes/referencias rotas/mapeos incompletos/reglas contradictorias) que obligarian a inventar decisiones tecnicas y visuales, lo cual incumpliria tus reglas.

## 5. Minimo necesario para desbloquear

1. Confirmar si falta agregar [src/assets/componentesgraficos/components/products-header.svg](src/assets/componentesgraficos/components) o si [src/assets/componentesgraficos/components/products-table.svg](src/assets/componentesgraficos/components/products-table.svg) debe usarse como header.
2. Entregar los recursos PNG referenciados o una version de SVG sin dependencias externas.
3. Publicar un contrato de mapeo oficial kit <-> modelo real de PACKYA para orden, cliente, item, totales y payment.
4. Definir archivo de anclajes por campo para cada componente (sin inventar coordenadas).
5. Resolver conflicto de margenes (Brand vs layout) y regla de escala/unidades.
6. Confirmar politica de estados (mapeo oficial).
7. Confirmar si en esta Fase 1 de Orden se incluyen o no StatusBadge, ProjectSummary, ObservationBlock y SignatureBlock.
8. Proveer dataset real aprobado para escenarios 1/5/10/20/35 sin datos ficticios.
