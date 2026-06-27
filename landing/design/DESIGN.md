---
name: Forge Industrial
colors:
  surface: '#1a120d'
  surface-dim: '#1a120d'
  surface-bright: '#413732'
  surface-container-lowest: '#140d08'
  surface-container-low: '#221a15'
  surface-container: '#261e19'
  surface-container-high: '#312823'
  surface-container-highest: '#3d332d'
  on-surface: '#f0dfd7'
  on-surface-variant: '#dac2b4'
  inverse-surface: '#f0dfd7'
  inverse-on-surface: '#382e29'
  outline: '#a28c80'
  outline-variant: '#554339'
  surface-tint: '#ffb68a'
  primary: '#ffb68a'
  on-primary: '#522300'
  primary-container: '#e8894a'
  on-primary-container: '#5d2900'
  inverse-primary: '#96490c'
  secondary: '#ffb692'
  on-secondary: '#552000'
  secondary-container: '#8f3b01'
  on-secondary-container: '#ffba99'
  tertiary: '#50d9e4'
  on-tertiary: '#00363a'
  tertiary-container: '#00b2bd'
  on-tertiary-container: '#003e43'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbc8'
  primary-fixed-dim: '#ffb68a'
  on-primary-fixed: '#321300'
  on-primary-fixed-variant: '#743500'
  secondary-fixed: '#ffdbcb'
  secondary-fixed-dim: '#ffb692'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#793100'
  tertiary-fixed: '#7bf4ff'
  tertiary-fixed-dim: '#50d9e4'
  on-tertiary-fixed: '#002022'
  on-tertiary-fixed-variant: '#004f54'
  background: '#1a120d'
  on-background: '#f0dfd7'
  surface-variant: '#3d332d'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.7'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.7'
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 20px
  margin: 24px
---

## Brand & Style

This design system is built on a "Forge" narrative—moving away from the typical vibrant startup aesthetic toward something more grounded, industrial, and utilitarian. It is designed for developer tools, high-performance computing, and technical platforms where focus and reliability are paramount.

The aesthetic blends **Minimalism** with **Modern Industrial** influences. It relies on a high-contrast, near-black foundation punctuated by warm, ember-like accents. The visual language is disciplined, utilizing thin borders, monochromatic surfaces, and sharp typography to create a sense of mechanical precision. All soft gradients, blurs, and cool-toned tints are strictly avoided in favor of flat, decisive color blocks and structured layouts.

## Colors

The palette is strictly dark and warm. The foundation is a near-black "Forge" base that provides maximum contrast for the "Ember" accent colors.

- **Primary & Deep Accents:** Used for calls to action and critical status indicators. These warm oranges evoke a sense of heat and energy without the levity of brighter yellows.
- **Surface & Borders:** Layering is achieved through slight shifts in dark neutrals rather than elevation or shadows. The `#1E2025` border is the primary structural element.
- **Typography Tones:** Headings use a warm stone white (`#F5F0E8`) to maintain high legibility without the harshness of pure white, while body text is pushed back to a functional grey (`#9CA3AF`).

## Typography

The typographic system is a study in functional contrast. 

- **Headings:** Geist is utilized for its geometric precision and modern technical feel. For display and large headings, tight negative letter-spacing is applied to create a dense, authoritative "block" of text.
- **Body:** Inter provides a highly legible, neutral experience for long-form reading, set with a generous 1.7 line-height to ensure clarity against the dark background.
- **Monospace:** JetBrains Mono is the workhorse for technical metadata, code snippets, and terminal views. It is often rendered in the primary accent color to highlight technical importance.

## Layout & Spacing

This design system uses a **Fluid Grid** model with a strictly defined 4px baseline. 

- **Desktop:** 12-column layout with 20px gutters. Content is often contained within technical "panes" rather than floating freely.
- **Mobile:** 4-column layout with 16px margins.
- **Rhythm:** Spacing follows a linear scale. Use `sm` (16px) for internal component padding and `md` (24px) for spacing between related groups. The `lg` (48px) and `xl` (80px) units are reserved for section vertical padding to maintain the minimalist breathability.

## Elevation & Depth

This system rejects shadows in favor of **Tonal Layers** and **Low-Contrast Outlines**.

- **Level 0 (Base):** `#0C0D0F` — The root background.
- **Level 1 (Surface):** `#13151A` — Used for cards, sidebars, and navigation containers.
- **Level 2 (Active/Hover):** A border shift to Primary Accent or a slightly lighter neutral.
- **Separation:** Depth is communicated exclusively through `0.5px` or `1px` solid borders (`#1E2025`). In terminal or code environments, the background may drop even darker (`#0A0B0D`) to focus the user's eye on the input.

## Shapes

The shape language is tight and disciplined. While not purely "sharp," the radius is kept low to maintain the industrial feel.

- **Small Components:** Buttons and inputs use a strict **6px** radius.
- **Containers:** Cards and larger surfaces use a **10px** radius.
- **Interactive Elements:** Maintain the same radius on hover; do not use "pill" shapes unless specifically for tags/chips that require high visual distinction.

## Components

### Buttons
- **Primary:** Background `#E8894A`, Text `#0C0D0F`, Font-Weight `600`. Hover state transitions to `#C4622A`. No shadow.
- **Secondary:** Transparent background, `0.5px` solid border `#2C2F38`, Text `#F5F0E8`. Hover state fills with `#13151A` and changes border to `#E8894A`.

### Cards
- **Structure:** Background `#13151A`, `0.5px` solid border `#1E2025`.
- **Interaction:** On hover, the border changes to a subtle amber tint `rgba(232, 137, 74, 0.3)`.

### Terminal & Code Blocks
- **Styling:** Background `#0A0B0D`, border `#1E2025`. 
- **Content:** Text uses JetBrains Mono. Primary text is `#9CA3AF`, while prompts and variables use `#E8894A`.

### Input Fields
- **Default:** Background `#0C0D0F`, border `#2C2F38`, text `#F5F0E8`.
- **Focus:** Border changes to `#E8894A`.

### Chips & Tags
- **Technical:** Small text (12-13px) using JetBrains Mono, background `#1E2025`, border `#2C2F38`.
- **Active:** Background `#1E1409`, border `#3D2410`, text `#E8894A`.