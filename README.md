# Visualize Math

## Description

A browser-based linear-algebra whiteboard. Users define matrices and vectors, enter expressions, and step through animated geometric or numeric explanations.

## Dependencies

A modern browser. Python 3 or another static file server can serve the site locally. Bun is required only for the test command.

## Technologies

HTML, CSS, zero-dependency JavaScript modules, Canvas, GitHub Pages, and Bun tests.

## Setup

```bash
git clone https://github.com/bryan3342/visualize-math.git
cd visualize-math
python3 -m http.server 8000
```

Open `http://localhost:8000`. There is no dependency installation or build step for the application.

## Features

- Matrix and matrix-vector multiplication with row-by-column arithmetic.
- Matrix addition, subtraction, scalar operations, powers, inverse, and transpose.
- Determinant walkthroughs.
- Reduced row-echelon form shown as elementary row operations.
- Eigenvalue and eigenvector output for 2 by 2 matrices, including reporting for complex or defective cases.
- Inline matrix literals, object editing, explanations, a legend, and a clickable timeline.

All calculations run in the browser. The live GitHub Pages site is [bryan3342.github.io/visualize-math](https://bryan3342.github.io/visualize-math/).

## Commands to run

```bash
python3 -m http.server 8000
bun test
```

The test suite covers the parser and math engine. When deploying changed assets through GitHub Pages, update the `?v=` values in `index.html` to avoid mixing cached and current files.

## Contributors

- [Bryan Mejia (@bryan3342)](https://github.com/bryan3342), credited in Git history.

## License

[MIT](LICENSE).
