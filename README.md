# visualize-math

Interactive linear algebra visualizer — a Desmos-style setup for matrices and vectors.
Define objects on the left, write an expression, and watch the operation happen on the right:
animated 2D grid transformations for the geometry, and step-by-step numeric animations for
the arithmetic.

**Live:** https://bryan3342.github.io/visualize-math/

## What it does

Three toggleable representations:

- **Graph view** — the geometric picture: an animated, zoomable (scroll wheel or +/− buttons)
  2D grid transformation with basis vectors, eigenlines, and determinant area shading.
- **Matrix view** — the actual matrices: color-coded, step-by-step arithmetic with a
  clickable start-to-finish timeline of every step, a legend, and an explicit explanation
  per step.
- **Sandbox** — a whiteboard-white rendering of the same walkthrough, for teaching: driven by
  the same expression box and objects as the other views. Type matrices inline
  (`[1 2; 3 4] * [5; 6]`) and the equation previews live exactly as typed — rows stay rows,
  columns stay columns — then Go steps through it in color.

Operations:

- **Matrix multiplication** — `A*B` plays the composition stage by stage on the graph
  (right to left, the way composition actually works) and fills the product in cell by cell
  as color-coded row·column dot products in the matrix view.
- **Matrix–vector products** — `A*v` shows the vector riding the grid transformation.
- **Eigenvectors & eigenvalues** — `eig(A)` draws the invariant eigenlines and shows
  eigenvectors staying on their span while scaling by λ; the matrix view verifies
  `A·v = λ·v` numerically. Complex, repeated, and defective cases are reported honestly.
- **Elementary row operations** — `rref(M)` plays the reduction one elementary row operation
  at a time (`R2 ← R2 − 2·R1`, swaps, scalings) with pivot rows and pivot entries highlighted.
- **Determinants** — `det(A)` walks the `a·d − b·c` formula with diagonal highlights and
  shades the unit square's image on the graph.
- **More** — entry-by-entry addition/subtraction, scalar multiplication, transposition, and
  general expressions: `2A + B`, `inv(A)*A`, `B^4`, parentheses, implicit multiplication (`2A`).

## Syntax

| Form | Meaning |
|------|---------|
| `A*B`, `A B`, `2A` | product (explicit or implicit) |
| `+` `-` `/` `^` | add, subtract, divide by scalar, integer powers (`A^-1` = inverse) |
| `det(A)` | determinant |
| `inv(A)` | inverse |
| `trans(A)` | transpose |
| `rref(M)` | reduced row-echelon form, animated as row operations |
| `eig(A)` | eigenvalues/eigenvectors of a 2×2, drawn on the plane |
| `[1 2; 3 4]` | inline matrix literal — spaces/commas between entries, `;` between rows |

The plane view animates 2×2 matrices and 2-vectors; anything bigger still computes and
animates numerically in the steps view.

## Stack

Zero-dependency vanilla ES modules + a `<canvas>` renderer. No build step, no backend,
no runtime network calls — everything computes in the browser. Deployed on GitHub Pages
straight from `main`.

## Local dev

```bash
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

Tests (math engine + parser) run with [Bun](https://bun.sh):

```bash
bun test
```
