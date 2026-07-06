# visualize-math

Interactive linear algebra visualizer — a Desmos-style setup for matrices and vectors.
Define objects on the left, write an expression, and watch the operation happen on the right:
animated 2D grid transformations for the geometry, and step-by-step numeric animations for
the arithmetic.

**Live:** https://bryan3342.github.io/visualize-math/

## What it does

- **Matrix multiplication** — `A*B` animates two ways: the plane view plays the composition
  stage by stage (right to left, the way composition actually works), and the steps view fills
  in the product cell by cell as row·column dot products.
- **Matrix–vector products** — `A*v` shows the vector riding the grid transformation.
- **Eigenvectors & eigenvalues** — `eig(A)` draws the invariant eigenlines, animates the
  transform, and shows the eigenvectors staying on their span while scaling by λ. Complex,
  repeated, and defective cases are reported honestly.
- **Elementary row operations** — `rref(M)` plays the full reduction one elementary row
  operation at a time (`R2 ← R2 − 2·R1`, swaps, scalings), with the affected rows highlighted.
- **Determinants** — `det(A)` shades the image of the unit square and shows the area scaling.
- **General expressions** — `2A + B`, `inv(A)*A`, `B^4`, `trans(A)`, scalar arithmetic,
  parentheses, and implicit multiplication (`2A`).

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
