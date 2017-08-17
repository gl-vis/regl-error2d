'use strict'

const createRegl = require('regl')
const getBounds = require('array-bounds')
const rgba = require('color-rgba')

module.exports = Error2D

const WEIGHTS = [
  //direction, lineWidth shift, capSize shift

  // x-error bar
  [1, 0, 0, 1, 0, 0],
  [1, 0, 0, -1, 0, 0],
  [-1, 0, 0, -1, 0, 0],

  [-1, 0, 0, -1, 0, 0],
  [-1, 0, 0, 1, 0, 0],
  [1, 0, 0, 1, 0, 0],

  // x-error right cap
  [1, 0, -1, 0, 0, 1],
  [1, 0, -1, 0, 0, -1],
  [1, 0, 1, 0, 0, -1],

  [1, 0, 1, 0, 0, -1],
  [1, 0, 1, 0, 0, 1],
  [1, 0, -1, 0, 0, 1],

  // x-error left cap
  [-1, 0, -1, 0, 0, 1],
  [-1, 0, -1, 0, 0, -1],
  [-1, 0, 1, 0, 0, -1],

  [-1, 0, 1, 0, 0, -1],
  [-1, 0, 1, 0, 0, 1],
  [-1, 0, -1, 0, 0, 1],

  // y-error bar
  [0, 1, 1, 0, 0, 0],
  [0, 1, -1, 0, 0, 0],
  [0, -1, -1, 0, 0, 0],

  [0, -1, -1, 0, 0, 0],
  [0, 1, 1, 0, 0, 0],
  [0, -1, 1, 0, 0, 0],

  // y-error top cap
  [0, 1, 0, -1, 1, 0],
  [0, 1, 0, -1, -1, 0],
  [0, 1, 0, 1, -1, 0],

  [0, 1, 0, 1, 1, 0],
  [0, 1, 0, -1, 1, 0],
  [0, 1, 0, 1, -1, 0],

  // y-error bottom cap
  [0, -1, 0, -1, 1, 0],
  [0, -1, 0, -1, -1, 0],
  [0, -1, 0, 1, -1, 0],

  [0, -1, 0, 1, 1, 0],
  [0, -1, 0, -1, 1, 0],
  [0, -1, 0, 1, -1, 0]
]


function Error2D (options) {
  if (!options) options = {}
  else if (typeof options === 'function') options = {regl: options}
  else if (options.length) options = {positions: options}

  // persistent variables
  let regl, range, viewport, scissor,
      positions = [], errors = [], count = 0, bounds, color = [0,0,0,255],
      drawErrors,
      positionBuffer, colorBuffer, errorBuffer, meshBuffer,
      lineWidth = 1, capSize = 5

  if (options.regl) regl = options.regl
  else {
    let opts = {}
    opts.pixelRatio = options.pixelRatio || global.devicePixelRatio

    if (options instanceof HTMLCanvasElement) opts.canvas = options
    else if (options instanceof HTMLElement) opts.container = options
    else if (options.drawingBufferWidth || options.drawingBufferHeight) opts.gl = options
    else {
      if (options.canvas) opts.canvas = options.canvas
      if (options.container) opts.container = options.container
      if (options.gl) opts.gl = options.gl
    }

    //FIXME: use fallback if not available
    opts.optionalExtensions = [
      'ANGLE_instanced_arrays'
    ]

    regl = createRegl(opts)
  }

  //TODO: use instanced colors
  //TODO: use instanced positions
  //color per-point
  colorBuffer = regl.buffer({
    usage: 'dynamic',
    type: 'uint8',
    data: null
  })
  //xy-position per-point
  positionBuffer = regl.buffer({
    usage: 'dynamic',
    type: 'float',
    data: null
  })
  //4 errors per-point
  errorBuffer = regl.buffer({
    usage: 'dynamic',
    type: 'float',
    data: null
  })
  //error bar mesh
  meshBuffer = regl.buffer({
    usage: 'static',
    type: 'float',
    data: WEIGHTS
  })


  //TODO: detect hi-precision here

  update(options)

  //drawing method
  drawErrors = regl({
    vert: `
    precision highp float;

    attribute vec2 position;
    attribute vec4 error;
    attribute vec4 color;

    attribute vec2 direction, lineOffset, capOffset;

    uniform vec4 bounds, range;
    uniform vec2 pixelScale;
    uniform float lineWidth, capSize;

    varying vec4 fragColor;

    void main() {
      gl_Position = vec4(position, 0, 1);

      fragColor = color;

      vec2 pixelOffset = lineWidth * lineOffset + (capSize + lineWidth) * capOffset;

      vec2 bxy = vec2(bounds.z - bounds.x, bounds.w - bounds.y);
      vec2 rxy = vec2(range.z - range.x, range.w - range.y);

      //FIXME: add more step fn
      vec2 dxy = -step(.5, direction.xy) * error.xz + step(direction.xy, vec2(-.5)) * error.yw;

      vec2 pos = (position.xy + dxy - range.xy) / rxy;

      pos += pixelScale * pixelOffset;

      gl_Position = vec4(pos * 2. - 1., 0, 1);
    }
    `,

    frag: `
    precision mediump float;

    varying vec4 fragColor;

    void main() {
      gl_FragColor = fragColor / 255.;
    }
    `,

    uniforms: {
      bounds: regl.prop('bounds'),
      range: regl.prop('range'),
      lineWidth: regl.prop('lineWidth'),
      capSize: regl.prop('capSize'),
      pixelScale: ctx => [
        ctx.pixelRatio / ctx.viewportWidth,
        ctx.pixelRatio / ctx.viewportHeight
      ]
    },

    attributes: {
      //dynamic attributes
      color: ctx => {
        return color.length <= 4 ? {constant: color} : {
          buffer: colorBuffer,
          divisor: 1
        }
      },
      position: {
        buffer: positionBuffer,
        divisor: 1
      },
      error: {
        buffer: errorBuffer,
        divisor: 1
      },

      //static attributes
      direction: {
        buffer: meshBuffer,
        stride: 24,
        offset: 0
      },
      lineOffset: {
        buffer: meshBuffer,
        stride: 24,
        offset: 8
      },
      capOffset: {
        buffer: meshBuffer,
        stride: 24,
        offset: 16
      }
    },

    primitive: 'triangles',

    blend: {
      enable: true,
      color: [0,0,0,1],
      func: {
        srcRGB:   'src alpha',
        srcAlpha: 1,
        dstRGB:   'one minus src alpha',
        dstAlpha: 'one minus src alpha'
      }
    },

    depth: {
      enable: false
    },

    scissor: ctx => {
      return {enable: !!scissor, box: scissor}
    },

    viewport: ctx => {
      return !viewport ? {
        x: 0, y: 0,
        width: ctx.drawingBufferWidth,
        height: ctx.drawingBufferHeight
      } : viewport
    },

    instances: regl.prop('count'),
    count: WEIGHTS.length
  })


  //main draw method
  function draw (opts) {
    if (opts) {
      update(opts)
      if (opts.draw === false) return
    }

    if (!count) return

    drawErrors({
      bounds: bounds,
      range: range,
      lineWidth: lineWidth,
      capSize: capSize,
      count: count //count points times 4 errors
    })
  }

  function update (options) {
    if (options.length != null) options = {positions: options}

    //update style
    if ('lineWidth' in options) {
      lineWidth = +options.lineWidth * .5
    }
    if ('capSize' in options) {
      capSize = +options.capSize * .5
    }

    //update errors
    if (options.errors) {
      //unroll errors
      if (options.errors[0].length) {
        let unrolled = []
        for (let i = 0, l = options.errors.length; i<l; i++) {
          unrolled[i*2] = options.errors[i][0]
          unrolled[i*2+1] = options.errors[i][1]
          unrolled[i*2+2] = options.errors[i][2]
          unrolled[i*2+3] = options.errors[i][3]
        }
        errors = unrolled
      }
      else {
        errors = options.errors
      }

      errorBuffer(errors)
    }

    //update positions
    if (options.data) options.positions = options.data
    if (options.points) options.positions = options.points
    if (options.positions && options.positions.length) {
      //unroll
      let unrolled
      if (options.positions[0].length) {
        unrolled = Array(options.positions.length)
        for (let i = 0, l = options.positions.length; i<l; i++) {
          unrolled[i*2] = options.positions[i][0]
          unrolled[i*2+1] = options.positions[i][1]
        }
      }
      else {
        unrolled = options.positions
      }

      positions = unrolled
      count = Math.floor(positions.length / 2)
      bounds = getBounds(positions, 2)

      positionBuffer(positions)
    }

    //process colors
    if (options.colors) options.color = options.colors
    if (options.color) {
      let colors = options.color

      if (!Array.isArray(colors)) {
        colors = [colors]
      }

      if (colors.length > 1 && colors.length != count) throw Error('Not enough colors')


      if (colors.length > 1) {
        color = new Uint8Array(count * 4)

        //convert colors to float arrays
        for (let i = 0; i < colors.length; i++) {
          if (typeof colors[i] === 'string') {
            colors[i] = rgba(colors[i], false)
          }
          color[i*4] = colors[i][0]
          color[i*4 + 1] = colors[i][1]
          color[i*4 + 2] = colors[i][2]
          color[i*4 + 3] = colors[i][3] * 255
        }
        colorBuffer(color)
      }
      else {
        color = rgba(colors[0], false)
        color[3] *= 255
        color = new Uint8Array(color)
      }
    }

    //FIXME: process databox
    if (!options.range && !range) options.range = bounds

    //update range
    if (options.range) {
      range = options.range
    }

    //update visible attribs
    if ('viewport' in options) {
      viewport = rect(options.viewport)
    }
    if ('scissor' in options) {
      scissor = rect(options.scissor)
    }
  }

  //return viewport/scissor rectangle object from arg
  function rect(arg) {
      if (Array.isArray(options.viewport)) {
        return {x: arg[0], y: arg[1], width: arg[2], height: arg[3]}
      }
      else if (arg) {
        return {
          x: arg.x || arg.left || 0,
          y: arg.y || arg.top || 0,
          width: arg.w || arg.width || 0,
          height: arg.h || arg.height || 0
        }
      }
  }

  return draw
}
