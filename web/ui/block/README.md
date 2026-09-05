# Vendor reference — Aceternity UI blocks

These are the paid Aceternity blocks as the registry ships them, kept unmodified so the provenance
of the landing page is checkable. They are **not** part of the build: they are demo pages carrying
Aceternity's own copy and hosted imagery, and they are written against React 18's ref types, so
`tsconfig.json` excludes this directory.

What was taken from each, and where it now lives:

| Block | Adapted into | What was reused |
|---|---|---|
| `hero-section-with-beams-and-grid` | — | **Rejected after visual review.** The beams read as decoration rather than meaning: a falling line and faint permanent diagonals. A metaphor the viewer has to be told about is not doing work. |
| `hero-with-centered-image` | `app/page.tsx` | The double-nested rounded frame and the gradient that fades a product shot into the page |
| `cta-with-dashed-grid-lines` | `components/landing/Closing.tsx` | The dashed rules crossing the panel |
| `footer-with-big-text` | `components/landing/Closing.tsx` | The cropped wordmark footer |
| `faqs-with-dashed-lines` | `components/landing/Sections.tsx` | The dashed rule between rows |
| `feature-section-with-terminal` | — | Rejected: 744 lines including keystroke audio, and it simulates a terminal typing |
| `features-section-demo-2` | — | Rejected in favour of a numbered sequence, since the four steps are genuinely ordered |

`components/ui/resizable-navbar.tsx` is installed and unmodified. The landing header borrows its
scroll-condense behaviour but not its layout: it centres nav items with `absolute inset-0`, and
both surfaces here share one `grid-cols-[auto_1fr_auto]` header instead.
