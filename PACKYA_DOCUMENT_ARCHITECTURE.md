# PACKYA Document System - Technical Architecture

Version: 1.0
Date: 2026-07-29
Status: Draft for validation before refactor

Reference standard:
- The visual identity is governed exclusively by PACKYA_BRAND_SYSTEM.md.

## 1. Component Tree

CorporateDocument
|
+-- CorporateHeader
|   +-- BrandLogo
|   +-- BrandSlogan
|   +-- DocumentBadge
|   +-- DocumentNumber
|
+-- ContentLayout
|   +-- ClientSection
|   |   +-- ClientCard
|   |   +-- StatusBadge (optional by document type)
|   |
|   +-- ProjectSummary (optional)
|   |
|   +-- DynamicProductTable
|   |   +-- TableHeader
|   |   +-- TableRows
|   |   +-- TablePaginationController
|   |
|   +-- LowerGrid
|       +-- TotalsCard (optional by doc type)
|       +-- ConditionsCard (optional by doc type)
|       +-- ObservationBlock (optional)
|       +-- SignatureBlock (optional)
|
+-- PaymentCard (optional by doc type)
|
+-- CorporateFooter

Document recipes:
- Orden de Trabajo: Header + ClientSection + StatusBadge + ProjectSummary + DynamicProductTable + TotalsCard + ObservationBlock + SignatureBlock + PaymentCard + Footer
- Presupuesto: Header + ClientSection + ProjectSummary + DynamicProductTable + TotalsCard + ConditionsCard + ObservationBlock + PaymentCard + Footer
- Remito: Header + ClientSection + DynamicProductTable + SignatureBlock + ObservationBlock + Footer

## 2. Rendering Flow

Input data
-> Data Mapper (normalization + defaults + visibility rules)
-> Document Composer (choose component recipe by document type)
-> Layout Engine (grid, spacing, pagination, page breaks)
-> Component Renderer (draw each block using design tokens)
-> Footer pass (apply footer and page X/Y on all pages)
-> PDF output

Detailed sequence:
1. Receive source entity (order, quote, delivery note, etc.).
2. Normalize into a canonical view-model for the selected document type.
3. Resolve visibility of optional fields and blocks.
4. Render first page header and top sections.
5. Render DynamicProductTable with automatic page splitting.
6. Render lower content blocks in priority order according to available space.
7. Add pages as needed and repeat required structural elements.
8. Apply CorporateFooter to every page after total page count is known.
9. Export final PDF.

## 3. Data Contracts by Component

Contract rule:
- required: must exist for the component to render.
- optional: hidden when absent, no placeholder noise.

### 3.1 CorporateHeader
Inputs:
- required: documentType, documentNumber
- optional: issueDate, logoDataUrl, sloganOverride
Behavior:
- badge label and tone derived from documentType mapping.

### 3.2 ClientCard
Inputs:
- required: client.name
- optional: client.contact, client.phone, client.email, meta.date, meta.validity, meta.estimatedDelivery
Behavior:
- rows with missing optional fields are not rendered.

### 3.3 StatusBadge
Inputs:
- required: status.key
Behavior:
- key maps to icon + color + label via centralized status config.
Fallback:
- unknown key maps to neutral style and label Pendiente.

### 3.4 ProjectSummary
Inputs:
- optional: summaryText
Behavior:
- if empty, block is omitted.
- if present, height grows by wrapped line count.

### 3.5 DynamicProductTable
Inputs:
- required: items[]
Item shape:
- required: product, quantity, unitPrice
- optional: description, measure, design
Computed:
- lineTotal = quantity * unitPrice
Behavior:
- table columns are fixed by design system.
- description and product support multiline wrapping.
- if rows exceed available page area, create new page and repeat table header.
- header/footer persistence is mandatory on all pages.

### 3.6 TotalsCard
Inputs:
- required: totals.total
- optional: totals.subtotal, totals.discount, totals.advance, totals.remaining
Behavior:
- render only existing optional rows.
- total always rendered with highest hierarchy.

### 3.7 ConditionsCard
Inputs:
- required: conditions[]
Behavior:
- conditions come from one central config source.
- never hardcoded per document implementation.

### 3.8 ObservationBlock
Inputs:
- optional: observationText
Behavior:
- if empty, render blank writing lines only when template requires manual annotation.
- if populated, render wrapped text with constrained max height and page-safe growth.

### 3.9 PaymentCard
Inputs:
- required: paymentAccounts[]
Account shape:
- required: provider, alias, holder
- optional: taxId
Behavior:
- QR is explicitly disabled by policy.
- card layout is fixed and minimal.

### 3.10 SignatureBlock
Inputs:
- optional: signoffFields[]
Default fields:
- Responsable
- Fecha de impresion
- Control de calidad
Behavior:
- if omitted, use default signoff field set.

### 3.11 CorporateFooter
Inputs:
- required: contacts.whatsapp, contacts.instagram, contacts.website
- required: pageNumber, totalPages
Behavior:
- rendered in final pass on all pages.

## 4. Centralized Style System

Strict rule:
- Components cannot define inline color, typography size, spacing, radius, borders, or status palettes.
- All visual values are read from design tokens.

Style modules:
1. brandTokens
- colors
- typography
- spacing scale
- border radius
- line styles

2. semanticTokens
- document type badge styles
- status badge styles
- table style variants
- card variants

3. layoutTokens
- page margins
- content width
- footer reserved space
- table row baseline height

Resolution order:
- brand tokens -> semantic tokens -> component renderer

## 5. Scalability Strategy

To add a new document:
1. Define data mapper for the document entity.
2. Select component recipe (existing reusable blocks).
3. Configure visibility and order of blocks.
4. Reuse shared renderer and layout engine.

No-duplication guarantees:
- Shared table engine for all item-based documents.
- Shared header/footer renderer.
- Shared status mapping and badge drawing.
- Shared totals and payment cards.

Expected reuse:
- Presupuesto and Orden share around 90 percent of visual structure.
- Remito reuses same primitives with fewer economic/payment blocks.

## 6. Refactor Execution Plan (Priority Order)

Phase 1 (current priority): Orden de Trabajo full refactor
- Build canonical mapper for order data.
- Migrate to full component recipe.
- Validate long-table pagination and production workflow blocks.

Phase 2: Presupuesto
- Reuse the same engine and components.
- Enable conditions emphasis and commercial totals variant.

Phase 3: Remito
- Reuse structure with delivery-focused configuration.

## 7. Validation Checklist Before Coding

Architecture is valid when:
- Every block in the target document maps to a canonical component.
- No visual values are hardcoded in component files.
- Pagination behavior is deterministic for 1, 10, and 20+ rows.
- Footer and header consistency is preserved across all pages.
- Single Source of Truth policy is enforceable from brand system file.
