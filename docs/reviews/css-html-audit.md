# CSS and HTML audit

Base: `b7c38ab` (merged invoice PR #460).

## Confirmed problems and fixes

- **Spacing variables were out of scope.** Tailwind's spacing configuration uses `--size-*`, but those variables were declared only on `#spark-app`, which the application does not render. A Chromium probe of the original production CSS measured `p-4` as `0px` and `w-64` as the full 1280px viewport. Declare the compatibility scale on `:root`, including for Radix portals outside `#root`. After the fix, the same utilities measure 16px and 256px.
- **Competing theme definitions.** `index.css` declared a premium palette that the later `main.css` root tokens overwrote. Consolidate the effective shipped light/dark palette in `styles/tokens.css`, keep one Tailwind semantic mapping and one border reset, and use `.dark` consistently. Preserve the effective 10px `rounded-lg` and primary colors.
- **Unused palette imports.** Keep the referenced Slate, Blue and Teal palettes and remove the other Radix color imports. The built CSS decreases from 263,657 to 217,134 bytes (17.6%); gzip decreases from 42,697 to 31,337 bytes (26.6%). These are CSS asset sizes, not page-load timing claims.
- **Nested scroll containers.** Global `overflow-x: hidden` implicitly enabled vertical scrolling on ancestors of sticky headers. Clip horizontal overflow without establishing a second vertical scroll container. Scope the header shadow to AppShell.
- **Desktop dialog sizing conflict.** Mobile `inset-0` leaked right/bottom offsets into the centered desktop dialog. Reset desktop insets and use one width constraint plus the component's overridable maximum width.
- **HTML bootstrap duplication.** Move fallback CSS into the document head, scope its animation name, preserve fallback content and structured metadata, and load application CSS through the existing TypeScript entry only.
- **Reduced motion.** Respect the user's motion preference for smooth scrolling and decorative landing/fallback animations.

## Validation and limits

- `npm run lint`, `npm run build` (includes TypeScript checking), and `npm test`: 113 frontend tests pass.
- `npm run test:styles`: 10 Chromium checks pass across desktop and mobile viewport emulation, exercising the production CSS and actual Button/Dialog primitives. Checks cover spacing, widths, radii, palettes, portal inheritance, dialog sizing/scroll locking, sticky headers, dark variants and reduced motion. CI installs standard Playwright Chromium; the restricted local environment used an external Chromium executable override.
- HTML tests verify head-only style elements, unique bootstrap IDs, parseable structured data and single application/CSS entry.
- Mobile Chromium emulation does not substitute for Safari or real-device coverage. The fixture does not authenticate or exercise every application page. Existing JavaScript chunk-size build warnings remain outside this CSS/HTML change.
