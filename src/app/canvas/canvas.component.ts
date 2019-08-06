import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface RaymarcherProgramInfo {
  program: WebGLProgram;
  buffers: {[name: string]: WebGLBuffer};
  attributeLocations: {
    vertexPosition: number;
    vertexColor: number;
  };
  uniformLocations: {
    bounceLimit: WebGLUniformLocation;
    cameraOrientation: WebGLUniformLocation;
    cameraPosition: WebGLUniformLocation;
    depthOfField: WebGLUniformLocation;
    directionalLight: WebGLUniformLocation;
    fovea: WebGLUniformLocation;
    gravityExponent: WebGLUniformLocation;
    gravityStrength: WebGLUniformLocation;
    lightSpeed: WebGLUniformLocation;
    objectDefinitions?: WebGLUniformLocation;
    raysPerPixel: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    skybox: WebGLUniformLocation;
    sphereColors: WebGLUniformLocation;
    spheres: WebGLUniformLocation;
    time: WebGLUniformLocation;
  };
  shaders: WebGLShader[];
}

const defaultSettings = {
  raysPerPixel: 1,
  bounceLimit: 1,
  depthOfField: 3,
  directionalLight: [0, 1, 0],
  cameraPosition: [0, 2, -3],
  cameraOrientation: [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ],
  downsample: 1,
  startOnLoad: true,
  gravityStrength: 10,
  lightSpeed: 300000000,
  gravityExponent: 2
};
const Settings = localStorage.getItem('settings') && JSON.parse(localStorage.getItem('settings')) || defaultSettings;
const State = {
  movement: {
    fwd: false,
    left: false,
    back: false,
    right: false,
    up: false,
    down: false,
  },
  mouseCoords : {x: 0, y: 0},
  playerVelocity: {x: 0, y: 0, z: 0},

  ballPositions:  new Float32Array([
     0.0, 0,  1,
    -0.5, 0,  2,
     0.5, 0,  2,
    -1.0, 0,  3,
     0.0, 0,  3,
     1.0, 0,  3,
    -1.5, 0,  4,
    -0.5, 0,  4,
     0.5, 0,  4,
     1.5, 0,  4,
     0.0, 0, -1,
  ]),
  ballVelocities:  new Float32Array([
     0.0, 0,  1,
    -0.5, 0,  2,
     0.5, 0,  2,
    -1.0, 0,  3,
     0.0, 0,  3,
     1.0, 0,  3,
    -1.5, 0,  4,
    -0.5, 0,  4,
     0.5, 0,  4,
     1.5, 0,  4,
     0.0, 0, -1,
  ]),
};

@Component({
  selector: 'app-canvas',
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.css'],
})
export class CanvasComponent implements OnInit {

  @ViewChild('renderer', {static: true}) canvas!: ElementRef<HTMLCanvasElement>;

  // @ts-ignore
  private gl: WebGL2RenderingContext;
  private programInfo: RaymarcherProgramInfo;
  private startTime = Date.now();
  Settings = Settings;
  isPlaying = false;
  isReady = false;
  averageRenderTime = 0;
  lastTimestamp = 0;

  constructor(
    private http: HttpClient
  ) { }

  async ngOnInit() {
    console.log('Initializing Canvas');
    await this.start();
  }

  async start() {

    const rollingAverage = [];
    const draw = () => {

      this.drawFrame();
      const end = Date.now();
      const delta = end - this.lastTimestamp;
      this.lastTimestamp = end;
      rollingAverage.unshift(delta / 1000);
      rollingAverage.length = Math.min(rollingAverage.length, 90);

      const length = rollingAverage.length;
      this.averageRenderTime = rollingAverage.reduce((prev, current) => prev + current / length);
      console.log(`Rendered in ${delta}ms, avg: ${(1 / this.averageRenderTime).toFixed(0)}fps`);

      // window.requestAnimationFrame(draw);
    };

    this.lastTimestamp = Date.now();
    await this.setupWebGL();
    console.log(`'Set up WebGL in ${Date.now() - this.lastTimestamp}ms`);
    this.setupControls();

    this.isReady = true;
    this.isPlaying = Settings.startOnLoad;
    this.lastTimestamp = Date.now();
    draw();
  }

  async setupWebGL() {
    console.log('Setting up WebGL');
    // @ts-ignore
    this.gl = this.canvas.nativeElement.getContext('webgl2') as WebGL2RenderingContext;

    const [vert, frag] = await Promise.all([
      this.http.get<string>('/assets/pool-shader.vert', {responseType: 'text' as 'json'}).toPromise(),
      this.http.get<string>('/assets/pool-shader.frag', {responseType: 'text' as 'json'}).toPromise()
    ]);

    this.programInfo = this.createProgram(vert, frag);

    console.log(JSON.stringify(this.programInfo, undefined, 2));
    await this.createTextures();
    this.programInfo.buffers = await this.createBuffers();

    this.gl.validateProgram(this.programInfo.program);
    this.checkError(99);

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.frontFace(this.gl.CCW);
    this.gl.depthFunc(this.gl.LEQUAL);
  }

  setupControls() {
    document.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'w' : State.movement.fwd = true; break;
        case 'a' : State.movement.left = true; break;
        case 's' : State.movement.back = true; break;
        case 'd' : State.movement.right = true; break;
        case 'q' : State.movement.up = true; break;
        case 'e' : State.movement.down = true; break;
        case 'r' : Settings.cameraPosition = [...defaultSettings.cameraPosition]; break;
        default: console.log('KEYDOWN', e);
      }
    }, false);
    document.addEventListener('keyup', (e) => {
      switch (e.key) {
        case 'w' : State.movement.fwd = false; break;
        case 'a' : State.movement.left = false; break;
        case 's' : State.movement.back = false; break;
        case 'd' : State.movement.right = false; break;
        case 'q' : State.movement.up = false; break;
        case 'e' : State.movement.down = false; break;
        default: console.log('KEYUP', e);
      }
    }, false);
    document.addEventListener('mousemove', (e: MouseEvent) => {
      State.mouseCoords = {x: e.x, y: e.y};
    });
  }

  teardownControls() {

  }

  update() {
    if (this.isPlaying) {
      // update camera position
      if (State.movement.up) {
        State.playerVelocity.y += 0.1;
      } else if (State.playerVelocity.y > 0) {
        State.playerVelocity.y *= 0.85;
      }

      if (State.movement.down) {
        State.playerVelocity.y += -0.1;
      } else if (State.playerVelocity.y < 0) {
        State.playerVelocity.y *= 0.85;
      }

      if (State.movement.right) {
        State.playerVelocity.x += 0.1;
      } else if (State.playerVelocity.x < 0) {
        State.playerVelocity.x *= 0.85;
      }

      if (State.movement.left) {
        State.playerVelocity.x += -0.1;
      } else if (State.playerVelocity.x > 0) {
        State.playerVelocity.x *= 0.85;
      }

      if (State.movement.fwd) {
        State.playerVelocity.z += 0.1;
      } else if (State.playerVelocity.z > 0) {
        State.playerVelocity.z *= 0.85;
      }

      if (State.movement.back) {
        State.playerVelocity.z += -0.1;
      } else if (State.playerVelocity.z < 0) {
        State.playerVelocity.z *= 0.85;
      }

      Settings.cameraPosition[0] += State.playerVelocity.x;
      Settings.cameraPosition[1] += State.playerVelocity.y;
      Settings.cameraPosition[2] += State.playerVelocity.z;

      // update camera rotation
      // window.requestAnimationFrame(() => this.drawFrame());
    }
  }

  drawFrame() {
    this.saveSettings();
    const rect = {
      height: window.innerHeight * Settings.downsample,
      width: window.innerWidth * Settings.downsample
    };

    this.gl.canvas.width = rect.width;
    this.gl.canvas.height = rect.height;

    this.gl.viewport(0, 0, rect.width, rect.height);
    this.gl.clearDepth(1);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT | this.gl.COLOR_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT); // tslint:disable-line

    this.gl.useProgram(this.programInfo.program);
    this.checkError(1);


    this.gl.uniform1i(this.programInfo.uniformLocations.skybox, 0);
    this.gl.uniform1i(this.programInfo.uniformLocations.raysPerPixel, Settings.raysPerPixel);
    this.gl.uniform1i(this.programInfo.uniformLocations.bounceLimit, Settings.bounceLimit);
    this.gl.uniform1f(this.programInfo.uniformLocations.depthOfField, Settings.depthOfField);
    this.gl.uniform1f(this.programInfo.uniformLocations.gravityStrength, Settings.gravityStrength);
    this.gl.uniform1f(this.programInfo.uniformLocations.lightSpeed, Settings.lightSpeed);
    this.gl.uniform1f(this.programInfo.uniformLocations.gravityExponent, Settings.gravityExponent);
    this.gl.uniform1f(this.programInfo.uniformLocations.time, (Date.now() - this.startTime) / 1000);
    this.gl.uniform3fv(this.programInfo.uniformLocations.directionalLight, new Float32Array(Settings.directionalLight));
    this.gl.uniform3fv(this.programInfo.uniformLocations.cameraPosition, new Float32Array(Settings.cameraPosition));
    this.gl.uniformMatrix4fv(this.programInfo.uniformLocations.cameraOrientation, false, Settings.cameraOrientation);
    this.gl.uniform2fv(this.programInfo.uniformLocations.resolution, new Float32Array([rect.width, rect.height]));
    this.gl.uniform2f(this.programInfo.uniformLocations.fovea, State.mouseCoords.x, window.innerHeight - State.mouseCoords.y); // NOTE: {0,0} is bottom-left in OpenGL
    this.gl.uniform3fv(this.programInfo.uniformLocations.spheres, State.ballPositions, 0, 33);

    // NOTE: In here it should just be the uniforms I'm gonna CHANGE
    this.gl.uniform4fv(this.programInfo.uniformLocations.sphereColors, new Float32Array([
      0,  0,  1, 0.90,
      0,  1,  0, 0.10,
      0,  1,  1, 0.80,
      1,  0,  0, 0.20,
      0,  0,  0, 0.70,
      1,  1,  0, 0.30,
      1, .5,  0, 0.60,
      1,  0, .5, 0.40,
     .5,  1,  0, 0.45,
     .5,  0,  1, 0.55,
     .7, .7, .7, 0.5,
    ]), 0, 44);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.checkError(3);

    const sync = this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    const status = this.gl.clientWaitSync(sync, 0, 0);
  }

  createBuffers() {
    const vertexPosition = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexPosition);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0]), this.gl.STATIC_DRAW);

    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    this.gl.enableVertexAttribArray(this.programInfo.attributeLocations.vertexPosition);
    this.gl.vertexAttribPointer(this.programInfo.attributeLocations.vertexPosition, 2, this.gl.FLOAT, false, 0, 0);

    return { vertexPosition };
  }

  async createTextures() {
    const skybox = this.gl.createTexture();
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.checkError(5.1);
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, skybox);
    this.checkError(5.2);

    const promises = [
      {url: '/assets/shearing_l.jpg', target: this.gl.TEXTURE_CUBE_MAP_NEGATIVE_X},
      {url: '/assets/shearing_r.jpg', target: this.gl.TEXTURE_CUBE_MAP_POSITIVE_X},
      {url: '/assets/shearing_d.jpg', target: this.gl.TEXTURE_CUBE_MAP_NEGATIVE_Y},
      {url: '/assets/shearing_t.jpg', target: this.gl.TEXTURE_CUBE_MAP_POSITIVE_Y},
      {url: '/assets/shearing_b.jpg', target: this.gl.TEXTURE_CUBE_MAP_NEGATIVE_Z},
      {url: '/assets/shearing_f.jpg', target: this.gl.TEXTURE_CUBE_MAP_POSITIVE_Z},
    ].map(src => {
      return new Promise(res => {
        this.gl.texImage2D(src.target, 0, this.gl.RGB, 2048, 2048, 0, this.gl.RGB, this.gl.UNSIGNED_BYTE, null);
        const image = new Image();
        image.onload = () => res({...src, image});
        image.src = src.url;
      });
    });

    const imageData: {url: string, target: number; image: any}[] = await Promise.all(promises) as any;

    imageData.forEach((data, index) => {
      console.log('Setting up', data.url);
      this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, skybox);
      this.gl.texImage2D(data.target, 0, this.gl.RGB, this.gl.RGB, this.gl.UNSIGNED_BYTE, data.image);
      this.checkError(6 + index / 10);
    });

    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, skybox);
    this.gl.activeTexture(this.gl.TEXTURE0);


    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);

    // this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
    this.checkError(7);
  }

  createProgram(vert: string, frag: string): RaymarcherProgramInfo {

    const program = this.gl.createProgram();
    const vertShader = this.createShader(vert, this.gl.VERTEX_SHADER);
    const fragShader = this.createShader(frag, this.gl.FRAGMENT_SHADER);

    this.gl.attachShader(program, vertShader);
    this.gl.attachShader(program, fragShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      alert('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(program));
      return null;
    }

    return {
      program,
      buffers: {},
      shaders: [vertShader, fragShader],
      attributeLocations: {
        vertexPosition: this.gl.getAttribLocation(program, 'aVertexPosition'),
        vertexColor: this.gl.getAttribLocation(program, 'aVertexColor'),
      }, uniformLocations: {
        cameraPosition: this.gl.getUniformLocation(program, 'uCameraPosition'),
        cameraOrientation: this.gl.getUniformLocation(program, 'uCameraOrientation'),
        resolution: this.gl.getUniformLocation(program, 'uResolution'),
        fovea: this.gl.getUniformLocation(program, 'uFovea'),
        spheres: this.gl.getUniformLocation(program, 'uSphereCenters'),
        sphereColors: this.gl.getUniformLocation(program, 'uSphereColors'),
        directionalLight: this.gl.getUniformLocation(program, 'uDirectionalLight'),
        raysPerPixel: this.gl.getUniformLocation(program, 'uRaysPerPixel'),
        bounceLimit: this.gl.getUniformLocation(program, 'uMaxBounces'),
        depthOfField: this.gl.getUniformLocation(program, 'uDoF'),
        skybox: this.gl.getUniformLocation(program, 'uSkybox'),
        time: this.gl.getUniformLocation(program, 'uTime'),
        gravityStrength: this.gl.getUniformLocation(program, 'uGravityStrength'),
        lightSpeed: this.gl.getUniformLocation(program, 'uLightSpeed'),
        gravityExponent: this.gl.getUniformLocation(program, 'uGravityExponent'),
        // objectDefinitions: this.gl.getUniformLocation(program, 'uObjectDefinitions'),
      },
    };
  }

  createShader(source: string, type: number) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const glError = this.gl.getShaderInfoLog(shader);
      const err = `An error occurred compiling the shaders: ${glError}`;
      this.gl.deleteShader(shader);
      console.error(glError);
      throw new Error(err);
    }
    return shader;
  }

  checkError(n = 0) {
    const error = this.gl.getError();
    if (error) {
      console.error(n, 'Shader Program Error: ', error, this.gl.getProgramInfoLog(this.programInfo.program),
        this.gl.getShaderInfoLog(this.programInfo.shaders[0]),
        this.gl.getShaderInfoLog(this.programInfo.shaders[1])
      );
    }
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    this.saveSettings();
    if (this.isPlaying) {
      this.start();
    }
  }

  toggleStartOnLoad() {
    Settings.startOnLoad = !Settings.startOnLoad;
    this.saveSettings();
  }

  saveSettings() {
    localStorage.setItem('settings', JSON.stringify(Settings));
  }
}
