import{En as e,Fn as t,Jn as n,L as r,O as i,Qn as a,Rn as o,U as s,cr as c,fr as l,h as u,jt as d,l as f,m as p,sr as m,vt as h,yt as g}from"./three.core-uGoKMxsn.js";import{n as _}from"./three.module-ZjNeuXO9.js";var v={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},y=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},b=new d(-1,1,1,-1,0,1),x=new class extends f{constructor(){super(),this.setAttribute(`position`,new r([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new r([0,2,0,0,2,0],2))}},S=class{constructor(e){this._mesh=new h(x,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,b)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},C=class extends y{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof o?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=a.clone(e.uniforms),this.material=new o({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new S(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},w=class extends y{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},T=class extends y{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},E=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new m);this._width=n.width,this._height=n.height,t=new l(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:s}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new C(v),this.copyPass.material.blending=0,this.timer=new n}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}w!==void 0&&(r instanceof w?n=!0:r instanceof T&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new m);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},D=class extends y{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new p}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},O={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new p(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},k=class e extends y{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new m(256,256):new m(e.x,e.y),this.clearColor=new p(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),u=Math.round(this.resolution.y/2);this.renderTargetBright=new l(i,u,{type:s,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new l(i,u,{type:s,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new l(i,u,{type:s,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),u=Math.round(u/2)}let d=O;this.highPassUniforms=a.clone(d.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new o({uniforms:this.highPassUniforms,vertexShader:d.vertexShader,fragmentShader:d.fragmentShader}),this.separableBlurMaterials=[];let f=[6,10,14,18,22];i=Math.round(this.resolution.x/2),u=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(f[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new m(1/i,1/u),i=Math.round(i/2),u=Math.round(u/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let h=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=h,this.bloomTintColors=[new c(1,1,1),new c(1,1,1),new c(1,1,1),new c(1,1,1),new c(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=a.clone(v.uniforms),this.blendMaterial=new o({uniforms:this.copyUniforms,vertexShader:v.vertexShader,fragmentShader:v.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new p,this._oldClearAlpha=1,this._basic=new g,this._fsQuad=new S(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new m(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new o({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new m(.5,.5)},direction:{value:new m(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new o({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};k.BlurDirectionX=new m(1,0),k.BlurDirectionY=new m(0,1);var A={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},j=class extends y{constructor(){super(),this.isOutputPass=!0,this.uniforms=a.clone(A.uniforms),this.material=new e({name:A.name,uniforms:this.uniforms,vertexShader:A.vertexShader,fragmentShader:A.fragmentShader}),this._fsQuad=new S(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},u.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},M={low:{pixelRatio:.78,shadows:!1,shadowMap:512,bloom:!1,samples:0,particles:.35},medium:{pixelRatio:.9,shadows:!0,shadowMap:1024,bloom:!1,samples:0,particles:.6},high:{pixelRatio:1,shadows:!0,shadowMap:2048,bloom:!0,samples:0,particles:.85}};function N(){let e=navigator,t=e.hardwareConcurrency??4;return window.matchMedia?.(`(pointer: coarse)`).matches||t<=4||e.deviceMemory!==void 0&&e.deviceMemory<=4||e.connection?.saveData?`low`:`medium`}var P={uniforms:{tDiffuse:{value:null},time:{value:0},damage:{value:0},lowHealth:{value:0},flash:{value:0},overdrive:{value:0},vignette:{value:.32},grain:{value:.035},resolution:{value:new m(1,1)}},vertexShader:`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float time, damage, lowHealth, flash, vignette, grain, overdrive;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      // Single crisp sample: no chromatic aberration / RGB split (it read as double vision in heavy fights).
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // Gentle S-curve contrast + split tone (warm highlights, cool shadows).
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += (vec3(0.03, 0.012, -0.02) * luma - vec3(0.004, -0.002, -0.012) * (1.0 - luma)) ;
      // Low health: only a slight desaturation; the warning is the bloody vignette below.
      col = mix(col, vec3(luma), lowHealth * 0.12);
      float edge = smoothstep(0.08, 0.5, r2 * 2.0);
      // Overdrive: hot amber grade, crushed blues, pulsing molten edge glow.
      vec3 hot = vec3(luma) * vec3(1.35, 0.92, 0.55) + col * 0.35;
      col = mix(col, hot, overdrive * 0.6);
      col += vec3(1.0, 0.42, 0.08) * overdrive * edge * (0.22 + 0.08 * sin(time * 9.0));
      col = mix(col, vec3(0.55, 0.02, 0.01), clamp(damage * 0.6 * edge, 0.0, 0.8));
      // Bloody vignette: an irregular, slowly creeping blood rim that pulses with the heartbeat
      // and closes in as health drops. Sharp-edged (no blur): multiplied to deep red + darkened.
      if (lowHealth > 0.001) {
        vec2 e = c * vec2(1.0, 1.3);
        float rim = length(e) * 1.55;
        float n = vnoise(e * 6.0 + vec2(0.0, time * 0.05)) * 0.3 + vnoise(e * 17.0 - time * 0.03) * 0.12 + vnoise(e * 41.0) * 0.05;
        float beat = 0.5 + 0.5 * sin(time * 6.0);
        float reach = 0.98 - lowHealth * (0.3 + 0.06 * beat);
        float blood = smoothstep(reach, reach + 0.1, rim + n);
        float core = smoothstep(reach + 0.12, reach + 0.35, rim + n);
        vec3 bloodCol = mix(col * vec3(0.62, 0.08, 0.06) + vec3(0.2, 0.0, 0.0), vec3(0.16, 0.0, 0.0), core * 0.7);
        col = mix(col, bloodCol, clamp(blood * lowHealth * (1.15 + 0.15 * beat), 0.0, 0.92));
      }
      col += vec3(1.0, 0.85, 0.7) * flash;
      col *= 1.0 - vignette * smoothstep(0.1, 0.75, r2 * 1.6);
      col += (hash(vUv * resolution + fract(time) * 91.7) - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }
  `},F=3,I=class extends y{mesh;camera;rt=new l(1,1,{type:s,depthBuffer:!1});quad=new S(new o({uniforms:{tScene:{value:null},tSmoke:{value:this.rt.texture}},vertexShader:`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:`uniform sampler2D tScene; uniform sampler2D tSmoke; varying vec2 vUv;
void main() { vec4 s = texture2D(tScene, vUv); vec4 p = texture2D(tSmoke, vUv); gl_FragColor = vec4(p.rgb + s.rgb * (1.0 - p.a), s.a); }`,depthTest:!1,depthWrite:!1}));clearColor=new p;constructor(e,t){super(),this.mesh=e,this.camera=t,this.needsSwap=!0,e.layers.set(3)}setSize(e,t){this.rt.setSize(Math.max(1,Math.floor(e/2)),Math.max(1,Math.floor(t/2)))}render(e,t,n){let r=this.mesh.material.uniforms;r.sceneDepth.value=n.depthTexture,r.depthRes.value.set(this.rt.width,this.rt.height),r.camNear.value=this.camera.near,r.camFar.value=this.camera.far,r.offscreen.value=1,e.getClearColor(this.clearColor);let i=e.getClearAlpha(),a=e.autoClear,o=this.camera.layers.mask;e.setClearColor(0,0),e.setRenderTarget(this.rt),e.clear(!0,!1,!1),e.autoClear=!1,this.camera.layers.set(3),e.render(this.mesh,this.camera),this.camera.layers.mask=o,e.autoClear=a,e.setClearColor(this.clearColor,i),r.offscreen.value=0,this.quad.material.uniforms.tScene.value=n.texture,e.setRenderTarget(this.renderToScreen?null:t),this.quad.render(e)}dispose(){this.rt.dispose(),this.quad.dispose(),this.quad.material.dispose()}},L=class{canvas;gl;composer;bloom;grade;smoke;preset;adaptivePixelRatio;scene;camera;fx={damage:0,lowHealth:0,flash:0,overdrive:0};constructor(e,n){this.canvas=e,this.preset=M[n],this.adaptivePixelRatio=this.preset.pixelRatio,this.gl=new _({canvas:e,antialias:!1,powerPreference:`high-performance`,stencil:!1}),this.gl.outputColorSpace=t,this.gl.toneMapping=4,this.gl.toneMappingExposure=1.05,this.gl.shadowMap.type=2,this.applyQuality(n),window.addEventListener(`resize`,()=>this.resize())}get shadowMapSize(){return this.preset.shadowMap}get particleDensity(){return this.preset.particles}get shadowsEnabled(){return this.preset.shadows}applyQuality(e){this.preset=M[e],this.adaptivePixelRatio=this.preset.pixelRatio,this.gl.shadowMap.enabled=this.preset.shadows,this.composer?.dispose(),this.bloom?.dispose(),this.composer=void 0,this.bloom=void 0,this.grade=void 0,this.updatePixelRatio()}setAdaptivePixelRatio(e){Number.isFinite(e)&&(this.adaptivePixelRatio=Math.min(this.preset.pixelRatio,Math.max(.5,e)),this.updatePixelRatio())}updatePixelRatio(){this.gl.setPixelRatio(Math.min(window.devicePixelRatio||1,this.preset.pixelRatio,this.adaptivePixelRatio)),this.resize()}ensureComposer(e,t){if(this.composer&&this.scene===e&&this.camera===t)return this.composer;this.composer?.dispose(),this.scene=e,this.camera=t;let n=this.gl.getDrawingBufferSize(new m),r=new l(n.x,n.y,{type:s,samples:this.preset.samples});if(this.smoke&&(r.depthTexture=new i(n.x,n.y)),this.composer=new E(this.gl,r),this.composer.addPass(new D(e,t)),this.smoke&&this.composer.addPass(new I(this.smoke,t)),this.preset.bloom){let e=this.gl.getSize(new m);this.bloom=new k(e,.55,.55,.92),this.composer.addPass(this.bloom)}this.composer.addPass(new j),this.grade=new C(P),this.composer.addPass(this.grade);let a=this.gl.getSize(new m);return this.composer.setPixelRatio(this.gl.getPixelRatio()),this.composer.setSize(a.x,a.y),this.composer}setHalfResSmoke(e){this.smoke!==e&&(this.smoke=e,this.composer?.dispose(),this.composer=void 0)}resize(){let e=this.canvas.clientWidth||window.innerWidth,t=this.canvas.clientHeight||window.innerHeight;this.gl.setSize(e,t,!1),this.composer&&(this.composer.setPixelRatio(this.gl.getPixelRatio()),this.composer.setSize(e,t)),this.camera&&(this.camera.aspect=e/t,this.camera.updateProjectionMatrix())}render(e,t,n){let r=this.canvas.clientWidth||window.innerWidth,i=this.canvas.clientHeight||window.innerHeight;Math.abs(t.aspect-r/i)>.001&&(t.aspect=r/i,t.updateProjectionMatrix());let a=this.ensureComposer(e,t);if(this.grade){let e=this.grade.uniforms;e.time.value=n,e.damage.value=this.fx.damage,e.lowHealth.value=this.fx.lowHealth,e.flash.value=this.fx.flash,e.overdrive.value=this.fx.overdrive,e.resolution.value.set(r,i)}a.render()}};export{F as HALF_RES_LAYER,M as QUALITY_PRESETS,L as Renderer,N as suggestQuality};