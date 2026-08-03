# PACKYA Icon System

Version: 1.0  
Date: 2026-08-01  
Status: Approved

This document defines the official PACKYA icon system.

## Core Rule

All icons must come from official Tabler Icons SVG files only.

Hard constraints:
- SVG only (no PNG, JPG, WebP, or raster fallbacks).
- Original 24x24 viewBox.
- Original stroke width 2.
- No manual redraws.
- No local icon packs outside this system.

Source package:
- `@tabler/icons`

Local icon folder:
- `src/assets/icons/`

Reusable helper:
- `src/utils/packyaIconSystem.js`

## Canonical Icon Registry

Each icon has one canonical key used by UI, PDFs, and future documents.

| Key | Tabler file | Primary usage |
| --- | --- | --- |
| `documentOrder` | `file-description.svg` | Orden de Trabajo |
| `documentBudget` | `clipboard-list.svg` | Presupuestos |
| `documentRemit` | `package.svg` | Remitos |
| `documentInvoice` | `file-invoice.svg` | Facturas |
| `documentLabel` | `tag.svg` | Etiquetas |
| `operationDelivery` | `truck-delivery.svg` | Entrega / logistica |
| `operationPrint` | `printer.svg` | Impresion |
| `operationPayment` | `receipt.svg` | Cobros / pagos |
| `operationPrice` | `file-dollar.svg` | Costos / montos |
| `operationQr` | `qrcode.svg` | QR interno |
| `operationBarcode` | `barcode.svg` | Codigo de barras |
| `customer` | `user.svg` | Cliente |
| `contactPhone` | `phone.svg` | Telefono |
| `contactMail` | `mail.svg` | Email |
| `contactDate` | `calendar-event.svg` | Fechas |
| `contactWeb` | `world-www.svg` | Sitio web |
| `contactWhatsapp` | `brand-whatsapp.svg` | WhatsApp |
| `contactInstagram` | `brand-instagram.svg` | Instagram |
| `statusOk` | `check.svg` | Estado correcto |
| `statusAlert` | `alert-circle.svg` | Advertencia |
| `actionEdit` | `pencil.svg` | Edicion |
| `actionConfig` | `settings.svg` | Configuracion |
| `dashboard` | `dashboard.svg` | Dashboard principal |
| `dashboardAnalytics` | `chart-bar.svg` | KPI y metricas |
| `supportNotes` | `notes.svg` | Notas / observaciones |
| `supportReport` | `report.svg` | Reportes |
| `supportMeasure` | `ruler-measure.svg` | Medidas |
| `supportDesign` | `palette.svg` | Diseño |
| `supportStore` | `building-store.svg` | Local / comercio |
| `supportProduct` | `box.svg` | Producto |

## Usage in App and Documents

Use the helper as the only access point:

```js
import {
  getPackyaIconSvg,
  getPackyaIconDataUrl,
  drawPackyaIconOnPdf,
} from './src/utils/packyaIconSystem'
```

Supported helper functions:
- `getPackyaIconSvg(name)` -> raw SVG string.
- `getPackyaIconDataUrl(name, { strokeColor })` -> data URL for HTML/img usage.
- `getPackyaIconMarkup(name, { strokeColor })` -> inline SVG markup string.
- `drawPackyaIconOnPdf(doc, name, { x, y, size, strokeColor })` -> SVG draw path for jsPDF documents.

## Scope

This icon system is the baseline for:
- Ordenes de Trabajo
- Presupuestos
- Remitos
- Etiquetas
- Facturas
- Dashboard
- Future PACKYA documents and printable assets

## Governance

- New icons must be added from official Tabler SVG files only.
- Keep files unmodified inside `src/assets/icons/`.
- Every new icon must be registered in:
  - `src/utils/packyaIconSystem.js`
  - `PACKYA_ICON_SYSTEM.md`
