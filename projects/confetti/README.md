# confetti

The one PoC project. The table app opens it, and its entry module, `main.snap`, is the buffer: the program the cards on the table write. There is no "new project" and no template mechanism. These are the files the p5 template would make:

- `package.json`: depends on `snapscript-p5` and its textbook, `snapscript-p5-getting-started`, and names `main.snap` as the entry module.
- `main.snap`: only the hidden `[import(snapscript-p5)as(p5)]` that names the library cards `p5.…`.
- `snapscript.lock`: the marker ID of each library card and textbook page, from 400. `pnpm lock` adds what's missing and never changes a line, so edit it only through `pnpm lock`.
- `kit.yaml`: the cards made for the project and how many sheets of each, matching the bases printed (#158). `pnpm print` prints them.
