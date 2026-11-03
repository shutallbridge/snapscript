# confetti

The one PoC project. The table app opens it, and its entry module, `main.snap`, is the buffer: the program the cards on the table write. There is no "new project" and no template mechanism. These are the files the p5 template would make:

- `package.json`: depends on `snapscript-p5` and its textbook, `snapscript-p5-getting-started`, and names `main.snap` as the entry module.
- `main.snap`: only the hidden `[import(snapscript-p5)as(p5)]` that names the library cards `p5.…`.
- `snapscript.lock`: the marker ID of each library card and textbook page, from 400. `pnpm lock` adds what's missing and never changes a line, so edit it only through `pnpm lock`.
- `kit.yaml`: the cards made for the project and how many sheets of each, matching the bases printed (#158). `pnpm print` prints them.

## Printing

`pnpm print` (from the repo root) writes `print/sheets.pdf` (the kit's faces, both sides of flip pairs), `print/pages.pdf` (the textbook's pages, each with its page marker) and `print/ruler.pdf` (the ruler page for calibration). `print/` isn't committed. It needs Electron, so a display. It stops, writing nothing, on a kit card with no marker, a page whose program has an error, or a page that doesn't fit one A4 sheet.

Print the PDFs at actual size (100%, not "fit to page"), then check each page's 50 mm bar with a ruler. `pnpm print <project> <folder>` prints another project, or into another folder.
