# Before we start

Lay `[call(shapes.square)]` on the table. Code such as `x[0]` and `[1, 2]` stays code.

![The canvas](canvas.png)

# A square

```snap
/** @table hidden */
[import(fixture-shapes)as(shapes)]

[define(setup)]
	[call(shapes.square)][num{10}][num{20}][num{30}]
```

Then try `[repeat][num{3}]`.

# Many squares

Some text.

```js
not a program
```
