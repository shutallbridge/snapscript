// The native module beside loop.snap: run calls the program's setup once and
// its draw three times; bump adds one to the module's count.
export const calls = [];

export function run(context, program) {
  calls.push(["run"]);
  const setup = context.function(program, "setup");
  const draw = context.function(program, "draw");
  if (setup) context.call(setup);
  for (let frame = 0; frame < 3; frame += 1) {
    if (draw) context.call(draw);
    context.frame();
  }
}

export function bump(context) {
  calls.push(["bump"]);
  context.setGlobal("count", context.global("count") + 1);
}
