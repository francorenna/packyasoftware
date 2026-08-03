# PACKYA Corporate Document Brand System

Version: 1.0
Date: 2026-07-29
Status: Approved

This document defines the official visual and structural system for all PACKYA PDFs.

Scope:
- Presupuesto
- Orden de Trabajo
- Remito
- Comprobante de Pago
- Comprobante de Retiro
- Etiquetas de Produccion

Design principle:
- Premium
- Minimal
- Institutional

Goal:
- Ensure all corporate documents share one unified visual language.
- Decouple visual design from business logic.
- Centralize visual updates so one change propagates to every document.

Single Source of Truth policy:
- This file is the only source of truth for visual identity in the PACKYA document system.
- New documents cannot define local visual styles outside this specification.
- Any visual change must be made here first and then propagated through shared components.

## 1. Brand Identity

### 1.1 Official Tone
- Quality
- Order
- Confidence
- Professionalism
- Consolidated company

### 1.2 Things to Avoid
- Heavy shadows
- Thick borders
- Spreadsheet-style tables
- 3D effects
- Strong gradients
- Generic administrative software appearance

## 2. Typography

Primary pair:
- Montserrat
- Inter

Usage rules:
- Montserrat: document titles, section headers, badges, totals, key names.
- Inter: body text, tables, observations, technical information.

Fallback stack:
- Montserrat, Inter, Helvetica, Arial, sans-serif

### 2.1 Type Scale (PDF)
- Display title: 30-34 px equivalent
- Main section title: 15-17 px equivalent
- Subsection title: 12-13 px equivalent
- Label and badge text: 10-11 px equivalent
- Body text: 9-10 px equivalent
- Footer/meta text: 7-8 px equivalent

## 3. Color System

### 3.1 Core Palette (Official)
- Black: #0B0B0D
- White: #FFFFFF
- Magenta: #EC008C
- Cyan: #00AEEF
- Yellow: #FFF200

### 3.2 Supporting Palette
- Light Gray: #F5F6F8
- Text Gray: #6B7280

### 3.3 Semantic Color Usage
- Primary text: Black (#0B0B0D)
- Secondary text: Text Gray (#6B7280)
- Soft backgrounds and cards: Light Gray (#F5F6F8)
- Accent highlights: Magenta and Cyan
- Attention accents: Yellow (sparingly)

## 4. Grid, Margins and Spacing

Page format:
- A4 portrait

Margins:
- Left: 16 mm
- Right: 16 mm
- Top: 14 mm
- Bottom: 14 mm

Grid:
- 12-column layout
- 4 mm gutter

Spacing system:
- Base rhythm in multiples of 4 mm
- Recommended vertical gaps: 4 mm, 8 mm, 12 mm
- Card inner padding: 4-6 mm

## 5. Header and Footer

### 5.1 Corporate Header (Fixed)
Must include:
- PACKYA logo
- Slogan: Packaging que potencia marcas
- Document badge (dynamic)
- Document number

Header badge text examples:
- PRESUPUESTO
- ORDEN DE TRABAJO
- REMITO
- COMPROBANTE DE PAGO
- COMPROBANTE DE RETIRO

### 5.2 Corporate Footer (Fixed)
Must include only:
- PACKYA logo
- WhatsApp: +54 9 261 629-8349
- Instagram: @packya.ok
- Web: www.packya.com.ar
- Page indicator: Pagina X de Y

Rule:
- Keep footer minimal and clean. No additional legal or promotional clutter.

## 6. Canonical Components

All documents must be composed only with these reusable components.

1. CorporateHeader
- Inputs: documentType, documentNumber, issueDate.
- Role: top identity band and metadata.

2. ClientCard
- Inputs: client, contact, phone, email, date, validity, deliveryDate.
- Rule: hide missing fields automatically.

3. ProjectSummary
- Inputs: summary text.
- Rule: auto-grow height without breaking layout.

4. StatusBadge
- Inputs: status key.
- Role: color + icon + text state marker.

5. DynamicProductTable
- Canonical columns:
  - Producto
  - Descripcion
  - Cantidad
  - Medida
  - Diseno
  - Precio Unitario
  - Total
- Rules:
  - Minimal separators
  - Generous whitespace
  - No heavy box-grid
  - Auto-pagination
  - Repeat page header and table header on new pages
  - Preserve footer on every page

6. TotalsCard
- Inputs: subtotal, discount, total, advance, remaining.
- Rule: show only existing values.
- Priority: TOTAL must have strongest visual hierarchy.

7. ConditionsCard
- Inputs: fixed conditions list from one configuration source.

8. ObservationBlock
- Inputs: observation text.
- Rule: expandable block, never breaks visual structure.

9. PaymentCard
- Inputs: payment accounts.
- Rule: no QR codes.
- Must show:
  - Mercado Pago
  - Alias PACKYA - Titular Franco Renna
  - Alias PACKYA2 - Titular Damian Vanin

10. SignatureBlock
- Inputs: labels for internal signoff.
- Typical fields:
  - Responsable
  - Fecha de impresion
  - Control de calidad

11. CorporateFooter
- Inputs: page index and total pages.
- Role: stable contact + pagination strip.

## 7. Order Status System

Simplified official statuses:
- En Diseno
- Aprobado
- En Produccion
- Listo para Entrega
- Entregado

Visual mapping:
- En Diseno: Yellow + icon pencil
- Aprobado: Cyan + icon check
- En Produccion: Magenta + icon gear
- Listo para Entrega: Green + icon package
- Entregado: Black + icon truck

Implementation note:
- StatusBadge must always render color + icon + text.

## 8. Fixed Conditions Content

This is the approved legal-operational wording for reuse:

- Diseno incluido (segun lo acordado).
- Impresion con tecnologia de alta calidad.
- Colores sujetos a tolerancias propias del proceso de impresion.
- Los plazos de produccion comienzan una vez aprobado el diseno y acreditado el pago correspondiente.
- El cliente debera verificar el diseno antes de autorizar la produccion.
- Modificaciones posteriores a la aprobacion podran generar costos adicionales.
- Los tiempos de entrega son estimados y pueden variar por razones operativas.

## 9. Data Behavior Rules

- Design is fixed. Data is dynamic.
- Missing optional data must be hidden, not replaced with noisy placeholders.
- The layout must remain visually stable with 1, 10 or 20+ items.
- Product tables must paginate automatically when needed.

## 10. Document Blueprints

### 10.1 Presupuesto
- CorporateHeader
- ClientCard
- ProjectSummary
- DynamicProductTable
- TotalsCard
- ConditionsCard
- ObservationBlock
- PaymentCard
- CorporateFooter

### 10.2 Orden de Trabajo
- CorporateHeader
- ClientCard
- StatusBadge
- ProjectSummary
- DynamicProductTable
- TotalsCard
- ObservationBlock
- SignatureBlock
- PaymentCard
- CorporateFooter

### 10.3 Remito
- CorporateHeader
- ClientCard
- DynamicProductTable
- SignatureBlock
- ObservationBlock
- CorporateFooter

### 10.4 Comprobante de Pago
- CorporateHeader
- ClientCard
- TotalsCard
- PaymentCard
- ObservationBlock
- CorporateFooter

### 10.5 Comprobante de Retiro
- CorporateHeader
- ClientCard
- DynamicProductTable
- SignatureBlock
- ObservationBlock
- CorporateFooter

### 10.6 Etiquetas de Produccion
- Compact Header Variant
- Product identity block
- Quantity block
- Production metadata block
- StatusBadge

## 11. Governance Rules

- No new document can introduce ad-hoc styles.
- Every visual change must be token-driven.
- Any logo, slogan or palette update is done once in the shared system.
- Every document must consume the same component library.

## 12. Engineering Hand-off Checklist

Before implementing a new document:
- Confirm component map from this document.
- Confirm required data contract fields.
- Confirm status mapping and badge rendering.
- Confirm pagination behavior with long tables.
- Confirm footer and header consistency.

Done criteria for implementation:
- Passes visual consistency against this brand system.
- Uses only canonical reusable components.
- No duplicated styling logic across documents.
