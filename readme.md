# regl-error2d [![experimental](https://img.shields.io/badge/stability-unstable-green.svg)](http://github.com/badges/stability-badges)

Draw error bars for a set of points with regl.

[image]

Remake on [gl-error2d](https://github.com/gl-vis/gl-error2d).

* `color` may take list of colors for per-bar color
* max number of bars extended from 1e5 to 4e6 (40 times) via instanced draw
* `lineWidth` and `capSize` normalized to reflect actual pixels
* enhanced updating performance by delegating range calculations to vertex shader

## Usage

[![npm install regl-error2d](https://nodei.co/npm/regl-error2d.png?mini=true)](https://npmjs.org/package/regl-error2d/)

```js
let drawErrors = require('regl-error2d')(require('regl')())

drawErrors({
	positions: data,
	color: 'rgba(0, 100, 200, .75)'
})
```

## API

### `drawErrors = require('regl-error2d')(options|regl)`

Create a function drawing points.

Option | Default | Description
---|---|---
`regl` | `null` | Regl instance to reuse, otherwise new regl is created.
`gl`, `canvas`, `container` | `null` | Options for `regl`, if new regl is created.
`...rest` | | `drawErrors(rest)` is invoked with the rest of options.

### `drawErrors(points|options?)`

Redraw points and optionally update options.

Option | Default | Description
---|---|---

`positions`, `points` | `[]` | An array of the unrolled xy coordinates of the points as `[x,y, x,y, ...]` or array of points `[[x,y], [x,y], ...]`.
`errors` | `[]` | Array with error values corresponding to the points `[e0l,e0r,e0b,e0t, e1l,e1r,e1b,e1t, ...]`
`capSize` | `5` | Error bar cap size, in pixels
`lineWidth` | `1` | Error bar line width, in pixels
`color`, `colors` | `'red'` | Color or array with colors. Each color can be a css-color string or an array with float `0..1` values.
`bounds` | `null` | Limits for visible data
`viewport` | `null` | Limits withing the visible area
`scissor` | `null` | Limits withing the visible area

## License

(c) 2017 Dima Yv. MIT License

Development supported by plot.ly.
