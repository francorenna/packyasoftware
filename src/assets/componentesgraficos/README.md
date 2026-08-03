## PACKYA Document Kit

Paquete documental portable alineado al sistema real de PACKYA.

### Alcance

- Los SVG son la base visual fija.
- El contrato de datos vive en `components.json`.
- La receta de composición vive en `layout.json`.
- Los tokens visuales viven en `tokens.json`.
- El kit no redefine modelos de negocio: consume las claves reales documentadas en `PACKYA_SYSTEM_DOCUMENTATION.md`.

### Orden de composición

1. Dibujar Header.
2. Dibujar Document Info.
3. Dibujar Client Card.
4. Dibujar Products Header.
5. Repetir Product Row por cada producto.
6. Si no entra una fila, crear nueva página, repetir Header y repetir Products Header.
7. Cuando termine la tabla, dibujar Totals.
8. Dibujar Payment.
9. Dibujar Footer.

### Convenciones del paquete

- `components/products-table.svg` es el recurso visual canonico para `products-header`.
- Los campos sin backing real en el modelo PACKYA deben declararse como `null` en `components.json`.
- Los valores derivados como subtotal o total por fila no se persisten: los calcula el renderer a partir del modelo real.
- `payment-card` combina pagos reales del pedido con constantes corporativas (`TRANSFER_ACCOUNTS`, `PACKYA_PHONE_NUMBER`, `PACKYA_WEBSITE_URL`).
- El kit se adapta al sistema existente; no al reves.

### Restricciones

- Nunca modificar tamaños.
- Nunca escalar componentes.
- Nunca cambiar tipografías.
- Nunca cambiar márgenes fuera del SSOT de marca.