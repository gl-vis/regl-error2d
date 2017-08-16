'use strict'

const createRegl = require('regl')
const getBounds = require('../array-bounds')
const rgba = require('color-rgba')

module.exports = Error2D

const WEIGHTS = [
  //[left,right], [lineTop/lineBottom], [capLeft/capRight]

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
      positionBuffer, colorBuffer,
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

    regl = createRegl(opts)
  }

  //TODO: use instanced colors
  //TODO: use instanced positions
  colorBuffer = regl.buffer({
    usage: 'dynamic',
    type: 'uint8',
    data: null
  })
  positionBuffer = regl.buffer({
    usage: 'dynamic',
    type: 'float',
    data: null
  })


  //TODO: detect hi-precision here

  update(options)

  //drawing method
  drawErrors = regl({
    vert: `
    precision highp float;

    attribute vec2 positionHi;
    attribute vec2 positionLo;
    attribute vec2 pixelOffset;
    attribute vec4 color;

    uniform vec2 scaleHi, scaleLo, translateHi, translateLo, pixelScale;

    varying vec4 fragColor;

    //TODO: test if GPU has base-64 calculations
    vec2 project(vec2 scHi, vec2 trHi, vec2 scLo, vec2 trLo, vec2 posHi, vec2 posLo) {
      return (posHi + trHi) * scHi
           + (posLo + trLo) * scHi
           + (posHi + trHi) * scLo
           + (posLo + trLo) * scLo;
    }

    void main() {
      gl_Position = vec4(positionHi, 0, 1);

      fragColor = color;

      vec3 scrPosition = vec3(
             project(scaleHi, translateHi, scaleLo, translateLo, positionHi, positionLo),
             1);
      gl_Position = vec4(
        scrPosition.xy + scrPosition.z * pixelScale * pixelOffset,
        0,
        scrPosition.z);
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
      scaleHi: regl.prop('scaleHi'),
      scaleLo: regl.prop('scaleLo'),
      translateHi: regl.prop('translateHi'),
      translateLo: regl.prop('translateLo'),
      pixelScale: ctx => [
        2. * ctx.pixelRatio / ctx.viewportWidth,
        2. * ctx.pixelRatio / ctx.viewportHeight
      ]
    },

    attributes: {
      color: ctx => {
        return color.length <= 4 ? {constant: color} : colorBuffer
      },
      positionHi: {
        buffer: positionBuffer,
        stride: 24,
        offset:0
      },
      positionLo: {
        buffer: positionBuffer,
        stride: 24,
        offset: 8
      },
      pixelOffset: {
        buffer: positionBuffer,
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

    count: regl.prop('count')
  })


  //main draw method
  function draw (opts) {
    if (opts) {
      update(opts)
      if (opts.draw === false) return
    }

    if (!count) return

    //calc bounds fast
    let boundX = bounds[2] - bounds[0]
    let boundY = bounds[3] - bounds[1]
    let dataX = range[2] - range[0]
    let dataY = range[3] - range[1]

    let scaleX = 2 * boundX / dataX
    let scaleY = 2 * boundY / dataY
    let translateX = (bounds[0] - range[0] - 0.5 * dataX) / boundX
    let translateY = (bounds[1] - range[1] - 0.5 * dataY) / boundY

    drawErrors({
      scaleHi: [scaleX, scaleY],
      scaleLo: [0, 0], //FIXME: add precision
      translateHi: [translateX, translateY],
      translateLo: [0, 0], //FIXME: add precision
      count: count * WEIGHTS.length
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
    }

    //update positions
    if (options.data) options.positions = options.data
    if (options.points) options.positions = options.points
    if (options.positions && options.positions.length) {
      //unroll positions
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

      //FIXME: make sure we really need increasing that bounds range
      if (bounds[2] === bounds[0]) {
        bounds[2] += 1
      }
      if (bounds[3] === bounds[1]) {
        bounds[3] += 1
      }

      let sx = 1.0 / (bounds[2] - bounds[0])
      let sy = 1.0 / (bounds[3] - bounds[1])
      let tx = bounds[0]
      let ty = bounds[1]

      let bufferData = new Float32Array(count * WEIGHTS.length * 6)

      let ptr = 0

      for (let i = 0; i < count; ++i) {
        let x = positions[2 * i]
        let y = positions[2 * i + 1]
        let ex0 = errors[4 * i]
        let ex1 = errors[4 * i + 1]
        let ey0 = errors[4 * i + 2]
        let ey1 = errors[4 * i + 3]

        for (let j = 0; j < WEIGHTS.length; ++j) {
          let w = WEIGHTS[j]

          let dx = w[0]
          let dy = w[1]

          if (dx < 0) {
            dx *= ex0
          } else if (dx > 0) {
            dx *= ex1
          }

          if (dy < 0) {
            dy *= ey0
          } else if (dy > 0) {
            dy *= ey1
          }

          //absolute offset in normalized to 0..1 coords
          bufferData[ptr++] = sx * ((x - tx) + dx)
          bufferData[ptr++] = sy * ((y - ty) + dy)

          //FIXME: lo-precision data remainder
          bufferData[ptr++] = 0 //bufferData[ptr-2] - bufferData[ptr-2]
          bufferData[ptr++] = 0 //bufferData[ptr - 2] - bufferData

          //relative offset in pixels
          bufferData[ptr++] = lineWidth * w[2] + (capSize + lineWidth) * w[4]
          bufferData[ptr++] = lineWidth * w[3] + (capSize + lineWidth) * w[5]
        }
      }

      positionBuffer(bufferData)
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
      //FIXME: move here from draw call
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
