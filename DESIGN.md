---
name: Aurum
description: Local-first personal finance, built as a calculator you trust.
colors:
  key: "#f2b632"
  key-hover: "#e8a817"
  key-ink: "#1e1d1b"
  income: "#4a8c3f"
  income-ink: "#36702c"
  expense: "#d9482b"
  expense-ink: "#b0381d"
  net: "#3a3934"
  transfer: "#8c8a81"
  casing: "#e5e4df"
  casing-deep: "#d9d8d2"
  face: "#ffffff"
  display: "#22221f"
  display-well: "#191917"
  display-ink: "#f3f1ea"
  display-dim: "#a8a69c"
  lamp-income-lit: "#7fbf6e"
  lamp-expense-lit: "#f07a5e"
  graphite: "#1e1d1b"
  ink-body: "#42413c"
  ink-muted: "#69675f"
  seam-soft: "#dddbd5"
  well: "#f6f5f2"
  category-slate-blue: "#4d6a8c"
  category-clay: "#9c6a4e"
  category-teal: "#3f7f86"
  category-lilac: "#8a6f9e"
  category-rose: "#b3868f"
  category-olive: "#6f7d4f"
  category-indigo: "#5b5f9e"
  category-stone: "#7a7770"
typography:
  display:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1"
  readout:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  stat:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\" 1"
  title:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    fontFeature: "\"tnum\" 1"
  operator:
    fontFamily: "Hanken Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 300
    lineHeight: 1
rounded:
  bar: "2px"
  control: "8px"
  plate: "12px"
  bezel: "16px"
  key: "9999px"
spacing:
  seam: "1px"
  cell: "10px"
  gutter: "16px"
  module: "20px"
  header: "28px"
  page-x: "40px"
components:
  button-primary:
    backgroundColor: "{colors.key}"
    textColor: "{colors.key-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.key}"
    padding: "0 18px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.key-hover}"
  button-secondary:
    backgroundColor: "{colors.face}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.key}"
    padding: "0 18px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.well}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.key}"
    padding: "0 18px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.expense}"
    textColor: "{colors.face}"
    rounded: "{rounded.key}"
    padding: "0 18px"
    height: "40px"
  button-danger-hover:
    backgroundColor: "{colors.expense-ink}"
  button-sm:
    typography: "{typography.label}"
    padding: "0 12px"
    height: "32px"
  key-round:
    backgroundColor: "{colors.face}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.key}"
    size: "36px"
  month-window:
    backgroundColor: "{colors.display}"
    textColor: "{colors.display-ink}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 12px"
  field:
    backgroundColor: "{colors.well}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "0 12px"
  field-focus:
    backgroundColor: "{colors.face}"
  module:
    backgroundColor: "{colors.face}"
    padding: "{spacing.module}"
  plate:
    backgroundColor: "{colors.face}"
    rounded: "{rounded.plate}"
  display-panel:
    backgroundColor: "{colors.display}"
    textColor: "{colors.display-ink}"
    rounded: "{rounded.bezel}"
    padding: "6px"
  display-glass:
    backgroundColor: "{colors.display-well}"
    textColor: "{colors.display-ink}"
    rounded: "{rounded.plate}"
    padding: "24px 28px 20px"
  nav-item:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.face}"
    textColor: "{colors.graphite}"
  segmented-track:
    backgroundColor: "{colors.casing-deep}"
    rounded: "{rounded.key}"
    padding: "2px"
  segmented-option-active:
    backgroundColor: "{colors.face}"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.key}"
    padding: "4px 12px"
  tooltip:
    backgroundColor: "{colors.display}"
    textColor: "{colors.display-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
---

# Design System: Aurum

## Overview

**Creative North Star: "The Trusted Calculator"**

Aurum is built as a desktop instrument in the Braun ET66 line, not as a dashboard of cards. A warm aluminium casing holds white matte face panels. The panels meet at a 1px seam and cast no drop shadow. One dark display panel carries the month's result in light numerals, written out as the sum it is: income − expenses = balance. Everything you press is a round convex key. Everything that reports status is a small round lamp. Hierarchy comes from the display, the seam and the type weight, never from colour blocks or elevation.

The build is dense and calm. It is tuned for a desktop monthly review and still works on a phone. Figures are tabular everywhere. Colour is almost entirely neutral: the one function yellow belongs to the primary action and the "=" sign. Green, red-orange and graphite have exactly one meaning each (income, expense, net). The perforated dot grille is the only texture. The system rejects the fintech default: no navy sidebar, no gold gradient tile, no grid of floating KPI cards, no shadowed rounded cards.

**Key Characteristics:**
- Warm neutral casing ground; white face modules joined by 1px seams into one plate.
- A single dark display per screen, with numerals on recessed glass.
- Round convex keys (pill buttons, round steppers) that press down by 1px.
- One function yellow, kept for the primary action and the "=" operator.
- Semantic series colours: Braun green, signal red-orange, graphite.
- Status carried by 8px lamps rather than coloured badges or banners.
- Hanken Grotesk with tabular figures throughout.

## Colors

A warm aluminium-and-graphite neutral field, one function yellow, and three semantic series colours that are never reused decoratively.

### Primary
- **Function Yellow** (key): the colour of the primary-action key (one per view, e.g. "+ Transakce", "Nový účet"), the "=" operator on the display, and the Aurum mark. It also tints the text caret and selection. Hover deepens to **Pressed Amber** (key-hover). Text on yellow is always **Key Graphite** (key-ink).

### Secondary
- **Braun Green** (income): the income series in charts, income lamps, and positive deltas. Use **Deep Braun Green** (income-ink) when green carries text on a light face.
- **Signal Red-Orange** (expense): the expense series, expense lamps, the missing-record lamp, and the danger key. Use **Deep Signal** (expense-ink) for error text and negative values on light faces.

### Tertiary
- **Graphite Net** (net): the net/savings series line and net-related icons.
- **Transfer Stone** (transfer): transfers and the folded "Další" category, both of which sit outside income and expense.
- **Category palette** (category-slate-blue, clay, teal, lilac, rose, olive, indigo, stone): eight muted slots for user categories. The palette never cycles; beyond seven categories the tail folds into "Další" in Transfer Stone. Pre-redesign stored defaults are remapped to these slots at display time (`displayColor`), and user-chosen colours are left as they are.

### Neutral
- **Aluminium Casing** (casing): the app ground, the sidebar, and the mobile top bar.
- **Deep Casing** (casing-deep): the recessed track behind segmented switches.
- **Matte Face** (face): every panel, module, row list, field on focus, and secondary key.
- **Display Graphite** (display): the display bezel, the month window, tooltips and toasts.
- **Display Glass** (display-well): the recessed glass inside the display bezel.
- **Display Ink** (display-ink) / **Display Dim** (display-dim): primary and secondary text on dark surfaces.
- **Lit Green / Lit Red-Orange** (lamp-income-lit, lamp-expense-lit): income and expense lamps as they read on dark glass.
- **Graphite** (graphite): primary text, focus outlines, active tab underline.
- **Body Ink** (ink-body), **Muted Ink** (ink-muted): secondary text, hints, chart axis labels.
- **Soft Seam** (seam-soft) and **Well** (well): inner dividers, and the fill of sunken fields and explanation wells.
- Seams themselves are graphite at 8% alpha (`rgb(30 29 27 / 0.08)`), not a solid grey.

### Named Rules
**The One Yellow Rule.** Function Yellow marks the one primary action in a view and the "=" of the equation. It is never a fill, a highlight, a chart series or a status colour.

**The One Meaning Rule.** Green is income, red-orange is expense, graphite is net. None of them is used for decoration, brand accent or category colour.

## Typography

**Display Font:** Hanken Grotesk Variable (with ui-sans-serif, system-ui). Self-hosted via Fontsource, as the PWA precache requires.
**Body Font:** Hanken Grotesk Variable.

**Character:** A single grotesk across the whole app, weighted like the legends on an instrument. Semibold carries hierarchy, a light weight is used only for operators, and tabular figures (`"tnum" 1` on body) keep every column of money aligned.

### Hierarchy
- **Display** (600, 3.25rem, 2.75rem below sm, line-height 1, −0.03em): the balance readout, only once per screen.
- **Readout** (600, 2rem, 1.75rem below sm, line-height 1, −0.03em): the income and expense operands on the display.
- **Operator** (300, 1.875rem): the "−" and "=" between operands. "=" is in Function Yellow, "−" in Display Dim.
- **Headline** (600, 1.875rem, 1.25, −0.025em): page titles in the page header.
- **Stat** (600, 1.625rem, line-height 1, −0.02em): register-strip figures (e.g. account totals).
- **Title** (600, 15px, −0.01em): module headings. Modal titles use 16px.
- **Body** (400, 14px, 20px): table rows, list text, controls.
- **Label** (500, 12px): field labels, lamp captions, hints, subtitles, table headers. Always sentence case.

### Named Rules
**The Tabular Rule.** Every figure uses tabular numerals. Money never shifts width as values change.

**The Sentence-Case Legend Rule.** Labels are 12px sentence case in Muted Ink. Hierarchy comes from size and weight, not from uppercase tracking.

## Layout

A fixed 232px casing sidebar (`w-58`) sits on the left at `lg` and above. Below `lg` it becomes a slide-in drawer, and a sticky, translucent casing top bar holds a round menu key. Content is capped at 80rem, with 16 / 24 / 40px horizontal padding (base / sm / lg) and 36px vertical padding on desktop. Each page opens with a header: title and subtitle on the left, keys on the right, 28px below.

Modules are grouped into a **seamed plate**: a CSS grid with a 1px gap over a graphite-8% ground, clipped to a 12px outer radius, so the gaps read as seams. On desktop the plate is a 5-column grid (3 + 2 spans on Přehled). Register strips (the account totals) are 3-column seamed plates, and row lists attach to them with a seam. The display and the plate are separated by a 16px gutter. Module padding is 20px, with titles inset 20px horizontally and 18px from the top.

## Elevation & Depth

Panels are flat. A module is separated from the casing only by its seam and its tone (white on warm grey). Depth is physical, and appears only where something is pressed or sunken: keys are convex (a top highlight plus a short contact shadow), fields and tracks are wells (a soft inset shadow), and the display glass is recessed inside its bezel. Lifted shadows appear only on transient overlays (modal, toast, tooltip, mobile drawer), which float above the instrument.

### Shadow Vocabulary
- **Convex key** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.55), 0 1px 1px rgb(30 29 27 / 0.18), 0 2px 6px -2px rgb(30 29 27 / 0.2)`): every key, the active nav item, the selected segment.
- **Pressed key** (`box-shadow: inset 0 1px 2px rgb(30 29 27 / 0.25)`): key `:active`, combined with a 1px downward translate.
- **Well** (`box-shadow: inset 0 1px 2px rgb(30 29 27 / 0.08)`): inputs, selects, segmented tracks, category bar tracks, explanation wells.
- **Recessed glass** (`box-shadow: inset 0 2px 6px rgb(0 0 0 / 0.45)`): the display glass inside the bezel.
- **Overlay** (`box-shadow: 0 24px 64px -16px rgb(20 20 18 / 0.45)`): modal. Toasts and tooltips use smaller variants of the same shape.

### Named Rules
**The Seam, Not Shadow Rule.** Resting panels never cast a drop shadow. When two modules sit together they share one plate and meet at a 1px seam.

## Shapes

Anything you press is fully round: pill buttons, round 36px steppers, round icon keys, segmented options, lamps. Panels use a 12px radius on the outer plate only; modules inside a plate are square and take the plate's clip. The display adds a 16px bezel around 12px glass. Controls that are windows rather than keys (fields, the month window, nav items, tooltips) use 8px. Chart bars have a 2px top radius, and category bars are rounded tracks.

## Components

### Buttons
Keys on an instrument: round, convex, and press down 1px when struck.
- **Shape:** full pill (9999px); 40px tall (32px small), semibold.
- **Primary:** Function Yellow with Key Graphite text, convex shadow; hover darkens to Pressed Amber. One per view.
- **Secondary:** Matte Face with a 1px 70% soft-grey ring and convex shadow; hover fills Well.
- **Ghost:** no fill; Muted Ink turning to graphite on a 5% graphite wash.
- **Danger:** Signal Red-Orange with white text, for irreversible actions only.
- **Hover / Focus:** 150ms background/shadow transition; `:active` swaps to the pressed shadow and translates 1px; focus is a 2px graphite outline offset 2px. Disabled drops to 45% opacity.
- **Round key:** 36px circle, face fill, convex; used for month steppers and the mobile menu. Icon keys are 32px, flat until hovered.

### Chips (lamp captions)
- **Style:** an 8px lamp (with a 1px inner rim) followed by 12px Muted Ink label text. Used for transaction type, series legends and status.
- **State:** a filled lamp is a fact. An outlined lamp is in progress (on the display) or a transfer (in tables).

### Cards / Containers
- **Corner Style:** 12px on standalone plates; square inside a seamed plate (`flush`).
- **Background:** Matte Face.
- **Shadow Strategy:** none (see Elevation). Only a 1px graphite-8% ring.
- **Internal Padding:** 20px; title row 18px top.

### Inputs / Fields
- **Style:** 36px well: Well fill, 1px 80% soft-grey border, inset well shadow, 8px radius; label above in 12px Muted Ink.
- **Focus:** border goes graphite, fill lifts to Matte Face, plus a 2px graphite-10% ring.
- **Error / Disabled:** 12px Deep Signal message below; disabled at 60% opacity.

### Navigation
- **Sidebar:** casing ground; the wordmark (the yellow "=" key mark and "Aurum" in 17px bold). Items are 14px medium Muted Ink with 16px icons in an 8px-radius row. The active item becomes a raised face key (face fill, convex shadow, graphite text, 2.25 icon stroke). Groups are separated by 16px. The footer carries a grille strip and a green lamp with the local-storage statement.
- **Tabs:** 14px medium text over a 10%-graphite rule; the active tab has a 2px graphite underline.
- **Segmented switch:** a sunken casing-deep pill track with a raised white key for the selected option.

### Month Display (signature)
The one dark display on Přehled: a Display Graphite bezel (16px radius, 6px padding) around recessed Display Glass. A header line carries a status lamp and the month. Below it, the equation reads as operands: Readout income − Readout expense = Display balance, each with a lit lamp and a 12px hint (delta vs. previous month in lit green/red-orange, or "průběžně"). A register line under a white-8% rule links to the reserve and next-month estimate. Operators collapse inline before values on mobile.

### Month Window
Two round keys flanking an 8px-radius Display Graphite window with the month in semibold Display Ink. The "Dnes" reset is an underlined text link.

### Register Strip
A seamed 3-column plate of Stat figures (label, value, hint), joined by a seam to a face row list. Each row: name and meta on the left, month change in income/expense ink, balance in 18px semibold tabular, and a chevron that nudges 2px on hover.

### Tooltip and Toast
Display Graphite surfaces with Display Dim text and Display Ink figures: the dark display vocabulary reused for transient readouts.

## Do's and Don'ts

### Do:
- **Do** join adjacent modules into one seamed plate (1px gap over graphite 8%, 12px outer radius) rather than spacing out separate cards.
- **Do** give each view at most one Function Yellow key, and put it last in the header actions.
- **Do** show state with an 8px lamp and a sentence-case caption.
- **Do** mark estimates with dashes (dashed borders, dashed series lines, the "odhad" reference line) and actuals with solid strokes and fills.
- **Do** use tabular figures for all money, dates and percentages.
- **Do** reuse the display vocabulary (Display Graphite, Display Ink/Dim) for transient readouts like tooltips and toasts.

### Don't:
- **Don't** put a drop shadow on a resting panel; depth is for keys, wells and the display glass only.
- **Don't** use Function Yellow as a fill, highlight, chart series or warning colour.
- **Don't** use income green or expense red-orange for anything but income and expense.
- **Don't** use more than one display panel (bezel and recessed glass) per screen; the month window, tooltips and toasts share its colours but not its form.
- **Don't** cycle the category palette; fold the tail into "Další".
- **Don't** add textures beyond the perforated dot grille.
