# Names ignore case

Snapscript names ignore case: `[set{framecount}to]` and `[get{frameCount}]` are the same name. That covers variables, functions, parameters, attributes, module names, library declarations and builtins. Strings, import paths and package names still count case.

Names are handwritten, and the rig test showed that case is one of the things handwriting reading gets wrong ([Hands-on test](https://github.com/shutallbridge/snapscript/issues/46)). Gemma read `framecount` as `frameCount` when the `c` was written big, `score2` as `Score2`, and a lone `x` as `X`. A lone letter has nothing to compare its size against, so a person can't always tell either. With case counting, each of these misreads turns a correct card into a `NameError`. Ignoring case removes that whole kind of mistake before it happens.

The other way was to keep case significant and help after the error, for example "did you mean `framecount`?" on the `NameError`. That still stops the program on a card the learner wrote correctly, and it can't fix `x`/`X`.

## Consequences

- Python counts case. The transfer rule is one line: in Python, `score` and `Score` are two names, so pick one spelling and keep it. Snapscript's guiding principle is that concepts transfer easily, not that programs are identical.
- Mixed spellings in one file are not an error or a warning. Most of them come from misreads, so a warning would mostly fire on cards that were written right.
- Every rule about names compares them ignoring case. Two declarations that differ only in case are the existing duplicate-declaration error. A library that wraps something with such a pair, like p5.js's `image()` and `p5.Image`, has to rename one.
- The text keeps names as they were written, and messages use the spelling a name was declared with.
- By convention, names are camelCase (`frameCount`), as in p5.js. That's easier to read than lowercase and shorter than snake_case on a card. Python uses snake_case, which a learner picks up along with the case rule.
- Changing back later would break old programs that mix spellings, so the decision is made before v0.
