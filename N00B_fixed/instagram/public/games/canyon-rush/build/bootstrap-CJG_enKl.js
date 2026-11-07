var e=1e3,t=1001,n=1002,r=1003,i=1004,a=1005,o=1006,s=1007,c=1008,l=1009,u=1012,d=1014,f=1015,p=1016,m=1017,h=1018,g=1020,_=1023,v=1026,y=1027,b=1028,x=1029,S=1030,C=1031,w=1033,T=2300,E=2301,D=2302,O=2303,ee=2400,k=2401,A=2402,j=`srgb`,M=`srgb-linear`,N=`linear`,P=`srgb`,te=7680,F=35044,ne=35048,re=2e3;function ie(e){for(let t=e.length-1;t>=0;--t)if(e[t]>=65535)return!0;return!1}function ae(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function oe(e){return document.createElementNS(`http://www.w3.org/1999/xhtml`,e)}function se(){let e=oe(`canvas`);return e.style.display=`block`,e}var ce={};function le(...e){let t=`THREE.`+e.shift();console.log(t,...e)}function ue(e){let t=e[0];if(typeof t==`string`&&t.startsWith(`TSL:`)){let t=e[1];t&&t.isStackTrace?e[0]+=` `+t.getLocation():e[1]=`Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.`}return e}function I(...e){e=ue(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.warn(n.getError(t)):console.warn(t,...e)}}function L(...e){e=ue(e);let t=`THREE.`+e.shift();{let n=e[0];n&&n.isStackTrace?console.error(n.getError(t)):console.error(t,...e)}}function de(...e){let t=e.join(` `);t in ce||(ce[t]=!0,I(...e))}function fe(e,t,n){return new Promise(function(r,i){function a(){switch(e.clientWaitSync(t,e.SYNC_FLUSH_COMMANDS_BIT,0)){case e.WAIT_FAILED:i();break;case e.TIMEOUT_EXPIRED:setTimeout(a,n);break;default:r()}}setTimeout(a,n)})}var pe={0:1,2:6,4:7,3:5,1:0,6:2,7:4,5:3},me=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n!==void 0&&n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let r=n[e];if(r!==void 0){let e=r.indexOf(t);e!==-1&&r.splice(e,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let t=n.slice(0);for(let n=0,r=t.length;n<r;n++)t[n].call(this,e);e.target=null}}},he=`00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10.11.12.13.14.15.16.17.18.19.1a.1b.1c.1d.1e.1f.20.21.22.23.24.25.26.27.28.29.2a.2b.2c.2d.2e.2f.30.31.32.33.34.35.36.37.38.39.3a.3b.3c.3d.3e.3f.40.41.42.43.44.45.46.47.48.49.4a.4b.4c.4d.4e.4f.50.51.52.53.54.55.56.57.58.59.5a.5b.5c.5d.5e.5f.60.61.62.63.64.65.66.67.68.69.6a.6b.6c.6d.6e.6f.70.71.72.73.74.75.76.77.78.79.7a.7b.7c.7d.7e.7f.80.81.82.83.84.85.86.87.88.89.8a.8b.8c.8d.8e.8f.90.91.92.93.94.95.96.97.98.99.9a.9b.9c.9d.9e.9f.a0.a1.a2.a3.a4.a5.a6.a7.a8.a9.aa.ab.ac.ad.ae.af.b0.b1.b2.b3.b4.b5.b6.b7.b8.b9.ba.bb.bc.bd.be.bf.c0.c1.c2.c3.c4.c5.c6.c7.c8.c9.ca.cb.cc.cd.ce.cf.d0.d1.d2.d3.d4.d5.d6.d7.d8.d9.da.db.dc.dd.de.df.e0.e1.e2.e3.e4.e5.e6.e7.e8.e9.ea.eb.ec.ed.ee.ef.f0.f1.f2.f3.f4.f5.f6.f7.f8.f9.fa.fb.fc.fd.fe.ff`.split(`.`),ge=1234567,_e=Math.PI/180,ve=180/Math.PI;function ye(){let e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(he[e&255]+he[e>>8&255]+he[e>>16&255]+he[e>>24&255]+`-`+he[t&255]+he[t>>8&255]+`-`+he[t>>16&15|64]+he[t>>24&255]+`-`+he[n&63|128]+he[n>>8&255]+`-`+he[n>>16&255]+he[n>>24&255]+he[r&255]+he[r>>8&255]+he[r>>16&255]+he[r>>24&255]).toLowerCase()}function R(e,t,n){return Math.max(t,Math.min(n,e))}function be(e,t){return(e%t+t)%t}function xe(e,t,n,r,i){return r+(e-t)*(i-r)/(n-t)}function Se(e,t,n){return e===t?0:(n-e)/(t-e)}function Ce(e,t,n){return(1-n)*e+n*t}function we(e,t,n,r){return Ce(e,t,1-Math.exp(-n*r))}function Te(e,t=1){return t-Math.abs(be(e,t*2)-t)}function Ee(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*(3-2*e))}function De(e,t,n){return e<=t?0:e>=n?1:(e=(e-t)/(n-t),e*e*e*(e*(e*6-15)+10))}function Oe(e,t){return e+Math.floor(Math.random()*(t-e+1))}function ke(e,t){return e+Math.random()*(t-e)}function Ae(e){return e*(.5-Math.random())}function je(e){e!==void 0&&(ge=e);let t=ge+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function Me(e){return e*_e}function Ne(e){return e*ve}function Pe(e){return e>0&&Number.isInteger(e)&&2**Math.round(Math.log2(e))===e}function Fe(e){return 2**Math.ceil(Math.log(e)/Math.LN2)}function Ie(e){return 2**Math.floor(Math.log(e)/Math.LN2)}function z(e,t,n,r,i){let a=Math.cos,o=Math.sin,s=a(n/2),c=o(n/2),l=a((t+r)/2),u=o((t+r)/2),d=a((t-r)/2),f=o((t-r)/2),p=a((r-t)/2),m=o((r-t)/2);switch(i){case`XYX`:e.set(s*u,c*d,c*f,s*l);break;case`YZY`:e.set(c*f,s*u,c*d,s*l);break;case`ZXZ`:e.set(c*d,c*f,s*u,s*l);break;case`XZX`:e.set(s*u,c*m,c*p,s*l);break;case`YXY`:e.set(c*p,s*u,c*m,s*l);break;case`ZYZ`:e.set(c*m,c*p,s*u,s*l);break;default:I(`MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: `+i)}}function Le(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return e/4294967295;case Uint16Array:return e/65535;case Uint8Array:case Uint8ClampedArray:return e/255;case Int32Array:return Math.max(e/2147483647,-1);case Int16Array:return Math.max(e/32767,-1);case Int8Array:return Math.max(e/127,-1);default:throw Error(`THREE.MathUtils: Invalid component type.`)}}function B(e,t){switch(t.constructor){case Float32Array:return e;case Uint32Array:return Math.round(e*4294967295);case Uint16Array:return Math.round(e*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(e*255);case Int32Array:return Math.round(e*2147483647);case Int16Array:return Math.round(e*32767);case Int8Array:return Math.round(e*127);default:throw Error(`THREE.MathUtils: Invalid component type.`)}}var Re={DEG2RAD:_e,RAD2DEG:ve,generateUUID:ye,clamp:R,euclideanModulo:be,mapLinear:xe,inverseLerp:Se,lerp:Ce,damp:we,pingpong:Te,smoothstep:Ee,smootherstep:De,randInt:Oe,randFloat:ke,randFloatSpread:Ae,seededRandom:je,degToRad:Me,radToDeg:Ne,isPowerOfTwo:Pe,ceilPowerOfTwo:Fe,floorPowerOfTwo:Ie,setQuaternionFromProperEuler:z,normalize:B,denormalize:Le},V=class e{static{e.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw Error(`THREE.Vector2: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw Error(`THREE.Vector2: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6],this.y=r[1]*t+r[4]*n+r[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=R(this.x,e.x,t.x),this.y=R(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=R(this.x,e,t),this.y=R(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(R(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(R(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),r=Math.sin(t),i=this.x-e.x,a=this.y-e.y;return this.x=i*n-a*r+e.x,this.y=i*r+a*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},ze=class{constructor(e=0,t=0,n=0,r=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=r}static slerpFlat(e,t,n,r,i,a,o){let s=n[r+0],c=n[r+1],l=n[r+2],u=n[r+3],d=i[a+0],f=i[a+1],p=i[a+2],m=i[a+3];if(u!==m||s!==d||c!==f||l!==p){let e=s*d+c*f+l*p+u*m;e<0&&(d=-d,f=-f,p=-p,m=-m,e=-e);let t=1-o;if(e<.9995){let n=Math.acos(e),r=Math.sin(n);t=Math.sin(t*n)/r,o=Math.sin(o*n)/r,s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o}else{s=s*t+d*o,c=c*t+f*o,l=l*t+p*o,u=u*t+m*o;let e=1/Math.sqrt(s*s+c*c+l*l+u*u);s*=e,c*=e,l*=e,u*=e}}e[t]=s,e[t+1]=c,e[t+2]=l,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,r,i,a){let o=n[r],s=n[r+1],c=n[r+2],l=n[r+3],u=i[a],d=i[a+1],f=i[a+2],p=i[a+3];return e[t]=o*p+l*u+s*f-c*d,e[t+1]=s*p+l*d+c*u-o*f,e[t+2]=c*p+l*f+o*d-s*u,e[t+3]=l*p-o*u-s*d-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,r){return this._x=e,this._y=t,this._z=n,this._w=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,r=e._y,i=e._z,a=e._order,o=Math.cos,s=Math.sin,c=o(n/2),l=o(r/2),u=o(i/2),d=s(n/2),f=s(r/2),p=s(i/2);switch(a){case`XYZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`YXZ`:this._x=d*l*u+c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`ZXY`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u-d*f*p;break;case`ZYX`:this._x=d*l*u-c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u+d*f*p;break;case`YZX`:this._x=d*l*u+c*f*p,this._y=c*f*u+d*l*p,this._z=c*l*p-d*f*u,this._w=c*l*u-d*f*p;break;case`XZY`:this._x=d*l*u-c*f*p,this._y=c*f*u-d*l*p,this._z=c*l*p+d*f*u,this._w=c*l*u+d*f*p;break;default:I(`Quaternion: .setFromEuler() encountered an unknown order: `+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,r=Math.sin(n);return this._x=e.x*r,this._y=e.y*r,this._z=e.z*r,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],r=t[4],i=t[8],a=t[1],o=t[5],s=t[9],c=t[2],l=t[6],u=t[10],d=n+o+u;if(d>0){let e=.5/Math.sqrt(d+1);this._w=.25/e,this._x=(l-s)*e,this._y=(i-c)*e,this._z=(a-r)*e}else if(n>o&&n>u){let e=2*Math.sqrt(1+n-o-u);this._w=(l-s)/e,this._x=.25*e,this._y=(r+a)/e,this._z=(i+c)/e}else if(o>u){let e=2*Math.sqrt(1+o-n-u);this._w=(i-c)/e,this._x=(r+a)/e,this._y=.25*e,this._z=(s+l)/e}else{let e=2*Math.sqrt(1+u-n-o);this._w=(a-r)/e,this._x=(i+c)/e,this._y=(s+l)/e,this._z=.25*e}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<1e-8?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(R(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let r=Math.min(1,t/n);return this.slerp(e,r),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x*=e,this._y*=e,this._z*=e,this._w*=e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=t._x,s=t._y,c=t._z,l=t._w;return this._x=n*l+a*o+r*c-i*s,this._y=r*l+a*s+i*o-n*c,this._z=i*l+a*c+n*s-r*o,this._w=a*l-n*o-r*s-i*c,this._onChangeCallback(),this}slerp(e,t){let n=e._x,r=e._y,i=e._z,a=e._w,o=this.dot(e);o<0&&(n=-n,r=-r,i=-i,a=-a,o=-o);let s=1-t;if(o<.9995){let e=Math.acos(o),c=Math.sin(e);s=Math.sin(s*e)/c,t=Math.sin(t*e)/c,this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this._onChangeCallback()}else this._x=this._x*s+n*t,this._y=this._y*s+r*t,this._z=this._z*s+i*t,this._w=this._w*s+a*t,this.normalize();return this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),r=Math.sqrt(1-n),i=Math.sqrt(n);return this.set(r*Math.sin(e),r*Math.cos(e),i*Math.sin(t),i*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},H=class e{static{e.prototype.isVector3=!0}constructor(e=0,t=0,n=0){this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw Error(`THREE.Vector3: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw Error(`THREE.Vector3: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Be.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Be.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6]*r,this.y=i[1]*t+i[4]*n+i[7]*r,this.z=i[2]*t+i[5]*n+i[8]*r,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=e.elements,a=1/(i[3]*t+i[7]*n+i[11]*r+i[15]);return this.x=(i[0]*t+i[4]*n+i[8]*r+i[12])*a,this.y=(i[1]*t+i[5]*n+i[9]*r+i[13])*a,this.z=(i[2]*t+i[6]*n+i[10]*r+i[14])*a,this}applyQuaternion(e){let t=this.x,n=this.y,r=this.z,i=e.x,a=e.y,o=e.z,s=e.w,c=2*(a*r-o*n),l=2*(o*t-i*r),u=2*(i*n-a*t);return this.x=t+s*c+a*u-o*l,this.y=n+s*l+o*c-i*u,this.z=r+s*u+i*l-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,r=this.z,i=e.elements;return this.x=i[0]*t+i[4]*n+i[8]*r,this.y=i[1]*t+i[5]*n+i[9]*r,this.z=i[2]*t+i[6]*n+i[10]*r,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=R(this.x,e.x,t.x),this.y=R(this.y,e.y,t.y),this.z=R(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=R(this.x,e,t),this.y=R(this.y,e,t),this.z=R(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(R(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,r=e.y,i=e.z,a=t.x,o=t.y,s=t.z;return this.x=r*s-i*o,this.y=i*a-n*s,this.z=n*o-r*a,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return U.copy(this).projectOnVector(e),this.sub(U)}reflect(e){return this.sub(U.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(R(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,r=this.z-e.z;return t*t+n*n+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let r=Math.sin(t)*e;return this.x=r*Math.sin(n),this.y=Math.cos(t)*e,this.z=r*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),r=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=r,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},U=new H,Be=new ze,W=class e{static{e.prototype.isMatrix3=!0}constructor(e,t,n,r,i,a,o,s,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,r,i,a,o,s,c)}set(e,t,n,r,i,a,o,s,c){let l=this.elements;return l[0]=e,l[1]=r,l[2]=o,l[3]=t,l[4]=i,l[5]=s,l[6]=n,l[7]=a,l[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[3],s=n[6],c=n[1],l=n[4],u=n[7],d=n[2],f=n[5],p=n[8],m=r[0],h=r[3],g=r[6],_=r[1],v=r[4],y=r[7],b=r[2],x=r[5],S=r[8];return i[0]=a*m+o*_+s*b,i[3]=a*h+o*v+s*x,i[6]=a*g+o*y+s*S,i[1]=c*m+l*_+u*b,i[4]=c*h+l*v+u*x,i[7]=c*g+l*y+u*S,i[2]=d*m+f*_+p*b,i[5]=d*h+f*v+p*x,i[8]=d*g+f*y+p*S,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8];return t*a*l-t*o*c-n*i*l+n*o*s+r*i*c-r*a*s}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=l*a-o*c,d=o*s-l*i,f=c*i-a*s,p=t*u+n*d+r*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);let m=1/p;return e[0]=u*m,e[1]=(r*c-l*n)*m,e[2]=(o*n-r*a)*m,e[3]=d*m,e[4]=(l*t-r*s)*m,e[5]=(r*i-o*t)*m,e[6]=f*m,e[7]=(n*s-c*t)*m,e[8]=(a*t-n*i)*m,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,r,i,a,o){let s=Math.cos(i),c=Math.sin(i);return this.set(n*s,n*c,-n*(s*a+c*o)+a+e,-r*c,r*s,-r*(-c*a+s*o)+o+t,0,0,1),this}scale(e,t){return de(`Matrix3: .scale() is deprecated. Use .makeScale() instead.`),this.premultiply(Ve.makeScale(e,t)),this}rotate(e){return de(`Matrix3: .rotate() is deprecated. Use .makeRotation() instead.`),this.premultiply(Ve.makeRotation(-e)),this}translate(e,t){return de(`Matrix3: .translate() is deprecated. Use .makeTranslation() instead.`),this.premultiply(Ve.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<9;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Ve=new W,He=new W().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Ue=new W().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function We(){let e={enabled:!0,workingColorSpace:M,spaces:{},convert:function(e,t,n){return this.enabled===!1||t===n||!t||!n?e:(this.spaces[t].transfer===`srgb`&&(e.r=Ke(e.r),e.g=Ke(e.g),e.b=Ke(e.b)),this.spaces[t].primaries!==this.spaces[n].primaries&&(e.applyMatrix3(this.spaces[t].toXYZ),e.applyMatrix3(this.spaces[n].fromXYZ)),this.spaces[n].transfer===`srgb`&&(e.r=qe(e.r),e.g=qe(e.g),e.b=qe(e.b)),e)},workingToColorSpace:function(e,t){return this.convert(e,this.workingColorSpace,t)},colorSpaceToWorking:function(e,t){return this.convert(e,t,this.workingColorSpace)},getPrimaries:function(e){return this.spaces[e].primaries},getTransfer:function(e){return e===``?N:this.spaces[e].transfer},getToneMappingMode:function(e){return this.spaces[e].outputColorSpaceConfig.toneMappingMode||`standard`},getLuminanceCoefficients:function(e,t=this.workingColorSpace){return e.fromArray(this.spaces[t].luminanceCoefficients)},define:function(e){Object.assign(this.spaces,e)},_getMatrix:function(e,t,n){return e.copy(this.spaces[t].toXYZ).multiply(this.spaces[n].fromXYZ)},_getDrawingBufferColorSpace:function(e){return this.spaces[e].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(e=this.workingColorSpace){return this.spaces[e].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(t,n){return de(`ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace().`),e.workingToColorSpace(t,n)},toWorkingColorSpace:function(t,n){return de(`ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking().`),e.colorSpaceToWorking(t,n)}},t=[.64,.33,.3,.6,.15,.06],n=[.2126,.7152,.0722],r=[.3127,.329];return e.define({[M]:{primaries:t,whitePoint:r,transfer:N,toXYZ:He,fromXYZ:Ue,luminanceCoefficients:n,workingColorSpaceConfig:{unpackColorSpace:j},outputColorSpaceConfig:{drawingBufferColorSpace:j}},[j]:{primaries:t,whitePoint:r,transfer:P,toXYZ:He,fromXYZ:Ue,luminanceCoefficients:n,outputColorSpaceConfig:{drawingBufferColorSpace:j}}}),e}var Ge=We();function Ke(e){return e<.04045?e*.0773993808:(e*.9478672986+.0521327014)**2.4}function qe(e){return e<.0031308?e*12.92:1.055*e**.41666-.055}var Je,Ye=class{static getDataURL(e,t=`image/png`){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>`u`)return e.src;let n;if(e instanceof HTMLCanvasElement)n=e;else{Je===void 0&&(Je=oe(`canvas`)),Je.width=e.width,Je.height=e.height;let t=Je.getContext(`2d`);e instanceof ImageData?t.putImageData(e,0,0):t.drawImage(e,0,0,e.width,e.height),n=Je}return n.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap){let t=oe(`canvas`);t.width=e.width,t.height=e.height;let n=t.getContext(`2d`);n.drawImage(e,0,0,e.width,e.height);let r=n.getImageData(0,0,e.width,e.height),i=r.data;for(let e=0;e<i.length;e++)i[e]=Ke(i[e]/255)*255;return n.putImageData(r,0,0),t}if(e.data){let t=e.data.slice(0);for(let e=0;e<t.length;e++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[e]=Math.floor(Ke(t[e]/255)*255):t[e]=Ke(t[e]);return{data:t,width:e.width,height:e.height}}return I(`ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.`),e}},Xe=0,Ze=class{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:Xe++}),this.uuid=ye(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){let t=this.data;return typeof HTMLVideoElement<`u`&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<`u`&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t===null?e.set(0,0,0):e.set(t.width,t.height,t.depth||0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:``},r=this.data;if(r!==null){let e;if(Array.isArray(r)){e=[];for(let t=0,n=r.length;t<n;t++)r[t].isDataTexture?e.push(Qe(r[t].image)):e.push(Qe(r[t]))}else e=Qe(r);n.url=e}return t||(e.images[this.uuid]=n),n}};function Qe(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap?Ye.getDataURL(e):e.data?{data:Array.from(e.data),width:e.width,height:e.height,type:e.data.constructor.name}:(I(`Texture: Unable to serialize Texture.`),{})}var $e=0,et=new H,tt=class r extends me{constructor(e=r.DEFAULT_IMAGE,n=r.DEFAULT_MAPPING,i=t,a=t,s=o,u=c,d=_,f=l,p=r.DEFAULT_ANISOTROPY,m=``){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:$e++}),this.uuid=ye(),this.name=``,this.source=new Ze(e),this.mipmaps=[],this.mapping=n,this.channel=0,this.wrapS=i,this.wrapT=a,this.magFilter=s,this.minFilter=u,this.anisotropy=p,this.format=d,this.internalFormat=null,this.type=f,this.offset=new V(0,0),this.repeat=new V(1,1),this.center=new V(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new W,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=m,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(et).x}get height(){return this.source.getSize(et).y}get depth(){return this.source.getSize(et).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(let t in e){let n=e[t];if(n===void 0){I(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){I(`Texture.setValues(): property '${t}' does not exist.`);continue}r&&n&&r.isVector2&&n.isVector2||r&&n&&r.isVector3&&n.isVector3||r&&n&&r.isMatrix3&&n.isMatrix3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.7,type:`Texture`,generator:`Texture.toJSON`},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:`dispose`})}transformUv(r){if(this.mapping!==300)return r;if(r.applyMatrix3(this.matrix),r.x<0||r.x>1)switch(this.wrapS){case e:r.x-=Math.floor(r.x);break;case t:r.x=r.x<0?0:1;break;case n:Math.abs(Math.floor(r.x)%2)===1?r.x=Math.ceil(r.x)-r.x:r.x-=Math.floor(r.x)}if(r.y<0||r.y>1)switch(this.wrapT){case e:r.y-=Math.floor(r.y);break;case t:r.y=r.y<0?0:1;break;case n:Math.abs(Math.floor(r.y)%2)===1?r.y=Math.ceil(r.y)-r.y:r.y-=Math.floor(r.y)}return this.flipY&&(r.y=1-r.y),r}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};tt.DEFAULT_IMAGE=null,tt.DEFAULT_MAPPING=300,tt.DEFAULT_ANISOTROPY=1;var nt=class e{static{e.prototype.isVector4=!0}constructor(e=0,t=0,n=0,r=1){this.x=e,this.y=t,this.z=n,this.w=r}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,r){return this.x=e,this.y=t,this.z=n,this.w=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw Error(`THREE.Vector4: index is out of range: `+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw Error(`THREE.Vector4: index is out of range: `+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w===void 0?1:e.w,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,r=this.z,i=this.w,a=e.elements;return this.x=a[0]*t+a[4]*n+a[8]*r+a[12]*i,this.y=a[1]*t+a[5]*n+a[9]*r+a[13]*i,this.z=a[2]*t+a[6]*n+a[10]*r+a[14]*i,this.w=a[3]*t+a[7]*n+a[11]*r+a[15]*i,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,r,i,a=.01,o=.1,s=e.elements,c=s[0],l=s[4],u=s[8],d=s[1],f=s[5],p=s[9],m=s[2],h=s[6],g=s[10];if(Math.abs(l-d)<a&&Math.abs(u-m)<a&&Math.abs(p-h)<a){if(Math.abs(l+d)<o&&Math.abs(u+m)<o&&Math.abs(p+h)<o&&Math.abs(c+f+g-3)<o)return this.set(1,0,0,0),this;t=Math.PI;let e=(c+1)/2,s=(f+1)/2,_=(g+1)/2,v=(l+d)/4,y=(u+m)/4,b=(p+h)/4;return e>s&&e>_?e<a?(n=0,r=.707106781,i=.707106781):(n=Math.sqrt(e),r=v/n,i=y/n):s>_?s<a?(n=.707106781,r=0,i=.707106781):(r=Math.sqrt(s),n=v/r,i=b/r):_<a?(n=.707106781,r=.707106781,i=0):(i=Math.sqrt(_),n=y/i,r=b/i),this.set(n,r,i,t),this}let _=Math.sqrt((h-p)*(h-p)+(u-m)*(u-m)+(d-l)*(d-l));return Math.abs(_)<.001&&(_=1),this.x=(h-p)/_,this.y=(u-m)/_,this.z=(d-l)/_,this.w=Math.acos((c+f+g-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=R(this.x,e.x,t.x),this.y=R(this.y,e.y,t.y),this.z=R(this.z,e.z,t.z),this.w=R(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=R(this.x,e,t),this.y=R(this.y,e,t),this.z=R(this.z,e,t),this.w=R(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(R(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},rt=class extends me{constructor(e=1,t=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:o,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=n.depth,this.scissor=new nt(0,0,e,t),this.scissorTest=!1,this.viewport=new nt(0,0,e,t),this.textures=[];let r=new tt({width:e,height:t,depth:n.depth}),i=n.count;for(let e=0;e<i;e++)this.textures[e]=r.clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveColorBuffer=n.resolveColorBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.storeMultisampledColorBuffer=n.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=n.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=n.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(e={}){let t={minFilter:o,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let e=0;e<this.textures.length;e++)this.textures[e].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let r=0,i=this.textures.length;r<i;r++)this.textures[r].image.width=e,this.textures[r].image.height=t,this.textures[r].image.depth=n,this.textures[r].isData3DTexture!==!0&&(this.textures[r].isArrayTexture=this.textures[r].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let n=Object.assign({},e.textures[t].image);this.textures[t].source=new Ze(n)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null){if(e.depthTexture.renderTarget===e){let t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture}return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:`dispose`})}},it=class extends rt{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},at=class extends tt{constructor(e=null,n=1,i=1,a=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:n,height:i,depth:a},this.magFilter=r,this.minFilter=r,this.wrapR=t,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}},ot=class extends tt{constructor(e=null,n=1,i=1,a=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:n,height:i,depth:a},this.magFilter=r,this.minFilter=r,this.wrapR=t,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}},G=class e{static{e.prototype.isMatrix4=!0}constructor(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h)}set(e,t,n,r,i,a,o,s,c,l,u,d,f,p,m,h){let g=this.elements;return g[0]=e,g[4]=t,g[8]=n,g[12]=r,g[1]=i,g[5]=a,g[9]=o,g[13]=s,g[2]=c,g[6]=l,g[10]=u,g[14]=d,g[3]=f,g[7]=p,g[11]=m,g[15]=h,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new e().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),n.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();let t=this.elements,n=e.elements,r=1/st.setFromMatrixColumn(e,0).length(),i=1/st.setFromMatrixColumn(e,1).length(),a=1/st.setFromMatrixColumn(e,2).length();return t[0]=n[0]*r,t[1]=n[1]*r,t[2]=n[2]*r,t[3]=0,t[4]=n[4]*i,t[5]=n[5]*i,t[6]=n[6]*i,t[7]=0,t[8]=n[8]*a,t[9]=n[9]*a,t[10]=n[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,r=e.y,i=e.z,a=Math.cos(n),o=Math.sin(n),s=Math.cos(r),c=Math.sin(r),l=Math.cos(i),u=Math.sin(i);if(e.order===`XYZ`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=-s*u,t[8]=c,t[1]=n+r*c,t[5]=e-i*c,t[9]=-o*s,t[2]=i-e*c,t[6]=r+n*c,t[10]=a*s}else if(e.order===`YXZ`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e+i*o,t[4]=r*o-n,t[8]=a*c,t[1]=a*u,t[5]=a*l,t[9]=-o,t[2]=n*o-r,t[6]=i+e*o,t[10]=a*s}else if(e.order===`ZXY`){let e=s*l,n=s*u,r=c*l,i=c*u;t[0]=e-i*o,t[4]=-a*u,t[8]=r+n*o,t[1]=n+r*o,t[5]=a*l,t[9]=i-e*o,t[2]=-a*c,t[6]=o,t[10]=a*s}else if(e.order===`ZYX`){let e=a*l,n=a*u,r=o*l,i=o*u;t[0]=s*l,t[4]=r*c-n,t[8]=e*c+i,t[1]=s*u,t[5]=i*c+e,t[9]=n*c-r,t[2]=-c,t[6]=o*s,t[10]=a*s}else if(e.order===`YZX`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=i-e*u,t[8]=r*u+n,t[1]=u,t[5]=a*l,t[9]=-o*l,t[2]=-c*l,t[6]=n*u+r,t[10]=e-i*u}else if(e.order===`XZY`){let e=a*s,n=a*c,r=o*s,i=o*c;t[0]=s*l,t[4]=-u,t[8]=c*l,t[1]=e*u+i,t[5]=a*l,t[9]=n*u-r,t[2]=r*u-n,t[6]=o*l,t[10]=i*u+e}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(lt,e,ut)}lookAt(e,t,n){let r=this.elements;return pt.subVectors(e,t),pt.lengthSq()===0&&(pt.z=1),pt.normalize(),dt.crossVectors(n,pt),dt.lengthSq()===0&&(Math.abs(n.z)===1?pt.x+=1e-4:pt.z+=1e-4,pt.normalize(),dt.crossVectors(n,pt)),dt.normalize(),ft.crossVectors(pt,dt),r[0]=dt.x,r[4]=ft.x,r[8]=pt.x,r[1]=dt.y,r[5]=ft.y,r[9]=pt.y,r[2]=dt.z,r[6]=ft.z,r[10]=pt.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,r=t.elements,i=this.elements,a=n[0],o=n[4],s=n[8],c=n[12],l=n[1],u=n[5],d=n[9],f=n[13],p=n[2],m=n[6],h=n[10],g=n[14],_=n[3],v=n[7],y=n[11],b=n[15],x=r[0],S=r[4],C=r[8],w=r[12],T=r[1],E=r[5],D=r[9],O=r[13],ee=r[2],k=r[6],A=r[10],j=r[14],M=r[3],N=r[7],P=r[11],te=r[15];return i[0]=a*x+o*T+s*ee+c*M,i[4]=a*S+o*E+s*k+c*N,i[8]=a*C+o*D+s*A+c*P,i[12]=a*w+o*O+s*j+c*te,i[1]=l*x+u*T+d*ee+f*M,i[5]=l*S+u*E+d*k+f*N,i[9]=l*C+u*D+d*A+f*P,i[13]=l*w+u*O+d*j+f*te,i[2]=p*x+m*T+h*ee+g*M,i[6]=p*S+m*E+h*k+g*N,i[10]=p*C+m*D+h*A+g*P,i[14]=p*w+m*O+h*j+g*te,i[3]=_*x+v*T+y*ee+b*M,i[7]=_*S+v*E+y*k+b*N,i[11]=_*C+v*D+y*A+b*P,i[15]=_*w+v*O+y*j+b*te,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[12],a=e[1],o=e[5],s=e[9],c=e[13],l=e[2],u=e[6],d=e[10],f=e[14],p=e[3],m=e[7],h=e[11],g=e[15],_=s*f-c*d,v=o*f-c*u,y=o*d-s*u,b=a*f-c*l,x=a*d-s*l,S=a*u-o*l;return t*(m*_-h*v+g*y)-n*(p*_-h*b+g*x)+r*(p*v-m*b+g*S)-i*(p*y-m*x+h*S)}determinantAffine(){let e=this.elements,t=e[0],n=e[4],r=e[8],i=e[1],a=e[5],o=e[9],s=e[2],c=e[6],l=e[10];return t*(a*l-o*c)-n*(i*l-o*s)+r*(i*c-a*s)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let r=this.elements;return e.isVector3?(r[12]=e.x,r[13]=e.y,r[14]=e.z):(r[12]=e,r[13]=t,r[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],r=e[2],i=e[3],a=e[4],o=e[5],s=e[6],c=e[7],l=e[8],u=e[9],d=e[10],f=e[11],p=e[12],m=e[13],h=e[14],g=e[15],_=t*o-n*a,v=t*s-r*a,y=t*c-i*a,b=n*s-r*o,x=n*c-i*o,S=r*c-i*s,C=l*m-u*p,w=l*h-d*p,T=l*g-f*p,E=u*h-d*m,D=u*g-f*m,O=d*g-f*h,ee=_*O-v*D+y*E+b*T-x*w+S*C;if(ee===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let k=1/ee;return e[0]=(o*O-s*D+c*E)*k,e[1]=(r*D-n*O-i*E)*k,e[2]=(m*S-h*x+g*b)*k,e[3]=(d*x-u*S-f*b)*k,e[4]=(s*T-a*O-c*w)*k,e[5]=(t*O-r*T+i*w)*k,e[6]=(h*y-p*S-g*v)*k,e[7]=(l*S-d*y+f*v)*k,e[8]=(a*D-o*T+c*C)*k,e[9]=(n*T-t*D-i*C)*k,e[10]=(p*x-m*y+g*_)*k,e[11]=(u*y-l*x-f*_)*k,e[12]=(o*w-a*E-s*C)*k,e[13]=(t*E-n*w+r*C)*k,e[14]=(m*v-p*b-h*_)*k,e[15]=(l*b-u*v+d*_)*k,this}scale(e){let t=this.elements,n=e.x,r=e.y,i=e.z;return t[0]*=n,t[4]*=r,t[8]*=i,t[1]*=n,t[5]*=r,t[9]*=i,t[2]*=n,t[6]*=r,t[10]*=i,t[3]*=n,t[7]*=r,t[11]*=i,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],r=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,r))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),r=Math.sin(t),i=1-n,a=e.x,o=e.y,s=e.z,c=i*a,l=i*o;return this.set(c*a+n,c*o-r*s,c*s+r*o,0,c*o+r*s,l*o+n,l*s-r*a,0,c*s-r*o,l*s+r*a,i*s*s+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,r,i,a){return this.set(1,n,i,0,e,1,a,0,t,r,1,0,0,0,0,1),this}compose(e,t,n){let r=this.elements,i=t._x,a=t._y,o=t._z,s=t._w,c=i+i,l=a+a,u=o+o,d=i*c,f=i*l,p=i*u,m=a*l,h=a*u,g=o*u,_=s*c,v=s*l,y=s*u,b=n.x,x=n.y,S=n.z;return r[0]=(1-(m+g))*b,r[1]=(f+y)*b,r[2]=(p-v)*b,r[3]=0,r[4]=(f-y)*x,r[5]=(1-(d+g))*x,r[6]=(h+_)*x,r[7]=0,r[8]=(p+v)*S,r[9]=(h-_)*S,r[10]=(1-(d+m))*S,r[11]=0,r[12]=e.x,r[13]=e.y,r[14]=e.z,r[15]=1,this}decompose(e,t,n){let r=this.elements;e.x=r[12],e.y=r[13],e.z=r[14];let i=this.determinantAffine();if(i===0)return n.set(1,1,1),t.identity(),this;let a=st.set(r[0],r[1],r[2]).length(),o=st.set(r[4],r[5],r[6]).length(),s=st.set(r[8],r[9],r[10]).length();i<0&&(a=-a),ct.copy(this);let c=1/a,l=1/o,u=1/s;return ct.elements[0]*=c,ct.elements[1]*=c,ct.elements[2]*=c,ct.elements[4]*=l,ct.elements[5]*=l,ct.elements[6]*=l,ct.elements[8]*=u,ct.elements[9]*=u,ct.elements[10]*=u,t.setFromRotationMatrix(ct),n.x=a,n.y=o,n.z=s,this}makePerspective(e,t,n,r,i,a,o=re,s=!1){let c=this.elements,l=2*i/(t-e),u=2*i/(n-r),d=(t+e)/(t-e),f=(n+r)/(n-r),p,m;if(s)p=i/(a-i),m=a*i/(a-i);else if(o===2e3)p=-(a+i)/(a-i),m=-2*a*i/(a-i);else if(o===2001)p=-a/(a-i),m=-a*i/(a-i);else throw Error(`THREE.Matrix4.makePerspective(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,r,i,a,o=re,s=!1){let c=this.elements,l=2/(t-e),u=2/(n-r),d=-(t+e)/(t-e),f=-(n+r)/(n-r),p,m;if(s)p=1/(a-i),m=a/(a-i);else if(o===2e3)p=-2/(a-i),m=-(a+i)/(a-i);else if(o===2001)p=-1/(a-i),m=-i/(a-i);else throw Error(`THREE.Matrix4.makeOrthographic(): Invalid coordinate system: `+o);return c[0]=l,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=p,c[14]=m,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let e=0;e<16;e++)if(t[e]!==n[e])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},st=new H,ct=new G,lt=new H(0,0,0),ut=new H(1,1,1),dt=new H,ft=new H,pt=new H,mt=new G,ht=new ze,gt=class e{constructor(t=0,n=0,r=0,i=e.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=n,this._z=r,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,r=this._order){return this._x=e,this._y=t,this._z=n,this._order=r,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let r=e.elements,i=r[0],a=r[4],o=r[8],s=r[1],c=r[5],l=r[9],u=r[2],d=r[6],f=r[10];switch(t){case`XYZ`:this._y=Math.asin(R(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-l,f),this._z=Math.atan2(-a,i)):(this._x=Math.atan2(d,c),this._z=0);break;case`YXZ`:this._x=Math.asin(-R(l,-1,1)),Math.abs(l)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(s,c)):(this._y=Math.atan2(-u,i),this._z=0);break;case`ZXY`:this._x=Math.asin(R(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(s,i));break;case`ZYX`:this._y=Math.asin(-R(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,f),this._z=Math.atan2(s,i)):(this._x=0,this._z=Math.atan2(-a,c));break;case`YZX`:this._z=Math.asin(R(s,-1,1)),Math.abs(s)<.9999999?(this._x=Math.atan2(-l,c),this._y=Math.atan2(-u,i)):(this._x=0,this._y=Math.atan2(o,f));break;case`XZY`:this._z=Math.asin(-R(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,i)):(this._x=Math.atan2(-l,f),this._y=0);break;default:I(`Euler: .setFromRotationMatrix() encountered an unknown order: `+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return mt.makeRotationFromQuaternion(e),this.setFromRotationMatrix(mt,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return ht.setFromEuler(this),this.setFromQuaternion(ht,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};gt.DEFAULT_ORDER=`XYZ`;var _t=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return!!(this.mask&(1<<e|0))}},vt=0,yt=new H,bt=new ze,xt=new G,St=new H,Ct=new H,wt=new H,Tt=new ze,Et=new H(1,0,0),Dt=new H(0,1,0),Ot=new H(0,0,1),kt={type:`added`},At={type:`removed`},jt={type:`childadded`,child:null},Mt={type:`childremoved`,child:null},Nt=class e extends me{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:vt++}),this.uuid=ye(),this.name=``,this.type=`Object3D`,this.parent=null,this.children=[],this.up=e.DEFAULT_UP.clone();let t=new H,n=new gt,r=new ze,i=new H(1,1,1);function a(){r.setFromEuler(n,!1)}function o(){n.setFromQuaternion(r,void 0,!1)}n._onChange(a),r._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:n},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new G},normalMatrix:{value:new W}}),this.matrix=new G,this.matrixWorld=new G,this.matrixAutoUpdate=e.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=e.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new _t,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return bt.setFromAxisAngle(e,t),this.quaternion.multiply(bt),this}rotateOnWorldAxis(e,t){return bt.setFromAxisAngle(e,t),this.quaternion.premultiply(bt),this}rotateX(e){return this.rotateOnAxis(Et,e)}rotateY(e){return this.rotateOnAxis(Dt,e)}rotateZ(e){return this.rotateOnAxis(Ot,e)}translateOnAxis(e,t){return yt.copy(e).applyQuaternion(this.quaternion),this.position.add(yt.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Et,e)}translateY(e){return this.translateOnAxis(Dt,e)}translateZ(e){return this.translateOnAxis(Ot,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(xt.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?St.copy(e):St.set(e,t,n);let r=this.parent;this.updateWorldMatrix(!0,!1),Ct.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?xt.lookAt(Ct,St,this.up):xt.lookAt(St,Ct,this.up),this.quaternion.setFromRotationMatrix(xt),r&&(xt.extractRotation(r.matrixWorld),bt.setFromRotationMatrix(xt),this.quaternion.premultiply(bt.invert()))}add(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return e===this?(L(`Object3D.add: object can't be added as a child of itself.`,e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(kt),jt.child=e,this.dispatchEvent(jt),jt.child=null):L(`Object3D.add: object not an instance of THREE.Object3D.`,e),this)}remove(e){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.remove(arguments[e]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(At),Mt.child=e,this.dispatchEvent(Mt),Mt.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),xt.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),xt.multiply(e.parent.matrixWorld)),e.applyMatrix4(xt),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(kt),jt.child=e,this.dispatchEvent(jt),jt.child=null,this}getObjectById(e){return this.getObjectByProperty(`id`,e)}getObjectByName(e){return this.getObjectByProperty(`name`,e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,r=this.children.length;n<r;n++){let r=this.children[n].getObjectByProperty(e,t);if(r!==void 0)return r}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let r=this.children;for(let i=0,a=r.length;i<a;i++)r[i].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ct,e,wt),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ct,Tt,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(e){e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let e=this.pivot;if(e!==null){let t=e.x,n=e.y,r=e.z,i=this.matrix.elements;i[12]+=t-i[0]*t-i[4]*n-i[8]*r,i[13]+=n-i[1]*t-i[5]*n-i[9]*r,i[14]+=r-i[2]*t-i[6]*n-i[10]*r}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,r=t.length;n<r;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t,n=!1){let r=this.parent;if(e===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),t===!0){let e=this.children;for(let t=0,r=e.length;t<r;t++)e[t].updateWorldMatrix(!1,!0,n)}}toJSON(e){let t=e===void 0||typeof e==`string`,n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:`Object`,generator:`Object3D.toJSON`});let r={};r.uuid=this.uuid,r.type=this.type,r.name=this.name,r.castShadow=this.castShadow,r.receiveShadow=this.receiveShadow,r.visible=this.visible,r.frustumCulled=this.frustumCulled,r.renderOrder=this.renderOrder,r.static=this.static,r.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(r.userData=this.userData),r.layers=this.layers.mask,r.matrix=this.matrix.toArray(),r.up=this.up.toArray(),this.pivot!==null&&(r.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(r.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(r.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(r.type=`InstancedMesh`,r.count=this.count,r.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(r.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(r.type=`BatchedMesh`,r.perObjectFrustumCulled=this.perObjectFrustumCulled,r.sortObjects=this.sortObjects,r.drawRanges=this._drawRanges,r.reservedRanges=this._reservedRanges,r.geometryInfo=this._geometryInfo.map(e=>({...e,boundingBox:e.boundingBox?e.boundingBox.toJSON():void 0,boundingSphere:e.boundingSphere?e.boundingSphere.toJSON():void 0})),r.instanceInfo=this._instanceInfo.map(e=>({...e})),r.availableInstanceIds=this._availableInstanceIds.slice(),r.availableGeometryIds=this._availableGeometryIds.slice(),r.nextIndexStart=this._nextIndexStart,r.nextVertexStart=this._nextVertexStart,r.geometryCount=this._geometryCount,r.maxInstanceCount=this._maxInstanceCount,r.maxVertexCount=this._maxVertexCount,r.maxIndexCount=this._maxIndexCount,r.geometryInitialized=this._geometryInitialized,r.matricesTexture=this._matricesTexture.toJSON(e),r.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(r.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(r.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(r.boundingBox=this.boundingBox.toJSON()));function i(t,n){return t[n.uuid]===void 0&&(t[n.uuid]=n.toJSON(e)),n.uuid}if(this.isScene)this.background&&(this.background.isColor?r.background=this.background.toJSON():this.background.isTexture&&(r.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(r.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){r.geometry=i(e.geometries,this.geometry);let t=this.geometry.parameters;if(t!==void 0&&t.shapes!==void 0){let n=t.shapes;if(Array.isArray(n))for(let t=0,r=n.length;t<r;t++){let r=n[t];i(e.shapes,r)}else i(e.shapes,n)}}if(this.isSkinnedMesh&&(r.bindMode=this.bindMode,r.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(i(e.skeletons,this.skeleton),r.skeleton=this.skeleton.uuid)),this.material!==void 0){if(Array.isArray(this.material)){let t=[];for(let n=0,r=this.material.length;n<r;n++)t.push(i(e.materials,this.material[n]));r.material=t}else r.material=i(e.materials,this.material)}if(this.children.length>0){r.children=[];for(let t=0;t<this.children.length;t++)r.children.push(this.children[t].toJSON(e).object)}if(this.animations.length>0){r.animations=[];for(let t=0;t<this.animations.length;t++){let n=this.animations[t];r.animations.push(i(e.animations,n))}}if(t){let t=a(e.geometries),r=a(e.materials),i=a(e.textures),o=a(e.images),s=a(e.shapes),c=a(e.skeletons),l=a(e.animations),u=a(e.nodes);t.length>0&&(n.geometries=t),r.length>0&&(n.materials=r),i.length>0&&(n.textures=i),o.length>0&&(n.images=o),s.length>0&&(n.shapes=s),c.length>0&&(n.skeletons=c),l.length>0&&(n.animations=l),u.length>0&&(n.nodes=u)}return n.object=r,n;function a(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot===null?null:e.pivot.clone(),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let t=0;t<e.children.length;t++){let n=e.children[t];this.add(n.clone())}return this}dispose(){this.dispatchEvent({type:`dispose`})}};Nt.DEFAULT_UP=new H(0,1,0),Nt.DEFAULT_MATRIX_AUTO_UPDATE=!0,Nt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var K=class extends Nt{constructor(){super(),this.isGroup=!0,this.type=`Group`}},Pt={type:`move`},Ft=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new K,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new K,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new H,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new H),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new K,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new H,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new H,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:`connected`,data:e}),this}disconnect(e){return this.dispatchEvent({type:`disconnected`,data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let r=null,i=null,a=null,o=this._targetRay,s=this._grip,c=this._hand;if(e&&t.session.visibilityState!==`visible-blurred`){if(c&&e.hand){a=!0;for(let r of e.hand.values()){let e=t.getJointPose(r,n),i=this._getHandJoint(c,r);e!==null&&(i.matrix.fromArray(e.transform.matrix),i.matrix.decompose(i.position,i.rotation,i.scale),i.matrixWorldNeedsUpdate=!0,i.jointRadius=e.radius),i.visible=e!==null}let r=c.joints[`index-finger-tip`],i=c.joints[`thumb-tip`],o=r.position.distanceTo(i.position);c.inputState.pinching&&o>.025?(c.inputState.pinching=!1,this.dispatchEvent({type:`pinchend`,handedness:e.handedness,target:this})):!c.inputState.pinching&&o<=.015&&(c.inputState.pinching=!0,this.dispatchEvent({type:`pinchstart`,handedness:e.handedness,target:this}))}else s!==null&&e.gripSpace&&(i=t.getPose(e.gripSpace,n),i!==null&&(s.matrix.fromArray(i.transform.matrix),s.matrix.decompose(s.position,s.rotation,s.scale),s.matrixWorldNeedsUpdate=!0,i.linearVelocity?(s.hasLinearVelocity=!0,s.linearVelocity.copy(i.linearVelocity)):s.hasLinearVelocity=!1,i.angularVelocity?(s.hasAngularVelocity=!0,s.angularVelocity.copy(i.angularVelocity)):s.hasAngularVelocity=!1,s.eventsEnabled&&s.dispatchEvent({type:`gripUpdated`,data:e,target:this})));o!==null&&(r=t.getPose(e.targetRaySpace,n),r===null&&i!==null&&(r=i),r!==null&&(o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,r.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(r.linearVelocity)):o.hasLinearVelocity=!1,r.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(r.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Pt)))}return o!==null&&(o.visible=r!==null),s!==null&&(s.visible=i!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new K;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},It={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Lt={h:0,s:0,l:0},Rt={h:0,s:0,l:0};function zt(e,t,n){return n<0&&(n+=1),n>1&&--n,n<1/6?e+(t-e)*6*n:n<1/2?t:n<2/3?e+(t-e)*6*(2/3-n):e}var q=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let t=e;t&&t.isColor?this.copy(t):typeof t==`number`?this.setHex(t):typeof t==`string`&&this.setStyle(t)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=j){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Ge.colorSpaceToWorking(this,t),this}setRGB(e,t,n,r=Ge.workingColorSpace){return this.r=e,this.g=t,this.b=n,Ge.colorSpaceToWorking(this,r),this}setHSL(e,t,n,r=Ge.workingColorSpace){if(e=be(e,1),t=R(t,0,1),n=R(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,i=2*n-r;this.r=zt(i,r,e+1/3),this.g=zt(i,r,e),this.b=zt(i,r,e-1/3)}return Ge.colorSpaceToWorking(this,r),this}setStyle(e,t=j){function n(t){t!==void 0&&parseFloat(t)<1&&I(`Color: Alpha component of `+e+` will be ignored.`)}let r;if(r=/^(\w+)\(([^\)]*)\)/.exec(e)){let i,a=r[1],o=r[2];switch(a){case`rgb`:case`rgba`:if(i=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(255,parseInt(i[1],10))/255,Math.min(255,parseInt(i[2],10))/255,Math.min(255,parseInt(i[3],10))/255,t);if(i=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setRGB(Math.min(100,parseInt(i[1],10))/100,Math.min(100,parseInt(i[2],10))/100,Math.min(100,parseInt(i[3],10))/100,t);break;case`hsl`:case`hsla`:if(i=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(i[4]),this.setHSL(parseFloat(i[1])/360,parseFloat(i[2])/100,parseFloat(i[3])/100,t);break;default:I(`Color: Unknown color model `+e)}}else if(r=/^\#([A-Fa-f\d]+)$/.exec(e)){let n=r[1],i=n.length;if(i===3)return this.setRGB(parseInt(n.charAt(0),16)/15,parseInt(n.charAt(1),16)/15,parseInt(n.charAt(2),16)/15,t);if(i===6)return this.setHex(parseInt(n,16),t);I(`Color: Invalid hex color `+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=j){let n=It[e.toLowerCase()];return n===void 0?I(`Color: Unknown color `+e):this.setHex(n,t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Ke(e.r),this.g=Ke(e.g),this.b=Ke(e.b),this}copyLinearToSRGB(e){return this.r=qe(e.r),this.g=qe(e.g),this.b=qe(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=j){return Ge.workingToColorSpace(Bt.copy(this),e),Math.round(R(Bt.r*255,0,255))*65536+Math.round(R(Bt.g*255,0,255))*256+Math.round(R(Bt.b*255,0,255))}getHexString(e=j){return(`000000`+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Ge.workingColorSpace){Ge.workingToColorSpace(Bt.copy(this),t);let n=Bt.r,r=Bt.g,i=Bt.b,a=Math.max(n,r,i),o=Math.min(n,r,i),s,c,l=(o+a)/2;if(o===a)s=0,c=0;else{let e=a-o;switch(c=l<=.5?e/(a+o):e/(2-a-o),a){case n:s=(r-i)/e+(r<i?6:0);break;case r:s=(i-n)/e+2;break;case i:s=(n-r)/e+4}s/=6}return e.h=s,e.s=c,e.l=l,e}getRGB(e,t=Ge.workingColorSpace){return Ge.workingToColorSpace(Bt.copy(this),t),e.r=Bt.r,e.g=Bt.g,e.b=Bt.b,e}getStyle(e=j){Ge.workingToColorSpace(Bt.copy(this),e);let t=Bt.r,n=Bt.g,r=Bt.b;return e===`srgb`?`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(r*255)})`:`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${r.toFixed(3)})`}offsetHSL(e,t,n){return this.getHSL(Lt),this.setHSL(Lt.h+e,Lt.s+t,Lt.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Lt),e.getHSL(Rt);let n=Ce(Lt.h,Rt.h,t),r=Ce(Lt.s,Rt.s,t),i=Ce(Lt.l,Rt.l,t);return this.setHSL(n,r,i),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,r=this.b,i=e.elements;return this.r=i[0]*t+i[3]*n+i[6]*r,this.g=i[1]*t+i[4]*n+i[7]*r,this.b=i[2]*t+i[5]*n+i[8]*r,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},Bt=new q;q.NAMES=It;var Vt=class e{constructor(e,t=1,n=1e3){this.isFog=!0,this.name=``,this.color=new q(e),this.near=t,this.far=n}clone(){return new e(this.color,this.near,this.far)}toJSON(){return{type:`Fog`,name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}},Ht=class extends Nt{constructor(){super(),this.isScene=!0,this.type=`Scene`,this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new gt,this.environmentIntensity=1,this.environmentRotation=new gt,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}},Ut=new H,Wt=new H,Gt=new H,Kt=new H,qt=new H,Jt=new H,Yt=new H,Xt=new H,Zt=new H,Qt=new H,$t=new nt,en=new nt,tn=new nt,nn=class e{constructor(e=new H,t=new H,n=new H){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,r){r.subVectors(n,t),Ut.subVectors(e,t),r.cross(Ut);let i=r.lengthSq();return i>0?r.multiplyScalar(1/Math.sqrt(i)):r.set(0,0,0)}static getBarycoord(e,t,n,r,i){Ut.subVectors(r,t),Wt.subVectors(n,t),Gt.subVectors(e,t);let a=Ut.dot(Ut),o=Ut.dot(Wt),s=Ut.dot(Gt),c=Wt.dot(Wt),l=Wt.dot(Gt),u=a*c-o*o;if(u===0)return i.set(0,0,0),null;let d=1/u,f=(c*s-o*l)*d,p=(a*l-o*s)*d;return i.set(1-f-p,p,f)}static containsPoint(e,t,n,r){return this.getBarycoord(e,t,n,r,Kt)!==null&&Kt.x>=0&&Kt.y>=0&&Kt.x+Kt.y<=1}static getInterpolation(e,t,n,r,i,a,o,s){return this.getBarycoord(e,t,n,r,Kt)===null?(s.x=0,s.y=0,`z`in s&&(s.z=0),`w`in s&&(s.w=0),null):(s.setScalar(0),s.addScaledVector(i,Kt.x),s.addScaledVector(a,Kt.y),s.addScaledVector(o,Kt.z),s)}static getInterpolatedAttribute(e,t,n,r,i,a){return $t.setScalar(0),en.setScalar(0),tn.setScalar(0),$t.fromBufferAttribute(e,t),en.fromBufferAttribute(e,n),tn.fromBufferAttribute(e,r),a.setScalar(0),a.addScaledVector($t,i.x),a.addScaledVector(en,i.y),a.addScaledVector(tn,i.z),a}static isFrontFacing(e,t,n,r){return Ut.subVectors(n,t),Wt.subVectors(e,t),Ut.cross(Wt).dot(r)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,r){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[r]),this}setFromAttributeAndIndices(e,t,n,r){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,r),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Ut.subVectors(this.c,this.b),Wt.subVectors(this.a,this.b),Ut.cross(Wt).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return e.getNormal(this.a,this.b,this.c,t)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,n){return e.getBarycoord(t,this.a,this.b,this.c,n)}getInterpolation(t,n,r,i,a){return e.getInterpolation(t,this.a,this.b,this.c,n,r,i,a)}containsPoint(t){return e.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return e.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,r=this.b,i=this.c,a,o;qt.subVectors(r,n),Jt.subVectors(i,n),Xt.subVectors(e,n);let s=qt.dot(Xt),c=Jt.dot(Xt);if(s<=0&&c<=0)return t.copy(n);Zt.subVectors(e,r);let l=qt.dot(Zt),u=Jt.dot(Zt);if(l>=0&&u<=l)return t.copy(r);let d=s*u-l*c;if(d<=0&&s>=0&&l<=0)return a=s/(s-l),t.copy(n).addScaledVector(qt,a);Qt.subVectors(e,i);let f=qt.dot(Qt),p=Jt.dot(Qt);if(p>=0&&f<=p)return t.copy(i);let m=f*c-s*p;if(m<=0&&c>=0&&p<=0)return o=c/(c-p),t.copy(n).addScaledVector(Jt,o);let h=l*p-f*u;if(h<=0&&u-l>=0&&f-p>=0)return Yt.subVectors(i,r),o=(u-l)/(u-l+(f-p)),t.copy(r).addScaledVector(Yt,o);let g=1/(h+m+d);return a=m*g,o=d*g,t.copy(n).addScaledVector(qt,a).addScaledVector(Jt,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},rn=class{constructor(e=new H(1/0,1/0,1/0),t=new H(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(on.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(on.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=on.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute(`position`);if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let t=0,n=r.count;t<n;t++)e.isMesh===!0?e.getVertexPosition(t,on):on.fromBufferAttribute(r,t),on.applyMatrix4(e.matrixWorld),this.expandByPoint(on);else e.boundingBox===void 0?(n.boundingBox===null&&n.computeBoundingBox(),sn.copy(n.boundingBox)):(e.boundingBox===null&&e.computeBoundingBox(),sn.copy(e.boundingBox)),sn.applyMatrix4(e.matrixWorld),this.union(sn)}let r=e.children;for(let e=0,n=r.length;e<n;e++)this.expandByObject(r[e],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,on),on.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(mn),hn.subVectors(this.max,mn),cn.subVectors(e.a,mn),ln.subVectors(e.b,mn),un.subVectors(e.c,mn),dn.subVectors(ln,cn),fn.subVectors(un,ln),pn.subVectors(cn,un);let t=[0,-dn.z,dn.y,0,-fn.z,fn.y,0,-pn.z,pn.y,dn.z,0,-dn.x,fn.z,0,-fn.x,pn.z,0,-pn.x,-dn.y,dn.x,0,-fn.y,fn.x,0,-pn.y,pn.x,0];return!vn(t,cn,ln,un,hn)||(t=[1,0,0,0,1,0,0,0,1],!vn(t,cn,ln,un,hn))?!1:(gn.crossVectors(dn,fn),t=[gn.x,gn.y,gn.z],vn(t,cn,ln,un,hn))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,on).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(on).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(an[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),an[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),an[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),an[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),an[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),an[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),an[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),an[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(an),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}},an=[new H,new H,new H,new H,new H,new H,new H,new H],on=new H,sn=new rn,cn=new H,ln=new H,un=new H,dn=new H,fn=new H,pn=new H,mn=new H,hn=new H,gn=new H,_n=new H;function vn(e,t,n,r,i){for(let a=0,o=e.length-3;a<=o;a+=3){_n.fromArray(e,a);let o=i.x*Math.abs(_n.x)+i.y*Math.abs(_n.y)+i.z*Math.abs(_n.z),s=t.dot(_n),c=n.dot(_n),l=r.dot(_n);if(Math.max(-Math.max(s,c,l),Math.min(s,c,l))>o)return!1}return!0}var yn=new H,bn=new V,xn=0,Sn=class extends me{constructor(e,t,n=!1){if(super(),Array.isArray(e))throw TypeError(`THREE.BufferAttribute: array should be a Typed Array.`);this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:xn++}),this.name=``,this.array=e,this.itemSize=t,this.count=e===void 0?0:e.length/t,this.normalized=n,this.usage=F,this.updateRanges=[],this.gpuType=f,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let r=0,i=this.itemSize;r<i;r++)this.array[e+r]=t.array[n+r];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)bn.fromBufferAttribute(this,t),bn.applyMatrix3(e),this.setXY(t,bn.x,bn.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)yn.fromBufferAttribute(this,t),yn.applyMatrix3(e),this.setXYZ(t,yn.x,yn.y,yn.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)yn.fromBufferAttribute(this,t),yn.applyMatrix4(e),this.setXYZ(t,yn.x,yn.y,yn.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)yn.fromBufferAttribute(this,t),yn.applyNormalMatrix(e),this.setXYZ(t,yn.x,yn.y,yn.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)yn.fromBufferAttribute(this,t),yn.transformDirection(e),this.setXYZ(t,yn.x,yn.y,yn.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Le(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=B(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Le(t,this.array)),t}setX(e,t){return this.normalized&&(t=B(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Le(t,this.array)),t}setY(e,t){return this.normalized&&(t=B(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Le(t,this.array)),t}setZ(e,t){return this.normalized&&(t=B(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Le(t,this.array)),t}setW(e,t){return this.normalized&&(t=B(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=B(t,this.array),n=B(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,r){return e*=this.itemSize,this.normalized&&(t=B(t,this.array),n=B(n,this.array),r=B(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e*=this.itemSize,this.normalized&&(t=B(t,this.array),n=B(n,this.array),r=B(r,this.array),i=B(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=r,this.array[e+3]=i,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:`dispose`})}},Cn=class extends Sn{constructor(e,t,n){super(new Uint16Array(e),t,n)}},wn=class extends Sn{constructor(e,t,n){super(new Uint32Array(e),t,n)}},Tn=class extends Sn{constructor(e,t,n){super(new Float32Array(e),t,n)}},En=new rn,Dn=new H,On=new H,kn=class{constructor(e=new H,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t===void 0?En.setFromPoints(e).getCenter(n):n.copy(t);let r=0;for(let t=0,i=e.length;t<i;t++)r=Math.max(r,n.distanceToSquared(e[t]));return this.radius=Math.sqrt(r),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius*=e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Dn.subVectors(e,this.center);let t=Dn.lengthSq();if(t>this.radius*this.radius){let e=Math.sqrt(t),n=(e-this.radius)*.5;this.center.addScaledVector(Dn,n/e),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(On.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Dn.copy(e.center).add(On)),this.expandByPoint(Dn.copy(e.center).sub(On))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}},An=0,jn=new G,Mn=new Nt,Nn=new H,Pn=new rn,Fn=new rn,In=new H,Ln=class e extends me{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:An++}),this.uuid=ye(),this.name=``,this.type=`BufferGeometry`,this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return this.index=Array.isArray(e)?new(ie(e)?wn:Cn)(e,1):e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let t=new W().getNormalMatrix(e);n.applyNormalMatrix(t),n.needsUpdate=!0}let r=this.attributes.tangent;return r!==void 0&&(r.transformDirection(e),r.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return jn.makeRotationFromQuaternion(e),this.applyMatrix4(jn),this}rotateX(e){return jn.makeRotationX(e),this.applyMatrix4(jn),this}rotateY(e){return jn.makeRotationY(e),this.applyMatrix4(jn),this}rotateZ(e){return jn.makeRotationZ(e),this.applyMatrix4(jn),this}translate(e,t,n){return jn.makeTranslation(e,t,n),this.applyMatrix4(jn),this}scale(e,t,n){return jn.makeScale(e,t,n),this.applyMatrix4(jn),this}lookAt(e){return Mn.lookAt(e),Mn.updateMatrix(),this.applyMatrix4(Mn.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Nn).negate(),this.translate(Nn.x,Nn.y,Nn.z),this}setFromPoints(e){let t=this.getAttribute(`position`);if(t===void 0){let t=[];for(let n=0,r=e.length;n<r;n++){let r=e[n];t.push(r.x,r.y,r.z||0)}this.setAttribute(`position`,new Tn(t,3))}else{let n=Math.min(e.length,t.count);for(let r=0;r<n;r++){let n=e[r];t.setXYZ(r,n.x,n.y,n.z||0)}e.length>t.count&&I(`BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry.`),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new rn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){L(`BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.`,this),this.boundingBox.set(new H(-1/0,-1/0,-1/0),new H(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Pn.setFromBufferAttribute(n),this.morphTargetsRelative?(In.addVectors(this.boundingBox.min,Pn.min),this.boundingBox.expandByPoint(In),In.addVectors(this.boundingBox.max,Pn.max),this.boundingBox.expandByPoint(In)):(this.boundingBox.expandByPoint(Pn.min),this.boundingBox.expandByPoint(Pn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&L(`BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.`,this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new kn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){L(`BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.`,this),this.boundingSphere.set(new H,1/0);return}if(e){let n=this.boundingSphere.center;if(Pn.setFromBufferAttribute(e),t)for(let e=0,n=t.length;e<n;e++){let n=t[e];Fn.setFromBufferAttribute(n),this.morphTargetsRelative?(In.addVectors(Pn.min,Fn.min),Pn.expandByPoint(In),In.addVectors(Pn.max,Fn.max),Pn.expandByPoint(In)):(Pn.expandByPoint(Fn.min),Pn.expandByPoint(Fn.max))}Pn.getCenter(n);let r=0;for(let t=0,i=e.count;t<i;t++)In.fromBufferAttribute(e,t),r=Math.max(r,n.distanceToSquared(In));if(t)for(let i=0,a=t.length;i<a;i++){let a=t[i],o=this.morphTargetsRelative;for(let t=0,i=a.count;t<i;t++)In.fromBufferAttribute(a,t),o&&(Nn.fromBufferAttribute(e,t),In.add(Nn)),r=Math.max(r,n.distanceToSquared(In))}this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&L(`BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.`,this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){L(`BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)`);return}let n=t.position,r=t.normal,i=t.uv,a=this.getAttribute(`tangent`);(a===void 0||a.count!==n.count)&&(a=new Sn(new Float32Array(4*n.count),4),this.setAttribute(`tangent`,a));let o=[],s=[];for(let e=0;e<n.count;e++)o[e]=new H,s[e]=new H;let c=new H,l=new H,u=new H,d=new V,f=new V,p=new V,m=new H,h=new H;function g(e,t,r){c.fromBufferAttribute(n,e),l.fromBufferAttribute(n,t),u.fromBufferAttribute(n,r),d.fromBufferAttribute(i,e),f.fromBufferAttribute(i,t),p.fromBufferAttribute(i,r),l.sub(c),u.sub(c),f.sub(d),p.sub(d);let a=1/(f.x*p.y-p.x*f.y);isFinite(a)&&(m.copy(l).multiplyScalar(p.y).addScaledVector(u,-f.y).multiplyScalar(a),h.copy(u).multiplyScalar(f.x).addScaledVector(l,-p.x).multiplyScalar(a),o[e].add(m),o[t].add(m),o[r].add(m),s[e].add(h),s[t].add(h),s[r].add(h))}let _=this.groups;_.length===0&&(_=[{start:0,count:e.count}]);for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)g(e.getX(t+0),e.getX(t+1),e.getX(t+2))}let v=new H,y=new H,b=new H,x=new H;function S(e){b.fromBufferAttribute(r,e),x.copy(b);let t=o[e];v.copy(t),v.sub(b.multiplyScalar(b.dot(t))).normalize(),y.crossVectors(x,t);let n=y.dot(s[e])<0?-1:1;a.setXYZW(e,v.x,v.y,v.z,n)}for(let t=0,n=_.length;t<n;++t){let n=_[t],r=n.start,i=n.count;for(let t=r,n=r+i;t<n;t+=3)S(e.getX(t+0)),S(e.getX(t+1)),S(e.getX(t+2))}this._transformed=!0}computeVertexNormals(){let e=this.index,t=this.getAttribute(`position`);if(t!==void 0){let n=this.getAttribute(`normal`);if(n===void 0||n.count!==t.count)n=new Sn(new Float32Array(t.count*3),3),this.setAttribute(`normal`,n);else for(let e=0,t=n.count;e<t;e++)n.setXYZ(e,0,0,0);let r=new H,i=new H,a=new H,o=new H,s=new H,c=new H,l=new H,u=new H;if(e)for(let d=0,f=e.count;d<f;d+=3){let f=e.getX(d+0),p=e.getX(d+1),m=e.getX(d+2);r.fromBufferAttribute(t,f),i.fromBufferAttribute(t,p),a.fromBufferAttribute(t,m),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),o.fromBufferAttribute(n,f),s.fromBufferAttribute(n,p),c.fromBufferAttribute(n,m),o.add(l),s.add(l),c.add(l),n.setXYZ(f,o.x,o.y,o.z),n.setXYZ(p,s.x,s.y,s.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let e=0,o=t.count;e<o;e+=3)r.fromBufferAttribute(t,e+0),i.fromBufferAttribute(t,e+1),a.fromBufferAttribute(t,e+2),l.subVectors(a,i),u.subVectors(r,i),l.cross(u),n.setXYZ(e+0,l.x,l.y,l.z),n.setXYZ(e+1,l.x,l.y,l.z),n.setXYZ(e+2,l.x,l.y,l.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)In.fromBufferAttribute(e,t),In.normalize(),e.setXYZ(t,In.x,In.y,In.z)}toNonIndexed(){function t(e,t){let n=e.array,r=e.itemSize,i=e.normalized,a=new n.constructor(t.length*r),o=0,s=0;for(let i=0,c=t.length;i<c;i++){o=e.isInterleavedBufferAttribute?t[i]*e.data.stride+e.offset:t[i]*r;for(let e=0;e<r;e++)a[s++]=n[o++]}return new Sn(a,r,i)}if(this.index===null)return I(`BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.`),this;let n=new e,r=this.index.array,i=this.attributes;for(let e in i){let a=i[e],o=t(a,r);n.setAttribute(e,o)}let a=this.morphAttributes;for(let e in a){let i=[],o=a[e];for(let e=0,n=o.length;e<n;e++){let n=o[e],a=t(n,r);i.push(a)}n.morphAttributes[e]=i}n.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let e=0,t=o.length;e<t;e++){let t=o[e];n.addGroup(t.start,t.count,t.materialIndex)}return n}toJSON(){let e={metadata:{version:4.7,type:`BufferGeometry`,generator:`BufferGeometry.toJSON`}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?`BufferGeometry`:this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let t=this.parameters;for(let n in t)t[n]!==void 0&&(e[n]=t[n]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let t in n){let r=n[t];e.data.attributes[t]=r.toJSON(e.data)}let r={},i=!1;for(let t in this.morphAttributes){let n=this.morphAttributes[t],a=[];for(let t=0,r=n.length;t<r;t++){let r=n[t];a.push(r.toJSON(e.data))}a.length>0&&(r[t]=a,i=!0)}i&&(e.data.morphAttributes=r,e.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone());let r=e.attributes;for(let e in r){let n=r[e];this.setAttribute(e,n.clone(t))}let i=e.morphAttributes;for(let e in i){let n=[],r=i[e];for(let e=0,i=r.length;e<i;e++)n.push(r[e].clone(t));this.morphAttributes[e]=n}this.morphTargetsRelative=e.morphTargetsRelative;let a=e.groups;for(let e=0,t=a.length;e<t;e++){let t=a[e];this.addGroup(t.start,t.count,t.materialIndex)}let o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());let s=e.boundingSphere;return s!==null&&(this.boundingSphere=s.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:`dispose`})}},Rn=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e===void 0?0:e.length/t,this.usage=F,this.updateRanges=[],this.version=0,this.uuid=ye()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let r=0,i=this.stride;r<i;r++)this.array[e+r]=t.array[n+r];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=ye()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=ye()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer)));let t={uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride};return t.usage=this.usage,t}},zn=new H,Bn=class e{constructor(e,t,n,r=!1){this.isInterleavedBufferAttribute=!0,this.name=``,this.data=e,this.itemSize=t,this.offset=n,this.normalized=r}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)zn.fromBufferAttribute(this,t),zn.applyMatrix4(e),this.setXYZ(t,zn.x,zn.y,zn.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)zn.fromBufferAttribute(this,t),zn.applyNormalMatrix(e),this.setXYZ(t,zn.x,zn.y,zn.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)zn.fromBufferAttribute(this,t),zn.transformDirection(e),this.setXYZ(t,zn.x,zn.y,zn.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=Le(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=B(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=B(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=B(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=B(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=B(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Le(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Le(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Le(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Le(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=B(t,this.array),n=B(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=B(t,this.array),n=B(n,this.array),r=B(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this}setXYZW(e,t,n,r,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=B(t,this.array),n=B(n,this.array),r=B(r,this.array),i=B(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=r,this.data.array[e+3]=i,this}clone(t){if(t===void 0){le(`InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.`);let e=[];for(let t=0;t<this.count;t++){let n=t*this.data.stride+this.offset;for(let t=0;t<this.itemSize;t++)e.push(this.data.array[n+t])}return new Sn(new this.array.constructor(e),this.itemSize,this.normalized)}return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new e(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){le(`InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.`);let e=[];for(let t=0;t<this.count;t++){let n=t*this.data.stride+this.offset;for(let t=0;t<this.itemSize;t++)e.push(this.data.array[n+t])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},Vn=new H,Hn=new H,Un=new W,Wn=class{constructor(e=new H(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,r){return this.normal.set(e,t,n),this.constant=r,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let r=Vn.subVectors(n,t).cross(Hn.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(r,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,n=!0){let r=e.delta(Vn),i=this.normal.dot(r);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let a=-(e.start.dot(this.normal)+this.constant)/i;return n===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(r,a)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||Un.getNormalMatrix(e),r=this.coplanarPoint(Vn).applyMatrix4(e),i=this.normal.applyMatrix3(n).normalize();return this.constant=-r.dot(i),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}},Gn=0,Kn=class extends me{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Gn++}),this.uuid=ye(),this.name=``,this.type=`Material`,this.blending=1,this.side=0,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=204,this.blendDst=205,this.blendEquation=100,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new q(0,0,0),this.blendAlpha=0,this.depthFunc=3,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=519,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=te,this.stencilZFail=te,this.stencilZPass=te,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){I(`Material: parameter '${t}' has value of undefined.`);continue}let r=this[t];if(r===void 0){I(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}r&&r.isColor?r.set(n):r&&r.isVector2&&n&&n.isVector2||r&&r.isEuler&&n&&n.isEuler||r&&r.isVector3&&n&&n.isVector3?r.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e==`string`;t&&(e={textures:{},images:{}});let n={metadata:{version:4.7,type:`Material`,generator:`Material.toJSON`}};n.uuid=this.uuid,n.type=this.type,n.blending=this.blending,n.side=this.side,n.shadowSide=this.shadowSide,n.vertexColors=this.vertexColors,n.opacity=this.opacity,n.transparent=this.transparent,n.blendSrc=this.blendSrc,n.blendDst=this.blendDst,n.blendEquation=this.blendEquation,n.blendSrcAlpha=this.blendSrcAlpha,n.blendDstAlpha=this.blendDstAlpha,n.blendEquationAlpha=this.blendEquationAlpha,n.blendColor=this.blendColor.getHex(),n.blendAlpha=this.blendAlpha,n.depthFunc=this.depthFunc,n.depthTest=this.depthTest,n.depthWrite=this.depthWrite,n.colorWrite=this.colorWrite,n.clipIntersection=this.clipIntersection,n.clipShadows=this.clipShadows,n.stencilWriteMask=this.stencilWriteMask,n.stencilFunc=this.stencilFunc,n.stencilRef=this.stencilRef,n.stencilFuncMask=this.stencilFuncMask,n.stencilFail=this.stencilFail,n.stencilZFail=this.stencilZFail,n.stencilZPass=this.stencilZPass,n.stencilWrite=this.stencilWrite,n.polygonOffset=this.polygonOffset,n.polygonOffsetFactor=this.polygonOffsetFactor,n.polygonOffsetUnits=this.polygonOffsetUnits,n.dithering=this.dithering,n.alphaTest=this.alphaTest,n.alphaHash=this.alphaHash,n.alphaToCoverage=this.alphaToCoverage,n.premultipliedAlpha=this.premultipliedAlpha,n.forceSinglePass=this.forceSinglePass,n.allowOverride=this.allowOverride,n.visible=this.visible,n.toneMapped=this.toneMapped,n.name=this.name,this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(n.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(n.clippingPlanes=this.clippingPlanes.map(e=>e.toJSON())),this.rotation!==void 0&&(n.rotation=this.rotation),this.depthPacking!==void 0&&(n.depthPacking=this.depthPacking),this.linewidth!==void 0&&(n.linewidth=this.linewidth),this.linecap!==void 0&&(n.linecap=this.linecap),this.linejoin!==void 0&&(n.linejoin=this.linejoin),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.wireframe!==void 0&&(n.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(n.flatShading=this.flatShading),this.fog!==void 0&&(n.fog=this.fog),Object.keys(this.userData).length>0&&(n.userData=this.userData);function r(e){let t=[];for(let n in e){let r=e[n];delete r.metadata,t.push(r)}return t}if(t){let t=r(e.textures),i=r(e.images);t.length>0&&(n.textures=t),i.length>0&&(n.images=i)}return n}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new q().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(e=>new Wn().fromJSON(e))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(this.vertexColors=typeof e.vertexColors==`number`?e.vertexColors>0:e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let t=e.normalScale;Array.isArray(t)===!1&&(t=[t,t]),this.normalScale=new V().fromArray(t)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new V().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let e=t.length;n=Array(e);for(let r=0;r!==e;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:`dispose`})}set needsUpdate(e){e===!0&&this.version++}},qn=class extends Kn{constructor(e){super(),this.isSpriteMaterial=!0,this.type=`SpriteMaterial`,this.color=new q(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},Jn,Yn=new H,Xn=new H,Zn=new H,Qn=new V,$n=new V,er=new G,tr=new H,nr=new H,rr=new H,ir=new V,ar=new V,or=new V,sr=class extends Nt{constructor(e=new qn){if(super(),this.isSprite=!0,this.type=`Sprite`,Jn===void 0){Jn=new Ln;let e=new Rn(new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),5);Jn.setIndex([0,1,2,0,2,3]),Jn.setAttribute(`position`,new Bn(e,3,0,!1)),Jn.setAttribute(`uv`,new Bn(e,2,3,!1))}this.geometry=Jn,this.material=e,this.center=new V(.5,.5),this.count=1}intersectsFrustum(e){return e.intersectsSprite(this)}raycast(e,t){e.camera===null&&L(`Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.`),Xn.setFromMatrixScale(this.matrixWorld),er.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),Zn.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&Xn.multiplyScalar(-Zn.z);let n=this.material.rotation,r,i;n!==0&&(i=Math.cos(n),r=Math.sin(n));let a=this.center;cr(tr.set(-.5,-.5,0),Zn,a,Xn,r,i),cr(nr.set(.5,-.5,0),Zn,a,Xn,r,i),cr(rr.set(.5,.5,0),Zn,a,Xn,r,i),ir.set(0,0),ar.set(1,0),or.set(1,1);let o=e.ray.intersectTriangle(tr,nr,rr,!1,Yn);if(o===null&&(cr(nr.set(-.5,.5,0),Zn,a,Xn,r,i),ar.set(0,1),o=e.ray.intersectTriangle(tr,rr,nr,!1,Yn),o===null))return;let s=e.ray.origin.distanceTo(Yn);s<e.near||s>e.far||t.push({distance:s,point:Yn.clone(),uv:nn.getInterpolation(Yn,tr,nr,rr,ir,ar,or,new V),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};function cr(e,t,n,r,i,a){Qn.subVectors(e,n).addScalar(.5).multiply(r),i===void 0?$n.copy(Qn):($n.x=a*Qn.x-i*Qn.y,$n.y=i*Qn.x+a*Qn.y),e.copy(t),e.x+=$n.x,e.y+=$n.y,e.applyMatrix4(er)}var lr=new H,ur=new H,dr=new H,fr=new H,pr=class{constructor(e=new H,t=new H(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,lr)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=lr.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(lr.copy(this.origin).addScaledVector(this.direction,t),lr.distanceToSquared(e))}distanceSqToSegment(e,t,n,r){ur.copy(e).add(t).multiplyScalar(.5),dr.copy(t).sub(e).normalize(),fr.copy(this.origin).sub(ur);let i=e.distanceTo(t)*.5,a=-this.direction.dot(dr),o=fr.dot(this.direction),s=-fr.dot(dr),c=fr.lengthSq(),l=Math.abs(1-a*a),u,d,f,p;if(l>0){if(u=a*s-o,d=a*o-s,p=i*l,u>=0){if(d>=-p){if(d<=p){let e=1/l;u*=e,d*=e,f=u*(u+a*d+2*o)+d*(a*u+d+2*s)+c}else d=i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d=-i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c}else d<=-p?(u=Math.max(0,-(-a*i+o)),d=u>0?-i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c):d<=p?(u=0,d=Math.min(Math.max(-i,-s),i),f=d*(d+2*s)+c):(u=Math.max(0,-(a*i+o)),d=u>0?i:Math.min(Math.max(-i,-s),i),f=-u*u+d*(d+2*s)+c)}else d=a>0?-i:i,u=Math.max(0,-(a*d+o)),f=-u*u+d*(d+2*s)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),r&&r.copy(ur).addScaledVector(dr,d),f}intersectSphere(e,t){if(e.radius<0)return null;lr.subVectors(e.center,this.origin);let n=lr.dot(this.direction),r=lr.dot(lr)-n*n,i=e.radius*e.radius;if(r>i)return null;let a=Math.sqrt(i-r),o=n-a,s=n+a;return s<0?null:o<0?this.at(s,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,r,i,a,o,s,c=1/this.direction.x,l=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(e.min.x-d.x)*c,r=(e.max.x-d.x)*c):(n=(e.max.x-d.x)*c,r=(e.min.x-d.x)*c),l>=0?(i=(e.min.y-d.y)*l,a=(e.max.y-d.y)*l):(i=(e.max.y-d.y)*l,a=(e.min.y-d.y)*l),n>a||i>r||((i>n||isNaN(n))&&(n=i),(a<r||isNaN(r))&&(r=a),u>=0?(o=(e.min.z-d.z)*u,s=(e.max.z-d.z)*u):(o=(e.max.z-d.z)*u,s=(e.min.z-d.z)*u),n>s||o>r)||((o>n||n!==n)&&(n=o),(s<r||r!==r)&&(r=s),r<0)?null:this.at(n>=0?n:r,t)}intersectsBox(e){return this.intersectBox(e,lr)!==null}intersectTriangle(e,t,n,r,i){let a=this.origin,o=this.direction,s=o.x,c=o.y,l=o.z,u=e.x-a.x,d=e.y-a.y,f=e.z-a.z,p=t.x-a.x,m=t.y-a.y,h=t.z-a.z,g=n.x-a.x,_=n.y-a.y,v=n.z-a.z,y=Math.abs(s),b=Math.abs(c),x=Math.abs(l),S,C,w,T,E,D,O,ee,k,A,j,M;if(y>=b&&y>=x?(w=s,D=u,k=p,M=g,s>=0?(S=c,C=l,T=d,E=f,O=m,ee=h,A=_,j=v):(S=l,C=c,T=f,E=d,O=h,ee=m,A=v,j=_)):b>=x?(w=c,D=d,k=m,M=_,c>=0?(S=l,C=s,T=f,E=u,O=h,ee=p,A=v,j=g):(S=s,C=l,T=u,E=f,O=p,ee=h,A=g,j=v)):(w=l,D=f,k=h,M=v,l>=0?(S=s,C=c,T=u,E=d,O=p,ee=m,A=g,j=_):(S=c,C=s,T=d,E=u,O=m,ee=p,A=_,j=g)),w===0)return null;let N=S/w,P=C/w,te=1/w,F=T-N*D,ne=E-P*D,re=O-N*k,ie=ee-P*k,ae=A-N*M,oe=j-P*M,se=ae*ie-oe*re,ce=F*oe-ne*ae,le=re*ne-ie*F;if(r){if(se<0||ce<0||le<0)return null}else if((se<0||ce<0||le<0)&&(se>0||ce>0||le>0))return null;let ue=se+ce+le;if(ue===0)return null;let I=te*(se*D+ce*k+le*M);return(ue>0?I<0:I>0)?null:this.at(I/ue,i)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},mr=class extends Kn{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type=`MeshBasicMaterial`,this.color=new q(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new gt,this.combine=0,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},hr=new G,gr=new pr,_r=new kn,vr=new H,yr=new H,br=new H,xr=new H,Sr=new H,Cr=new H,wr=new H,Tr=new H,J=class extends Nt{constructor(e=new Ln,t=new mr){super(),this.isMesh=!0,this.type=`Mesh`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}getVertexPosition(e,t){let n=this.geometry,r=n.attributes.position,i=n.morphAttributes.position,a=n.morphTargetsRelative;t.fromBufferAttribute(r,e);let o=this.morphTargetInfluences;if(i&&o){Cr.set(0,0,0);for(let n=0,r=i.length;n<r;n++){let r=o[n],s=i[n];r!==0&&(Sr.fromBufferAttribute(s,e),a?Cr.addScaledVector(Sr,r):Cr.addScaledVector(Sr.sub(t),r))}t.add(Cr)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,r=this.material,i=this.matrixWorld;r!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),_r.copy(n.boundingSphere),_r.applyMatrix4(i),gr.copy(e.ray).recast(e.near),!(_r.containsPoint(gr.origin)===!1&&(gr.intersectSphere(_r,vr)===null||gr.origin.distanceToSquared(vr)>(e.far-e.near)**2))&&(hr.copy(i).invert(),gr.copy(e.ray).applyMatrix4(hr),(n.boundingBox===null||gr.intersectsBox(n.boundingBox)!==!1)&&this._computeIntersections(e,t,gr)))}_computeIntersections(e,t,n){let r,i=this.geometry,a=this.material,o=i.index,s=i.attributes.position,c=i.attributes.uv,l=i.attributes.uv1,u=i.attributes.normal,d=i.groups,f=i.drawRange;if(o!==null){if(Array.isArray(a))for(let i=0,s=d.length;i<s;i++){let s=d[i],p=a[s.materialIndex],m=Math.max(s.start,f.start),h=Math.min(o.count,Math.min(s.start+s.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=o.getX(i),d=o.getX(i+1),f=o.getX(i+2);r=Dr(this,p,e,n,c,l,u,a,d,f),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=s.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),s=Math.min(o.count,f.start+f.count);for(let d=i,f=s;d<f;d+=3){let i=o.getX(d),s=o.getX(d+1),f=o.getX(d+2);r=Dr(this,a,e,n,c,l,u,i,s,f),r&&(r.faceIndex=Math.floor(d/3),t.push(r))}}}else if(s!==void 0){if(Array.isArray(a))for(let i=0,o=d.length;i<o;i++){let o=d[i],p=a[o.materialIndex],m=Math.max(o.start,f.start),h=Math.min(s.count,Math.min(o.start+o.count,f.start+f.count));for(let i=m,a=h;i<a;i+=3){let a=i,s=i+1,d=i+2;r=Dr(this,p,e,n,c,l,u,a,s,d),r&&(r.faceIndex=Math.floor(i/3),r.face.materialIndex=o.materialIndex,t.push(r))}}else{let i=Math.max(0,f.start),o=Math.min(s.count,f.start+f.count);for(let s=i,d=o;s<d;s+=3){let i=s,o=s+1,d=s+2;r=Dr(this,a,e,n,c,l,u,i,o,d),r&&(r.faceIndex=Math.floor(s/3),t.push(r))}}}}};function Er(e,t,n,r,i,a,o,s){let c;if(c=t.side===1?r.intersectTriangle(o,a,i,!0,s):r.intersectTriangle(i,a,o,t.side===0,s),c===null)return null;Tr.copy(s),Tr.applyMatrix4(e.matrixWorld);let l=n.ray.origin.distanceTo(Tr);return l<n.near||l>n.far?null:{distance:l,point:Tr.clone(),object:e}}function Dr(e,t,n,r,i,a,o,s,c,l){e.getVertexPosition(s,yr),e.getVertexPosition(c,br),e.getVertexPosition(l,xr);let u=Er(e,t,n,r,yr,br,xr,wr);if(u){let e=new H;nn.getBarycoord(wr,yr,br,xr,e),i&&(u.uv=nn.getInterpolatedAttribute(i,s,c,l,e,new V)),a&&(u.uv1=nn.getInterpolatedAttribute(a,s,c,l,e,new V)),o&&(u.normal=nn.getInterpolatedAttribute(o,s,c,l,e,new H),u.normal.dot(r.direction)>0&&u.normal.multiplyScalar(-1));let t={a:s,b:c,c:l,normal:new H,materialIndex:0};nn.getNormal(yr,br,xr,t.normal),u.face=t,u.barycoord=e}return u}var Or=new nt,kr=new nt,Ar=new nt,jr=new nt,Mr=new G,Nr=new H,Pr=new kn,Fr=new G,Ir=new pr,Lr=class extends J{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type=`SkinnedMesh`,this.bindMode=`attached`,this.bindMatrix=new G,this.bindMatrixInverse=new G,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let e=this.geometry;this.boundingBox===null&&(this.boundingBox=new rn),this.boundingBox.makeEmpty();let t=e.getAttribute(`position`);for(let e=0;e<t.count;e++)this.getVertexPosition(e,Nr),this.boundingBox.expandByPoint(Nr)}computeBoundingSphere(){let e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new kn),this.boundingSphere.makeEmpty();let t=e.getAttribute(`position`);for(let e=0;e<t.count;e++)this.getVertexPosition(e,Nr),this.boundingSphere.expandByPoint(Nr)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}raycast(e,t){let n=this.material,r=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Pr.copy(this.boundingSphere),Pr.applyMatrix4(r),e.ray.intersectsSphere(Pr)!==!1&&(Fr.copy(r).invert(),Ir.copy(e.ray).applyMatrix4(Fr),(this.boundingBox===null||Ir.intersectsBox(this.boundingBox)!==!1)&&this._computeIntersections(e,t,Ir)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new nt,t=this.geometry.attributes.skinWeight;for(let n=0,r=t.count;n<r;n++){e.fromBufferAttribute(t,n);let r=1/e.manhattanLength();r===1/0?e.set(1,0,0,0):e.multiplyScalar(r),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===`attached`?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===`detached`?this.bindMatrixInverse.copy(this.bindMatrix).invert():I(`SkinnedMesh: Unrecognized bindMode: `+this.bindMode)}applyBoneTransform(e,t){let n=this.skeleton,r=this.geometry;kr.fromBufferAttribute(r.attributes.skinIndex,e),Ar.fromBufferAttribute(r.attributes.skinWeight,e),t.isVector4?(Or.copy(t),t.set(0,0,0,0)):(Or.set(...t,1),t.set(0,0,0)),Or.applyMatrix4(this.bindMatrix);for(let e=0;e<4;e++){let r=Ar.getComponent(e);if(r!==0){let i=kr.getComponent(e);Mr.multiplyMatrices(n.bones[i].matrixWorld,n.boneInverses[i]),t.addScaledVector(jr.copy(Or).applyMatrix4(Mr),r)}}return t.isVector4&&(t.w=Or.w),t.applyMatrix4(this.bindMatrixInverse)}},Rr=class extends Nt{constructor(){super(),this.isBone=!0,this.type=`Bone`}},zr=class extends tt{constructor(e=null,t=1,n=1,i,a,o,s,c,l=r,u=r,d,f){super(null,o,s,c,l,u,i,a,d,f),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Br=new G,Vr=new G,Hr=class e{constructor(e=[],t=[]){this.uuid=ye(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){I(`Skeleton: Number of inverse bone matrices does not match amount of bones.`),this.boneInverses=[];for(let e=0,t=this.bones.length;e<t;e++)this.boneInverses.push(new G)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let t=new G;this.bones[e]&&t.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(t)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let t=this.bones[e];t&&t.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let t=this.bones[e];t&&(t.parent&&t.parent.isBone?(t.matrix.copy(t.parent.matrixWorld).invert(),t.matrix.multiply(t.matrixWorld)):t.matrix.copy(t.matrixWorld),t.matrix.decompose(t.position,t.quaternion,t.scale))}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,r=this.boneTexture;for(let r=0,i=e.length;r<i;r++){let i=e[r]?e[r].matrixWorld:Vr;Br.multiplyMatrices(i,t[r]),Br.toArray(n,r*16)}r!==null&&(r.needsUpdate=!0)}clone(){return new e(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);let t=new Float32Array(e*e*4);t.set(this.boneMatrices);let n=new zr(t,e,e,_,f);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let n=this.bones[t];if(n.name===e)return n}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,r=e.bones.length;n<r;n++){let r=e.bones[n],i=t[r];i===void 0&&(I(`Skeleton: No bone found with UUID:`,r),i=new Rr),this.bones.push(i),this.boneInverses.push(new G().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.7,type:`Skeleton`,generator:`Skeleton.toJSON`},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let r=0,i=t.length;r<i;r++){let i=t[r];e.bones.push(i.uuid);let a=n[r];e.boneInverses.push(a.toArray())}return e}},Ur=class extends Sn{constructor(e,t,n,r=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=r}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},Wr=new G,Gr=new G,Kr=[],qr=new rn,Jr=new G,Yr=new J,Xr=new kn,Zr=class extends J{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new Ur(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let e=0;e<n;e++)this.setMatrixAt(e,Jr)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new rn),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Wr),qr.copy(e.boundingBox).applyMatrix4(Wr),this.boundingBox.union(qr)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new kn),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,Wr),Xr.copy(e.boundingSphere).applyMatrix4(Wr),this.boundingSphere.union(Xr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,r=this.morphTexture.source.data.data,i=e*(n.length+1)+1;for(let e=0;e<n.length;e++)n[e]=r[i+e]}raycast(e,t){let n=this.matrixWorld,r=this.count;if(Yr.geometry=this.geometry,Yr.material=this.material,Yr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Xr.copy(this.boundingSphere),Xr.applyMatrix4(n),e.ray.intersectsSphere(Xr)!==!1))for(let i=0;i<r;i++){this.getMatrixAt(i,Wr),Gr.multiplyMatrices(n,Wr),Yr.matrixWorld=Gr,Yr.raycast(e,Kr);for(let e=0,n=Kr.length;e<n;e++){let n=Kr[e];n.instanceId=i,n.object=this,t.push(n)}Kr.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new Ur(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){let n=t.morphTargetInfluences,r=n.length+1;this.morphTexture===null&&(this.morphTexture=new zr(new Float32Array(r*this.count),r,this.count,b,f));let i=this.morphTexture.source.data.data,a=0;for(let e=0;e<n.length;e++)a+=n[e];let o=this.geometry.morphTargetsRelative?1:1-a,s=r*e;return i[s]=o,i.set(n,s+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},Qr=new kn,$r=new V(.5,.5),ei=new H,ti=class{constructor(e=new Wn,t=new Wn,n=new Wn,r=new Wn,i=new Wn,a=new Wn){this.planes=[e,t,n,r,i,a]}set(e,t,n,r,i,a){let o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(n),o[3].copy(r),o[4].copy(i),o[5].copy(a),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=re,n=!1){let r=this.planes,i=e.elements,a=i[0],o=i[1],s=i[2],c=i[3],l=i[4],u=i[5],d=i[6],f=i[7],p=i[8],m=i[9],h=i[10],g=i[11],_=i[12],v=i[13],y=i[14],b=i[15];if(r[0].setComponents(c-a,f-l,g-p,b-_).normalize(),r[1].setComponents(c+a,f+l,g+p,b+_).normalize(),r[2].setComponents(c+o,f+u,g+m,b+v).normalize(),r[3].setComponents(c-o,f-u,g-m,b-v).normalize(),n)r[4].setComponents(s,d,h,y).normalize(),r[5].setComponents(c-s,f-d,g-h,b-y).normalize();else if(r[4].setComponents(c-s,f-d,g-h,b-y).normalize(),t===2e3)r[5].setComponents(c+s,f+d,g+h,b+y).normalize();else if(t===2001)r[5].setComponents(s,d,h,y).normalize();else throw Error(`THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: `+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Qr.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Qr.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Qr)}intersectsSprite(e){return Qr.center.set(0,0,0),Qr.radius=.7071067811865476+$r.distanceTo(e.center),Qr.applyMatrix4(e.matrixWorld),this.intersectsSphere(Qr)}intersectsSphere(e){let t=this.planes,n=e.center,r=-e.radius;for(let e=0;e<6;e++)if(t[e].distanceToPoint(n)<r)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let r=t[n];if(ei.x=r.normal.x>0?e.max.x:e.min.x,ei.y=r.normal.y>0?e.max.y:e.min.y,ei.z=r.normal.z>0?e.max.z:e.min.z,r.distanceToPoint(ei)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}},ni=class extends Kn{constructor(e){super(),this.isLineBasicMaterial=!0,this.type=`LineBasicMaterial`,this.color=new q(16777215),this.map=null,this.linewidth=1,this.linecap=`round`,this.linejoin=`round`,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},ri=new H,ii=new H,ai=new G,oi=new pr,si=new kn,ci=new H,li=new H,ui=class extends Nt{constructor(e=new Ln,t=new ni){super(),this.isLine=!0,this.type=`Line`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let e=1,r=t.count;e<r;e++)ri.fromBufferAttribute(t,e-1),ii.fromBufferAttribute(t,e),n[e]=n[e-1],n[e]+=ri.distanceTo(ii);e.setAttribute(`lineDistance`,new Tn(n,1))}else I(`Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.`);return this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Line.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),si.copy(n.boundingSphere),si.applyMatrix4(r),si.radius+=i,e.ray.intersectsSphere(si)===!1)return;ai.copy(r).invert(),oi.copy(e.ray).applyMatrix4(ai);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=this.isLineSegments?2:1,l=n.index,u=n.attributes.position;if(l!==null){let n=Math.max(0,a.start),r=Math.min(l.count,a.start+a.count);for(let i=n,a=r-1;i<a;i+=c){let n=l.getX(i),r=l.getX(i+1),a=di(this,e,oi,s,n,r,i);a&&t.push(a)}if(this.isLineLoop){let i=l.getX(r-1),a=l.getX(n),o=di(this,e,oi,s,i,a,r-1);o&&t.push(o)}}else{let n=Math.max(0,a.start),r=Math.min(u.count,a.start+a.count);for(let i=n,a=r-1;i<a;i+=c){let n=di(this,e,oi,s,i,i+1,i);n&&t.push(n)}if(this.isLineLoop){let i=di(this,e,oi,s,r-1,n,r-1);i&&t.push(i)}}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function di(e,t,n,r,i,a,o){let s=e.geometry.attributes.position;if(ri.fromBufferAttribute(s,i),ii.fromBufferAttribute(s,a),n.distanceSqToSegment(ri,ii,ci,li)>r)return;ci.applyMatrix4(e.matrixWorld);let c=t.ray.origin.distanceTo(ci);if(!(c<t.near||c>t.far))return{distance:c,point:li.clone().applyMatrix4(e.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:e}}var fi=new H,pi=new H,mi=class extends ui{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type=`LineSegments`}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let e=0,r=t.count;e<r;e+=2)fi.fromBufferAttribute(t,e),pi.fromBufferAttribute(t,e+1),n[e]=e===0?0:n[e-1],n[e+1]=n[e]+fi.distanceTo(pi);e.setAttribute(`lineDistance`,new Tn(n,1))}else I(`LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.`);return this}},hi=class extends ui{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type=`LineLoop`}},gi=class extends Kn{constructor(e){super(),this.isPointsMaterial=!0,this.type=`PointsMaterial`,this.color=new q(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},_i=new G,vi=new pr,yi=new kn,bi=new H,xi=class extends Nt{constructor(e=new Ln,t=new gi){super(),this.isPoints=!0,this.type=`Points`,this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){let n=this.geometry,r=this.matrixWorld,i=e.params.Points.threshold,a=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),yi.copy(n.boundingSphere),yi.applyMatrix4(r),yi.radius+=i,e.ray.intersectsSphere(yi)===!1)return;_i.copy(r).invert(),vi.copy(e.ray).applyMatrix4(_i);let o=i/((this.scale.x+this.scale.y+this.scale.z)/3),s=o*o,c=n.index,l=n.attributes.position;if(c!==null){let n=Math.max(0,a.start),i=Math.min(c.count,a.start+a.count);for(let a=n,o=i;a<o;a++){let n=c.getX(a);bi.fromBufferAttribute(l,n),Si(bi,n,s,r,e,t,this)}}else{let n=Math.max(0,a.start),i=Math.min(l.count,a.start+a.count);for(let a=n,o=i;a<o;a++)bi.fromBufferAttribute(l,a),Si(bi,a,s,r,e,t,this)}}updateMorphTargets(){let e=this.geometry.morphAttributes,t=Object.keys(e);if(t.length>0){let n=e[t[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let e=0,t=n.length;e<t;e++){let t=n[e].name||String(e);this.morphTargetInfluences.push(0),this.morphTargetDictionary[t]=e}}}}};function Si(e,t,n,r,i,a,o){let s=vi.distanceSqToPoint(e);if(s<n){let n=new H;vi.closestPointToPoint(e,n),n.applyMatrix4(r);let c=i.ray.origin.distanceTo(n);if(c<i.near||c>i.far)return;a.push({distance:c,distanceToRay:Math.sqrt(s),point:n,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}var Ci=class extends tt{constructor(e=[],t=301,n,r,i,a,o,s,c,l){super(e,t,n,r,i,a,o,s,c,l),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},wi=class extends tt{constructor(e,t,n,r,i,a,o,s,c){super(e,t,n,r,i,a,o,s,c),this.isCanvasTexture=!0,this.needsUpdate=!0}},Ti=class extends tt{constructor(e,t,n=d,i,a,o,s=r,c=r,l,u=v,f=1){if(u!==1026&&u!==1027)throw Error(`THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat`);super({width:e,height:t,depth:f},i,a,o,s,c,u,n,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Ze(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}},Ei=class extends Ti{constructor(e,t=d,n=301,i,a,o=r,s=r,c,l=v){let u={width:e,height:e,depth:1},f=[u,u,u,u,u,u];super(e,e,t,n,i,a,o,s,c,l),this.image=f,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}},Di=class extends tt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}},Oi=class e extends Ln{constructor(e=1,t=1,n=1,r=1,i=1,a=1){super(),this.type=`BoxGeometry`,this.parameters={width:e,height:t,depth:n,widthSegments:r,heightSegments:i,depthSegments:a};let o=this;r=Math.floor(r),i=Math.floor(i),a=Math.floor(a);let s=[],c=[],l=[],u=[],d=0,f=0;p(`z`,`y`,`x`,-1,-1,n,t,e,a,i,0),p(`z`,`y`,`x`,1,-1,n,t,-e,a,i,1),p(`x`,`z`,`y`,1,1,e,n,t,r,a,2),p(`x`,`z`,`y`,1,-1,e,n,-t,r,a,3),p(`x`,`y`,`z`,1,-1,e,t,n,r,i,4),p(`x`,`y`,`z`,-1,-1,e,t,-n,r,i,5),this.setIndex(s),this.setAttribute(`position`,new Tn(c,3)),this.setAttribute(`normal`,new Tn(l,3)),this.setAttribute(`uv`,new Tn(u,2));function p(e,t,n,r,i,a,p,m,h,g,_){let v=a/h,y=p/g,b=a/2,x=p/2,S=m/2,C=h+1,w=g+1,T=0,E=0,D=new H;for(let a=0;a<w;a++){let o=a*y-x;for(let s=0;s<C;s++)D[e]=(s*v-b)*r,D[t]=o*i,D[n]=S,c.push(D.x,D.y,D.z),D[e]=0,D[t]=0,D[n]=m>0?1:-1,l.push(D.x,D.y,D.z),u.push(s/h),u.push(1-a/g),T+=1}for(let e=0;e<g;e++)for(let t=0;t<h;t++){let n=d+t+C*e,r=d+t+C*(e+1),i=d+(t+1)+C*(e+1),a=d+(t+1)+C*e;s.push(n,r,a),s.push(r,i,a),E+=6}o.addGroup(f,E,_),f+=E,d+=T}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},ki=class e extends Ln{constructor(e=1,t=1,n=4,r=8,i=1){super(),this.type=`CapsuleGeometry`,this.parameters={radius:e,height:t,capSegments:n,radialSegments:r,heightSegments:i},t=Math.max(0,t),n=Math.max(1,Math.floor(n)),r=Math.max(3,Math.floor(r)),i=Math.max(1,Math.floor(i));let a=[],o=[],s=[],c=[],l=t/2,u=Math.PI/2*e,d=t,f=2*u+d,p=n*2+i,m=r+1,h=new H,g=new H;for(let _=0;_<=p;_++){let v=0,y=0,b=0,x=0;if(_<=n){let t=_/n,r=t*Math.PI/2;y=-l-e*Math.cos(r),b=e*Math.sin(r),x=-e*Math.cos(r),v=t*u}else if(_<=n+i){let r=(_-n)/i;y=-l+r*t,b=e,x=0,v=u+r*d}else{let t=(_-n-i)/n,r=t*Math.PI/2;y=l+e*Math.sin(r),b=e*Math.cos(r),x=e*Math.sin(r),v=u+d+t*u}let S=Math.max(0,Math.min(1,v/f)),C=0;_===0?C=.5/r:_===p&&(C=-.5/r);for(let e=0;e<=r;e++){let t=e/r,n=t*Math.PI*2,i=Math.sin(n),a=Math.cos(n);g.x=-b*a,g.y=y,g.z=b*i,o.push(g.x,g.y,g.z),h.set(-b*a,x,b*i),h.normalize(),s.push(h.x,h.y,h.z),c.push(t+C,S)}if(_>0){let e=(_-1)*m;for(let t=0;t<r;t++){let n=e+t,r=e+t+1,i=_*m+t,o=_*m+t+1;a.push(n,r,i),a.push(r,o,i)}}}this.setIndex(a),this.setAttribute(`position`,new Tn(o,3)),this.setAttribute(`normal`,new Tn(s,3)),this.setAttribute(`uv`,new Tn(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}},Ai=class e extends Ln{constructor(e=1,t=32,n=0,r=Math.PI*2){super(),this.type=`CircleGeometry`,this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:r},t=Math.max(3,t);let i=[],a=[],o=[],s=[],c=new H,l=new V;a.push(0,0,0),o.push(0,0,1),s.push(.5,.5);for(let i=0,u=3;i<=t;i++,u+=3){let d=n+i/t*r;c.x=e*Math.cos(d),c.y=e*Math.sin(d),a.push(c.x,c.y,c.z),o.push(0,0,1),l.x=(a[u]/e+1)/2,l.y=(a[u+1]/e+1)/2,s.push(l.x,l.y)}for(let e=1;e<=t;e++)i.push(e,e+1,0);this.setIndex(i),this.setAttribute(`position`,new Tn(a,3)),this.setAttribute(`normal`,new Tn(o,3)),this.setAttribute(`uv`,new Tn(s,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.segments,t.thetaStart,t.thetaLength)}},ji=class e extends Ln{constructor(e=1,t=1,n=1,r=32,i=1,a=!1,o=0,s=Math.PI*2){super(),this.type=`CylinderGeometry`,this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:r,heightSegments:i,openEnded:a,thetaStart:o,thetaLength:s};let c=this;r=Math.floor(r),i=Math.floor(i);let l=[],u=[],d=[],f=[],p=0,m=[],h=n/2,g=0;_(),a===!1&&(e>0&&v(!0),t>0&&v(!1)),this.setIndex(l),this.setAttribute(`position`,new Tn(u,3)),this.setAttribute(`normal`,new Tn(d,3)),this.setAttribute(`uv`,new Tn(f,2));function _(){let a=new H,_=new H,v=0,y=(t-e)/n;for(let c=0;c<=i;c++){let l=[],g=c/i,v=g*(t-e)+e;for(let e=0;e<=r;e++){let t=e/r,i=t*s+o,c=Math.sin(i),m=Math.cos(i);_.x=v*c,_.y=-g*n+h,_.z=v*m,u.push(_.x,_.y,_.z),a.set(c,y,m).normalize(),d.push(a.x,a.y,a.z),f.push(t,1-g),l.push(p++)}m.push(l)}for(let n=0;n<r;n++)for(let r=0;r<i;r++){let a=m[r][n],o=m[r+1][n],s=m[r+1][n+1],c=m[r][n+1];(e>0||r!==0)&&(l.push(a,o,c),v+=3),(t>0||r!==i-1)&&(l.push(o,s,c),v+=3)}c.addGroup(g,v,0),g+=v}function v(n){let i=p,a=new V,m=new H,_=0,v=n===!0?e:t,y=n===!0?1:-1;for(let e=1;e<=r;e++)u.push(0,h*y,0),d.push(0,y,0),f.push(.5,.5),p++;let b=p;for(let e=0;e<=r;e++){let t=e/r*s+o,n=Math.cos(t),i=Math.sin(t);m.x=v*i,m.y=h*y,m.z=v*n,u.push(m.x,m.y,m.z),d.push(0,y,0),a.x=n*.5+.5,a.y=i*.5*y+.5,f.push(a.x,a.y),p++}for(let e=0;e<r;e++){let t=i+e,r=b+e;n===!0?l.push(r,r+1,t):l.push(r+1,r,t),_+=3}c.addGroup(g,_,n===!0?1:2),g+=_}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Mi=class e extends ji{constructor(e=1,t=1,n=32,r=1,i=!1,a=0,o=Math.PI*2){super(0,e,t,n,r,i,a,o),this.type=`ConeGeometry`,this.parameters={radius:e,height:t,radialSegments:n,heightSegments:r,openEnded:i,thetaStart:a,thetaLength:o}}static fromJSON(t){return new e(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},Ni=class e extends Ln{constructor(e=[],t=[],n=1,r=0){super(),this.type=`PolyhedronGeometry`,this.parameters={vertices:e,indices:t,radius:n,detail:r};let i=[],a=[];o(r),c(n),l(),this.setAttribute(`position`,new Tn(i,3)),this.setAttribute(`normal`,new Tn(i.slice(),3)),this.setAttribute(`uv`,new Tn(a,2)),r===0?this.computeVertexNormals():this.normalizeNormals();function o(e){let n=new H,r=new H,i=new H;for(let a=0;a<t.length;a+=3)f(t[a+0],n),f(t[a+1],r),f(t[a+2],i),s(n,r,i,e)}function s(e,t,n,r){let i=r+1,a=[];for(let r=0;r<=i;r++){a[r]=[];let o=e.clone().lerp(n,r/i),s=t.clone().lerp(n,r/i),c=i-r;for(let e=0;e<=c;e++)e===0&&r===i?a[r][e]=o:a[r][e]=o.clone().lerp(s,e/c)}for(let e=0;e<i;e++)for(let t=0;t<2*(i-e)-1;t++){let n=Math.floor(t/2);t%2==0?(d(a[e][n+1]),d(a[e+1][n]),d(a[e][n])):(d(a[e][n+1]),d(a[e+1][n+1]),d(a[e+1][n]))}}function c(e){let t=new H;for(let n=0;n<i.length;n+=3)t.x=i[n+0],t.y=i[n+1],t.z=i[n+2],t.normalize().multiplyScalar(e),i[n+0]=t.x,i[n+1]=t.y,i[n+2]=t.z}function l(){let e=new H;for(let t=0;t<i.length;t+=3){e.x=i[t+0],e.y=i[t+1],e.z=i[t+2];let n=h(e)/2/Math.PI+.5,r=g(e)/Math.PI+.5;a.push(n,1-r)}p(),u()}function u(){for(let e=0;e<a.length;e+=6){let t=a[e+0],n=a[e+2],r=a[e+4];Math.max(t,n,r)>.9&&Math.min(t,n,r)<.1&&(t<.2&&(a[e+0]+=1),n<.2&&(a[e+2]+=1),r<.2&&(a[e+4]+=1))}}function d(e){i.push(e.x,e.y,e.z)}function f(t,n){let r=t*3;n.x=e[r+0],n.y=e[r+1],n.z=e[r+2]}function p(){let e=new H,t=new H,n=new H,r=new H,o=new V,s=new V,c=new V;for(let l=0,u=0;l<i.length;l+=9,u+=6){e.set(i[l+0],i[l+1],i[l+2]),t.set(i[l+3],i[l+4],i[l+5]),n.set(i[l+6],i[l+7],i[l+8]),o.set(a[u+0],a[u+1]),s.set(a[u+2],a[u+3]),c.set(a[u+4],a[u+5]),r.copy(e).add(t).add(n).divideScalar(3);let d=h(r);m(o,u+0,e,d),m(s,u+2,t,d),m(c,u+4,n,d)}}function m(e,t,n,r){r<0&&e.x===1&&(a[t]=e.x-1),n.x===0&&n.z===0&&(a[t]=r/2/Math.PI+.5)}function h(e){return Math.atan2(e.z,-e.x)}function g(e){return Math.atan2(-e.y,Math.sqrt(e.x*e.x+e.z*e.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.vertices,t.indices,t.radius,t.detail)}},Pi=class e extends Ni{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,r=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1];super(r,[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1],e,t),this.type=`IcosahedronGeometry`,this.parameters={radius:e,detail:t}}static fromJSON(t){return new e(t.radius,t.detail)}},Fi=class e extends Ni{constructor(e=1,t=0){super([1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2],e,t),this.type=`OctahedronGeometry`,this.parameters={radius:e,detail:t}}static fromJSON(t){return new e(t.radius,t.detail)}},Ii=class e extends Ln{constructor(e=1,t=1,n=1,r=1){super(),this.type=`PlaneGeometry`,this.parameters={width:e,height:t,widthSegments:n,heightSegments:r};let i=e/2,a=t/2,o=Math.floor(n),s=Math.floor(r),c=o+1,l=s+1,u=e/o,d=t/s,f=[],p=[],m=[],h=[];for(let e=0;e<l;e++){let t=e*d-a;for(let n=0;n<c;n++){let r=n*u-i;p.push(r,-t,0),m.push(0,0,1),h.push(n/o),h.push(1-e/s)}}for(let e=0;e<s;e++)for(let t=0;t<o;t++){let n=t+c*e,r=t+c*(e+1),i=t+1+c*(e+1),a=t+1+c*e;f.push(n,r,a),f.push(r,i,a)}this.setIndex(f),this.setAttribute(`position`,new Tn(p,3)),this.setAttribute(`normal`,new Tn(m,3)),this.setAttribute(`uv`,new Tn(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.width,t.height,t.widthSegments,t.heightSegments)}},Li=class e extends Ln{constructor(e=1,t=32,n=16,r=0,i=Math.PI*2,a=0,o=Math.PI){super(),this.type=`SphereGeometry`,this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:r,phiLength:i,thetaStart:a,thetaLength:o},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let s=Math.min(a+o,Math.PI),c=0,l=[],u=new H,d=new H,f=[],p=[],m=[],h=[];for(let f=0;f<=n;f++){let g=[],_=f/n,v=a+_*o,y=e*Math.cos(v),b=Math.sqrt(e*e-y*y),x=0;f===0&&a===0?x=.5/t:f===n&&s===Math.PI&&(x=-.5/t);for(let e=0;e<=t;e++){let n=e/t,a=r+n*i;u.x=-b*Math.cos(a),u.y=y,u.z=b*Math.sin(a),p.push(u.x,u.y,u.z),d.copy(u).normalize(),m.push(d.x,d.y,d.z),h.push(n+x,1-_),g.push(c++)}l.push(g)}for(let e=0;e<n;e++)for(let r=0;r<t;r++){let t=l[e][r+1],i=l[e][r],o=l[e+1][r],c=l[e+1][r+1];(e!==0||a>0)&&f.push(t,i,c),(e!==n-1||s<Math.PI)&&f.push(i,o,c)}this.setIndex(f),this.setAttribute(`position`,new Tn(p,3)),this.setAttribute(`normal`,new Tn(m,3)),this.setAttribute(`uv`,new Tn(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}},Ri=class e extends Ln{constructor(e=1,t=.4,n=12,r=48,i=Math.PI*2,a=0,o=Math.PI*2){super(),this.type=`TorusGeometry`,this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:r,arc:i,thetaStart:a,thetaLength:o},n=Math.floor(n),r=Math.floor(r);let s=[],c=[],l=[],u=[],d=new H,f=new H,p=new H;for(let s=0;s<=n;s++){let m=a+s/n*o;for(let a=0;a<=r;a++){let o=a/r*i;f.x=(e+t*Math.cos(m))*Math.cos(o),f.y=(e+t*Math.cos(m))*Math.sin(o),f.z=t*Math.sin(m),c.push(f.x,f.y,f.z),d.x=e*Math.cos(o),d.y=e*Math.sin(o),p.subVectors(f,d).normalize(),l.push(p.x,p.y,p.z),u.push(a/r),u.push(s/n)}}for(let e=1;e<=n;e++)for(let t=1;t<=r;t++){let n=(r+1)*e+t-1,i=(r+1)*(e-1)+t-1,a=(r+1)*(e-1)+t,o=(r+1)*e+t;s.push(n,i,o),s.push(i,a,o)}this.setIndex(s),this.setAttribute(`position`,new Tn(c,3)),this.setAttribute(`normal`,new Tn(l,3)),this.setAttribute(`uv`,new Tn(u,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(t){return new e(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc,t.thetaStart,t.thetaLength)}};function zi(e){let t={};for(let n in e){t[n]={};for(let r in e[n]){let i=e[n][r];if(Vi(i))i.isRenderTargetTexture?(I(`UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms().`),t[n][r]=null):t[n][r]=i.clone();else if(Array.isArray(i)){if(Vi(i[0])){let e=[];for(let t=0,n=i.length;t<n;t++)e[t]=i[t].clone();t[n][r]=e}else t[n][r]=i.slice()}else t[n][r]=i}}return t}function Bi(e){let t={};for(let n=0;n<e.length;n++){let r=zi(e[n]);for(let e in r)t[e]=r[e]}return t}function Vi(e){return e&&(e.isColor||e.isMatrix3||e.isMatrix4||e.isVector2||e.isVector3||e.isVector4||e.isTexture||e.isQuaternion)}function Hi(e){let t=[];for(let n=0;n<e.length;n++)t.push(e[n].clone());return t}function Ui(e){let t=e.getRenderTarget();return t===null?e.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Ge.workingColorSpace}var Wi={clone:zi,merge:Bi},Gi=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Ki=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,qi=class extends Kn{constructor(e){super(),this.isShaderMaterial=!0,this.type=`ShaderMaterial`,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Gi,this.fragmentShader=Ki,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=zi(e.uniforms),this.uniformsGroups=Hi(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let n in this.uniforms){let r=this.uniforms[n].value;r&&r.isTexture?t.uniforms[n]={type:`t`,value:r.toJSON(e).uuid}:r&&r.isColor?t.uniforms[n]={type:`c`,value:r.getHex()}:r&&r.isVector2?t.uniforms[n]={type:`v2`,value:r.toArray()}:r&&r.isVector3?t.uniforms[n]={type:`v3`,value:r.toArray()}:r&&r.isVector4?t.uniforms[n]={type:`v4`,value:r.toArray()}:r&&r.isMatrix3?t.uniforms[n]={type:`m3`,value:r.toArray()}:r&&r.isMatrix4?t.uniforms[n]={type:`m4`,value:r.toArray()}:t.uniforms[n]={value:r}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let e in this.extensions)this.extensions[e]===!0&&(n[e]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(let n in e.uniforms){let r=e.uniforms[n];switch(this.uniforms[n]={},r.type){case`t`:this.uniforms[n].value=t[r.value]||null;break;case`c`:this.uniforms[n].value=new q().setHex(r.value);break;case`v2`:this.uniforms[n].value=new V().fromArray(r.value);break;case`v3`:this.uniforms[n].value=new H().fromArray(r.value);break;case`v4`:this.uniforms[n].value=new nt().fromArray(r.value);break;case`m3`:this.uniforms[n].value=new W().fromArray(r.value);break;case`m4`:this.uniforms[n].value=new G().fromArray(r.value);break;default:this.uniforms[n].value=r.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(let t in e.extensions)this.extensions[t]=e.extensions[t];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}},Ji=class extends qi{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type=`RawShaderMaterial`}},Yi=class extends Kn{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type=`MeshStandardMaterial`,this.defines={STANDARD:``},this.color=new q(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new q(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=0,this.normalScale=new V(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new gt,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap=`round`,this.wireframeLinejoin=`round`,this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:``},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},Xi=class extends Yi{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:``,PHYSICAL:``},this.type=`MeshPhysicalMaterial`,this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new V(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return R(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new q(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new q(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new q(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._retroreflectivity=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get retroreflectivity(){return this._retroreflectivity}set retroreflectivity(e){this._retroreflectivity>0!=e>0&&this.version++,this._retroreflectivity=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:``,PHYSICAL:``},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.retroreflectivity=e.retroreflectivity,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}},Zi=class extends Kn{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type=`MeshDepthMaterial`,this.depthPacking=3200,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},Qi=class extends Kn{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type=`MeshDistanceMaterial`,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function $i(e,t){return!e||e.constructor===t?e:typeof t.BYTES_PER_ELEMENT==`number`?new t(e):Array.prototype.slice.call(e)}function ea(e){return e!==void 0&&e.inTangents!==void 0&&e.outTangents!==void 0}function ta(e){function t(t,n){return e[t]-e[n]}let n=e.length,r=Array(n);for(let e=0;e!==n;++e)r[e]=e;return r.sort(t),r}function na(e,t,n){let r=e.length,i=new e.constructor(r);for(let a=0,o=0;o!==r;++a){let r=n[a]*t;for(let n=0;n!==t;++n)i[o++]=e[r+n]}return i}function ra(e,t,n,r){let i=1,a=e[0];for(;a!==void 0&&a[r]===void 0;)a=e[i++];if(a===void 0)return;let o=a[r];if(o!==void 0){if(Array.isArray(o))do o=a[r],o!==void 0&&(t.push(a.time),n.push(...o)),a=e[i++];while(a!==void 0);else if(o.toArray!==void 0)do o=a[r],o!==void 0&&(t.push(a.time),o.toArray(n,n.length)),a=e[i++];while(a!==void 0);else do o=a[r],o!==void 0&&(t.push(a.time),n.push(o)),a=e[i++];while(a!==void 0)}}var ia=class{constructor(e,t,n,r){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=r===void 0?new t.constructor(n):r,this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,r=t[n],i=t[n-1];validate_interval:{seek:{let a;linear_scan:{forward_scan:if(!(e<r)){for(let a=n+2;;){if(r===void 0){if(e<i)break forward_scan;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(i=r,r=t[++n],e<r)break seek}a=t.length;break linear_scan}if(!(e>=i)){let o=t[1];e<o&&(n=2,i=o);for(let a=n-2;;){if(i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===a)break;if(r=i,i=t[--n-1],e>=i)break seek}a=n,n=0;break linear_scan}break validate_interval}for(;n<a;){let r=n+a>>>1;e<t[r]?a=r:n=r+1}if(r=t[n],i=t[n-1],i===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(r===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,i,r)}return this.interpolate_(n,i,e,r)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r;for(let e=0;e!==r;++e)t[e]=n[i+e];return t}interpolate_(){throw Error(`THREE.Interpolant: Call to abstract method.`)}intervalChanged_(){}},aa=class extends ia{constructor(e,t,n,r){super(e,t,n,r),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ee,endingEnd:ee}}intervalChanged_(e,t,n){let r=this.parameterPositions,i=e-2,a=e+1,o=r[i],s=r[a];if(o===void 0)switch(this.getSettings_().endingStart){case k:i=e,o=2*t-n;break;case A:i=r.length-2,o=t+r[i]-r[i+1];break;default:i=e,o=n}if(s===void 0)switch(this.getSettings_().endingEnd){case k:a=e,s=2*n-t;break;case A:a=1,s=n+r[1]-r[0];break;default:a=e-1,s=t}let c=(n-t)*.5,l=this.valueSize;this._weightPrev=c/(t-o),this._weightNext=c/(s-n),this._offsetPrev=i*l,this._offsetNext=a*l}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,f=this._weightNext,p=(n-t)/(r-t),m=p*p,h=m*p,g=-d*h+2*d*m-d*p,_=(1+d)*h+(-1.5-2*d)*m+(-.5+d)*p+1,v=(-1-f)*h+(1.5+f)*m+.5*p,y=f*h-f*m;for(let e=0;e!==o;++e)i[e]=g*a[l+e]+_*a[c+e]+v*a[s+e]+y*a[u+e];return i}},oa=class extends ia{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=(n-t)/(r-t),u=1-l;for(let e=0;e!==o;++e)i[e]=a[c+e]*u+a[s+e]*l;return i}},sa=class extends ia{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e){return this.copySampleValue_(e-1)}},ca=class extends ia{interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=e*o,c=s-o,l=this.inTangents,u=this.outTangents;if(!l||!u){let e=(n-t)/(r-t),l=1-e;for(let t=0;t!==o;++t)i[t]=a[c+t]*l+a[s+t]*e;return i}let d=o*2,f=e-1;for(let p=0;p!==o;++p){let o=a[c+p],m=a[s+p],h=f*d+p*2,g=u[h],_=u[h+1],v=e*d+p*2,y=l[v],b=l[v+1],x=da(n,t,g,y,r);i[p]=la(x,o,_,b,m)}return i}};function la(e,t,n,r,i){let a=1-e;return a*a*a*t+3*a*a*e*n+3*a*e*e*r+e*e*e*i}function ua(e,t,n,r,i){let a=1-e;return 3*a*a*(n-t)+6*a*e*(r-n)+3*e*e*(i-r)}function da(e,t,n,r,i){let a=(e-t)/(i-t);for(let o=0;o<8;o++){let o=la(a,t,n,r,i)-e;if(Math.abs(o)<1e-10)break;let s=ua(a,t,n,r,i);if(Math.abs(s)<1e-10)break;a=Math.max(0,Math.min(1,a-o/s))}return a}var fa=class{constructor(e,t,n,r){if(e===void 0)throw Error(`THREE.KeyframeTrack: track name is undefined`);if(t===void 0||t.length===0)throw Error(`THREE.KeyframeTrack: no keyframes in track named `+e);this.name=e,this.times=$i(t,this.TimeBufferType),this.values=$i(n,this.ValueBufferType),this.setInterpolation(r||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:$i(e.times,Array),values:$i(e.values,Array)};let t=e.getInterpolation();t!==e.DefaultInterpolation&&(n.interpolation=t),ea(e.settings)&&(n.settings={inTangents:$i(e.settings.inTangents,Array),outTangents:$i(e.settings.outTangents,Array)})}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new sa(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new oa(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new aa(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodBezier(e){let t=new ca(this.times,this.values,this.getValueSize(),e);return this.settings&&(t.inTangents=this.settings.inTangents,t.outTangents=this.settings.outTangents),t}setInterpolation(e){let t;switch(e){case T:t=this.InterpolantFactoryMethodDiscrete;break;case E:t=this.InterpolantFactoryMethodLinear;break;case D:t=this.InterpolantFactoryMethodSmooth;break;case O:t=this.InterpolantFactoryMethodBezier}if(t===void 0){let t=`unsupported interpolation for `+this.ValueTypeName+` keyframe track named `+this.name;if(this.createInterpolant===void 0){if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw Error(t)}return I(`KeyframeTrack:`,t),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return T;case this.InterpolantFactoryMethodLinear:return E;case this.InterpolantFactoryMethodSmooth:return D;case this.InterpolantFactoryMethodBezier:return O}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,r=t.length;n!==r;++n)t[n]*=e;ea(this.settings)&&(pa(this.settings.inTangents,e),pa(this.settings.outTangents,e))}return this}trim(e,t){let n=this.times,r=n.length,i=0,a=r-1;for(;i!==r&&n[i]<e;)++i;for(;a!==-1&&n[a]>t;)--a;if(++a,i!==0||a!==r){i>=a&&(a=Math.max(a,1),i=a-1);let e=this.getValueSize();this.times=n.slice(i,a),this.values=this.values.slice(i*e,a*e)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(L(`KeyframeTrack: Invalid value size in track.`,this),e=!1);let n=this.times,r=this.values,i=n.length;i===0&&(L(`KeyframeTrack: Track is empty.`,this),e=!1);let a=null;for(let t=0;t!==i;t++){let r=n[t];if(typeof r==`number`&&isNaN(r)){L(`KeyframeTrack: Time is not a valid number.`,this,t,r),e=!1;break}if(a!==null&&a>r){L(`KeyframeTrack: Out of order keys.`,this,t,r,a),e=!1;break}a=r}if(r!==void 0&&ae(r))for(let t=0,n=r.length;t!==n;++t){let n=r[t];if(isNaN(n)){L(`KeyframeTrack: Value is not a valid number.`,this,t,n),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),r=this.getInterpolation()===D,i=e.length-1,a=1;for(let o=1;o<i;++o){let i=!1,s=e[o];if(s!==e[o+1]&&(o!==1||s!==e[0])){if(r)i=!0;else{let e=o*n,r=e-n,a=e+n;for(let o=0;o!==n;++o){let n=t[e+o];if(n!==t[r+o]||n!==t[a+o]){i=!0;break}}}}if(i){if(o!==a){e[a]=e[o];let r=o*n,i=a*n;for(let e=0;e!==n;++e)t[i+e]=t[r+e]}++a}}if(i>0){e[a]=e[i];for(let e=i*n,r=a*n,o=0;o!==n;++o)t[r+o]=t[e+o];++a}return a===e.length?(this.times=e,this.values=t):(this.times=e.slice(0,a),this.values=t.slice(0,a*n)),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,r=new n(this.name,e,t);return r.createInterpolant=this.createInterpolant,ea(this.settings)&&(r.settings={inTangents:this.settings.inTangents.slice(),outTangents:this.settings.outTangents.slice()}),r}};function pa(e,t){for(let n=0,r=e.length;n!==r;n+=2)e[n]*=t}fa.prototype.ValueTypeName=``,fa.prototype.TimeBufferType=Float32Array,fa.prototype.ValueBufferType=Float32Array,fa.prototype.DefaultInterpolation=E;var ma=class extends fa{constructor(e,t,n){super(e,t,n)}};ma.prototype.ValueTypeName=`bool`,ma.prototype.ValueBufferType=Array,ma.prototype.DefaultInterpolation=T,ma.prototype.InterpolantFactoryMethodLinear=void 0,ma.prototype.InterpolantFactoryMethodSmooth=void 0;var ha=class extends fa{constructor(e,t,n,r){super(e,t,n,r)}};ha.prototype.ValueTypeName=`color`;var ga=class extends fa{constructor(e,t,n,r){super(e,t,n,r)}};ga.prototype.ValueTypeName=`number`;var _a=class extends ia{constructor(e,t,n,r){super(e,t,n,r)}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=(n-t)/(r-t),c=e*o;for(let e=c+o;c!==e;c+=4)ze.slerpFlat(i,0,a,c-o,a,c,s);return i}},va=class extends fa{constructor(e,t,n,r){super(e,t,n,r)}InterpolantFactoryMethodLinear(e){return new _a(this.times,this.values,this.getValueSize(),e)}};va.prototype.ValueTypeName=`quaternion`,va.prototype.InterpolantFactoryMethodSmooth=void 0;var ya=class extends fa{constructor(e,t,n){super(e,t,n)}};ya.prototype.ValueTypeName=`string`,ya.prototype.ValueBufferType=Array,ya.prototype.DefaultInterpolation=T,ya.prototype.InterpolantFactoryMethodLinear=void 0,ya.prototype.InterpolantFactoryMethodSmooth=void 0;var ba=class extends fa{constructor(e,t,n,r){super(e,t,n,r)}};ba.prototype.ValueTypeName=`vector`;var xa=class{constructor(e=``,t=-1,n=[],r=2500){this.name=e,this.tracks=n,this.duration=t,this.blendMode=r,this.uuid=ye(),this.userData={},this.duration<0&&this.resetDuration()}static parse(e){let t=[],n=e.tracks,r=1/(e.fps||1);for(let e=0,i=n.length;e!==i;++e)t.push(Ca(n[e]).scale(r));let i=new this(e.name,e.duration,t,e.blendMode);return i.uuid=e.uuid,i.userData=JSON.parse(e.userData||`{}`),i}static toJSON(e){let t=[],n=e.tracks,r={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode,userData:JSON.stringify(e.userData)};for(let e=0,r=n.length;e!==r;++e)t.push(fa.toJSON(n[e]));return r}static CreateFromMorphTargetSequence(e,t,n,r){let i=t.length,a=[];for(let e=0;e<i;e++){let o=[],s=[];o.push((e+i-1)%i,e,(e+1)%i),s.push(0,1,0);let c=ta(o);o=na(o,1,c),s=na(s,1,c),!r&&o[0]===0&&(o.push(i),s.push(s[0])),a.push(new ga(`.morphTargetInfluences[`+t[e].name+`]`,o,s).scale(1/n))}return new this(e,-1,a)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let t=e;n=t.geometry&&t.geometry.animations||t.animations}for(let e=0;e<n.length;e++)if(n[e].name===t)return n[e];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let r={},i=/^([\w-]*?)([\d]+)$/;for(let t=0,n=e.length;t<n;t++){let n=e[t],a=n.name.match(i);if(a&&a.length>1){let e=a[1],t=r[e];t||(r[e]=t=[]),t.push(n)}}let a=[];for(let e in r)a.push(this.CreateFromMorphTargetSequence(e,r[e],t,n));return a}resetDuration(){let e=this.tracks,t=0;for(let n=0,r=e.length;n!==r;++n){let e=this.tracks[n];t=Math.max(t,e.times[e.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e&&=this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let t=0;t<this.tracks.length;t++)e.push(this.tracks[t].clone());let t=new this.constructor(this.name,this.duration,e,this.blendMode);return t.userData=JSON.parse(JSON.stringify(this.userData)),t}toJSON(){return this.constructor.toJSON(this)}};function Sa(e){switch(e.toLowerCase()){case`scalar`:case`double`:case`float`:case`number`:case`integer`:return ga;case`vector`:case`vector2`:case`vector3`:case`vector4`:return ba;case`color`:return ha;case`quaternion`:return va;case`bool`:case`boolean`:return ma;case`string`:return ya}throw Error(`THREE.KeyframeTrack: Unsupported typeName: `+e)}function Ca(e){if(e.type===void 0)throw Error(`THREE.KeyframeTrack: track type undefined, can not parse`);let t=Sa(e.type);if(e.times===void 0){let t=[],n=[];ra(e.keys,t,n,`value`),e.times=t,e.values=n}let n;return n=t.parse===void 0?new t(e.name,e.times,e.values,e.interpolation):t.parse(e),ea(e.settings)&&(n.settings={inTangents:$i(e.settings.inTangents,Float32Array),outTangents:$i(e.settings.outTangents,Float32Array)}),n}var wa={enabled:!1,files:{},add:function(e,t){this.enabled!==!1&&(Ta(e)||(this.files[e]=t))},get:function(e){if(this.enabled!==!1&&!Ta(e))return this.files[e]},remove:function(e){delete this.files[e]},clear:function(){this.files={}}};function Ta(e){try{let t=e.slice(e.indexOf(`:`)+1);return new URL(t).protocol===`blob:`}catch{return!1}}var Ea=new class{constructor(e,t,n){let r=this,i=!1,a=0,o=0,s,c=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this._abortController=null,this.itemStart=function(e){o++,i===!1&&r.onStart!==void 0&&r.onStart(e,a,o),i=!0},this.itemEnd=function(e){a++,r.onProgress!==void 0&&r.onProgress(e,a,o),a===o&&(i=!1,r.onLoad!==void 0&&r.onLoad())},this.itemError=function(e){r.onError!==void 0&&r.onError(e)},this.resolveURL=function(e){return e=e.normalize(`NFC`),s?s(e):e},this.setURLModifier=function(e){return s=e,this},this.addHandler=function(e,t){return c.push(e,t),this},this.removeHandler=function(e){let t=c.indexOf(e);return t!==-1&&c.splice(t,2),this},this.getHandler=function(e){for(let t=0,n=c.length;t<n;t+=2){let n=c[t],r=c[t+1];if(n.global&&(n.lastIndex=0),n.test(e))return r}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||=new AbortController,this._abortController}},Da=class{constructor(e){this.manager=e===void 0?Ea:e,this.crossOrigin=`anonymous`,this.withCredentials=!1,this.path=``,this.resourcePath=``,this.requestHeader={},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}load(){}loadAsync(e,t){let n=this;return new Promise(function(r,i){n.load(e,r,t,i)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}abort(){return this}};Da.DEFAULT_MATERIAL_NAME=`__DEFAULT`;var Oa={},ka=class extends Error{constructor(e,t){super(e),this.response=t}},Aa=class extends Da{constructor(e){super(e),this.mimeType=``,this.responseType=``,this._abortController=new AbortController}load(e,t,n,r){e===void 0&&(e=``),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let i=wa.get(`file:${e}`);if(i!==void 0){this.manager.itemStart(e),setTimeout(()=>{t&&t(i),this.manager.itemEnd(e)},0);return}if(Oa[e]!==void 0){Oa[e].push({onLoad:t,onProgress:n,onError:r});return}Oa[e]=[],Oa[e].push({onLoad:t,onProgress:n,onError:r});let a=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?`include`:`same-origin`,signal:typeof AbortSignal.any==`function`?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,s=this.responseType;fetch(a).then(t=>{if(t.status===200||t.status===0){if(t.status===0&&I(`FileLoader: HTTP Status 0 received.`),typeof ReadableStream>`u`||t.body===void 0||t.body.getReader===void 0)return t;let n=Oa[e],r=t.body.getReader(),i=t.headers.get(`X-File-Size`)||t.headers.get(`Content-Length`),a=i?parseInt(i):0,o=a!==0,s=0,c=new ReadableStream({start(e){t();function t(){r.read().then(({done:r,value:i})=>{if(r)e.close();else{s+=i.byteLength;let r=new ProgressEvent(`progress`,{lengthComputable:o,loaded:s,total:a});for(let e=0,t=n.length;e<t;e++){let t=n[e];t.onProgress&&t.onProgress(r)}e.enqueue(i),t()}},t=>{e.error(t)})}}});return new Response(c)}throw new ka(`fetch for "${t.url}" responded with ${t.status}: ${t.statusText}`,t)}).then(e=>{switch(s){case`arraybuffer`:return e.arrayBuffer();case`blob`:return e.blob();case`document`:return e.text().then(e=>new DOMParser().parseFromString(e,o));case`json`:return e.json();default:if(o===``)return e.text();{let t=/charset="?([^;"\s]*)"?/i.exec(o),n=t&&t[1]?t[1].toLowerCase():void 0,r=new TextDecoder(n);return e.arrayBuffer().then(e=>r.decode(e))}}}).then(t=>{wa.add(`file:${e}`,t);let n=Oa[e];delete Oa[e];for(let e=0,r=n.length;e<r;e++){let r=n[e];r.onLoad&&r.onLoad(t)}}).catch(t=>{let n=Oa[e];if(n===void 0)throw this.manager.itemError(e),t;delete Oa[e];for(let e=0,r=n.length;e<r;e++){let r=n[e];r.onError&&r.onError(t)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}},ja=new WeakMap,Ma=class extends Da{constructor(e){super(e)}load(e,t,n,r){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let i=this,a=wa.get(`image:${e}`);if(a!==void 0){if(a.complete===!0)i.manager.itemStart(e),setTimeout(function(){t&&t(a),i.manager.itemEnd(e)},0);else{let e=ja.get(a);e===void 0&&(e=[],ja.set(a,e)),e.push({onLoad:t,onError:r})}return a}let o=oe(`img`);function s(){l(),t&&t(this);let n=ja.get(this)||[];for(let e=0;e<n.length;e++){let t=n[e];t.onLoad&&t.onLoad(this)}ja.delete(this),i.manager.itemEnd(e)}function c(t){l(),r&&r(t),wa.remove(`image:${e}`);let n=ja.get(this)||[];for(let e=0;e<n.length;e++){let r=n[e];r.onError&&r.onError(t)}ja.delete(this),i.manager.itemError(e),i.manager.itemEnd(e)}function l(){o.removeEventListener(`load`,s,!1),o.removeEventListener(`error`,c,!1)}return o.addEventListener(`load`,s,!1),o.addEventListener(`error`,c,!1),e.slice(0,5)!==`data:`&&this.crossOrigin!==void 0&&(o.crossOrigin=this.crossOrigin),wa.add(`image:${e}`,o),i.manager.itemStart(e),o.src=e,o}},Na=class extends Da{constructor(e){super(e)}load(e,t,n,r){let i=new tt,a=new Ma(this.manager);return a.setCrossOrigin(this.crossOrigin),a.setPath(this.path),a.load(e,function(e){i.image=e,i.needsUpdate=!0,t!==void 0&&t(i)},n,r),i}},Pa=class extends Nt{constructor(e,t=1){super(),this.isLight=!0,this.type=`Light`,this.color=new q(e),this.intensity=t}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,t}},Fa=class extends Pa{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type=`HemisphereLight`,this.position.copy(Nt.DEFAULT_UP),this.updateMatrix(),this.groundColor=new q(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}toJSON(e){let t=super.toJSON(e);return t.object.groundColor=this.groundColor.getHex(),t}},Ia=new G,La=new H,Ra=new H,za=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new V(512,512),this.mapType=l,this.map=null,this.mapPass=null,this.matrix=new G,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new ti,this._frameExtents=new V(1,1),this._viewportCount=1,this._viewports=[new nt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getCamera(){return this.camera}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera;La.setFromMatrixPosition(e.matrixWorld),t.position.copy(La),Ra.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Ra),t.updateMatrixWorld(),this._updateMatrix(t,this.matrix,this._frustum)}_updateMatrix(e,t,n,r){Ia.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),n.setFromProjectionMatrix(Ia,e.coordinateSystem,e.reversedDepth);let i=this._frameExtents,a=r?r.z/i.x:1,o=r?r.w/i.y:1,s=r?r.x/i.x:0,c=r?r.y/i.y:0;e.coordinateSystem===2001||e.reversedDepth?t.set(.5*a,0,0,.5*a+s,0,.5*o,0,.5*o+c,0,0,1,0,0,0,0,1):t.set(.5*a,0,0,.5*a+s,0,.5*o,0,.5*o+c,0,0,.5,.5,0,0,0,1),t.multiply(Ia)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.autoUpdate=e.autoUpdate,this.needsUpdate=e.needsUpdate,this.normalBias=e.normalBias,this.blurSamples=e.blurSamples,this.mapSize.copy(e.mapSize),this.biasNode=e.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return e.intensity=this.intensity,e.bias=this.bias,e.normalBias=this.normalBias,e.radius=this.radius,e.blurSamples=this.blurSamples,e.mapSize=this.mapSize.toArray(),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},Ba=new H,Va=new ze,Ha=new H,Ua=class extends Nt{constructor(){super(),this.isCamera=!0,this.type=`Camera`,this.matrixWorldInverse=new G,this.projectionMatrix=new G,this.projectionMatrixInverse=new G,this.coordinateSystem=re,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Ba,Va,Ha),Ha.x===1&&Ha.y===1&&Ha.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ba,Va,Ha.set(1,1,1)).invert()}updateWorldMatrix(e,t,n=!1){super.updateWorldMatrix(e,t,n),this.matrixWorld.decompose(Ba,Va,Ha),Ha.x===1&&Ha.y===1&&Ha.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ba,Va,Ha.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Wa=new H,Ga=new V,Ka=new V,qa=class extends Ua{constructor(e=50,t=1,n=.1,r=2e3){super(),this.isPerspectiveCamera=!0,this.type=`PerspectiveCamera`,this.fov=e,this.zoom=1,this.near=n,this.far=r,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=ve*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(_e*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return ve*2*Math.atan(Math.tan(_e*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Wa.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Wa.x,Wa.y).multiplyScalar(-e/Wa.z),Wa.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Wa.x,Wa.y).multiplyScalar(-e/Wa.z)}getViewSize(e,t){return this.getViewBounds(e,Ga,Ka),t.subVectors(Ka,Ga)}setViewOffset(e,t,n,r,i,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(_e*.5*this.fov)/this.zoom,n=2*t,r=this.aspect*n,i=-.5*r,a=this.view;if(this.view!==null&&this.view.enabled){let e=a.fullWidth,o=a.fullHeight;i+=a.offsetX*r/e,t-=a.offsetY*n/o,r*=a.width/e,n*=a.height/o}let o=this.filmOffset;o!==0&&(i+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(i,i+r,t,t-n,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},Ja=class extends za{constructor(){super(new qa(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(e){let t=this.camera,n=ve*2*e.angle*this.focus,r=this.mapSize.width/this.mapSize.height*this.aspect,i=e.distance||t.far;(n!==t.fov||r!==t.aspect||i!==t.far)&&(t.fov=n,t.aspect=r,t.far=i,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this.aspect=e.aspect,this}toJSON(){let e=super.toJSON();return e.focus=this.focus,e.aspect=this.aspect,e}},Ya=class extends Pa{constructor(e,t,n=0,r=Math.PI/3,i=0,a=2){super(e,t),this.isSpotLight=!0,this.type=`SpotLight`,this.position.copy(Nt.DEFAULT_UP),this.updateMatrix(),this.target=new Nt,this.distance=n,this.angle=r,this.penumbra=i,this.decay=a,this.map=null,this.shadow=new Ja}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.map=e.map,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.angle=this.angle,t.object.decay=this.decay,t.object.penumbra=this.penumbra,t.object.target=this.target.uuid,this.map&&this.map.isTexture&&(t.object.map=this.map.toJSON(e).uuid),t.object.shadow=this.shadow.toJSON(),t}},Xa=class extends za{constructor(){super(new qa(90,1,.5,500)),this.isPointLightShadow=!0}},Za=class extends Pa{constructor(e,t,n=0,r=2){super(e,t),this.isPointLight=!0,this.type=`PointLight`,this.distance=n,this.decay=r,this.shadow=new Xa}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.distance=this.distance,t.object.decay=this.decay,t.object.shadow=this.shadow.toJSON(),t}},Qa=class extends Ua{constructor(e=-1,t=1,n=1,r=-1,i=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type=`OrthographicCamera`,this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=r,this.near=i,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,r,i,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=r,this.view.width=i,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,r=(this.top+this.bottom)/2,i=n-e,a=n+e,o=r+t,s=r-t;if(this.view!==null&&this.view.enabled){let e=(this.right-this.left)/this.view.fullWidth/this.zoom,t=(this.top-this.bottom)/this.view.fullHeight/this.zoom;i+=e*this.view.offsetX,a=i+e*this.view.width,o-=t*this.view.offsetY,s=o-t*this.view.height}this.projectionMatrix.makeOrthographic(i,a,o,s,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},$a=class extends za{constructor(){super(new Qa(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},eo=class extends Pa{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type=`DirectionalLight`,this.position.copy(Nt.DEFAULT_UP),this.updateMatrix(),this.target=new Nt,this.shadow=new $a}dispose(){super.dispose(),this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}toJSON(e){let t=super.toJSON(e);return t.object.shadow=this.shadow.toJSON(),t.object.target=this.target.uuid,t}},to=class{static extractUrlBase(e){let t=e.lastIndexOf(`/`);return t===-1?`./`:e.slice(0,t+1)}static resolveURL(e,t){return typeof e!=`string`||e===``?``:(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,`$1`)),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}},no=class extends Ln{constructor(){super(),this.isInstancedBufferGeometry=!0,this.type=`InstancedBufferGeometry`,this.instanceCount=1/0}copy(e){return super.copy(e),this.instanceCount=e.instanceCount,this}toJSON(){let e=super.toJSON();return e.instanceCount=this.instanceCount,e.isInstancedBufferGeometry=!0,e}},ro=new WeakMap,io=class extends Da{constructor(e){super(e),this.isImageBitmapLoader=!0,typeof createImageBitmap>`u`&&I(`ImageBitmapLoader: createImageBitmap() not supported.`),typeof fetch>`u`&&I(`ImageBitmapLoader: fetch() not supported.`),this.options={premultiplyAlpha:`none`},this._abortController=new AbortController}setOptions(e){return this.options=e,this}load(e,t,n,r){e===void 0&&(e=``),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let i=this,a=wa.get(`image-bitmap:${e}`);if(a!==void 0){if(i.manager.itemStart(e),a.then){a.then(n=>{ro.has(a)===!0?(r&&r(ro.get(a)),i.manager.itemError(e),i.manager.itemEnd(e)):(t&&t(n),i.manager.itemEnd(e))});return}setTimeout(function(){t&&t(a),i.manager.itemEnd(e)},0);return}let o={};o.credentials=this.crossOrigin===`anonymous`?`same-origin`:`include`,o.headers=this.requestHeader,o.signal=typeof AbortSignal.any==`function`?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal;let s=fetch(e,o).then(function(e){return e.blob()}).then(function(e){return createImageBitmap(e,Object.assign({},i.options,{colorSpaceConversion:`none`}))}).then(function(n){return wa.add(`image-bitmap:${e}`,n),t&&t(n),i.manager.itemEnd(e),n}).catch(function(t){r&&r(t),ro.set(s,t),wa.remove(`image-bitmap:${e}`),i.manager.itemError(e),i.manager.itemEnd(e)});wa.add(`image-bitmap:${e}`,s),i.manager.itemStart(e)}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}},ao=-90,oo=1,so=class extends Nt{constructor(e,t,n){super(),this.type=`CubeCamera`,this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let r=new qa(ao,oo,e,t);r.layers=this.layers,this.add(r);let i=new qa(ao,oo,e,t);i.layers=this.layers,this.add(i);let a=new qa(ao,oo,e,t);a.layers=this.layers,this.add(a);let o=new qa(ao,oo,e,t);o.layers=this.layers,this.add(o);let s=new qa(ao,oo,e,t);s.layers=this.layers,this.add(s);let c=new qa(ao,oo,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,r,i,a,o,s]=t;for(let e of t)this.remove(e);if(e===2e3)n.up.set(0,1,0),n.lookAt(1,0,0),r.up.set(0,1,0),r.lookAt(-1,0,0),i.up.set(0,0,-1),i.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),s.up.set(0,1,0),s.lookAt(0,0,-1);else if(e===2001)n.up.set(0,-1,0),n.lookAt(-1,0,0),r.up.set(0,-1,0),r.lookAt(1,0,0),i.up.set(0,0,1),i.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),s.up.set(0,-1,0),s.lookAt(0,0,-1);else throw Error(`THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: `+e);for(let e of t)this.add(e),e.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:r}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[i,a,o,s,c,l]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;let m=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let h=!1;h=e.isWebGLRenderer===!0?e.state.buffers.depth.getReversed():e.reversedDepthBuffer,e.setRenderTarget(n,0,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,i),e.setRenderTarget(n,1,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(n,2,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(n,3,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(n,4,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),n.texture.generateMipmaps=m,e.setRenderTarget(n,5,r),h&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(u,d,f),e.xr.enabled=p,n.texture.needsPMREMUpdate=!0}},co=class extends qa{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}},lo=class{constructor(){this._previousTime=0,this._currentTime=0,this._startTime=performance.now(),this._delta=0,this._elapsed=0,this._timescale=1,this._document=null,this._pageVisibilityHandler=null}connect(e){this._document=e,e.hidden!==void 0&&(this._pageVisibilityHandler=uo.bind(this),e.addEventListener(`visibilitychange`,this._pageVisibilityHandler,!1))}disconnect(){this._pageVisibilityHandler!==null&&(this._document.removeEventListener(`visibilitychange`,this._pageVisibilityHandler),this._pageVisibilityHandler=null),this._document=null}getDelta(){return this._delta/1e3}getElapsed(){return this._elapsed/1e3}getTimescale(){return this._timescale}setTimescale(e){return this._timescale=e,this}reset(){return this._currentTime=performance.now()-this._startTime,this}dispose(){this.disconnect()}update(e){return this._pageVisibilityHandler!==null&&this._document.hidden===!0?this._delta=0:(this._previousTime=this._currentTime,this._currentTime=(e===void 0?performance.now():e)-this._startTime,this._delta=(this._currentTime-this._previousTime)*this._timescale,this._elapsed+=this._delta),this}};function uo(){this._document.hidden===!1&&this.reset()}var fo=`\\[\\]\\.:\\/`,po=RegExp(`[\\[\\]\\.:\\/]`,`g`),mo=`[^\\[\\]\\.:\\/]`,ho=`[^`+fo.replace(`\\.`,``)+`]`,go=`((?:WC+[\\/:])*)`.replace(`WC`,mo),_o=`(WCOD+)?`.replace(`WCOD`,ho),vo=`(?:\\.(WC+)(?:\\[(.+)\\])?)?`.replace(`WC`,mo),yo=`\\.(WC+)(?:\\[(.+)\\])?`.replace(`WC`,mo),bo=RegExp(`^`+go+_o+vo+yo+`$`),xo=[`material`,`materials`,`bones`,`map`],So=class{constructor(e,t,n){let r=n||Co.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,r)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,r=this._bindings[n];r!==void 0&&r.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let r=this._targetGroup.nCachedObjects_,i=n.length;r!==i;++r)n[r].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},Co=class e{constructor(t,n,r){this.path=n,this.parsedPath=r||e.parseTrackName(n),this.node=e.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,n,r){return t&&t.isAnimationObjectGroup?new e.Composite(t,n,r):new e(t,n,r)}static sanitizeNodeName(e){return e.replace(/\s/g,`_`).replace(po,``)}static parseTrackName(e){let t=bo.exec(e);if(t===null)throw Error(`THREE.PropertyBinding: Cannot parse trackName: `+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},r=n.nodeName&&n.nodeName.lastIndexOf(`.`);if(r!==void 0&&r!==-1){let e=n.nodeName.substring(r+1);xo.indexOf(e)!==-1&&(n.nodeName=n.nodeName.substring(0,r),n.objectName=e)}if(n.propertyName===null||n.propertyName.length===0)throw Error(`THREE.PropertyBinding: can not parse propertyName from trackName: `+e);return n}static findNode(e,t){if(t===void 0||t===``||t===`.`||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(e){for(let r=0;r<e.length;r++){let i=e[r];if(i.name===t||i.uuid===t)return i;let a=n(i.children);if(a)return a}return null},r=n(e.children);if(r)return r}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)e[t++]=n[r]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let r=0,i=n.length;r!==i;++r)n[r]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let t=this.node,n=this.parsedPath,r=n.objectName,i=n.propertyName,a=n.propertyIndex;if(t||(t=e.findNode(this.rootNode,n.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){I(`PropertyBinding: No target node found for track: `+this.path+`.`);return}if(r){let e=n.objectIndex;switch(r){case`materials`:if(!t.material){L(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.materials){L(`PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.`,this);return}t=t.material.materials;break;case`bones`:if(!t.skeleton){L(`PropertyBinding: Can not bind to bones as node does not have a skeleton.`,this);return}t=t.skeleton.bones;for(let n=0;n<t.length;n++)if(t[n].name===e){e=n;break}break;case`map`:if(`map`in t){t=t.map;break}if(!t.material){L(`PropertyBinding: Can not bind to material as node does not have a material.`,this);return}if(!t.material.map){L(`PropertyBinding: Can not bind to material.map as node.material does not have a map.`,this);return}t=t.material.map;break;default:if(t[r]===void 0){L(`PropertyBinding: Can not bind to objectName of node undefined.`,this);return}t=t[r]}if(e!==void 0){if(t[e]===void 0){L(`PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.`,this,t);return}t=t[e]}}let o=t[i];if(o===void 0){let e=n.nodeName;L(`PropertyBinding: Trying to update property for track: `+e+`.`+i+` but it wasn't found.`,t);return}let s=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?s=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(s=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(a!==void 0){if(i===`morphTargetInfluences`){if(!t.geometry){L(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.`,this);return}if(!t.geometry.morphAttributes){L(`PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.`,this);return}t.morphTargetDictionary[a]!==void 0&&(a=t.morphTargetDictionary[a])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=a}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][s]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Co.Composite=So,Co.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3},Co.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2},Co.prototype.GetterByBindingType=[Co.prototype._getValue_direct,Co.prototype._getValue_array,Co.prototype._getValue_arrayElement,Co.prototype._getValue_toArray],Co.prototype.SetterByBindingTypeAndVersioning=[[Co.prototype._setValue_direct,Co.prototype._setValue_direct_setNeedsUpdate,Co.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Co.prototype._setValue_array,Co.prototype._setValue_array_setNeedsUpdate,Co.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Co.prototype._setValue_arrayElement,Co.prototype._setValue_arrayElement_setNeedsUpdate,Co.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Co.prototype._setValue_fromArray,Co.prototype._setValue_fromArray_setNeedsUpdate,Co.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]],class e{static{e.prototype.isMatrix2=!0}constructor(e,t,n,r){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,n,r)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let n=0;n<4;n++)this.elements[n]=e[n+t];return this}set(e,t,n,r){let i=this.elements;return i[0]=e,i[2]=t,i[1]=n,i[3]=r,this}};function wo(e,t,n,r){let i=To(r);switch(n){case 1021:return e*t;case b:return e*t/i.components*i.byteLength;case x:return e*t/i.components*i.byteLength;case S:return e*t*2/i.components*i.byteLength;case C:return e*t*2/i.components*i.byteLength;case 1022:return e*t*3/i.components*i.byteLength;case _:return e*t*4/i.components*i.byteLength;case w:return e*t*4/i.components*i.byteLength;case 33776:case 33777:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case 33778:case 33779:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 35841:case 35843:return Math.max(e,16)*Math.max(t,8)/4;case 35840:case 35842:return Math.max(e,8)*Math.max(t,8)/2;case 36196:case 37492:case 37488:case 37489:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*8;case 37496:case 37490:case 37491:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 37808:return Math.floor((e+3)/4)*Math.floor((t+3)/4)*16;case 37809:return Math.floor((e+4)/5)*Math.floor((t+3)/4)*16;case 37810:return Math.floor((e+4)/5)*Math.floor((t+4)/5)*16;case 37811:return Math.floor((e+5)/6)*Math.floor((t+4)/5)*16;case 37812:return Math.floor((e+5)/6)*Math.floor((t+5)/6)*16;case 37813:return Math.floor((e+7)/8)*Math.floor((t+4)/5)*16;case 37814:return Math.floor((e+7)/8)*Math.floor((t+5)/6)*16;case 37815:return Math.floor((e+7)/8)*Math.floor((t+7)/8)*16;case 37816:return Math.floor((e+9)/10)*Math.floor((t+4)/5)*16;case 37817:return Math.floor((e+9)/10)*Math.floor((t+5)/6)*16;case 37818:return Math.floor((e+9)/10)*Math.floor((t+7)/8)*16;case 37819:return Math.floor((e+9)/10)*Math.floor((t+9)/10)*16;case 37820:return Math.floor((e+11)/12)*Math.floor((t+9)/10)*16;case 37821:return Math.floor((e+11)/12)*Math.floor((t+11)/12)*16;case 36492:case 36494:case 36495:return Math.ceil(e/4)*Math.ceil(t/4)*16;case 36283:case 36284:return Math.ceil(e/4)*Math.ceil(t/4)*8;case 36285:case 36286:return Math.ceil(e/4)*Math.ceil(t/4)*16}throw Error(`Unable to determine texture byte length for ${n} format.`)}function To(e){switch(e){case l:case 1010:return{byteLength:1,components:1};case u:case 1011:case p:return{byteLength:2,components:1};case m:case h:return{byteLength:2,components:4};case d:case 1013:case f:return{byteLength:4,components:1};case 35902:case 35899:return{byteLength:4,components:3}}throw Error(`THREE.TextureUtils: Unknown texture type ${e}.`)}typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`register`,{detail:{revision:`186`}})),typeof window<`u`&&(window.__THREE__?I(`WARNING: Multiple instances of Three.js being imported.`):window.__THREE__=`186`);function Eo(){let e=null,t=!1,n=null,r=null;function i(t,a){r=e.requestAnimationFrame(i),n(t,a)}return{start:function(){t!==!0&&n!==null&&e!==null&&(r=e.requestAnimationFrame(i),t=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(r),t=!1},setAnimationLoop:function(e){n=e},setContext:function(t){e=t}}}function Do(e){let t=new WeakMap;function n(t,n){let r=t.array,i=t.usage,a=r.byteLength,o=e.createBuffer();e.bindBuffer(n,o),e.bufferData(n,r,i),t.onUploadCallback();let s;if(r instanceof Float32Array)s=e.FLOAT;else if(typeof Float16Array<`u`&&r instanceof Float16Array)s=e.HALF_FLOAT;else if(r instanceof Uint16Array)s=t.isFloat16BufferAttribute?e.HALF_FLOAT:e.UNSIGNED_SHORT;else if(r instanceof Int16Array)s=e.SHORT;else if(r instanceof Uint32Array)s=e.UNSIGNED_INT;else if(r instanceof Int32Array)s=e.INT;else if(r instanceof Int8Array)s=e.BYTE;else if(r instanceof Uint8Array)s=e.UNSIGNED_BYTE;else if(r instanceof Uint8ClampedArray)s=e.UNSIGNED_BYTE;else throw Error(`THREE.WebGLAttributes: Unsupported buffer data format: `+r);return{buffer:o,type:s,bytesPerElement:r.BYTES_PER_ELEMENT,version:t.version,size:a}}function r(t,n,r){let i=n.array,a=n.updateRanges;if(e.bindBuffer(r,t),a.length===0)e.bufferSubData(r,0,i);else{a.sort((e,t)=>e.start-t.start);let t=0;for(let e=1;e<a.length;e++){let n=a[t],r=a[e];r.start<=n.start+n.count+1?n.count=Math.max(n.count,r.start+r.count-n.start):(++t,a[t]=r)}a.length=t+1;for(let t=0,n=a.length;t<n;t++){let n=a[t];e.bufferSubData(r,n.start*i.BYTES_PER_ELEMENT,i,n.start,n.count)}n.clearUpdateRanges()}n.onUploadCallback()}function i(e){return e.isInterleavedBufferAttribute&&(e=e.data),t.get(e)}function a(n){n.isInterleavedBufferAttribute&&(n=n.data);let r=t.get(n);r&&(e.deleteBuffer(r.buffer),t.delete(n))}function o(e,i){if(e.isInterleavedBufferAttribute&&(e=e.data),e.isGLBufferAttribute){let n=t.get(e);(!n||n.version<e.version)&&t.set(e,{buffer:e.buffer,type:e.type,bytesPerElement:e.elementSize,version:e.version});return}let a=t.get(e);if(a===void 0)t.set(e,n(e,i));else if(a.version<e.version){if(a.size!==e.array.byteLength)throw Error(`THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.`);r(a.buffer,e,i),a.version=e.version}}return{get:i,remove:a,update:o}}var Y={alphahash_fragment:`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,alphahash_pars_fragment:`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,alphamap_fragment:`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,alphamap_pars_fragment:`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,alphatest_fragment:`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,alphatest_pars_fragment:`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,aomap_fragment:`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,aomap_pars_fragment:`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,batching_pars_vertex:`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,batching_vertex:`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,begin_vertex:`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,beginnormal_vertex:`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,bsdfs:`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,iridescence_fragment:`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,bumpmap_pars_fragment:`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,clipping_planes_fragment:`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,clipping_planes_pars_fragment:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,clipping_planes_pars_vertex:`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,clipping_planes_vertex:`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,color_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,color_pars_fragment:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,color_pars_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,color_vertex:`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,common:`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,cube_uv_reflection_fragment:`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,defaultnormal_vertex:`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,displacementmap_pars_vertex:`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,displacementmap_vertex:`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,emissivemap_fragment:`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,emissivemap_pars_fragment:`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,colorspace_fragment:`gl_FragColor = linearToOutputTexel( gl_FragColor );`,colorspace_pars_fragment:`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,envmap_fragment:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,envmap_common_pars_fragment:`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,envmap_pars_fragment:`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,envmap_pars_vertex:`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,envmap_physical_pars_fragment:`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,envmap_vertex:`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,fog_vertex:`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,fog_pars_vertex:`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,fog_fragment:`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fog_pars_fragment:`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,gradientmap_pars_fragment:`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,lightmap_pars_fragment:`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,lights_lambert_fragment:`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,lights_lambert_pars_fragment:`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,lights_pars_begin:`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,lights_toon_fragment:`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,lights_toon_pars_fragment:`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,lights_phong_fragment:`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,lights_phong_pars_fragment:`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,lights_physical_fragment:`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,lights_physical_pars_fragment:`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,lights_fragment_begin:`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,lights_fragment_maps:`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,lights_fragment_end:`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,lightprobes_pars_fragment:`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,logdepthbuf_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,logdepthbuf_pars_fragment:`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_pars_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,logdepthbuf_vertex:`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,map_fragment:`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,map_pars_fragment:`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,map_particle_fragment:`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,map_particle_pars_fragment:`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,metalnessmap_fragment:`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,metalnessmap_pars_fragment:`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,morphinstance_vertex:`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,morphcolor_vertex:`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,morphnormal_vertex:`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,morphtarget_pars_vertex:`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,morphtarget_vertex:`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,normal_fragment_begin:`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,normal_fragment_maps:`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,normal_pars_fragment:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_pars_vertex:`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,normal_vertex:`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,normalmap_pars_fragment:`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,clearcoat_normal_fragment_begin:`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,clearcoat_normal_fragment_maps:`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,clearcoat_pars_fragment:`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,iridescence_pars_fragment:`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,opaque_fragment:`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,packing:`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,premultiplied_alpha_fragment:`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,project_vertex:`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,dithering_fragment:`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,dithering_pars_fragment:`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,roughnessmap_fragment:`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,roughnessmap_pars_fragment:`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,shadowmap_pars_fragment:`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,shadowmap_pars_vertex:`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,shadowmap_vertex:`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,shadowmask_pars_fragment:`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,skinbase_vertex:`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,skinning_pars_vertex:`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,skinning_vertex:`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,skinnormal_vertex:`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,specularmap_fragment:`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,specularmap_pars_fragment:`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,tonemapping_fragment:`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,tonemapping_pars_fragment:`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,transmission_fragment:`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,transmission_pars_fragment:`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,uv_pars_fragment:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_pars_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,uv_vertex:`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,worldpos_vertex:`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,background_vert:`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,background_frag:`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,backgroundCube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,backgroundCube_frag:`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cube_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cube_frag:`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,depth_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,depth_frag:`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,distance_vert:`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,distance_frag:`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,equirect_vert:`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,equirect_frag:`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,linedashed_vert:`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,linedashed_frag:`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,meshbasic_vert:`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,meshbasic_frag:`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshlambert_vert:`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshlambert_frag:`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshmatcap_vert:`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,meshmatcap_frag:`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshnormal_vert:`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,meshnormal_frag:`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,meshphong_vert:`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshphong_frag:`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshphysical_vert:`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,meshphysical_frag:`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,meshtoon_vert:`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,meshtoon_frag:`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,points_vert:`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,points_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,shadow_vert:`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,shadow_frag:`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,sprite_vert:`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,sprite_frag:`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`},X={common:{diffuse:{value:new q(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new W},alphaMap:{value:null},alphaMapTransform:{value:new W},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new W}},envmap:{envMap:{value:null},envMapRotation:{value:new W},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new W}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new W}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new W},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new W},normalScale:{value:new V(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new W},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new W}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new W}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new W}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new q(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new H},probesMax:{value:new H},probesResolution:{value:new H}},points:{diffuse:{value:new q(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new W},alphaTest:{value:0},uvTransform:{value:new W}},sprite:{diffuse:{value:new q(16777215)},opacity:{value:1},center:{value:new V(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new W},alphaMap:{value:null},alphaMapTransform:{value:new W},alphaTest:{value:0}}},Oo={basic:{uniforms:Bi([X.common,X.specularmap,X.envmap,X.aomap,X.lightmap,X.fog]),vertexShader:Y.meshbasic_vert,fragmentShader:Y.meshbasic_frag},lambert:{uniforms:Bi([X.common,X.specularmap,X.envmap,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.fog,X.lights,{emissive:{value:new q(0)},envMapIntensity:{value:1}}]),vertexShader:Y.meshlambert_vert,fragmentShader:Y.meshlambert_frag},phong:{uniforms:Bi([X.common,X.specularmap,X.envmap,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.fog,X.lights,{emissive:{value:new q(0)},specular:{value:new q(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Y.meshphong_vert,fragmentShader:Y.meshphong_frag},standard:{uniforms:Bi([X.common,X.envmap,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.roughnessmap,X.metalnessmap,X.fog,X.lights,{emissive:{value:new q(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Y.meshphysical_vert,fragmentShader:Y.meshphysical_frag},toon:{uniforms:Bi([X.common,X.aomap,X.lightmap,X.emissivemap,X.bumpmap,X.normalmap,X.displacementmap,X.gradientmap,X.fog,X.lights,{emissive:{value:new q(0)}}]),vertexShader:Y.meshtoon_vert,fragmentShader:Y.meshtoon_frag},matcap:{uniforms:Bi([X.common,X.bumpmap,X.normalmap,X.displacementmap,X.fog,{matcap:{value:null}}]),vertexShader:Y.meshmatcap_vert,fragmentShader:Y.meshmatcap_frag},points:{uniforms:Bi([X.points,X.fog]),vertexShader:Y.points_vert,fragmentShader:Y.points_frag},dashed:{uniforms:Bi([X.common,X.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Y.linedashed_vert,fragmentShader:Y.linedashed_frag},depth:{uniforms:Bi([X.common,X.displacementmap]),vertexShader:Y.depth_vert,fragmentShader:Y.depth_frag},normal:{uniforms:Bi([X.common,X.bumpmap,X.normalmap,X.displacementmap,{opacity:{value:1}}]),vertexShader:Y.meshnormal_vert,fragmentShader:Y.meshnormal_frag},sprite:{uniforms:Bi([X.sprite,X.fog]),vertexShader:Y.sprite_vert,fragmentShader:Y.sprite_frag},background:{uniforms:{uvTransform:{value:new W},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Y.background_vert,fragmentShader:Y.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new W}},vertexShader:Y.backgroundCube_vert,fragmentShader:Y.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Y.cube_vert,fragmentShader:Y.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Y.equirect_vert,fragmentShader:Y.equirect_frag},distance:{uniforms:Bi([X.common,X.displacementmap,{referencePosition:{value:new H},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Y.distance_vert,fragmentShader:Y.distance_frag},shadow:{uniforms:Bi([X.lights,X.fog,{color:{value:new q(0)},opacity:{value:1}}]),vertexShader:Y.shadow_vert,fragmentShader:Y.shadow_frag}};Oo.physical={uniforms:Bi([Oo.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new W},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new W},clearcoatNormalScale:{value:new V(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new W},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new W},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new W},sheen:{value:0},sheenColor:{value:new q(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new W},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new W},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new W},transmissionSamplerSize:{value:new V},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new W},attenuationDistance:{value:0},attenuationColor:{value:new q(0)},specularColor:{value:new q(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new W},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new W},anisotropyVector:{value:new V},anisotropyMap:{value:null},anisotropyMapTransform:{value:new W}}]),vertexShader:Y.meshphysical_vert,fragmentShader:Y.meshphysical_frag};var ko={r:0,b:0,g:0},Ao=new G,jo=new W;jo.set(-1,0,0,0,1,0,0,0,1);function Mo(e,t,n,r,i,a){let o=new q(0),s=i===!0?0:1,c,l,u=null,d=0,f=null;function p(e){let n=e.isScene===!0?e.background:null;if(n&&n.isTexture){let r=e.backgroundBlurriness>0;n=t.get(n,r)}return n}function m(t){let r=!1,i=p(t);i===null?g(o,s):i&&i.isColor&&(g(i,1),r=!0);let c=e.xr.getEnvironmentBlendMode();c===`additive`?n.buffers.color.setClear(0,0,0,1,a):c===`alpha-blend`&&n.buffers.color.setClear(0,0,0,0,a),(e.autoClear||r)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function h(t,n){let i=p(n);i&&(i.isCubeTexture||i.mapping===306)?(l===void 0&&(l=new J(new Oi(1,1,1),new qi({name:`BackgroundCubeMaterial`,uniforms:zi(Oo.backgroundCube.uniforms),vertexShader:Oo.backgroundCube.vertexShader,fragmentShader:Oo.backgroundCube.fragmentShader,side:1,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute(`normal`),l.geometry.deleteAttribute(`uv`),l.onBeforeRender=function(e,t,n){this.matrixWorld.copyPosition(n.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),r.update(l)),l.material.uniforms.envMap.value=i,l.material.uniforms.backgroundBlurriness.value=n.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(Ao.makeRotationFromEuler(n.backgroundRotation)).transpose(),i.isCubeTexture&&i.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(jo),l.material.toneMapped=Ge.getTransfer(i.colorSpace)!==P,(u!==i||d!==i.version||f!==e.toneMapping)&&(l.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),l.layers.enableAll(),t.unshift(l,l.geometry,l.material,0,0,null)):i&&i.isTexture&&(c===void 0&&(c=new J(new Ii(2,2),new qi({name:`BackgroundMaterial`,uniforms:zi(Oo.background.uniforms),vertexShader:Oo.background.vertexShader,fragmentShader:Oo.background.fragmentShader,side:0,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute(`normal`),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),r.update(c)),c.material.uniforms.t2D.value=i,c.material.uniforms.backgroundIntensity.value=n.backgroundIntensity,c.material.toneMapped=Ge.getTransfer(i.colorSpace)!==P,i.matrixAutoUpdate===!0&&i.updateMatrix(),c.material.uniforms.uvTransform.value.copy(i.matrix),(u!==i||d!==i.version||f!==e.toneMapping)&&(c.material.needsUpdate=!0,u=i,d=i.version,f=e.toneMapping),c.layers.enableAll(),t.unshift(c,c.geometry,c.material,0,0,null))}function g(t,r){t.getRGB(ko,Ui(e)),n.buffers.color.setClear(ko.r,ko.g,ko.b,r,a)}function _(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(e,t=1){o.set(e),s=t,g(o,s)},getClearAlpha:function(){return s},setClearAlpha:function(e){s=e,g(o,s)},render:m,addToRenderList:h,dispose:_}}function No(e,t){let n=e.getParameter(e.MAX_VERTEX_ATTRIBS),r={},i=f(null),a=i,o=!1;function s(n,r,i,s,c){let u=!1,f=d(n,s,i,r);a!==f&&(a=f,l(a.object)),u=p(n,s,i,c),u&&m(n,s,i,c),c!==null&&t.update(c,e.ELEMENT_ARRAY_BUFFER),(u||o)&&(o=!1,b(n,r,i,s),c!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,t.get(c).buffer))}function c(){return e.createVertexArray()}function l(t){return e.bindVertexArray(t)}function u(t){return e.deleteVertexArray(t)}function d(e,t,n,i){let a=i.wireframe===!0,o=r[t.id];o===void 0&&(o={},r[t.id]=o);let s=e.isInstancedMesh===!0?e.id:0,l=o[s];l===void 0&&(l={},o[s]=l);let u=l[n.id];u===void 0&&(u={},l[n.id]=u);let d=u[a];return d===void 0&&(d=f(c()),u[a]=d),d}function f(e){let t=[],r=[],i=[];for(let e=0;e<n;e++)t[e]=0,r[e]=0,i[e]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:t,enabledAttributes:r,attributeDivisors:i,object:e,attributes:{},index:null}}function p(e,t,n,r){let i=a.attributes,o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=i[t],r=o[t];if(r===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(r=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(r=e.instanceColor)),n===void 0||n.attribute!==r||r&&n.data!==r.data)return!0;s++}return a.attributesNum!==s||a.index!==r}function m(e,t,n,r){let i={},o=t.attributes,s=0,c=n.getAttributes();for(let t in c)if(c[t].location>=0){let n=o[t];n===void 0&&(t===`instanceMatrix`&&e.instanceMatrix&&(n=e.instanceMatrix),t===`instanceColor`&&e.instanceColor&&(n=e.instanceColor));let r={};r.attribute=n,n&&n.data&&(r.data=n.data),i[t]=r,s++}a.attributes=i,a.attributesNum=s,a.index=r}function h(){let e=a.newAttributes;for(let t=0,n=e.length;t<n;t++)e[t]=0}function g(e){_(e,0)}function _(t,n){let r=a.newAttributes,i=a.enabledAttributes,o=a.attributeDivisors;r[t]=1,i[t]===0&&(e.enableVertexAttribArray(t),i[t]=1),o[t]!==n&&(e.vertexAttribDivisor(t,n),o[t]=n)}function v(){let t=a.newAttributes,n=a.enabledAttributes;for(let r=0,i=n.length;r<i;r++)n[r]!==t[r]&&(e.disableVertexAttribArray(r),n[r]=0)}function y(t,n,r,i,a,o,s){s===!0?e.vertexAttribIPointer(t,n,r,a,o):e.vertexAttribPointer(t,n,r,i,a,o)}function b(n,r,i,a){h();let o=a.attributes,s=i.getAttributes(),c=r.defaultAttributeValues;for(let r in s){let i=s[r];if(i.location>=0){let s=o[r];if(s===void 0&&(r===`instanceMatrix`&&n.instanceMatrix&&(s=n.instanceMatrix),r===`instanceColor`&&n.instanceColor&&(s=n.instanceColor)),s!==void 0){let r=s.normalized,o=s.itemSize,c=t.get(s);if(c===void 0)continue;let l=c.buffer,u=c.type,d=c.bytesPerElement,f=u===e.INT||u===e.UNSIGNED_INT||s.gpuType===1013;if(s.isInterleavedBufferAttribute){let t=s.data,c=t.stride,p=s.offset;if(t.isInstancedInterleavedBuffer){for(let e=0;e<i.locationSize;e++)_(i.location+e,t.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=t.meshPerAttribute*t.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,c*d,(p+o/i.locationSize*e)*d,f)}else{if(s.isInstancedBufferAttribute){for(let e=0;e<i.locationSize;e++)_(i.location+e,s.meshPerAttribute);n.isInstancedMesh!==!0&&a._maxInstanceCount===void 0&&(a._maxInstanceCount=s.meshPerAttribute*s.count)}else for(let e=0;e<i.locationSize;e++)g(i.location+e);e.bindBuffer(e.ARRAY_BUFFER,l);for(let e=0;e<i.locationSize;e++)y(i.location+e,o/i.locationSize,u,r,o*d,o/i.locationSize*e*d,f)}}else if(c!==void 0){let t=c[r];if(t!==void 0)switch(t.length){case 2:e.vertexAttrib2fv(i.location,t);break;case 3:e.vertexAttrib3fv(i.location,t);break;case 4:e.vertexAttrib4fv(i.location,t);break;default:e.vertexAttrib1fv(i.location,t)}}}}v()}function x(){T();for(let e in r){let t=r[e];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e]}}function S(e){if(r[e.id]===void 0)return;let t=r[e.id];for(let e in t){let n=t[e];for(let e in n){let t=n[e];for(let e in t)u(t[e].object),delete t[e];delete n[e]}}delete r[e.id]}function C(e){for(let t in r){let n=r[t];for(let t in n){let r=n[t];if(r[e.id]===void 0)continue;let i=r[e.id];for(let e in i)u(i[e].object),delete i[e];delete r[e.id]}}}function w(e){for(let t in r){let n=r[t],i=e.isInstancedMesh===!0?e.id:0,a=n[i];if(a!==void 0){for(let e in a){let t=a[e];for(let e in t)u(t[e].object),delete t[e];delete a[e]}delete n[i],Object.keys(n).length===0&&delete r[t]}}}function T(){E(),o=!0,a!==i&&(a=i,l(a.object))}function E(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:s,reset:T,resetDefaultState:E,dispose:x,releaseStatesOfGeometry:S,releaseStatesOfObject:w,releaseStatesOfProgram:C,initAttributes:h,enableAttribute:g,disableUnusedAttributes:v}}function Po(e,t,n){let r;function i(e){r=e}function a(t,i){e.drawArrays(r,t,i),n.update(i,r,1)}function o(t,i,a){a!==0&&(e.drawArraysInstanced(r,t,i,a),n.update(i,r,a))}function s(e,i,a){if(a===0)return;t.get(`WEBGL_multi_draw`).multiDrawArraysWEBGL(r,e,0,i,0,a);let o=0;for(let e=0;e<a;e++)o+=i[e];n.update(o,r,1)}this.setMode=i,this.render=a,this.renderInstances=o,this.renderMultiDraw=s}function Fo(e,t,n,r){let i;function a(){if(i!==void 0)return i;if(t.has(`EXT_texture_filter_anisotropic`)===!0){let n=t.get(`EXT_texture_filter_anisotropic`);i=e.getParameter(n.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(t){return t===1023||r.convert(t)===e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT)}function s(n){let i=n===1016&&(t.has(`EXT_color_buffer_half_float`)||t.has(`EXT_color_buffer_float`));return!(n!==1009&&n!==1015&&!i&&r.convert(n)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE))}function c(t){if(t===`highp`){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return`highp`;t=`mediump`}return t===`mediump`&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?`mediump`:`lowp`}let l=n.precision===void 0?`highp`:n.precision,u=c(l);u!==l&&(I(`WebGLRenderer:`,l,`not supported, using`,u,`instead.`),l=u);let d=n.logarithmicDepthBuffer===!0,f=n.reversedDepthBuffer===!0&&t.has(`EXT_clip_control`);n.reversedDepthBuffer===!0&&f===!1&&I(`WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.`);let p=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),m=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),h=e.getParameter(e.MAX_TEXTURE_SIZE),g=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),_=e.getParameter(e.MAX_VERTEX_ATTRIBS),v=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),b=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),x=e.getParameter(e.MAX_SAMPLES),S=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:a,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:s,precision:l,logarithmicDepthBuffer:d,reversedDepthBuffer:f,maxTextures:p,maxVertexTextures:m,maxTextureSize:h,maxCubemapSize:g,maxAttributes:_,maxVertexUniforms:v,maxVaryings:y,maxFragmentUniforms:b,maxSamples:x,samples:S}}function Io(e){let t=this,n=null,r=0,i=!1,a=!1,o=new Wn,s=new W,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(e,t){let n=e.length!==0||t||r!==0||i;return i=t,r=e.length,n},this.beginShadows=function(){a=!0,u(null)},this.endShadows=function(){a=!1},this.setGlobalState=function(e,t){n=u(e,t,0)},this.setState=function(t,o,s){let d=t.clippingPlanes,f=t.clipIntersection,p=t.clipShadows,m=e.get(t);if(!i||d===null||d.length===0||a&&!p)a?u(null):l();else{let e=a?0:r,t=e*4,i=m.clippingState||null;c.value=i,i=u(d,o,t,s);for(let e=0;e!==t;++e)i[e]=n[e];m.clippingState=i,this.numIntersection=f?this.numPlanes:0,this.numPlanes+=e}};function l(){c.value!==n&&(c.value=n,c.needsUpdate=r>0),t.numPlanes=r,t.numIntersection=0}function u(e,n,r,i){let a=e===null?0:e.length,l=null;if(a!==0){if(l=c.value,i!==!0||l===null){let t=r+a*4,i=n.matrixWorldInverse;s.getNormalMatrix(i),(l===null||l.length<t)&&(l=new Float32Array(t));for(let t=0,n=r;t!==a;++t,n+=4)o.copy(e[t]).applyMatrix4(i,s),o.normal.toArray(l,n),l[n+3]=o.constant}c.value=l,c.needsUpdate=!0}return t.numPlanes=a,t.numIntersection=0,l}}var Lo=4,Ro=6,zo=20,Bo=256,Vo=new Qa,Ho=new q,Uo=null,Wo=0,Go=0,Ko=!1,qo=new H,Jo=new H,Yo=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,n=.1,r=100,i={}){let{size:a=256,position:o=qo}=i;Uo=this._renderer.getRenderTarget(),Wo=this._renderer.getActiveCubeFace(),Go=this._renderer.getActiveMipmapLevel(),Ko=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let s=this._allocateTargets();return s.depthBuffer=!0,this._sceneToCubeUV(e,n,r,s,o),t>0&&this._blur(s,0,0,t),this._applyPMREM(s),this._cleanup(s),s}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=ns(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=ts(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=2**this._lodMax}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Uo,Wo,Go),this._renderer.xr.enabled=Ko,e.scissorTest=!1,Qo(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===301||e.mapping===302?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Uo=this._renderer.getRenderTarget(),Wo=this._renderer.getActiveCubeFace(),Go=this._renderer.getActiveMipmapLevel(),Ko=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:o,minFilter:o,generateMipmaps:!1,type:p,format:_,colorSpace:M,depthBuffer:!1},r=Zo(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Zo(e,t,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=Xo(r)),this._blurMaterial=es(r,e,t),this._ggxMaterial=$o(r,e,t)}return r}_compileMaterial(e){let t=new J(new Ln,e);this._renderer.compile(t,Vo)}_sceneToCubeUV(e,t,n,r,i){let a=new qa(90,1,t,n),o=[1,-1,1,1,1,1],s=[1,1,1,-1,-1,-1],c=this._renderer,l=c.autoClear,u=c.toneMapping;c.getClearColor(Ho),c.toneMapping=0,c.autoClear=!1,c.state.buffers.depth.getReversed()&&(c.setRenderTarget(r),c.clearDepth(),c.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new J(new Oi,new mr({name:`PMREM.Background`,side:1,depthWrite:!1,depthTest:!1})));let d=this._backgroundBox,f=d.material,p=!1,m=e.background;m?m.isColor&&(f.color.copy(m),e.background=null,p=!0):(f.color.copy(Ho),p=!0);for(let t=0;t<6;t++){let n=t%3;n===0?(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x+s[t],i.y,i.z)):n===1?(a.up.set(0,0,o[t]),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y+s[t],i.z)):(a.up.set(0,o[t],0),a.position.set(i.x,i.y,i.z),a.lookAt(i.x,i.y,i.z+s[t]));let l=this._cubeSize;Qo(r,n*l,t>2?l:0,l,l),c.setRenderTarget(r),p&&c.render(d,a),c.render(e,a)}c.toneMapping=u,c.autoClear=l,e.background=m}_textureToCubeUV(e,t){let n=this._renderer,r=e.mapping===301||e.mapping===302;r?(this._cubemapMaterial===null&&(this._cubemapMaterial=ns()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=ts());let i=r?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=i;let o=i.uniforms;o.envMap.value=e;let s=this._cubeSize;Qo(t,0,0,3*s,2*s),n.setRenderTarget(t),n.render(a,Vo)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let r=this._lodMeshes.length;for(let t=1;t<r;t++)this._applyGGXFilter(e,t-1,t);t.autoClear=n}_applyGGXFilter(e,t,n){let r=this._renderer,i=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let s=a.uniforms,c=n/(this._lodMeshes.length-1),l=t/(this._lodMeshes.length-1),u=Math.sqrt(c*c-l*l)*(c*1.25),{_lodMax:d}=this,f=this._sizeLods[n],p=3*f*(n>d-Lo?n-d+Lo:0),m=4*(this._cubeSize-f);s.envMap.value=e.texture,s.roughness.value=u,s.mipInt.value=d-t,Qo(i,p,m,3*f,2*f),r.setRenderTarget(i),r.render(o,Vo),s.envMap.value=i.texture,s.roughness.value=0,s.mipInt.value=d-n,Qo(e,p,m,3*f,2*f),r.setRenderTarget(e),r.render(o,Vo)}_blur(e,t,n,r){let i=this._pingPongRenderTarget,a=Math.min(r,Math.PI)/Math.SQRT2;this._blurPass(e,i,t,n,a),this._blurPass(i,e,n,n,a)}_blurPass(e,t,n,r,i){let a=this._renderer,o=this._blurMaterial,s=this._lodMeshes[r];s.material=o;let c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=i,c.mipInt.value=this._lodMax-n;let l=this._sizeLods[r];Qo(t,3*l*(r>this._lodMax-Lo?r-this._lodMax+Lo:0),4*(this._cubeSize-l),3*l,2*l),a.setRenderTarget(t),a.render(s,Vo)}};function Xo(e){let t=[],n=[],r=e,i=e-Lo+1+Ro;for(let e=0;e<i;e++){let e=2**r;t.push(e);let i=1/(e-2),a=-i,o=1+i,s=[a,a,o,a,o,o,a,a,o,o,a,o],c=new Float32Array(108),l=new Float32Array(108);for(let e=0;e<6;e++){let t=e%3*2/3-1,n=e>2?0:-1,r=[t,n,0,t+2/3,n,0,t+2/3,n+1,0,t,n,0,t+2/3,n+1,0,t,n+1,0];c.set(r,18*e);for(let t=0;t<6;t++){let n=s[t*2]*2-1,r=s[t*2+1]*2-1;e===0?Jo.set(1,r,n):e===1?Jo.set(-n,1,-r):e===2?Jo.set(-n,r,1):e===3?Jo.set(-1,r,-n):e===4?Jo.set(-n,-1,r):Jo.set(n,r,-1),Jo.toArray(l,(e*6+t)*3)}}let u=new Ln;u.setAttribute(`position`,new Sn(c,3)),u.setAttribute(`outputDirection`,new Sn(l,3)),n.push(new J(u,null)),r>Lo&&r--}return{lodMeshes:n,sizeLods:t}}function Zo(e,t,n){let r=new it(e,t,n);return r.texture.mapping=306,r.texture.name=`PMREM.cubeUv`,r.scissorTest=!0,r}function Qo(e,t,n,r,i){e.viewport.set(t,n,r,i),e.scissor.set(t,n,r,i)}function $o(e,t,n){return new qi({name:`PMREMGGXConvolution`,defines:{GGX_SAMPLES:Bo,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:rs(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function es(e,t,n){return new qi({name:`SphericalGaussianBlur`,defines:{SAMPLES:zo,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/n,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:rs(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function ts(){return new qi({name:`EquirectangularToCubeUV`,uniforms:{envMap:{value:null}},vertexShader:rs(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function ns(){return new qi({name:`CubemapToCubeUV`,uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:rs(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:0,depthTest:!1,depthWrite:!1})}function rs(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}var is=class extends it{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},r=[n,n,n,n,n,n];this.texture=new Ci(r),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},r=new Oi(5,5,5),i=new qi({name:`CubemapFromEquirect`,uniforms:zi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:1,blending:0});i.uniforms.tEquirect.value=t;let a=new J(r,i),s=t.minFilter;return t.minFilter===1008&&(t.minFilter=o),new so(1,10,this).update(e,a),t.minFilter=s,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,n=!0,r=!0){let i=e.getRenderTarget();for(let i=0;i<6;i++)e.setRenderTarget(this,i),e.clear(t,n,r);e.setRenderTarget(i)}};function as(e){let t=new WeakMap,n=new WeakMap,r=null;function i(e,t=!1){return e==null?null:t?o(e):a(e)}function a(n){if(n&&n.isTexture){let r=n.mapping;if(r===303||r===304){if(t.has(n)){let e=t.get(n).texture;return s(e,n.mapping)}{let r=n.image;if(r&&r.height>0){let i=new is(r.height);return i.fromEquirectangularTexture(e,n),t.set(n,i),n.addEventListener(`dispose`,l),s(i.texture,n.mapping)}return null}}}return n}function o(t){if(t&&t.isTexture){let i=t.mapping,a=i===303||i===304,o=i===301||i===302;if(a||o){let i=n.get(t),s=i===void 0?0:i.texture.pmremVersion;if(t.isRenderTargetTexture&&t.pmremVersion!==s)return r===null&&(r=new Yo(e)),i=a?r.fromEquirectangular(t,i):r.fromCubemap(t,i),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),i.texture;if(i!==void 0)return i.texture;{let s=t.image;return a&&s&&s.height>0||o&&s&&c(s)?(r===null&&(r=new Yo(e)),i=a?r.fromEquirectangular(t):r.fromCubemap(t),i.texture.pmremVersion=t.pmremVersion,n.set(t,i),t.addEventListener(`dispose`,u),i.texture):null}}}return t}function s(e,t){return t===303?e.mapping=301:t===304&&(e.mapping=302),e}function c(e){let t=0;for(let n=0;n<6;n++)e[n]!==void 0&&t++;return t===6}function l(e){let n=e.target;n.removeEventListener(`dispose`,l);let r=t.get(n);r!==void 0&&(t.delete(n),r.dispose())}function u(e){let t=e.target;t.removeEventListener(`dispose`,u);let r=n.get(t);r!==void 0&&(n.delete(t),r.dispose())}function d(){t=new WeakMap,n=new WeakMap,r!==null&&(r.dispose(),r=null)}return{get:i,dispose:d}}function os(e){let t={};function n(n){if(t[n]!==void 0)return t[n];let r=e.getExtension(n);return t[n]=r,r}return{has:function(e){return n(e)!==null},init:function(){n(`EXT_color_buffer_float`),n(`WEBGL_clip_cull_distance`),n(`OES_texture_float_linear`),n(`EXT_color_buffer_half_float`),n(`WEBGL_multisampled_render_to_texture`),n(`WEBGL_render_shared_exponent`)},get:function(e){let t=n(e);return t===null&&de(`WebGLRenderer: `+e+` extension not supported.`),t}}}function ss(e,t,n,r){let i={},a=new WeakMap;function o(e){let s=e.target;s.index!==null&&t.remove(s.index);for(let e in s.attributes)t.remove(s.attributes[e]);s.removeEventListener(`dispose`,o),delete i[s.id];let c=a.get(s);c&&(t.remove(c),a.delete(s)),r.releaseStatesOfGeometry(s),s.isInstancedBufferGeometry===!0&&delete s._maxInstanceCount,n.memory.geometries--}function s(e,t){return i[t.id]===!0?t:(t.addEventListener(`dispose`,o),i[t.id]=!0,n.memory.geometries++,t)}function c(n){let r=n.attributes;for(let n in r)t.update(r[n],e.ARRAY_BUFFER)}function l(e){let n=[],r=e.index,i=e.attributes.position,o=0;if(i===void 0)return;if(r!==null){let e=r.array;o=r.version;for(let t=0,r=e.length;t<r;t+=3){let r=e[t+0],i=e[t+1],a=e[t+2];n.push(r,i,i,a,a,r)}}else{let e=i.array;o=i.version;for(let t=0,r=e.length/3-1;t<r;t+=3){let e=t+0,r=t+1,i=t+2;n.push(e,r,r,i,i,e)}}let s=new(i.count>=65535?wn:Cn)(n,1);s.version=o;let c=a.get(e);c&&t.remove(c),a.set(e,s)}function u(e){let t=a.get(e);if(t){let n=e.index;n!==null&&t.version<n.version&&l(e)}else l(e);return a.get(e)}return{get:s,update:c,getWireframeAttribute:u}}function cs(e,t,n){let r;function i(e){r=e}let a,o;function s(e){a=e.type,o=e.bytesPerElement}function c(t,i){e.drawElements(r,i,a,t*o),n.update(i,r,1)}function l(t,i,s){s!==0&&(e.drawElementsInstanced(r,i,a,t*o,s),n.update(i,r,s))}function u(e,i,o){if(o===0)return;t.get(`WEBGL_multi_draw`).multiDrawElementsWEBGL(r,i,0,a,e,0,o);let s=0;for(let e=0;e<o;e++)s+=i[e];n.update(s,r,1)}this.setMode=i,this.setIndex=s,this.render=c,this.renderInstances=l,this.renderMultiDraw=u}function ls(e){let t={geometries:0,textures:0},n={frame:0,calls:0,triangles:0,points:0,lines:0};function r(t,r,i){switch(n.calls++,r){case e.TRIANGLES:n.triangles+=t/3*i;break;case e.LINES:n.lines+=t/2*i;break;case e.LINE_STRIP:n.lines+=i*(t-1);break;case e.LINE_LOOP:n.lines+=i*t;break;case e.POINTS:n.points+=i*t;break;default:L(`WebGLInfo: Unknown draw mode:`,r)}}function i(){n.calls=0,n.triangles=0,n.points=0,n.lines=0}return{memory:t,render:n,programs:null,autoReset:!0,reset:i,update:r}}function us(e,t,n){let r=new WeakMap,i=new nt;function a(a,o,s){let c=a.morphTargetInfluences,l=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=l===void 0?0:l.length,d=r.get(o);if(d===void 0||d.count!==u){d!==void 0&&d.texture.dispose();let e=o.morphAttributes.position!==void 0,n=o.morphAttributes.normal!==void 0,a=o.morphAttributes.color!==void 0,s=o.morphAttributes.position||[],c=o.morphAttributes.normal||[],l=o.morphAttributes.color||[],p=0;e===!0&&(p=1),n===!0&&(p=2),a===!0&&(p=3);let m=o.attributes.position.count*p,h=1;m>t.maxTextureSize&&(h=Math.ceil(m/t.maxTextureSize),m=t.maxTextureSize);let g=new Float32Array(m*h*4*u),_=new at(g,m,h,u);_.type=f,_.needsUpdate=!0;let v=p*4;for(let t=0;t<u;t++){let r=s[t],o=c[t],u=l[t],d=m*h*4*t;for(let t=0;t<r.count;t++){let s=t*v;e===!0&&(i.fromBufferAttribute(r,t),g[d+s+0]=i.x,g[d+s+1]=i.y,g[d+s+2]=i.z,g[d+s+3]=0),n===!0&&(i.fromBufferAttribute(o,t),g[d+s+4]=i.x,g[d+s+5]=i.y,g[d+s+6]=i.z,g[d+s+7]=0),a===!0&&(i.fromBufferAttribute(u,t),g[d+s+8]=i.x,g[d+s+9]=i.y,g[d+s+10]=i.z,g[d+s+11]=u.itemSize===4?i.w:1)}}d={count:u,texture:_,size:new V(m,h)},r.set(o,d);function y(){_.dispose(),r.delete(o),o.removeEventListener(`dispose`,y)}o.addEventListener(`dispose`,y)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)s.getUniforms().setValue(e,`morphTexture`,a.morphTexture,n);else{let t=0;for(let e=0;e<c.length;e++)t+=c[e];let n=o.morphTargetsRelative?1:1-t;s.getUniforms().setValue(e,`morphTargetBaseInfluence`,n),s.getUniforms().setValue(e,`morphTargetInfluences`,c)}s.getUniforms().setValue(e,`morphTargetsTexture`,d.texture,n),s.getUniforms().setValue(e,`morphTargetsTextureSize`,d.size)}return{update:a}}function ds(e,t,n,r,i){let a=new WeakMap;function o(r){let o=i.render.frame,s=r.geometry,l=t.get(r,s);if(a.get(l)!==o&&(t.update(l),a.set(l,o)),r.isInstancedMesh&&(r.hasEventListener(`dispose`,c)===!1&&r.addEventListener(`dispose`,c),a.get(r)!==o&&(n.update(r.instanceMatrix,e.ARRAY_BUFFER),r.instanceColor!==null&&n.update(r.instanceColor,e.ARRAY_BUFFER),a.set(r,o))),r.isSkinnedMesh){let e=r.skeleton;a.get(e)!==o&&(e.update(),a.set(e,o))}return l}function s(){a=new WeakMap}function c(e){let t=e.target;t.removeEventListener(`dispose`,c),r.releaseStatesOfObject(t),n.remove(t.instanceMatrix),t.instanceColor!==null&&n.remove(t.instanceColor)}return{update:o,dispose:s}}var fs={1:`LINEAR_TONE_MAPPING`,2:`REINHARD_TONE_MAPPING`,3:`CINEON_TONE_MAPPING`,4:`ACES_FILMIC_TONE_MAPPING`,6:`AGX_TONE_MAPPING`,7:`NEUTRAL_TONE_MAPPING`,5:`CUSTOM_TONE_MAPPING`};function ps(e,t,n,r,i,a){let o=new it(t,n,{type:e,depthBuffer:i,stencilBuffer:a,samples:r?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1}),s=null,c=null,l=new Ln;l.setAttribute(`position`,new Tn([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute(`uv`,new Tn([0,2,0,0,2,0],2));let u=new Ji({uniforms:{tDiffuse:{value:null}},vertexShader:`
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

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

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

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),d=new J(l,u),f=new Qa(-1,1,1,-1,0,1),m=null,h=null,g=!1,_,v=null,y=[],b=!1;this.setSize=function(e,t){o.setSize(e,t),s!==null&&s.setSize(e,t),c!==null&&c.setSize(e,t);for(let n=0;n<y.length;n++){let r=y[n];r.setSize&&r.setSize(e,t)}},this.setEffects=function(e){y=e,b=y.length>0&&y[0].isRenderPass===!0;let t=o.width,n=o.height;y.length>0&&s===null&&(s=new it(t,n,{type:p,depthBuffer:!1,stencilBuffer:!1}),c=new it(t,n,{type:p,depthBuffer:!1,stencilBuffer:!1}));for(let e=0;e<y.length;e++){let r=y[e];r.setSize&&r.setSize(t,n)}},this.begin=function(e,t){if(g||e.toneMapping===0&&y.length===0)return!1;if(v=t,t!==null){let e=t.width,n=t.height;(o.width!==e||o.height!==n)&&this.setSize(e,n)}return b===!1&&e.setRenderTarget(o),_=e.toneMapping,e.toneMapping=0,!0},this.hasRenderPass=function(){return b},this.end=function(e,t){e.toneMapping=_,g=!0;let n=o,r=s;for(let i=0;i<y.length;i++){let a=y[i];a.enabled!==!1&&(a.render(e,r,n,t),a.needsSwap!==!1&&(n=r,r=r===s?c:s))}if(m!==e.outputColorSpace||h!==e.toneMapping){m=e.outputColorSpace,h=e.toneMapping,u.defines={},Ge.getTransfer(m)===`srgb`&&(u.defines.SRGB_TRANSFER=``);let t=fs[h];t&&(u.defines[t]=``),u.needsUpdate=!0}u.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(v),e.render(d,f),v=null,g=!1},this.isCompositing=function(){return g},this.dispose=function(){o.dispose(),s!==null&&s.dispose(),c!==null&&c.dispose(),l.dispose(),u.dispose()}}var ms=new tt,hs=new Ti(1,1),gs=new at,_s=new ot,vs=new Ci,ys=[],bs=[],xs=new Float32Array(16),Ss=new Float32Array(9),Cs=new Float32Array(4);function ws(e,t,n){let r=e[0];if(r<=0||r>0)return e;let i=t*n,a=ys[i];if(a===void 0&&(a=new Float32Array(i),ys[i]=a),t!==0){r.toArray(a,0);for(let r=1,i=0;r!==t;++r)i+=n,e[r].toArray(a,i)}return a}function Ts(e,t){if(e.length!==t.length)return!1;for(let n=0,r=e.length;n<r;n++)if(e[n]!==t[n])return!1;return!0}function Es(e,t){for(let n=0,r=t.length;n<r;n++)e[n]=t[n]}function Ds(e,t){let n=bs[t];n===void 0&&(n=new Int32Array(t),bs[t]=n);for(let r=0;r!==t;++r)n[r]=e.allocateTextureUnit();return n}function Os(e,t){let n=this.cache;n[0]!==t&&(e.uniform1f(this.addr,t),n[0]=t)}function ks(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2f(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Ts(n,t))return;e.uniform2fv(this.addr,t),Es(n,t)}}function As(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3f(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else if(t.r!==void 0)(n[0]!==t.r||n[1]!==t.g||n[2]!==t.b)&&(e.uniform3f(this.addr,t.r,t.g,t.b),n[0]=t.r,n[1]=t.g,n[2]=t.b);else{if(Ts(n,t))return;e.uniform3fv(this.addr,t),Es(n,t)}}function js(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4f(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Ts(n,t))return;e.uniform4fv(this.addr,t),Es(n,t)}}function Ms(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(Ts(n,t))return;e.uniformMatrix2fv(this.addr,!1,t),Es(n,t)}else{if(Ts(n,r))return;Cs.set(r),e.uniformMatrix2fv(this.addr,!1,Cs),Es(n,r)}}function Ns(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(Ts(n,t))return;e.uniformMatrix3fv(this.addr,!1,t),Es(n,t)}else{if(Ts(n,r))return;Ss.set(r),e.uniformMatrix3fv(this.addr,!1,Ss),Es(n,r)}}function Ps(e,t){let n=this.cache,r=t.elements;if(r===void 0){if(Ts(n,t))return;e.uniformMatrix4fv(this.addr,!1,t),Es(n,t)}else{if(Ts(n,r))return;xs.set(r),e.uniformMatrix4fv(this.addr,!1,xs),Es(n,r)}}function Fs(e,t){let n=this.cache;n[0]!==t&&(e.uniform1i(this.addr,t),n[0]=t)}function Is(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2i(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Ts(n,t))return;e.uniform2iv(this.addr,t),Es(n,t)}}function Ls(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3i(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(Ts(n,t))return;e.uniform3iv(this.addr,t),Es(n,t)}}function Rs(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4i(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Ts(n,t))return;e.uniform4iv(this.addr,t),Es(n,t)}}function zs(e,t){let n=this.cache;n[0]!==t&&(e.uniform1ui(this.addr,t),n[0]=t)}function Bs(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y)&&(e.uniform2ui(this.addr,t.x,t.y),n[0]=t.x,n[1]=t.y);else{if(Ts(n,t))return;e.uniform2uiv(this.addr,t),Es(n,t)}}function Vs(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z)&&(e.uniform3ui(this.addr,t.x,t.y,t.z),n[0]=t.x,n[1]=t.y,n[2]=t.z);else{if(Ts(n,t))return;e.uniform3uiv(this.addr,t),Es(n,t)}}function Hs(e,t){let n=this.cache;if(t.x!==void 0)(n[0]!==t.x||n[1]!==t.y||n[2]!==t.z||n[3]!==t.w)&&(e.uniform4ui(this.addr,t.x,t.y,t.z,t.w),n[0]=t.x,n[1]=t.y,n[2]=t.z,n[3]=t.w);else{if(Ts(n,t))return;e.uniform4uiv(this.addr,t),Es(n,t)}}function Us(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i);let a;this.type===e.SAMPLER_2D_SHADOW?(hs.compareFunction=n.isReversedDepthBuffer()?518:515,a=hs):a=ms,n.setTexture2D(t||a,i)}function Ws(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture3D(t||_s,i)}function Gs(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTextureCube(t||vs,i)}function Ks(e,t,n){let r=this.cache,i=n.allocateTextureUnit();r[0]!==i&&(e.uniform1i(this.addr,i),r[0]=i),n.setTexture2DArray(t||gs,i)}function qs(e){switch(e){case 5126:return Os;case 35664:return ks;case 35665:return As;case 35666:return js;case 35674:return Ms;case 35675:return Ns;case 35676:return Ps;case 5124:case 35670:return Fs;case 35667:case 35671:return Is;case 35668:case 35672:return Ls;case 35669:case 35673:return Rs;case 5125:return zs;case 36294:return Bs;case 36295:return Vs;case 36296:return Hs;case 35678:case 36198:case 36298:case 36306:case 35682:return Us;case 35679:case 36299:case 36307:return Ws;case 35680:case 36300:case 36308:case 36293:return Gs;case 36289:case 36303:case 36311:case 36292:return Ks}}function Js(e,t){e.uniform1fv(this.addr,t)}function Ys(e,t){let n=ws(t,this.size,2);e.uniform2fv(this.addr,n)}function Xs(e,t){let n=ws(t,this.size,3);e.uniform3fv(this.addr,n)}function Zs(e,t){let n=ws(t,this.size,4);e.uniform4fv(this.addr,n)}function Qs(e,t){let n=ws(t,this.size,4);e.uniformMatrix2fv(this.addr,!1,n)}function $s(e,t){let n=ws(t,this.size,9);e.uniformMatrix3fv(this.addr,!1,n)}function ec(e,t){let n=ws(t,this.size,16);e.uniformMatrix4fv(this.addr,!1,n)}function tc(e,t){e.uniform1iv(this.addr,t)}function nc(e,t){e.uniform2iv(this.addr,t)}function rc(e,t){e.uniform3iv(this.addr,t)}function ic(e,t){e.uniform4iv(this.addr,t)}function ac(e,t){e.uniform1uiv(this.addr,t)}function oc(e,t){e.uniform2uiv(this.addr,t)}function sc(e,t){e.uniform3uiv(this.addr,t)}function cc(e,t){e.uniform4uiv(this.addr,t)}function lc(e,t,n){let r=this.cache,i=t.length,a=Ds(n,i);Ts(r,a)||(e.uniform1iv(this.addr,a),Es(r,a));let o;o=this.type===e.SAMPLER_2D_SHADOW?hs:ms;for(let e=0;e!==i;++e)n.setTexture2D(t[e]||o,a[e])}function uc(e,t,n){let r=this.cache,i=t.length,a=Ds(n,i);Ts(r,a)||(e.uniform1iv(this.addr,a),Es(r,a));for(let e=0;e!==i;++e)n.setTexture3D(t[e]||_s,a[e])}function dc(e,t,n){let r=this.cache,i=t.length,a=Ds(n,i);Ts(r,a)||(e.uniform1iv(this.addr,a),Es(r,a));for(let e=0;e!==i;++e)n.setTextureCube(t[e]||vs,a[e])}function fc(e,t,n){let r=this.cache,i=t.length,a=Ds(n,i);Ts(r,a)||(e.uniform1iv(this.addr,a),Es(r,a));for(let e=0;e!==i;++e)n.setTexture2DArray(t[e]||gs,a[e])}function pc(e){switch(e){case 5126:return Js;case 35664:return Ys;case 35665:return Xs;case 35666:return Zs;case 35674:return Qs;case 35675:return $s;case 35676:return ec;case 5124:case 35670:return tc;case 35667:case 35671:return nc;case 35668:case 35672:return rc;case 35669:case 35673:return ic;case 5125:return ac;case 36294:return oc;case 36295:return sc;case 36296:return cc;case 35678:case 36198:case 36298:case 36306:case 35682:return lc;case 35679:case 36299:case 36307:return uc;case 35680:case 36300:case 36308:case 36293:return dc;case 36289:case 36303:case 36311:case 36292:return fc}}var mc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=qs(t.type)}},hc=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=pc(t.type)}},gc=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let r=this.seq;for(let i=0,a=r.length;i!==a;++i){let a=r[i];a.setValue(e,t[a.id],n)}}},_c=/(\w+)(\])?(\[|\.)?/g;function vc(e,t){e.seq.push(t),e.map[t.id]=t}function yc(e,t,n){let r=e.name,i=r.length;for(_c.lastIndex=0;;){let a=_c.exec(r),o=_c.lastIndex,s=a[1],c=a[2]===`]`,l=a[3];if(c&&(s|=0),l===void 0||l===`[`&&o+2===i){vc(n,l===void 0?new mc(s,e,t):new hc(s,e,t));break}{let e=n.map[s];e===void 0&&(e=new gc(s),vc(n,e)),n=e}}}var bc=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let r=0;r<n;++r){let n=e.getActiveUniform(t,r);yc(n,e.getUniformLocation(t,n.name),this)}let r=[],i=[];for(let t of this.seq)t.type===e.SAMPLER_2D_SHADOW||t.type===e.SAMPLER_CUBE_SHADOW||t.type===e.SAMPLER_2D_ARRAY_SHADOW?r.push(t):i.push(t);r.length>0&&(this.seq=r.concat(i))}setValue(e,t,n,r){let i=this.map[t];i!==void 0&&i.setValue(e,n,r)}setOptional(e,t,n){let r=t[n];r!==void 0&&this.setValue(e,n,r)}static upload(e,t,n,r){for(let i=0,a=t.length;i!==a;++i){let a=t[i],o=n[a.id];o.needsUpdate!==!1&&a.setValue(e,o.value,r)}}static seqWithValue(e,t){let n=[];for(let r=0,i=e.length;r!==i;++r){let i=e[r];i.id in t&&n.push(i)}return n}};function xc(e,t,n){let r=e.createShader(t);return e.shaderSource(r,n),e.compileShader(r),r}var Sc=37297,Cc=0;function wc(e,t){let n=e.split(`
`),r=[],i=Math.max(t-6,0),a=Math.min(t+6,n.length);for(let e=i;e<a;e++){let i=e+1;r.push(`${i===t?`>`:` `} ${i}: ${n[e]}`)}return r.join(`
`)}var Tc=new W;function Ec(e){Ge._getMatrix(Tc,Ge.workingColorSpace,e);let t=`mat3( ${Tc.elements.map(e=>e.toFixed(4))} )`;switch(Ge.getTransfer(e)){case N:return[t,`LinearTransferOETF`];case P:return[t,`sRGBTransferOETF`];default:return I(`WebGLProgram: Unsupported color space: `,e),[t,`LinearTransferOETF`]}}function Dc(e,t,n){let r=e.getShaderParameter(t,e.COMPILE_STATUS),i=(e.getShaderInfoLog(t)||``).trim();if(r&&i===``)return``;let a=/ERROR: 0:(\d+)/.exec(i);if(a){let r=parseInt(a[1]);return n.toUpperCase()+`

`+i+`

`+wc(e.getShaderSource(t),r)}return i}function Oc(e,t){let n=Ec(t);return[`vec4 ${e}( vec4 value ) {`,`	return ${n[1]}( vec4( value.rgb * ${n[0]}, value.a ) );`,`}`].join(`
`)}var kc={1:`Linear`,2:`Reinhard`,3:`Cineon`,4:`ACESFilmic`,6:`AgX`,7:`Neutral`,5:`Custom`};function Ac(e,t){let n=kc[t];return n===void 0?(I(`WebGLProgram: Unsupported toneMapping:`,t),`vec3 `+e+`( vec3 color ) { return LinearToneMapping( color ); }`):`vec3 `+e+`( vec3 color ) { return `+n+`ToneMapping( color ); }`}var jc=new H;function Mc(){return Ge.getLuminanceCoefficients(jc),[`float luminance( const in vec3 rgb ) {`,`	const vec3 weights = vec3( ${jc.x.toFixed(4)}, ${jc.y.toFixed(4)}, ${jc.z.toFixed(4)} );`,`	return dot( weights, rgb );`,`}`].join(`
`)}function Nc(e){return[e.extensionClipCullDistance?`#extension GL_ANGLE_clip_cull_distance : require`:``,e.extensionMultiDraw?`#extension GL_ANGLE_multi_draw : require`:``].filter(Ic).join(`
`)}function Pc(e){let t=[];for(let n in e){let r=e[n];r!==!1&&t.push(`#define `+n+` `+r)}return t.join(`
`)}function Fc(e,t){let n={},r=e.getProgramParameter(t,e.ACTIVE_ATTRIBUTES);for(let i=0;i<r;i++){let r=e.getActiveAttrib(t,i),a=r.name,o=1;r.type===e.FLOAT_MAT2&&(o=2),r.type===e.FLOAT_MAT3&&(o=3),r.type===e.FLOAT_MAT4&&(o=4),n[a]={type:r.type,location:e.getAttribLocation(t,a),locationSize:o}}return n}function Ic(e){return e!==``}function Lc(e,t){let n=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return e.replace(/NUM_SUN_LIGHTS/g,t.numSunLights).replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,n).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,t.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Rc(e,t){return e.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var zc=/^[ \t]*#include +<([\w\d./]+)>/gm;function Bc(e){return e.replace(zc,Hc)}var Vc=new Map;function Hc(e,t){let n=Y[t];if(n===void 0){let e=Vc.get(t);if(e!==void 0)n=Y[e],I(`WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.`,t,e);else throw Error(`THREE.WebGLProgram: Can not resolve #include <`+t+`>`)}return Bc(n)}var Uc=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Wc(e){return e.replace(Uc,Gc)}function Gc(e,t,n,r){let i=``;for(let e=parseInt(t);e<parseInt(n);e++)i+=r.replace(/\[\s*i\s*\]/g,`[ `+e+` ]`).replace(/UNROLLED_LOOP_INDEX/g,e);return i}function Kc(e){let t=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision===`highp`?t+=`
#define HIGH_PRECISION`:e.precision===`mediump`?t+=`
#define MEDIUM_PRECISION`:e.precision===`lowp`&&(t+=`
#define LOW_PRECISION`),t}var qc={1:`SHADOWMAP_TYPE_PCF`,3:`SHADOWMAP_TYPE_VSM`};function Jc(e){return qc[e.shadowMapType]||`SHADOWMAP_TYPE_BASIC`}var Yc={301:`ENVMAP_TYPE_CUBE`,302:`ENVMAP_TYPE_CUBE`,306:`ENVMAP_TYPE_CUBE_UV`};function Xc(e){return e.envMap===!1?`ENVMAP_TYPE_CUBE`:Yc[e.envMapMode]||`ENVMAP_TYPE_CUBE`}var Zc={302:`ENVMAP_MODE_REFRACTION`};function Qc(e){return e.envMap===!1?`ENVMAP_MODE_REFLECTION`:Zc[e.envMapMode]||`ENVMAP_MODE_REFLECTION`}var $c={0:`ENVMAP_BLENDING_MULTIPLY`,1:`ENVMAP_BLENDING_MIX`,2:`ENVMAP_BLENDING_ADD`};function el(e){return e.envMap===!1?`ENVMAP_BLENDING_NONE`:$c[e.combine]||`ENVMAP_BLENDING_NONE`}function tl(e){let t=e.envMapCubeUVHeight;if(t===null)return null;let n=Math.log2(t)-2,r=1/t;return{texelWidth:1/(3*Math.max(2**n,112)),texelHeight:r,maxMip:n}}function nl(e,t,n,r){let i=e.getContext(),a=n.defines,o=n.vertexShader,s=n.fragmentShader,c=Jc(n),l=Xc(n),u=Qc(n),d=el(n),f=tl(n),p=Nc(n),m=Pc(a),h=i.createProgram(),g,_,v=n.glslVersion?`#version `+n.glslVersion+`
`:``;n.isRawShaderMaterial?(g=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Ic).join(`
`),g.length>0&&(g+=`
`),_=[`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m].filter(Ic).join(`
`),_.length>0&&(_+=`
`)):(g=[Kc(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.extensionClipCullDistance?`#define USE_CLIP_DISTANCE`:``,n.batching?`#define USE_BATCHING`:``,n.batchingColor?`#define USE_BATCHING_COLOR`:``,n.instancing?`#define USE_INSTANCING`:``,n.instancingColor?`#define USE_INSTANCING_COLOR`:``,n.instancingMorph?`#define USE_INSTANCING_MORPH`:``,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.map?`#define USE_MAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+u:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.displacementMap?`#define USE_DISPLACEMENTMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.mapUv?`#define MAP_UV `+n.mapUv:``,n.alphaMapUv?`#define ALPHAMAP_UV `+n.alphaMapUv:``,n.lightMapUv?`#define LIGHTMAP_UV `+n.lightMapUv:``,n.aoMapUv?`#define AOMAP_UV `+n.aoMapUv:``,n.emissiveMapUv?`#define EMISSIVEMAP_UV `+n.emissiveMapUv:``,n.bumpMapUv?`#define BUMPMAP_UV `+n.bumpMapUv:``,n.normalMapUv?`#define NORMALMAP_UV `+n.normalMapUv:``,n.displacementMapUv?`#define DISPLACEMENTMAP_UV `+n.displacementMapUv:``,n.metalnessMapUv?`#define METALNESSMAP_UV `+n.metalnessMapUv:``,n.roughnessMapUv?`#define ROUGHNESSMAP_UV `+n.roughnessMapUv:``,n.anisotropyMapUv?`#define ANISOTROPYMAP_UV `+n.anisotropyMapUv:``,n.clearcoatMapUv?`#define CLEARCOATMAP_UV `+n.clearcoatMapUv:``,n.clearcoatNormalMapUv?`#define CLEARCOAT_NORMALMAP_UV `+n.clearcoatNormalMapUv:``,n.clearcoatRoughnessMapUv?`#define CLEARCOAT_ROUGHNESSMAP_UV `+n.clearcoatRoughnessMapUv:``,n.iridescenceMapUv?`#define IRIDESCENCEMAP_UV `+n.iridescenceMapUv:``,n.iridescenceThicknessMapUv?`#define IRIDESCENCE_THICKNESSMAP_UV `+n.iridescenceThicknessMapUv:``,n.sheenColorMapUv?`#define SHEEN_COLORMAP_UV `+n.sheenColorMapUv:``,n.sheenRoughnessMapUv?`#define SHEEN_ROUGHNESSMAP_UV `+n.sheenRoughnessMapUv:``,n.specularMapUv?`#define SPECULARMAP_UV `+n.specularMapUv:``,n.specularColorMapUv?`#define SPECULAR_COLORMAP_UV `+n.specularColorMapUv:``,n.specularIntensityMapUv?`#define SPECULAR_INTENSITYMAP_UV `+n.specularIntensityMapUv:``,n.transmissionMapUv?`#define TRANSMISSIONMAP_UV `+n.transmissionMapUv:``,n.thicknessMapUv?`#define THICKNESSMAP_UV `+n.thicknessMapUv:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexNormals?`#define HAS_NORMAL`:``,n.vertexColors?`#define USE_COLOR`:``,n.vertexAlphas?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.flatShading?`#define FLAT_SHADED`:``,n.skinning?`#define USE_SKINNING`:``,n.morphTargets?`#define USE_MORPHTARGETS`:``,n.morphNormals&&n.flatShading===!1?`#define USE_MORPHNORMALS`:``,n.morphColors?`#define USE_MORPHCOLORS`:``,n.morphTargetsCount>0?`#define MORPHTARGETS_TEXTURE_STRIDE `+n.morphTextureStride:``,n.morphTargetsCount>0?`#define MORPHTARGETS_COUNT `+n.morphTargetsCount:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.sizeAttenuation?`#define USE_SIZEATTENUATION`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 modelMatrix;`,`uniform mat4 modelViewMatrix;`,`uniform mat4 projectionMatrix;`,`uniform mat4 viewMatrix;`,`uniform mat3 normalMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,`#ifdef USE_INSTANCING`,`	attribute mat4 instanceMatrix;`,`#endif`,`#ifdef USE_INSTANCING_COLOR`,`	attribute vec3 instanceColor;`,`#endif`,`#ifdef USE_INSTANCING_MORPH`,`	uniform sampler2D morphTexture;`,`#endif`,`attribute vec3 position;`,`attribute vec3 normal;`,`attribute vec2 uv;`,`#ifdef USE_UV1`,`	attribute vec2 uv1;`,`#endif`,`#ifdef USE_UV2`,`	attribute vec2 uv2;`,`#endif`,`#ifdef USE_UV3`,`	attribute vec2 uv3;`,`#endif`,`#ifdef USE_TANGENT`,`	attribute vec4 tangent;`,`#endif`,`#if defined( USE_COLOR_ALPHA )`,`	attribute vec4 color;`,`#elif defined( USE_COLOR )`,`	attribute vec3 color;`,`#endif`,`#ifdef USE_SKINNING`,`	attribute vec4 skinIndex;`,`	attribute vec4 skinWeight;`,`#endif`,`
`].filter(Ic).join(`
`),_=[Kc(n),`#define SHADER_TYPE `+n.shaderType,`#define SHADER_NAME `+n.shaderName,m,n.useFog&&n.fog?`#define USE_FOG`:``,n.useFog&&n.fogExp2?`#define FOG_EXP2`:``,n.alphaToCoverage?`#define ALPHA_TO_COVERAGE`:``,n.map?`#define USE_MAP`:``,n.matcap?`#define USE_MATCAP`:``,n.envMap?`#define USE_ENVMAP`:``,n.envMap?`#define `+l:``,n.envMap?`#define `+u:``,n.envMap?`#define `+d:``,f?`#define CUBEUV_TEXEL_WIDTH `+f.texelWidth:``,f?`#define CUBEUV_TEXEL_HEIGHT `+f.texelHeight:``,f?`#define CUBEUV_MAX_MIP `+f.maxMip+`.0`:``,n.lightMap?`#define USE_LIGHTMAP`:``,n.aoMap?`#define USE_AOMAP`:``,n.bumpMap?`#define USE_BUMPMAP`:``,n.normalMap?`#define USE_NORMALMAP`:``,n.normalMapObjectSpace?`#define USE_NORMALMAP_OBJECTSPACE`:``,n.normalMapTangentSpace?`#define USE_NORMALMAP_TANGENTSPACE`:``,n.packedNormalMap?`#define USE_PACKED_NORMALMAP`:``,n.emissiveMap?`#define USE_EMISSIVEMAP`:``,n.anisotropy?`#define USE_ANISOTROPY`:``,n.anisotropyMap?`#define USE_ANISOTROPYMAP`:``,n.clearcoat?`#define USE_CLEARCOAT`:``,n.clearcoatMap?`#define USE_CLEARCOATMAP`:``,n.clearcoatRoughnessMap?`#define USE_CLEARCOAT_ROUGHNESSMAP`:``,n.clearcoatNormalMap?`#define USE_CLEARCOAT_NORMALMAP`:``,n.dispersion?`#define USE_DISPERSION`:``,n.retroreflection?`#define USE_RETROREFLECTION`:``,n.iridescence?`#define USE_IRIDESCENCE`:``,n.iridescenceMap?`#define USE_IRIDESCENCEMAP`:``,n.iridescenceThicknessMap?`#define USE_IRIDESCENCE_THICKNESSMAP`:``,n.specularMap?`#define USE_SPECULARMAP`:``,n.specularColorMap?`#define USE_SPECULAR_COLORMAP`:``,n.specularIntensityMap?`#define USE_SPECULAR_INTENSITYMAP`:``,n.roughnessMap?`#define USE_ROUGHNESSMAP`:``,n.metalnessMap?`#define USE_METALNESSMAP`:``,n.alphaMap?`#define USE_ALPHAMAP`:``,n.alphaTest?`#define USE_ALPHATEST`:``,n.alphaHash?`#define USE_ALPHAHASH`:``,n.sheen?`#define USE_SHEEN`:``,n.sheenColorMap?`#define USE_SHEEN_COLORMAP`:``,n.sheenRoughnessMap?`#define USE_SHEEN_ROUGHNESSMAP`:``,n.transmission?`#define USE_TRANSMISSION`:``,n.transmissionMap?`#define USE_TRANSMISSIONMAP`:``,n.thicknessMap?`#define USE_THICKNESSMAP`:``,n.vertexTangents&&n.flatShading===!1?`#define USE_TANGENT`:``,n.vertexColors||n.instancingColor?`#define USE_COLOR`:``,n.vertexAlphas||n.batchingColor?`#define USE_COLOR_ALPHA`:``,n.vertexUv1s?`#define USE_UV1`:``,n.vertexUv2s?`#define USE_UV2`:``,n.vertexUv3s?`#define USE_UV3`:``,n.pointsUvs?`#define USE_POINTS_UV`:``,n.gradientMap?`#define USE_GRADIENTMAP`:``,n.flatShading?`#define FLAT_SHADED`:``,n.doubleSided?`#define DOUBLE_SIDED`:``,n.flipSided?`#define FLIP_SIDED`:``,n.shadowMapEnabled?`#define USE_SHADOWMAP`:``,n.shadowMapEnabled?`#define `+c:``,n.premultipliedAlpha?`#define PREMULTIPLIED_ALPHA`:``,n.numLightProbes>0?`#define USE_LIGHT_PROBES`:``,n.numLightProbeGrids>0?`#define USE_LIGHT_PROBES_GRID`:``,n.decodeVideoTexture?`#define DECODE_VIDEO_TEXTURE`:``,n.decodeVideoTextureEmissive?`#define DECODE_VIDEO_TEXTURE_EMISSIVE`:``,n.logarithmicDepthBuffer?`#define USE_LOGARITHMIC_DEPTH_BUFFER`:``,n.reversedDepthBuffer?`#define USE_REVERSED_DEPTH_BUFFER`:``,`uniform mat4 viewMatrix;`,`uniform vec3 cameraPosition;`,`uniform bool isOrthographic;`,n.toneMapping===0?``:`#define TONE_MAPPING`,n.toneMapping===0?``:Y.tonemapping_pars_fragment,n.toneMapping===0?``:Ac(`toneMapping`,n.toneMapping),n.dithering?`#define DITHERING`:``,n.opaque?`#define OPAQUE`:``,Y.colorspace_pars_fragment,Oc(`linearToOutputTexel`,n.outputColorSpace),Mc(),n.useDepthPacking?`#define DEPTH_PACKING `+n.depthPacking:``,`
`].filter(Ic).join(`
`)),o=Bc(o),o=Lc(o,n),o=Rc(o,n),s=Bc(s),s=Lc(s,n),s=Rc(s,n),o=Wc(o),s=Wc(s),n.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,g=[p,`#define attribute in`,`#define varying out`,`#define texture2D texture`].join(`
`)+`
`+g,_=[`#define varying in`,n.glslVersion===`300 es`?``:`layout(location = 0) out highp vec4 pc_fragColor;`,n.glslVersion===`300 es`?``:`#define gl_FragColor pc_fragColor`,`#define gl_FragDepthEXT gl_FragDepth`,`#define texture2D texture`,`#define textureCube texture`,`#define texture2DProj textureProj`,`#define texture2DLodEXT textureLod`,`#define texture2DProjLodEXT textureProjLod`,`#define textureCubeLodEXT textureLod`,`#define texture2DGradEXT textureGrad`,`#define texture2DProjGradEXT textureProjGrad`,`#define textureCubeGradEXT textureGrad`].join(`
`)+`
`+_);let y=v+g+o,b=v+_+s,x=xc(i,i.VERTEX_SHADER,y),S=xc(i,i.FRAGMENT_SHADER,b);i.attachShader(h,x),i.attachShader(h,S),n.index0AttributeName===void 0?n.hasPositionAttribute===!0&&i.bindAttribLocation(h,0,`position`):i.bindAttribLocation(h,0,n.index0AttributeName),i.linkProgram(h);function C(t){if(e.debug.checkShaderErrors){let n=i.getProgramInfoLog(h)||``,r=i.getShaderInfoLog(x)||``,a=i.getShaderInfoLog(S)||``,o=n.trim(),s=r.trim(),c=a.trim(),l=!0,u=!0;if(i.getProgramParameter(h,i.LINK_STATUS)===!1){if(l=!1,typeof e.debug.onShaderError==`function`)e.debug.onShaderError(i,h,x,S);else{let e=Dc(i,x,`vertex`),n=Dc(i,S,`fragment`);L(`WebGLProgram: Shader Error `+i.getError()+` - VALIDATE_STATUS `+i.getProgramParameter(h,i.VALIDATE_STATUS)+`

Material Name: `+t.name+`
Material Type: `+t.type+`

Program Info Log: `+o+`
`+e+`
`+n)}}else o===``?(s===``||c===``)&&(u=!1):I(`WebGLProgram: Program Info Log:`,o);u&&(t.diagnostics={runnable:l,programLog:o,vertexShader:{log:s,prefix:g},fragmentShader:{log:c,prefix:_}})}i.deleteShader(x),i.deleteShader(S),w=new bc(i,h),T=Fc(i,h)}let w;this.getUniforms=function(){return w===void 0&&C(this),w};let T;this.getAttributes=function(){return T===void 0&&C(this),T};let E=n.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return E===!1&&(E=i.getProgramParameter(h,Sc)),E},this.destroy=function(){r.releaseStatesOfProgram(this),i.deleteProgram(h),this.program=void 0},this.type=n.shaderType,this.name=n.shaderName,this.id=Cc++,this.cacheKey=t,this.usedTimes=1,this.program=h,this.vertexShader=x,this.fragmentShader=S,this}var rl=0,il=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,n){let r=this._getShaderCacheForMaterial(e);return r.has(t)===!1&&(r.add(t),t.usedTimes++),r.has(n)===!1&&(r.add(n),n.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let e of t)e.usedTimes--,e.usedTimes===0&&this.shaderCache.delete(e.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new al(e),t.set(e,n)),n}},al=class{constructor(e){this.id=rl++,this.code=e,this.usedTimes=0}};function ol(e){return e===1030||e===37490||e===36285}function sl(e,t,n,r,i,a){let o=new _t,s=new il,c=new Set,l=[],u=new Map,d=r.logarithmicDepthBuffer,f=r.precision,p={MeshDepthMaterial:`depth`,MeshDistanceMaterial:`distance`,MeshNormalMaterial:`normal`,MeshBasicMaterial:`basic`,MeshLambertMaterial:`lambert`,MeshPhongMaterial:`phong`,MeshToonMaterial:`toon`,MeshStandardMaterial:`physical`,MeshPhysicalMaterial:`physical`,MeshMatcapMaterial:`matcap`,LineBasicMaterial:`basic`,LineDashedMaterial:`dashed`,PointsMaterial:`points`,ShadowMaterial:`shadow`,SpriteMaterial:`sprite`};function m(e){return c.add(e),e===0?`uv`:`uv${e}`}function h(i,o,l,u,h,g){let _=u.fog,v=h.geometry,y=i.isMeshStandardMaterial||i.isMeshLambertMaterial||i.isMeshPhongMaterial?u.environment:null,b=i.isMeshStandardMaterial||i.isMeshLambertMaterial&&!i.envMap||i.isMeshPhongMaterial&&!i.envMap,x=t.get(i.envMap||y,b),S=x&&x.mapping===306?x.image.height:null,C=p[i.type];i.precision!==null&&(f=r.getMaxPrecision(i.precision),f!==i.precision&&I(`WebGLProgram.getParameters:`,i.precision,`not supported, using`,f,`instead.`));let w=v.morphAttributes.position||v.morphAttributes.normal||v.morphAttributes.color,T=w===void 0?0:w.length,E=0;v.morphAttributes.position!==void 0&&(E=1),v.morphAttributes.normal!==void 0&&(E=2),v.morphAttributes.color!==void 0&&(E=3);let D,O,ee,k;if(C){let e=Oo[C];D=e.vertexShader,O=e.fragmentShader}else{D=i.vertexShader,O=i.fragmentShader;let e=s.getVertexShaderStage(i),t=s.getFragmentShaderStage(i);s.update(i,e,t),ee=e.id,k=t.id}let A=e.getRenderTarget(),j=e.state.buffers.depth.getReversed(),M=h.isInstancedMesh===!0,N=h.isBatchedMesh===!0,P=!!i.map,te=!!i.matcap,F=!!x,ne=!!i.aoMap,re=!!i.lightMap,ie=!!i.bumpMap&&i.wireframe===!1,ae=!!i.normalMap,oe=!!i.displacementMap,se=!!i.emissiveMap,ce=!!i.metalnessMap,le=!!i.roughnessMap,ue=i.anisotropy>0,L=i.clearcoat>0,de=i.dispersion>0,fe=i.retroreflectivity>0,pe=i.iridescence>0,me=i.sheen>0,he=i.transmission>0,ge=ue&&!!i.anisotropyMap,_e=L&&!!i.clearcoatMap,ve=L&&!!i.clearcoatNormalMap,ye=L&&!!i.clearcoatRoughnessMap,R=pe&&!!i.iridescenceMap,be=pe&&!!i.iridescenceThicknessMap,xe=me&&!!i.sheenColorMap,Se=me&&!!i.sheenRoughnessMap,Ce=!!i.specularMap,we=!!i.specularColorMap,Te=!!i.specularIntensityMap,Ee=he&&!!i.transmissionMap,De=he&&!!i.thicknessMap,Oe=!!i.gradientMap,ke=!!i.alphaMap,Ae=i.alphaTest>0,je=!!i.alphaHash,Me=!!i.extensions,Ne=0;i.toneMapped&&(A===null||A.isXRRenderTarget===!0)&&(Ne=e.toneMapping);let Pe={shaderID:C,shaderType:i.type,shaderName:i.name,vertexShader:D,fragmentShader:O,defines:i.defines,customVertexShaderID:ee,customFragmentShaderID:k,isRawShaderMaterial:i.isRawShaderMaterial===!0,glslVersion:i.glslVersion,precision:f,batching:N,batchingColor:N&&h._colorsTexture!==null,instancing:M,instancingColor:M&&h.instanceColor!==null,instancingMorph:M&&h.morphTexture!==null,outputColorSpace:A===null?e.outputColorSpace:A.isXRRenderTarget===!0?A.texture.colorSpace:Ge.workingColorSpace,alphaToCoverage:!!i.alphaToCoverage,map:P,matcap:te,envMap:F,envMapMode:F&&x.mapping,envMapCubeUVHeight:S,aoMap:ne,lightMap:re,bumpMap:ie,normalMap:ae,displacementMap:oe,emissiveMap:se,normalMapObjectSpace:ae&&i.normalMapType===1,normalMapTangentSpace:ae&&i.normalMapType===0,packedNormalMap:ae&&i.normalMapType===0&&ol(i.normalMap.format),metalnessMap:ce,roughnessMap:le,anisotropy:ue,anisotropyMap:ge,clearcoat:L,clearcoatMap:_e,clearcoatNormalMap:ve,clearcoatRoughnessMap:ye,dispersion:de,retroreflection:fe,iridescence:pe,iridescenceMap:R,iridescenceThicknessMap:be,sheen:me,sheenColorMap:xe,sheenRoughnessMap:Se,specularMap:Ce,specularColorMap:we,specularIntensityMap:Te,transmission:he,transmissionMap:Ee,thicknessMap:De,gradientMap:Oe,opaque:i.transparent===!1&&i.blending===1&&i.alphaToCoverage===!1,alphaMap:ke,alphaTest:Ae,alphaHash:je,combine:i.combine,mapUv:P&&m(i.map.channel),aoMapUv:ne&&m(i.aoMap.channel),lightMapUv:re&&m(i.lightMap.channel),bumpMapUv:ie&&m(i.bumpMap.channel),normalMapUv:ae&&m(i.normalMap.channel),displacementMapUv:oe&&m(i.displacementMap.channel),emissiveMapUv:se&&m(i.emissiveMap.channel),metalnessMapUv:ce&&m(i.metalnessMap.channel),roughnessMapUv:le&&m(i.roughnessMap.channel),anisotropyMapUv:ge&&m(i.anisotropyMap.channel),clearcoatMapUv:_e&&m(i.clearcoatMap.channel),clearcoatNormalMapUv:ve&&m(i.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ye&&m(i.clearcoatRoughnessMap.channel),iridescenceMapUv:R&&m(i.iridescenceMap.channel),iridescenceThicknessMapUv:be&&m(i.iridescenceThicknessMap.channel),sheenColorMapUv:xe&&m(i.sheenColorMap.channel),sheenRoughnessMapUv:Se&&m(i.sheenRoughnessMap.channel),specularMapUv:Ce&&m(i.specularMap.channel),specularColorMapUv:we&&m(i.specularColorMap.channel),specularIntensityMapUv:Te&&m(i.specularIntensityMap.channel),transmissionMapUv:Ee&&m(i.transmissionMap.channel),thicknessMapUv:De&&m(i.thicknessMap.channel),alphaMapUv:ke&&m(i.alphaMap.channel),vertexTangents:!!v.attributes.tangent&&(ae||ue),vertexNormals:!!v.attributes.normal,vertexColors:i.vertexColors,vertexAlphas:i.vertexColors===!0&&!!v.attributes.color&&v.attributes.color.itemSize===4,pointsUvs:h.isPoints===!0&&!!v.attributes.uv&&(P||ke),fog:!!_,useFog:i.fog===!0,fogExp2:!!_&&_.isFogExp2,flatShading:i.wireframe===!1&&(i.flatShading===!0||v.attributes.normal===void 0&&ae===!1&&(i.isMeshLambertMaterial||i.isMeshPhongMaterial||i.isMeshStandardMaterial||i.isMeshPhysicalMaterial)),sizeAttenuation:i.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:j,skinning:h.isSkinnedMesh===!0,hasPositionAttribute:v.attributes.position!==void 0,morphTargets:v.morphAttributes.position!==void 0,morphNormals:v.morphAttributes.normal!==void 0,morphColors:v.morphAttributes.color!==void 0,morphTargetsCount:T,morphTextureStride:E,numSunLights:o.sun.length,numDirLights:o.directional.length,numPointLights:o.point.length,numSpotLights:o.spot.length,numSpotLightMaps:o.spotLightMap.length,numRectAreaLights:o.rectArea.length,numHemiLights:o.hemi.length,numSunLightShadows:o.sunShadowMap.length,numDirLightShadows:o.directionalShadowMap.length,numPointLightShadows:o.pointShadowMap.length,numSpotLightShadows:o.spotShadowMap.length,numSpotLightShadowsWithMaps:o.numSpotLightShadowsWithMaps,numLightProbes:o.numLightProbes,numLightProbeGrids:g.length,numClippingPlanes:a.numPlanes,numClipIntersection:a.numIntersection,dithering:i.dithering,shadowMapEnabled:e.shadowMap.enabled&&l.length>0,shadowMapType:e.shadowMap.type,toneMapping:Ne,decodeVideoTexture:P&&i.map.isVideoTexture===!0&&Ge.getTransfer(i.map.colorSpace)===`srgb`,decodeVideoTextureEmissive:se&&i.emissiveMap.isVideoTexture===!0&&Ge.getTransfer(i.emissiveMap.colorSpace)===`srgb`,premultipliedAlpha:i.premultipliedAlpha,doubleSided:i.side===2,flipSided:i.side===1,useDepthPacking:i.depthPacking>=0,depthPacking:i.depthPacking||0,index0AttributeName:i.index0AttributeName,extensionClipCullDistance:Me&&i.extensions.clipCullDistance===!0&&n.has(`WEBGL_clip_cull_distance`),extensionMultiDraw:(Me&&i.extensions.multiDraw===!0||N)&&n.has(`WEBGL_multi_draw`),rendererExtensionParallelShaderCompile:n.has(`KHR_parallel_shader_compile`),customProgramCacheKey:i.customProgramCacheKey()};return Pe.vertexUv1s=c.has(1),Pe.vertexUv2s=c.has(2),Pe.vertexUv3s=c.has(3),c.clear(),Pe}function g(t){let n=[];if(t.shaderID?n.push(t.shaderID):(n.push(t.customVertexShaderID),n.push(t.customFragmentShaderID)),t.defines!==void 0)for(let e in t.defines)n.push(e),n.push(t.defines[e]);return t.isRawShaderMaterial===!1&&(_(n,t),v(n,t),n.push(e.outputColorSpace)),n.push(t.customProgramCacheKey),n.join()}function _(e,t){e.push(t.precision),e.push(t.outputColorSpace),e.push(t.envMapMode),e.push(t.envMapCubeUVHeight),e.push(t.mapUv),e.push(t.alphaMapUv),e.push(t.lightMapUv),e.push(t.aoMapUv),e.push(t.bumpMapUv),e.push(t.normalMapUv),e.push(t.displacementMapUv),e.push(t.emissiveMapUv),e.push(t.metalnessMapUv),e.push(t.roughnessMapUv),e.push(t.anisotropyMapUv),e.push(t.clearcoatMapUv),e.push(t.clearcoatNormalMapUv),e.push(t.clearcoatRoughnessMapUv),e.push(t.iridescenceMapUv),e.push(t.iridescenceThicknessMapUv),e.push(t.sheenColorMapUv),e.push(t.sheenRoughnessMapUv),e.push(t.specularMapUv),e.push(t.specularColorMapUv),e.push(t.specularIntensityMapUv),e.push(t.transmissionMapUv),e.push(t.thicknessMapUv),e.push(t.combine),e.push(t.fogExp2),e.push(t.sizeAttenuation),e.push(t.morphTargetsCount),e.push(t.morphAttributeCount),e.push(t.numSunLights),e.push(t.numDirLights),e.push(t.numPointLights),e.push(t.numSpotLights),e.push(t.numSpotLightMaps),e.push(t.numHemiLights),e.push(t.numRectAreaLights),e.push(t.numSunLightShadows),e.push(t.numDirLightShadows),e.push(t.numPointLightShadows),e.push(t.numSpotLightShadows),e.push(t.numSpotLightShadowsWithMaps),e.push(t.numLightProbes),e.push(t.shadowMapType),e.push(t.toneMapping),e.push(t.numClippingPlanes),e.push(t.numClipIntersection),e.push(t.depthPacking)}function v(e,t){o.disableAll(),t.instancing&&o.enable(0),t.instancingColor&&o.enable(1),t.instancingMorph&&o.enable(2),t.matcap&&o.enable(3),t.envMap&&o.enable(4),t.normalMapObjectSpace&&o.enable(5),t.normalMapTangentSpace&&o.enable(6),t.clearcoat&&o.enable(7),t.iridescence&&o.enable(8),t.alphaTest&&o.enable(9),t.vertexColors&&o.enable(10),t.vertexAlphas&&o.enable(11),t.vertexUv1s&&o.enable(12),t.vertexUv2s&&o.enable(13),t.vertexUv3s&&o.enable(14),t.vertexTangents&&o.enable(15),t.anisotropy&&o.enable(16),t.alphaHash&&o.enable(17),t.batching&&o.enable(18),t.dispersion&&o.enable(19),t.retroreflection&&o.enable(24),t.batchingColor&&o.enable(20),t.gradientMap&&o.enable(21),t.packedNormalMap&&o.enable(22),t.vertexNormals&&o.enable(23),e.push(o.mask),o.disableAll(),t.fog&&o.enable(0),t.useFog&&o.enable(1),t.flatShading&&o.enable(2),t.logarithmicDepthBuffer&&o.enable(3),t.reversedDepthBuffer&&o.enable(4),t.skinning&&o.enable(5),t.morphTargets&&o.enable(6),t.morphNormals&&o.enable(7),t.morphColors&&o.enable(8),t.premultipliedAlpha&&o.enable(9),t.shadowMapEnabled&&o.enable(10),t.doubleSided&&o.enable(11),t.flipSided&&o.enable(12),t.useDepthPacking&&o.enable(13),t.dithering&&o.enable(14),t.transmission&&o.enable(15),t.sheen&&o.enable(16),t.opaque&&o.enable(17),t.pointsUvs&&o.enable(18),t.decodeVideoTexture&&o.enable(19),t.decodeVideoTextureEmissive&&o.enable(20),t.alphaToCoverage&&o.enable(21),t.numLightProbeGrids>0&&o.enable(22),t.hasPositionAttribute&&o.enable(23),e.push(o.mask)}function y(e){let t=p[e.type],n;if(t){let e=Oo[t];n=Wi.clone(e.uniforms)}else n=e.uniforms;return n}function b(t,n){let r=u.get(n);return r===void 0?(r=new nl(e,n,t,i),l.push(r),u.set(n,r)):++r.usedTimes,r}function x(e){if(--e.usedTimes===0){let t=l.indexOf(e);l[t]=l[l.length-1],l.pop(),u.delete(e.cacheKey),e.destroy()}}function S(e){s.remove(e)}function C(){s.dispose()}return{getParameters:h,getProgramCacheKey:g,getUniforms:y,acquireProgram:b,releaseProgram:x,releaseShaderCache:S,programs:l,dispose:C}}function cl(){let e=new WeakMap;function t(t){return e.has(t)}function n(t){let n=e.get(t);return n===void 0&&(n={},e.set(t,n)),n}function r(t){e.delete(t)}function i(t,n,r){e.get(t)[n]=r}function a(){e=new WeakMap}return{has:t,get:n,remove:r,update:i,dispose:a}}function ll(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.material.id===t.material.id?e.materialVariant===t.materialVariant?e.z===t.z?e.id-t.id:e.z-t.z:e.materialVariant-t.materialVariant:e.material.id-t.material.id:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function ul(e,t){return e.groupOrder===t.groupOrder?e.renderOrder===t.renderOrder?e.z===t.z?e.id-t.id:t.z-e.z:e.renderOrder-t.renderOrder:e.groupOrder-t.groupOrder}function dl(){let e=[],t=0,n=[],r=[],i=[];function a(){t=0,n.length=0,r.length=0,i.length=0}function o(e){let t=0;return e.isInstancedMesh&&(t+=2),e.isSkinnedMesh&&(t+=1),t}function s(n,r,i,a,s,c){let l=e[t];return l===void 0?(l={id:n.id,object:n,geometry:r,material:i,materialVariant:o(n),groupOrder:a,renderOrder:n.renderOrder,z:s,group:c},e[t]=l):(l.id=n.id,l.object=n,l.geometry=r,l.material=i,l.materialVariant=o(n),l.groupOrder=a,l.renderOrder=n.renderOrder,l.z=s,l.group=c),t++,l}function c(e,t,a,o,c,l,u){u.reversedDepth===!0&&(c=-c);let d=s(e,t,a,o,c,l);a.transmission>0?r.push(d):a.transparent===!0?i.push(d):n.push(d)}function l(e,t,a,o,c,l){let u=s(e,t,a,o,c,l);a.transmission>0?r.unshift(u):a.transparent===!0?i.unshift(u):n.unshift(u)}function u(e,t){n.length>1&&n.sort(e||ll),r.length>1&&r.sort(t||ul),i.length>1&&i.sort(t||ul)}function d(){for(let n=t,r=e.length;n<r;n++){let t=e[n];if(t.id===null)break;t.id=null,t.object=null,t.geometry=null,t.material=null,t.group=null}}return{opaque:n,transmissive:r,transparent:i,init:a,push:c,unshift:l,finish:d,sort:u}}function fl(){let e=new WeakMap;function t(t,n){let r=e.get(t),i;return r===void 0?(i=new dl,e.set(t,[i])):n>=r.length?(i=new dl,r.push(i)):i=r[n],i}function n(){e=new WeakMap}return{get:t,dispose:n}}function pl(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`SunLight`:case`DirectionalLight`:n={direction:new H,color:new q};break;case`SpotLight`:n={position:new H,direction:new H,color:new q,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case`PointLight`:n={position:new H,color:new q,distance:0,decay:0};break;case`HemisphereLight`:n={direction:new H,skyColor:new q,groundColor:new q};break;case`RectAreaLight`:n={color:new q,position:new H,halfWidth:new H,halfHeight:new H}}return e[t.id]=n,n}}}function ml(){let e={};return{get:function(t){if(e[t.id]!==void 0)return e[t.id];let n;switch(t.type){case`SunLight`:case`DirectionalLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new V};break;case`SpotLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new V};break;case`PointLight`:n={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new V,shadowCameraNear:1,shadowCameraFar:1e3}}return e[t.id]=n,n}}}var hl=0;function gl(e,t){return(t.castShadow?2:0)-(e.castShadow?2:0)+ +!!t.map-!!e.map}function _l(e){let t=new pl,n=ml(),r={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let e=0;e<9;e++)r.probe.push(new H);let i=new H,a=new G,o=new G;function s(i){let a=0,o=0,s=0;for(let e=0;e<9;e++)r.probe[e].set(0,0,0);let c=0,l=0,u=0,d=0,f=0,p=0,m=0,h=0,g=0,_=0,v=0,y=0,b=0,x=0;i.sort(gl);for(let e=0,S=i.length;e<S;e++){let S=i[e],C=S.color,w=S.intensity,T=S.distance,E=null;if(S.shadow&&S.shadow.map&&(E=S.shadow.map.texture.format===1030?S.shadow.map.texture:S.shadow.map.depthTexture||S.shadow.map.texture),S.isAmbientLight)a+=C.r*w,o+=C.g*w,s+=C.b*w;else if(S.isLightProbe){for(let e=0;e<9;e++)r.probe[e].addScaledVector(S.sh.coefficients[e],w);x++}else if(S.isSunLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize.copy(e.mapSize).multiply(e.getFrameExtents()),r.sunShadow[l]=t,r.sunShadowMap[l]=E;let i=e.getViewportCount();for(let t=0;t<i;t++)r.sunShadowMatrix[u+t]=e.getMatrix(t),r.sunShadowCascade[u+t]=e._cascadeData[t];u+=i,l++}r.sun[c]=e,c++}else if(S.isDirectionalLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,r.directionalShadow[d]=t,r.directionalShadowMap[d]=E,r.directionalShadowMatrix[d]=S.shadow.matrix,g++}r.directional[d]=e,d++}else if(S.isSpotLight){let e=t.get(S);e.position.setFromMatrixPosition(S.matrixWorld),e.color.copy(C).multiplyScalar(w),e.distance=T,e.coneCos=Math.cos(S.angle),e.penumbraCos=Math.cos(S.angle*(1-S.penumbra)),e.decay=S.decay,r.spot[p]=e;let i=S.shadow;if(S.map&&(r.spotLightMap[y]=S.map,y++,i.updateMatrices(S),S.castShadow&&b++),r.spotLightMatrix[p]=i.matrix,S.castShadow){let e=n.get(S);e.shadowIntensity=i.intensity,e.shadowBias=i.bias,e.shadowNormalBias=i.normalBias,e.shadowRadius=i.radius,e.shadowMapSize=i.mapSize,r.spotShadow[p]=e,r.spotShadowMap[p]=E,v++}p++}else if(S.isRectAreaLight){let e=t.get(S);e.color.copy(C).multiplyScalar(w),e.halfWidth.set(S.width*.5,0,0),e.halfHeight.set(0,S.height*.5,0),r.rectArea[m]=e,m++}else if(S.isPointLight){let e=t.get(S);if(e.color.copy(S.color).multiplyScalar(S.intensity),e.distance=S.distance,e.decay=S.decay,S.castShadow){let e=S.shadow,t=n.get(S);t.shadowIntensity=e.intensity,t.shadowBias=e.bias,t.shadowNormalBias=e.normalBias,t.shadowRadius=e.radius,t.shadowMapSize=e.mapSize,t.shadowCameraNear=e.camera.near,t.shadowCameraFar=e.camera.far,r.pointShadow[f]=t,r.pointShadowMap[f]=E,r.pointShadowMatrix[f]=S.shadow.matrix,_++}r.point[f]=e,f++}else if(S.isHemisphereLight){let e=t.get(S);e.skyColor.copy(S.color).multiplyScalar(w),e.groundColor.copy(S.groundColor).multiplyScalar(w),r.hemi[h]=e,h++}}m>0&&(e.has(`OES_texture_float_linear`)===!0?(r.rectAreaLTC1=X.LTC_FLOAT_1,r.rectAreaLTC2=X.LTC_FLOAT_2):(r.rectAreaLTC1=X.LTC_HALF_1,r.rectAreaLTC2=X.LTC_HALF_2)),r.ambient[0]=a,r.ambient[1]=o,r.ambient[2]=s;let S=r.hash;(S.sunLength!==c||S.directionalLength!==d||S.pointLength!==f||S.spotLength!==p||S.rectAreaLength!==m||S.hemiLength!==h||S.numSunShadows!==l||S.numDirectionalShadows!==g||S.numPointShadows!==_||S.numSpotShadows!==v||S.numSpotMaps!==y||S.numLightProbes!==x)&&(r.sun.length=c,r.directional.length=d,r.spot.length=p,r.rectArea.length=m,r.point.length=f,r.hemi.length=h,r.sunShadow.length=l,r.sunShadowMap.length=l,r.sunShadowMatrix.length=u,r.sunShadowCascade.length=u,r.directionalShadow.length=g,r.directionalShadowMap.length=g,r.directionalShadowMatrix.length=g,r.pointShadow.length=_,r.pointShadowMap.length=_,r.pointShadowMatrix.length=_,r.spotShadow.length=v,r.spotShadowMap.length=v,r.spotLightMatrix.length=v+y-b,r.spotLightMap.length=y,r.numSpotLightShadowsWithMaps=b,r.numLightProbes=x,S.sunLength=c,S.directionalLength=d,S.pointLength=f,S.spotLength=p,S.rectAreaLength=m,S.hemiLength=h,S.numSunShadows=l,S.numDirectionalShadows=g,S.numPointShadows=_,S.numSpotShadows=v,S.numSpotMaps=y,S.numLightProbes=x,r.version=hl++)}function c(e,t){let n=0,s=0,c=0,l=0,u=0,d=0,f=t.matrixWorldInverse;for(let t=0,p=e.length;t<p;t++){let p=e[t];if(p.isSunLight){let e=r.sun[n];e.direction.setFromMatrixPosition(p.matrixWorld),e.direction.transformDirection(f),n++}else if(p.isDirectionalLight){let e=r.directional[s];e.direction.setFromMatrixPosition(p.matrixWorld),i.setFromMatrixPosition(p.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(f),s++}else if(p.isSpotLight){let e=r.spot[l];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),e.direction.setFromMatrixPosition(p.matrixWorld),i.setFromMatrixPosition(p.target.matrixWorld),e.direction.sub(i),e.direction.transformDirection(f),l++}else if(p.isRectAreaLight){let e=r.rectArea[u];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),o.identity(),a.copy(p.matrixWorld),a.premultiply(f),o.extractRotation(a),e.halfWidth.set(p.width*.5,0,0),e.halfHeight.set(0,p.height*.5,0),e.halfWidth.applyMatrix4(o),e.halfHeight.applyMatrix4(o),u++}else if(p.isPointLight){let e=r.point[c];e.position.setFromMatrixPosition(p.matrixWorld),e.position.applyMatrix4(f),c++}else if(p.isHemisphereLight){let e=r.hemi[d];e.direction.setFromMatrixPosition(p.matrixWorld),e.direction.transformDirection(f),d++}}}return{setup:s,setupView:c,state:r}}function vl(e){let t=new _l(e),n=[],r=[],i=[];function a(e){d.camera=e,n.length=0,r.length=0,i.length=0}function o(e){n.push(e)}function s(e){r.push(e)}function c(e){i.push(e)}function l(){t.setup(n)}function u(e){t.setupView(n,e)}let d={lightsArray:n,shadowsArray:r,lightProbeGridArray:i,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:a,state:d,setupLights:l,setupLightsView:u,pushLight:o,pushShadow:s,pushLightProbeGrid:c}}function yl(e){let t=new WeakMap;function n(n,r=0){let i=t.get(n),a;return i===void 0?(a=new vl(e),t.set(n,[a])):r>=i.length?(a=new vl(e),i.push(a)):a=i[r],a}function r(){t=new WeakMap}return{get:n,dispose:r}}var bl=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,xl=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,Sl=[new H(1,0,0),new H(-1,0,0),new H(0,1,0),new H(0,-1,0),new H(0,0,1),new H(0,0,-1)],Cl=[new H(0,-1,0),new H(0,-1,0),new H(0,0,1),new H(0,0,-1),new H(0,-1,0),new H(0,-1,0)],wl=new G,Tl=new H,El=new H;function Dl(e,t,n){let i=new ti,a=new V,s=new V,c=new nt,l=new Zi,u=new Qi,m={},h=n.maxTextureSize,g={0:1,1:0,2:2},_=new qi({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new V},radius:{value:4}},vertexShader:bl,fragmentShader:xl}),y=_.clone();y.defines.HORIZONTAL_PASS=1;let b=new Ln;b.setAttribute(`position`,new Sn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let x=new J(b,_),C=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=1;let w=this.type;this.render=function(t,n,l){if(C.enabled===!1||C.autoUpdate===!1&&C.needsUpdate===!1||t.length===0)return;this.type===2&&(I(`WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.`),this.type=1);let u=e.getRenderTarget(),m=e.getActiveCubeFace(),g=e.getActiveMipmapLevel(),_=e.state;_.setBlending(0),_.buffers.depth.getReversed()===!0?_.buffers.color.setClear(0,0,0,0):_.buffers.color.setClear(1,1,1,1),_.buffers.depth.setTest(!0),_.setScissorTest(!1);let y=w!==this.type;y&&n.traverse(function(e){e.material&&(Array.isArray(e.material)?e.material.forEach(e=>e.needsUpdate=!0):e.material.needsUpdate=!0)});for(let u=0,m=t.length;u<m;u++){let m=t[u],g=m.shadow;if(g===void 0){I(`WebGLShadowMap:`,m,`has no shadow.`);continue}if(g.autoUpdate===!1&&g.needsUpdate===!1)continue;a.copy(g.mapSize);let b=g.getFrameExtents();a.multiply(b),s.copy(g.mapSize),(a.x>h||a.y>h)&&(a.x>h&&(s.x=Math.floor(h/b.x),a.x=s.x*b.x,g.mapSize.x=s.x),a.y>h&&(s.y=Math.floor(h/b.y),a.y=s.y*b.y,g.mapSize.y=s.y));let x=e.state.buffers.depth.getReversed();if(g.camera._reversedDepth=x,g.map===null||y===!0){if(g.map!==null&&(g.map.depthTexture!==null&&(g.map.depthTexture.dispose(),g.map.depthTexture=null),g.map.dispose()),this.type===3){if(m.isPointLight){I(`WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.`);continue}g.map=new it(a.x,a.y,{format:S,type:p,minFilter:o,magFilter:o,generateMipmaps:!1}),g.map.texture.name=m.name+`.shadowMap`,g.map.depthTexture=new Ti(a.x,a.y,f),g.map.depthTexture.name=m.name+`.shadowMapDepth`,g.map.depthTexture.format=v,g.map.depthTexture.compareFunction=null,g.map.depthTexture.minFilter=r,g.map.depthTexture.magFilter=r}else m.isPointLight?(g.map=new is(a.x),g.map.depthTexture=new Ei(a.x,d)):(g.map=new it(a.x,a.y),g.map.depthTexture=new Ti(a.x,a.y,d)),g.map.depthTexture.name=m.name+`.shadowMap`,g.map.depthTexture.format=v,this.type===1?(g.map.depthTexture.compareFunction=x?518:515,g.map.depthTexture.minFilter=o,g.map.depthTexture.magFilter=o):(g.map.depthTexture.compareFunction=null,g.map.depthTexture.minFilter=r,g.map.depthTexture.magFilter=r);g.camera.updateProjectionMatrix()}g.map.isWebGLCubeRenderTarget!==!0&&(g.map.width!==a.x||g.map.height!==a.y)&&g.map.setSize(a.x,a.y);let C=g.map.isWebGLCubeRenderTarget?6:g.getViewportCount();m.isPointLight!==!0&&g.updateMatrices(m,l);for(let t=0;t<C;t++){let r=g.getCamera(t);if(m.isPointLight){let e=g.camera,n=g.matrix,r=m.distance||e.far;r!==e.far&&(e.far=r,e.updateProjectionMatrix()),Tl.setFromMatrixPosition(m.matrixWorld),e.position.copy(Tl),El.copy(e.position),El.add(Sl[t]),e.up.copy(Cl[t]),e.lookAt(El),e.updateMatrixWorld(),n.makeTranslation(-Tl.x,-Tl.y,-Tl.z),wl.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),g._frustum.setFromProjectionMatrix(wl,e.coordinateSystem,e.reversedDepth)}if(g.map.isWebGLCubeRenderTarget)e.setRenderTarget(g.map,t),e.clear();else{t===0&&(e.setRenderTarget(g.map),e.clear());let n=g.getViewport(t);c.set(s.x*n.x,s.y*n.y,s.x*n.z,s.y*n.w),_.viewport(c)}i=g.getFrustum(t),D(n,l,r,m,this.type)}g.isPointLightShadow!==!0&&this.type===3&&T(g,l),g.needsUpdate=!1}w=this.type,C.needsUpdate=!1,e.setRenderTarget(u,m,g)};function T(n,r){let i=t.update(x);_.defines.VSM_SAMPLES!==n.blurSamples&&(_.defines.VSM_SAMPLES=n.blurSamples,y.defines.VSM_SAMPLES=n.blurSamples,_.needsUpdate=!0,y.needsUpdate=!0),n.mapPass===null?n.mapPass=new it(a.x,a.y,{format:S,type:p}):(n.mapPass.width!==n.map.width||n.mapPass.height!==n.map.height)&&n.mapPass.setSize(n.map.width,n.map.height),_.uniforms.shadow_pass.value=n.map.depthTexture,_.uniforms.resolution.value.set(n.map.width,n.map.height),_.uniforms.radius.value=n.radius,e.setRenderTarget(n.mapPass),e.clear(),e.renderBufferDirect(r,null,i,_,x,null),y.uniforms.shadow_pass.value=n.mapPass.texture,y.uniforms.resolution.value.set(n.map.width,n.map.height),y.uniforms.radius.value=n.radius,e.setRenderTarget(n.map),e.clear(),e.renderBufferDirect(r,null,i,y,x,null)}function E(t,n,r,i){let a=null,o=r.isPointLight===!0?t.customDistanceMaterial:t.customDepthMaterial;if(o!==void 0)a=o;else if(a=r.isPointLight===!0?u:l,e.localClippingEnabled&&n.clipShadows===!0&&Array.isArray(n.clippingPlanes)&&n.clippingPlanes.length!==0||n.displacementMap&&n.displacementScale!==0||n.alphaMap&&n.alphaTest>0||n.map&&n.alphaTest>0||n.alphaToCoverage===!0){let e=a.uuid,t=n.uuid,r=m[e];r===void 0&&(r={},m[e]=r);let i=r[t];i===void 0&&(i=a.clone(),r[t]=i,n.addEventListener(`dispose`,O)),a=i}if(a.visible=n.visible,a.wireframe=n.wireframe,i===3?a.side=n.shadowSide===null?n.side:n.shadowSide:a.side=n.shadowSide===null?g[n.side]:n.shadowSide,a.alphaMap=n.alphaMap,a.alphaTest=n.alphaToCoverage===!0?.5:n.alphaTest,a.map=n.map,a.clipShadows=n.clipShadows,a.clippingPlanes=n.clippingPlanes,a.clipIntersection=n.clipIntersection,a.displacementMap=n.displacementMap,a.displacementScale=n.displacementScale,a.displacementBias=n.displacementBias,a.wireframeLinewidth=n.wireframeLinewidth,a.linewidth=n.linewidth,r.isPointLight===!0&&a.isMeshDistanceMaterial===!0){let t=e.properties.get(a);t.light=r}return a}function D(n,r,a,o,s){if(n.visible===!1)return;if(n.layers.test(r.layers)&&(n.isMesh||n.isLine||n.isPoints)&&(n.castShadow||n.receiveShadow&&s===3)&&(!n.frustumCulled||n.intersectsFrustum(i))){n.modelViewMatrix.multiplyMatrices(a.matrixWorldInverse,n.matrixWorld);let i=t.update(n),c=n.material;if(Array.isArray(c)){let t=i.groups;for(let l=0,u=t.length;l<u;l++){let u=t[l],d=c[u.materialIndex];if(d&&d.visible){let t=E(n,d,o,s);n.onBeforeShadow(e,n,r,a,i,t,u),e.renderBufferDirect(a,null,i,t,n,u),n.onAfterShadow(e,n,r,a,i,t,u)}}}else if(c.visible){let t=E(n,c,o,s);n.onBeforeShadow(e,n,r,a,i,t,null),e.renderBufferDirect(a,null,i,t,n,null),n.onAfterShadow(e,n,r,a,i,t,null)}}let c=n.children;for(let e=0,t=c.length;e<t;e++)D(c[e],r,a,o,s)}function O(e){e.target.removeEventListener(`dispose`,O);for(let t in m){let n=m[t],r=e.target.uuid;r in n&&(n[r].dispose(),delete n[r])}}}function Ol(e,t){function n(){let t=!1,n=new nt,r=null,i=new nt(0,0,0,0);return{setMask:function(n){r!==n&&!t&&(e.colorMask(n,n,n,n),r=n)},setLocked:function(e){t=e},setClear:function(t,r,a,o,s){s===!0&&(t*=o,r*=o,a*=o),n.set(t,r,a,o),i.equals(n)===!1&&(e.clearColor(t,r,a,o),i.copy(n))},reset:function(){t=!1,r=null,i.set(-1,0,0,0)}}}function r(){let n=!1,r=!1,i=null,a=null,o=null;return{setReversed:function(e){if(r!==e){let n=t.get(`EXT_clip_control`);e?n.clipControlEXT(n.LOWER_LEFT_EXT,n.ZERO_TO_ONE_EXT):n.clipControlEXT(n.LOWER_LEFT_EXT,n.NEGATIVE_ONE_TO_ONE_EXT),r=e;let i=o;o=null,this.setClear(i)}},getReversed:function(){return r},setTest:function(t){t?ce(e.DEPTH_TEST):le(e.DEPTH_TEST)},setMask:function(t){i!==t&&!n&&(e.depthMask(t),i=t)},setFunc:function(t){if(r&&(t=pe[t]),a!==t){switch(t){case 0:e.depthFunc(e.NEVER);break;case 1:e.depthFunc(e.ALWAYS);break;case 2:e.depthFunc(e.LESS);break;case 3:e.depthFunc(e.LEQUAL);break;case 4:e.depthFunc(e.EQUAL);break;case 5:e.depthFunc(e.GEQUAL);break;case 6:e.depthFunc(e.GREATER);break;case 7:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}a=t}},setLocked:function(e){n=e},setClear:function(t){o!==t&&(o=t,r&&(t=1-t),e.clearDepth(t))},reset:function(){n=!1,i=null,a=null,o=null,r=!1}}}function i(){let t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null;return{setTest:function(n){t||(n?ce(e.STENCIL_TEST):le(e.STENCIL_TEST))},setMask:function(r){n!==r&&!t&&(e.stencilMask(r),n=r)},setFunc:function(t,n,o){(r!==t||i!==n||a!==o)&&(e.stencilFunc(t,n,o),r=t,i=n,a=o)},setOp:function(t,n,r){(o!==t||s!==n||c!==r)&&(e.stencilOp(t,n,r),o=t,s=n,c=r)},setLocked:function(e){t=e},setClear:function(t){l!==t&&(e.clearStencil(t),l=t)},reset:function(){t=!1,n=null,r=null,i=null,a=null,o=null,s=null,c=null,l=null}}}let a=new n,o=new r,s=new i,c=new WeakMap,l=new WeakMap,u={},d={},f={},p=new WeakMap,m=[],h=null,g=!1,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=new q(0,0,0),T=0,E=!1,D=null,O=null,ee=null,k=null,A=null,j=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS),M=!1,N=0,P=e.getParameter(e.VERSION);P.indexOf(`WebGL`)===-1?P.indexOf(`OpenGL ES`)!==-1&&(N=parseFloat(/^OpenGL ES (\d)/.exec(P)[1]),M=N>=2):(N=parseFloat(/^WebGL (\d)/.exec(P)[1]),M=N>=1);let te=null,F={},ne=e.getParameter(e.SCISSOR_BOX),re=e.getParameter(e.VIEWPORT),ie=new nt().fromArray(ne),ae=new nt().fromArray(re);function oe(t,n,r,i){let a=new Uint8Array(4),o=e.createTexture();e.bindTexture(t,o),e.texParameteri(t,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(t,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let o=0;o<r;o++)t===e.TEXTURE_3D||t===e.TEXTURE_2D_ARRAY?e.texImage3D(n,0,e.RGBA,1,1,i,0,e.RGBA,e.UNSIGNED_BYTE,a):e.texImage2D(n+o,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,a);return o}let se={};se[e.TEXTURE_2D]=oe(e.TEXTURE_2D,e.TEXTURE_2D,1),se[e.TEXTURE_CUBE_MAP]=oe(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),se[e.TEXTURE_2D_ARRAY]=oe(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),se[e.TEXTURE_3D]=oe(e.TEXTURE_3D,e.TEXTURE_3D,1,1),a.setClear(0,0,0,1),o.setClear(1),s.setClear(0),ce(e.DEPTH_TEST),o.setFunc(3),_e(!1),ve(1),ce(e.CULL_FACE),he(0);function ce(t){u[t]!==!0&&(e.enable(t),u[t]=!0)}function le(t){u[t]!==!1&&(e.disable(t),u[t]=!1)}function ue(t,n){return f[t]!==n&&(e.bindFramebuffer(t,n),f[t]=n,t===e.DRAW_FRAMEBUFFER&&(f[e.FRAMEBUFFER]=n),t===e.FRAMEBUFFER&&(f[e.DRAW_FRAMEBUFFER]=n),!0)}function I(t,n){let r=m,i=!1;if(t){r=p.get(n),r===void 0&&(r=[],p.set(n,r));let a=t.textures;if(r.length!==a.length||r[0]!==e.COLOR_ATTACHMENT0){for(let t=0,n=a.length;t<n;t++)r[t]=e.COLOR_ATTACHMENT0+t;r.length=a.length,i=!0}}else r[0]!==e.BACK&&(r[0]=e.BACK,i=!0);i&&e.drawBuffers(r)}function de(t){return h!==t&&(e.useProgram(t),h=t,!0)}let fe={100:e.FUNC_ADD,101:e.FUNC_SUBTRACT,102:e.FUNC_REVERSE_SUBTRACT};fe[103]=e.MIN,fe[104]=e.MAX;let me={200:e.ZERO,201:e.ONE,202:e.SRC_COLOR,204:e.SRC_ALPHA,210:e.SRC_ALPHA_SATURATE,208:e.DST_COLOR,206:e.DST_ALPHA,203:e.ONE_MINUS_SRC_COLOR,205:e.ONE_MINUS_SRC_ALPHA,209:e.ONE_MINUS_DST_COLOR,207:e.ONE_MINUS_DST_ALPHA,211:e.CONSTANT_COLOR,212:e.ONE_MINUS_CONSTANT_COLOR,213:e.CONSTANT_ALPHA,214:e.ONE_MINUS_CONSTANT_ALPHA};function he(t,n,r,i,a,o,s,c,l,u){if(t===0){g===!0&&(le(e.BLEND),g=!1);return}if(g===!1&&(ce(e.BLEND),g=!0),t!==5){if(t!==_||u!==E){if((v!==100||x!==100)&&(e.blendEquation(e.FUNC_ADD),v=100,x=100),u)switch(t){case 1:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFunc(e.ONE,e.ONE);break;case 3:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case 4:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:L(`WebGLState: Invalid blending: `,t)}else switch(t){case 1:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case 2:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case 3:L(`WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true`);break;case 4:L(`WebGLState: MultiplyBlending requires material.premultipliedAlpha = true`);break;default:L(`WebGLState: Invalid blending: `,t)}y=null,b=null,S=null,C=null,w.set(0,0,0),T=0,_=t,E=u}return}a||=n,o||=r,s||=i,(n!==v||a!==x)&&(e.blendEquationSeparate(fe[n],fe[a]),v=n,x=a),(r!==y||i!==b||o!==S||s!==C)&&(e.blendFuncSeparate(me[r],me[i],me[o],me[s]),y=r,b=i,S=o,C=s),(c.equals(w)===!1||l!==T)&&(e.blendColor(c.r,c.g,c.b,l),w.copy(c),T=l),_=t,E=!1}function ge(t,n){t.side===2?le(e.CULL_FACE):ce(e.CULL_FACE);let r=t.side===1;n&&(r=!r),_e(r),t.blending===1&&t.transparent===!1?he(0):he(t.blending,t.blendEquation,t.blendSrc,t.blendDst,t.blendEquationAlpha,t.blendSrcAlpha,t.blendDstAlpha,t.blendColor,t.blendAlpha,t.premultipliedAlpha),o.setFunc(t.depthFunc),o.setTest(t.depthTest),o.setMask(t.depthWrite),a.setMask(t.colorWrite);let i=t.stencilWrite;s.setTest(i),i&&(s.setMask(t.stencilWriteMask),s.setFunc(t.stencilFunc,t.stencilRef,t.stencilFuncMask),s.setOp(t.stencilFail,t.stencilZFail,t.stencilZPass)),R(t.polygonOffset,t.polygonOffsetFactor,t.polygonOffsetUnits),t.alphaToCoverage===!0?ce(e.SAMPLE_ALPHA_TO_COVERAGE):le(e.SAMPLE_ALPHA_TO_COVERAGE)}function _e(t){D!==t&&(t?e.frontFace(e.CW):e.frontFace(e.CCW),D=t)}function ve(t){t===0?le(e.CULL_FACE):(ce(e.CULL_FACE),t!==O&&(t===1?e.cullFace(e.BACK):t===2?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))),O=t}function ye(t){t!==ee&&(M&&e.lineWidth(t),ee=t)}function R(t,n,r){t?(ce(e.POLYGON_OFFSET_FILL),(k!==n||A!==r)&&(k=n,A=r,o.getReversed()&&(n=-n),e.polygonOffset(n,r))):le(e.POLYGON_OFFSET_FILL)}function be(t){t?ce(e.SCISSOR_TEST):le(e.SCISSOR_TEST)}function xe(t){t===void 0&&(t=e.TEXTURE0+j-1),te!==t&&(e.activeTexture(t),te=t)}function Se(t,n,r){r===void 0&&(r=te===null?e.TEXTURE0+j-1:te);let i=F[r];i===void 0&&(i={type:void 0,texture:void 0},F[r]=i),(i.type!==t||i.texture!==n)&&(te!==r&&(e.activeTexture(r),te=r),e.bindTexture(t,n||se[t]),i.type=t,i.texture=n)}function Ce(){let t=F[te];t!==void 0&&t.type!==void 0&&(e.bindTexture(t.type,null),t.type=void 0,t.texture=void 0)}function we(){try{e.compressedTexImage2D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Te(){try{e.compressedTexImage3D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Ee(){try{e.texSubImage2D(...arguments)}catch(e){L(`WebGLState:`,e)}}function De(){try{e.texSubImage3D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Oe(){try{e.compressedTexSubImage2D(...arguments)}catch(e){L(`WebGLState:`,e)}}function ke(){try{e.compressedTexSubImage3D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Ae(){try{e.texStorage2D(...arguments)}catch(e){L(`WebGLState:`,e)}}function je(){try{e.texStorage3D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Me(){try{e.texImage2D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Ne(){try{e.texImage3D(...arguments)}catch(e){L(`WebGLState:`,e)}}function Pe(t){return d[t]===void 0?e.getParameter(t):d[t]}function Fe(t,n){d[t]!==n&&(e.pixelStorei(t,n),d[t]=n)}function Ie(t){ie.equals(t)===!1&&(e.scissor(t.x,t.y,t.z,t.w),ie.copy(t))}function z(t){ae.equals(t)===!1&&(e.viewport(t.x,t.y,t.z,t.w),ae.copy(t))}function Le(t,n){let r=l.get(n);r===void 0&&(r=new WeakMap,l.set(n,r));let i=r.get(t);i===void 0&&(i=e.getUniformBlockIndex(n,t.name),r.set(t,i))}function B(t,n){let r=l.get(n).get(t);c.get(n)!==r&&(e.uniformBlockBinding(n,r,t.__bindingPointIndex),c.set(n,r))}function Re(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),o.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),u={},d={},te=null,F={},f={},p=new WeakMap,m=[],h=null,g=!1,_=null,v=null,y=null,b=null,x=null,S=null,C=null,w=new q(0,0,0),T=0,E=!1,D=null,O=null,ee=null,k=null,A=null,ie.set(0,0,e.canvas.width,e.canvas.height),ae.set(0,0,e.canvas.width,e.canvas.height),a.reset(),o.reset(),s.reset()}return{buffers:{color:a,depth:o,stencil:s},enable:ce,disable:le,bindFramebuffer:ue,drawBuffers:I,useProgram:de,setBlending:he,setMaterial:ge,setFlipSided:_e,setCullFace:ve,setLineWidth:ye,setPolygonOffset:R,setScissorTest:be,activeTexture:xe,bindTexture:Se,unbindTexture:Ce,compressedTexImage2D:we,compressedTexImage3D:Te,texImage2D:Me,texImage3D:Ne,pixelStorei:Fe,getParameter:Pe,updateUBOMapping:Le,uniformBlockBinding:B,texStorage2D:Ae,texStorage3D:je,texSubImage2D:Ee,texSubImage3D:De,compressedTexSubImage2D:Oe,compressedTexSubImage3D:ke,scissor:Ie,viewport:z,reset:Re}}function kl(l,u,d,f,p,m,h){let g=u.has(`WEBGL_multisampled_render_to_texture`)?u.get(`WEBGL_multisampled_render_to_texture`):null,_=typeof navigator>`u`?!1:/OculusBrowser/g.test(navigator.userAgent),v=new V,b=new WeakMap,x=new Set,S,C=new WeakMap,w=!1;try{w=typeof OffscreenCanvas<`u`&&new OffscreenCanvas(1,1).getContext(`2d`)!==null}catch{}function T(e,t){return w?new OffscreenCanvas(e,t):oe(`canvas`)}function E(e,t,n){let r=1,i=Ie(e);if((i.width>n||i.height>n)&&(r=n/Math.max(i.width,i.height)),r<1){if(typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<`u`&&e instanceof HTMLCanvasElement||typeof ImageBitmap<`u`&&e instanceof ImageBitmap||typeof VideoFrame<`u`&&e instanceof VideoFrame){let n=Math.floor(r*i.width),a=Math.floor(r*i.height);S===void 0&&(S=T(n,a));let o=t?T(n,a):S;return o.width=n,o.height=a,o.getContext(`2d`).drawImage(e,0,0,n,a),I(`WebGLRenderer: Texture has been resized from (`+i.width+`x`+i.height+`) to (`+n+`x`+a+`).`),o}return`data`in e&&I(`WebGLRenderer: Image in DataTexture is too big (`+i.width+`x`+i.height+`).`),e}return e}function D(e){return e.generateMipmaps}function O(e){l.generateMipmap(e)}function ee(e){return e.isWebGLCubeRenderTarget?l.TEXTURE_CUBE_MAP:e.isWebGL3DRenderTarget?l.TEXTURE_3D:e.isWebGLArrayRenderTarget||e.isCompressedArrayTexture?l.TEXTURE_2D_ARRAY:l.TEXTURE_2D}function k(e,t,n,r,i,a=!1){if(e!==null){if(l[e]!==void 0)return l[e];I(`WebGLRenderer: Attempt to use non-existing WebGL internal format '`+e+`'`)}let o;r&&(o=u.get(`EXT_texture_norm16`),o||I(`WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension`));let s=t;if(t===l.RED&&(n===l.FLOAT&&(s=l.R32F),n===l.HALF_FLOAT&&(s=l.R16F),n===l.UNSIGNED_BYTE&&(s=l.R8),n===l.UNSIGNED_SHORT&&o&&(s=o.R16_EXT),n===l.SHORT&&o&&(s=o.R16_SNORM_EXT)),t===l.RED_INTEGER&&(n===l.UNSIGNED_BYTE&&(s=l.R8UI),n===l.UNSIGNED_SHORT&&(s=l.R16UI),n===l.UNSIGNED_INT&&(s=l.R32UI),n===l.BYTE&&(s=l.R8I),n===l.SHORT&&(s=l.R16I),n===l.INT&&(s=l.R32I)),t===l.RG&&(n===l.FLOAT&&(s=l.RG32F),n===l.HALF_FLOAT&&(s=l.RG16F),n===l.UNSIGNED_BYTE&&(s=l.RG8),n===l.UNSIGNED_SHORT&&o&&(s=o.RG16_EXT),n===l.SHORT&&o&&(s=o.RG16_SNORM_EXT)),t===l.RG_INTEGER&&(n===l.UNSIGNED_BYTE&&(s=l.RG8UI),n===l.UNSIGNED_SHORT&&(s=l.RG16UI),n===l.UNSIGNED_INT&&(s=l.RG32UI),n===l.BYTE&&(s=l.RG8I),n===l.SHORT&&(s=l.RG16I),n===l.INT&&(s=l.RG32I)),t===l.RGB_INTEGER&&(n===l.UNSIGNED_BYTE&&(s=l.RGB8UI),n===l.UNSIGNED_SHORT&&(s=l.RGB16UI),n===l.UNSIGNED_INT&&(s=l.RGB32UI),n===l.BYTE&&(s=l.RGB8I),n===l.SHORT&&(s=l.RGB16I),n===l.INT&&(s=l.RGB32I)),t===l.RGBA_INTEGER&&(n===l.UNSIGNED_BYTE&&(s=l.RGBA8UI),n===l.UNSIGNED_SHORT&&(s=l.RGBA16UI),n===l.UNSIGNED_INT&&(s=l.RGBA32UI),n===l.BYTE&&(s=l.RGBA8I),n===l.SHORT&&(s=l.RGBA16I),n===l.INT&&(s=l.RGBA32I)),t===l.RGB&&(n===l.UNSIGNED_SHORT&&o&&(s=o.RGB16_EXT),n===l.SHORT&&o&&(s=o.RGB16_SNORM_EXT),n===l.UNSIGNED_INT_5_9_9_9_REV&&(s=l.RGB9_E5),n===l.UNSIGNED_INT_10F_11F_11F_REV&&(s=l.R11F_G11F_B10F)),t===l.RGBA){let e=a?N:Ge.getTransfer(i);n===l.FLOAT&&(s=l.RGBA32F),n===l.HALF_FLOAT&&(s=l.RGBA16F),n===l.UNSIGNED_BYTE&&(s=e===`srgb`?l.SRGB8_ALPHA8:l.RGBA8),n===l.UNSIGNED_SHORT&&o&&(s=o.RGBA16_EXT),n===l.SHORT&&o&&(s=o.RGBA16_SNORM_EXT),n===l.UNSIGNED_SHORT_4_4_4_4&&(s=l.RGBA4),n===l.UNSIGNED_SHORT_5_5_5_1&&(s=l.RGB5_A1)}return(s===l.R16F||s===l.R32F||s===l.RG16F||s===l.RG32F||s===l.RGBA16F||s===l.RGBA32F)&&u.get(`EXT_color_buffer_float`),s}function A(e,t){let n;return e?t===null||t===1014||t===1020?n=l.DEPTH24_STENCIL8:t===1015?n=l.DEPTH32F_STENCIL8:t===1012&&(n=l.DEPTH24_STENCIL8,I(`DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.`)):t===null||t===1014||t===1020?n=l.DEPTH_COMPONENT24:t===1015?n=l.DEPTH_COMPONENT32F:t===1012&&(n=l.DEPTH_COMPONENT16),n}function j(e,t){return D(e)===!0||e.isFramebufferTexture&&e.minFilter!==1003&&e.minFilter!==1006?Math.log2(Math.max(t.width,t.height))+1:e.mipmaps!==void 0&&e.mipmaps.length>0?e.mipmaps.length:e.isCompressedTexture&&Array.isArray(e.image)?t.mipmaps.length:1}function M(e){let t=e.target;t.removeEventListener(`dispose`,M),te(t),t.isVideoTexture&&b.delete(t),t.isHTMLTexture&&x.delete(t)}function P(e){let t=e.target;t.removeEventListener(`dispose`,P),ne(t)}function te(e){let t=f.get(e);if(t.__webglInit===void 0)return;let n=e.source,r=C.get(n);if(r){let i=r[t.__cacheKey];i.usedTimes--,i.usedTimes===0&&F(e),Object.keys(r).length===0&&C.delete(n)}f.remove(e)}function F(e){let t=f.get(e);l.deleteTexture(t.__webglTexture);let n=e.source,r=C.get(n);delete r[t.__cacheKey],h.memory.textures--}function ne(e){let t=f.get(e);if(e.depthTexture&&(e.depthTexture.dispose(),f.remove(e.depthTexture)),e.isWebGLCubeRenderTarget)for(let e=0;e<6;e++){if(Array.isArray(t.__webglFramebuffer[e]))for(let n=0;n<t.__webglFramebuffer[e].length;n++)l.deleteFramebuffer(t.__webglFramebuffer[e][n]);else l.deleteFramebuffer(t.__webglFramebuffer[e]);t.__webglDepthbuffer&&l.deleteRenderbuffer(t.__webglDepthbuffer[e])}else{if(Array.isArray(t.__webglFramebuffer))for(let e=0;e<t.__webglFramebuffer.length;e++)l.deleteFramebuffer(t.__webglFramebuffer[e]);else l.deleteFramebuffer(t.__webglFramebuffer);if(t.__webglDepthbuffer&&l.deleteRenderbuffer(t.__webglDepthbuffer),t.__webglMultisampledFramebuffer&&l.deleteFramebuffer(t.__webglMultisampledFramebuffer),t.__webglColorRenderbuffer)for(let e=0;e<t.__webglColorRenderbuffer.length;e++)t.__webglColorRenderbuffer[e]&&l.deleteRenderbuffer(t.__webglColorRenderbuffer[e]);t.__webglDepthRenderbuffer&&l.deleteRenderbuffer(t.__webglDepthRenderbuffer)}let n=e.textures;for(let e=0,t=n.length;e<t;e++){let t=f.get(n[e]);t.__webglTexture&&(l.deleteTexture(t.__webglTexture),h.memory.textures--),f.remove(n[e])}f.remove(e)}let re=0;function ie(){re=0}function ae(){return re}function se(e){re=e}function ce(){let e=re;return e>=p.maxTextures&&I(`WebGLTextures: Trying to use `+(e+1)+` texture units while this GPU supports only `+p.maxTextures),re+=1,e}function le(e){let t=[];return t.push(e.wrapS),t.push(e.wrapT),t.push(e.wrapR||0),t.push(e.magFilter),t.push(e.minFilter),t.push(e.anisotropy),t.push(e.internalFormat),t.push(e.format),t.push(e.type),t.push(e.generateMipmaps),t.push(e.premultiplyAlpha),t.push(e.flipY),t.push(e.unpackAlignment),t.push(e.colorSpace),t.join()}function ue(e,t){let n=f.get(e);if(e.isVideoTexture&&Pe(e),e.isRenderTargetTexture===!1&&e.isExternalTexture!==!0&&e.version>0&&n.__version!==e.version){let r=e.image;if(r===null)I(`WebGLRenderer: Texture marked for update but no image data found.`);else if(r.complete===!1)I(`WebGLRenderer: Texture marked for update but image is incomplete`);else{be(n,e,t);return}}else e.isExternalTexture&&(n.__webglTexture=e.sourceTexture?e.sourceTexture:null);d.bindTexture(l.TEXTURE_2D,n.__webglTexture,l.TEXTURE0+t)}function de(e,t){let n=f.get(e);if(e.isRenderTargetTexture===!1&&e.version>0&&n.__version!==e.version){be(n,e,t);return}e.isExternalTexture&&(n.__webglTexture=e.sourceTexture?e.sourceTexture:null),d.bindTexture(l.TEXTURE_2D_ARRAY,n.__webglTexture,l.TEXTURE0+t)}function fe(e,t){let n=f.get(e);if(e.isRenderTargetTexture===!1&&e.version>0&&n.__version!==e.version){be(n,e,t);return}d.bindTexture(l.TEXTURE_3D,n.__webglTexture,l.TEXTURE0+t)}function pe(e,t){let n=f.get(e);if(e.isCubeDepthTexture!==!0&&e.version>0&&n.__version!==e.version){xe(n,e,t);return}d.bindTexture(l.TEXTURE_CUBE_MAP,n.__webglTexture,l.TEXTURE0+t)}let me={[e]:l.REPEAT,[t]:l.CLAMP_TO_EDGE,[n]:l.MIRRORED_REPEAT},he={[r]:l.NEAREST,[i]:l.NEAREST_MIPMAP_NEAREST,[a]:l.NEAREST_MIPMAP_LINEAR,[o]:l.LINEAR,[s]:l.LINEAR_MIPMAP_NEAREST,[c]:l.LINEAR_MIPMAP_LINEAR},ge={512:l.NEVER,519:l.ALWAYS,513:l.LESS,515:l.LEQUAL,514:l.EQUAL,518:l.GEQUAL,516:l.GREATER,517:l.NOTEQUAL};function _e(e,t){if(t.type===1015&&u.has(`OES_texture_float_linear`)===!1&&(t.magFilter===1006||t.magFilter===1007||t.magFilter===1005||t.magFilter===1008||t.minFilter===1006||t.minFilter===1007||t.minFilter===1005||t.minFilter===1008)&&I(`WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device.`),l.texParameteri(e,l.TEXTURE_WRAP_S,me[t.wrapS]),l.texParameteri(e,l.TEXTURE_WRAP_T,me[t.wrapT]),(e===l.TEXTURE_3D||e===l.TEXTURE_2D_ARRAY)&&l.texParameteri(e,l.TEXTURE_WRAP_R,me[t.wrapR]),l.texParameteri(e,l.TEXTURE_MAG_FILTER,he[t.magFilter]),l.texParameteri(e,l.TEXTURE_MIN_FILTER,he[t.minFilter]),t.compareFunction&&(l.texParameteri(e,l.TEXTURE_COMPARE_MODE,l.COMPARE_REF_TO_TEXTURE),l.texParameteri(e,l.TEXTURE_COMPARE_FUNC,ge[t.compareFunction])),u.has(`EXT_texture_filter_anisotropic`)===!0){if(t.magFilter===1003||t.minFilter!==1005&&t.minFilter!==1008||t.type===1015&&u.has(`OES_texture_float_linear`)===!1)return;if(t.anisotropy>1||f.get(t).__currentAnisotropy){let n=u.get(`EXT_texture_filter_anisotropic`);l.texParameterf(e,n.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(t.anisotropy,p.getMaxAnisotropy())),f.get(t).__currentAnisotropy=t.anisotropy}}}function ve(e,t){let n=!1;e.__webglInit===void 0&&(e.__webglInit=!0,t.addEventListener(`dispose`,M));let r=t.source,i=C.get(r);i===void 0&&(i={},C.set(r,i));let a=le(t);if(a!==e.__cacheKey){i[a]===void 0&&(i[a]={texture:l.createTexture(),usedTimes:0},h.memory.textures++,n=!0),i[a].usedTimes++;let r=i[e.__cacheKey];r!==void 0&&(i[e.__cacheKey].usedTimes--,r.usedTimes===0&&F(t)),e.__cacheKey=a,e.__webglTexture=i[a].texture}return n}function ye(e,t,n){return Math.floor(Math.floor(e/n)/t)}function R(e,t,n,r){let i=e.updateRanges;if(i.length===0)d.texSubImage2D(l.TEXTURE_2D,0,0,0,t.width,t.height,n,r,t.data);else{i.sort((e,t)=>e.start-t.start);let a=0;for(let e=1;e<i.length;e++){let n=i[a],r=i[e],o=n.start+n.count,s=ye(r.start,t.width,4),c=ye(n.start,t.width,4);r.start<=o+1&&s===c&&ye(r.start+r.count-1,t.width,4)===s?n.count=Math.max(n.count,r.start+r.count-n.start):(++a,i[a]=r)}i.length=a+1;let o=d.getParameter(l.UNPACK_ROW_LENGTH),s=d.getParameter(l.UNPACK_SKIP_PIXELS),c=d.getParameter(l.UNPACK_SKIP_ROWS);d.pixelStorei(l.UNPACK_ROW_LENGTH,t.width);for(let e=0,a=i.length;e<a;e++){let a=i[e],o=Math.floor(a.start/4),s=Math.ceil(a.count/4),c=o%t.width,u=Math.floor(o/t.width),f=s;d.pixelStorei(l.UNPACK_SKIP_PIXELS,c),d.pixelStorei(l.UNPACK_SKIP_ROWS,u),d.texSubImage2D(l.TEXTURE_2D,0,c,u,f,1,n,r,t.data)}e.clearUpdateRanges(),d.pixelStorei(l.UNPACK_ROW_LENGTH,o),d.pixelStorei(l.UNPACK_SKIP_PIXELS,s),d.pixelStorei(l.UNPACK_SKIP_ROWS,c)}}function be(e,t,n){let r=l.TEXTURE_2D;(t.isDataArrayTexture||t.isCompressedArrayTexture)&&(r=l.TEXTURE_2D_ARRAY),t.isData3DTexture&&(r=l.TEXTURE_3D);let i=ve(e,t),a=t.source;d.bindTexture(r,e.__webglTexture,l.TEXTURE0+n);let o=f.get(a);if(a.version!==o.__version||i===!0){if(d.activeTexture(l.TEXTURE0+n),!(typeof ImageBitmap<`u`&&t.image instanceof ImageBitmap)){let e=Ge.getPrimaries(Ge.workingColorSpace),n=t.colorSpace===``?null:Ge.getPrimaries(t.colorSpace),r=t.colorSpace===``||e===n?l.NONE:l.BROWSER_DEFAULT_WEBGL;d.pixelStorei(l.UNPACK_FLIP_Y_WEBGL,t.flipY),d.pixelStorei(l.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),d.pixelStorei(l.UNPACK_COLORSPACE_CONVERSION_WEBGL,r)}d.pixelStorei(l.UNPACK_ALIGNMENT,t.unpackAlignment);let e=E(t.image,!1,p.maxTextureSize);e=Fe(t,e);let s=m.convert(t.format,t.colorSpace),c=m.convert(t.type),u=k(t.internalFormat,s,c,t.normalized,t.colorSpace,t.isVideoTexture);_e(r,t);let f,h=t.mipmaps,g=t.isVideoTexture!==!0,_=o.__version===void 0||i===!0,v=a.dataReady,b=j(t,e);if(t.isDepthTexture)u=A(t.format===y,t.type),_&&(g?d.texStorage2D(l.TEXTURE_2D,1,u,e.width,e.height):d.texImage2D(l.TEXTURE_2D,0,u,e.width,e.height,0,s,c,null));else if(t.isDataTexture){if(h.length>0){g&&_&&d.texStorage2D(l.TEXTURE_2D,b,u,h[0].width,h[0].height);for(let e=0,t=h.length;e<t;e++)f=h[e],g?v&&d.texSubImage2D(l.TEXTURE_2D,e,0,0,f.width,f.height,s,c,f.data):d.texImage2D(l.TEXTURE_2D,e,u,f.width,f.height,0,s,c,f.data);t.generateMipmaps=!1}else g?(_&&d.texStorage2D(l.TEXTURE_2D,b,u,e.width,e.height),v&&R(t,e,s,c)):d.texImage2D(l.TEXTURE_2D,0,u,e.width,e.height,0,s,c,e.data)}else if(t.isCompressedTexture){if(t.isCompressedArrayTexture){g&&_&&d.texStorage3D(l.TEXTURE_2D_ARRAY,b,u,h[0].width,h[0].height,e.depth);for(let n=0,r=h.length;n<r;n++)if(f=h[n],t.format!==1023){if(s!==null){if(g){if(v){if(t.layerUpdates.size>0){let e=wo(f.width,f.height,t.format,t.type);for(let r of t.layerUpdates){let t=f.data.subarray(r*e/f.data.BYTES_PER_ELEMENT,(r+1)*e/f.data.BYTES_PER_ELEMENT);d.compressedTexSubImage3D(l.TEXTURE_2D_ARRAY,n,0,0,r,f.width,f.height,1,s,t)}}else d.compressedTexSubImage3D(l.TEXTURE_2D_ARRAY,n,0,0,0,f.width,f.height,e.depth,s,f.data)}}else d.compressedTexImage3D(l.TEXTURE_2D_ARRAY,n,u,f.width,f.height,e.depth,0,f.data,0,0)}else I(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`)}else g?v&&d.texSubImage3D(l.TEXTURE_2D_ARRAY,n,0,0,0,f.width,f.height,e.depth,s,c,f.data):d.texImage3D(l.TEXTURE_2D_ARRAY,n,u,f.width,f.height,e.depth,0,s,c,f.data);t.layerUpdates.size>0&&t.clearLayerUpdates()}else{g&&_&&d.texStorage2D(l.TEXTURE_2D,b,u,h[0].width,h[0].height);for(let e=0,n=h.length;e<n;e++)f=h[e],t.format===1023?g?v&&d.texSubImage2D(l.TEXTURE_2D,e,0,0,f.width,f.height,s,c,f.data):d.texImage2D(l.TEXTURE_2D,e,u,f.width,f.height,0,s,c,f.data):s===null?I(`WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()`):g?v&&d.compressedTexSubImage2D(l.TEXTURE_2D,e,0,0,f.width,f.height,s,f.data):d.compressedTexImage2D(l.TEXTURE_2D,e,u,f.width,f.height,0,f.data)}}else if(t.isDataArrayTexture){if(g){if(_&&d.texStorage3D(l.TEXTURE_2D_ARRAY,b,u,e.width,e.height,e.depth),v){if(t.layerUpdates.size>0){let n=wo(e.width,e.height,t.format,t.type);for(let r of t.layerUpdates){let t=e.data.subarray(r*n/e.data.BYTES_PER_ELEMENT,(r+1)*n/e.data.BYTES_PER_ELEMENT);d.texSubImage3D(l.TEXTURE_2D_ARRAY,0,0,0,r,e.width,e.height,1,s,c,t)}t.clearLayerUpdates()}else d.texSubImage3D(l.TEXTURE_2D_ARRAY,0,0,0,0,e.width,e.height,e.depth,s,c,e.data)}}else d.texImage3D(l.TEXTURE_2D_ARRAY,0,u,e.width,e.height,e.depth,0,s,c,e.data)}else if(t.isData3DTexture)g?(_&&d.texStorage3D(l.TEXTURE_3D,b,u,e.width,e.height,e.depth),v&&d.texSubImage3D(l.TEXTURE_3D,0,0,0,0,e.width,e.height,e.depth,s,c,e.data)):d.texImage3D(l.TEXTURE_3D,0,u,e.width,e.height,e.depth,0,s,c,e.data);else if(t.isFramebufferTexture){if(_){if(g)d.texStorage2D(l.TEXTURE_2D,b,u,e.width,e.height);else{let t=e.width,n=e.height;for(let e=0;e<b;e++)d.texImage2D(l.TEXTURE_2D,e,u,t,n,0,s,c,null),t>>=1,n>>=1}}}else if(t.isHTMLTexture){if(`texElementImage2D`in l){let n=l.canvas;if(n.hasAttribute(`layoutsubtree`)||n.setAttribute(`layoutsubtree`,`true`),e.parentNode!==n){n.appendChild(e),x.add(t),n.onpaint=e=>{let t=e.changedElements;for(let e of x)t.includes(e.image)&&(e.needsUpdate=!0)},n.requestPaint();return}if(l.texElementImage2D.length===3)l.texElementImage2D(l.TEXTURE_2D,l.RGBA8,e);else{let t=l.RGBA,n=l.RGBA,r=l.UNSIGNED_BYTE;l.texElementImage2D(l.TEXTURE_2D,0,t,n,r,e)}l.texParameteri(l.TEXTURE_2D,l.TEXTURE_MIN_FILTER,l.LINEAR),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_WRAP_S,l.CLAMP_TO_EDGE),l.texParameteri(l.TEXTURE_2D,l.TEXTURE_WRAP_T,l.CLAMP_TO_EDGE)}}else if(h.length>0){if(g&&_){let e=Ie(h[0]);d.texStorage2D(l.TEXTURE_2D,b,u,e.width,e.height)}for(let e=0,t=h.length;e<t;e++)f=h[e],g?v&&d.texSubImage2D(l.TEXTURE_2D,e,0,0,s,c,f):d.texImage2D(l.TEXTURE_2D,e,u,s,c,f);t.generateMipmaps=!1}else if(g){if(_){let t=Ie(e);d.texStorage2D(l.TEXTURE_2D,b,u,t.width,t.height)}v&&d.texSubImage2D(l.TEXTURE_2D,0,0,0,s,c,e)}else d.texImage2D(l.TEXTURE_2D,0,u,s,c,e);D(t)&&O(r),o.__version=a.version,t.onUpdate&&t.onUpdate(t)}e.__version=t.version}function xe(e,t,n){if(t.image.length!==6)return;let r=ve(e,t),i=t.source;d.bindTexture(l.TEXTURE_CUBE_MAP,e.__webglTexture,l.TEXTURE0+n);let a=f.get(i);if(i.version!==a.__version||r===!0){d.activeTexture(l.TEXTURE0+n);let e=Ge.getPrimaries(Ge.workingColorSpace),o=t.colorSpace===``?null:Ge.getPrimaries(t.colorSpace),s=t.colorSpace===``||e===o?l.NONE:l.BROWSER_DEFAULT_WEBGL;d.pixelStorei(l.UNPACK_FLIP_Y_WEBGL,t.flipY),d.pixelStorei(l.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),d.pixelStorei(l.UNPACK_ALIGNMENT,t.unpackAlignment),d.pixelStorei(l.UNPACK_COLORSPACE_CONVERSION_WEBGL,s);let c=t.isCompressedTexture||t.image[0].isCompressedTexture,u=t.image[0]&&t.image[0].isDataTexture,f=[];for(let e=0;e<6;e++)!c&&!u?f[e]=E(t.image[e],!0,p.maxCubemapSize):f[e]=u?t.image[e].image:t.image[e],f[e]=Fe(t,f[e]);let h=f[0],g=m.convert(t.format,t.colorSpace),_=m.convert(t.type),v=k(t.internalFormat,g,_,t.normalized,t.colorSpace),y=t.isVideoTexture!==!0,b=a.__version===void 0||r===!0,x=i.dataReady,S=j(t,h);_e(l.TEXTURE_CUBE_MAP,t);let C;if(c){y&&b&&d.texStorage2D(l.TEXTURE_CUBE_MAP,S,v,h.width,h.height);for(let e=0;e<6;e++){C=f[e].mipmaps;for(let n=0;n<C.length;n++){let r=C[n];t.format===1023?y?x&&d.texSubImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,n,0,0,r.width,r.height,g,_,r.data):d.texImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,n,v,r.width,r.height,0,g,_,r.data):g===null?I(`WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()`):y?x&&d.compressedTexSubImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,n,0,0,r.width,r.height,g,r.data):d.compressedTexImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,n,v,r.width,r.height,0,r.data)}}}else{if(C=t.mipmaps,y&&b){C.length>0&&S++;let e=Ie(f[0]);d.texStorage2D(l.TEXTURE_CUBE_MAP,S,v,e.width,e.height)}for(let e=0;e<6;e++)if(u){y?x&&d.texSubImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,0,0,0,f[e].width,f[e].height,g,_,f[e].data):d.texImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,0,v,f[e].width,f[e].height,0,g,_,f[e].data);for(let t=0;t<C.length;t++){let n=C[t].image[e].image;y?x&&d.texSubImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,t+1,0,0,n.width,n.height,g,_,n.data):d.texImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,t+1,v,n.width,n.height,0,g,_,n.data)}}else{y?x&&d.texSubImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,0,0,0,g,_,f[e]):d.texImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,0,v,g,_,f[e]);for(let t=0;t<C.length;t++){let n=C[t];y?x&&d.texSubImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,t+1,0,0,g,_,n.image[e]):d.texImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+e,t+1,v,g,_,n.image[e])}}}D(t)&&O(l.TEXTURE_CUBE_MAP),a.__version=i.version,t.onUpdate&&t.onUpdate(t)}e.__version=t.version}function Se(e,t,n,r,i,a){let o=m.convert(n.format,n.colorSpace),s=m.convert(n.type),c=k(n.internalFormat,o,s,n.normalized,n.colorSpace),u=f.get(t),p=f.get(n);if(p.__renderTarget=t,!u.__hasExternalTextures){let e=Math.max(1,t.width>>a),n=Math.max(1,t.height>>a);i===l.TEXTURE_3D||i===l.TEXTURE_2D_ARRAY?d.texImage3D(i,a,c,e,n,t.depth,0,o,s,null):d.texImage2D(i,a,c,e,n,0,o,s,null)}d.bindFramebuffer(l.FRAMEBUFFER,e),Ne(t)?g.framebufferTexture2DMultisampleEXT(l.FRAMEBUFFER,r,i,p.__webglTexture,0,Me(t)):(i===l.TEXTURE_2D||i>=l.TEXTURE_CUBE_MAP_POSITIVE_X&&i<=l.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&l.framebufferTexture2D(l.FRAMEBUFFER,r,i,p.__webglTexture,a),d.bindFramebuffer(l.FRAMEBUFFER,null)}function Ce(e,t,n){if(l.bindRenderbuffer(l.RENDERBUFFER,e),t.depthBuffer){let r=t.depthTexture,i=r&&r.isDepthTexture?r.type:null,a=A(t.stencilBuffer,i),o=t.stencilBuffer?l.DEPTH_STENCIL_ATTACHMENT:l.DEPTH_ATTACHMENT;Ne(t)?g.renderbufferStorageMultisampleEXT(l.RENDERBUFFER,Me(t),a,t.width,t.height):n?l.renderbufferStorageMultisample(l.RENDERBUFFER,Me(t),a,t.width,t.height):l.renderbufferStorage(l.RENDERBUFFER,a,t.width,t.height),l.framebufferRenderbuffer(l.FRAMEBUFFER,o,l.RENDERBUFFER,e)}else{let e=t.textures;for(let r=0;r<e.length;r++){let i=e[r],a=m.convert(i.format,i.colorSpace),o=m.convert(i.type),s=k(i.internalFormat,a,o,i.normalized,i.colorSpace);Ne(t)?g.renderbufferStorageMultisampleEXT(l.RENDERBUFFER,Me(t),s,t.width,t.height):n?l.renderbufferStorageMultisample(l.RENDERBUFFER,Me(t),s,t.width,t.height):l.renderbufferStorage(l.RENDERBUFFER,s,t.width,t.height)}}l.bindRenderbuffer(l.RENDERBUFFER,null)}function we(e,t,n){let r=t.isWebGLCubeRenderTarget===!0;if(d.bindFramebuffer(l.FRAMEBUFFER,e),!(t.depthTexture&&t.depthTexture.isDepthTexture))throw Error(`THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.`);let i=f.get(t.depthTexture);if(i.__renderTarget=t,(!i.__webglTexture||t.depthTexture.image.width!==t.width||t.depthTexture.image.height!==t.height)&&(t.depthTexture.image.width=t.width,t.depthTexture.image.height=t.height,t.depthTexture.needsUpdate=!0),r){if(i.__webglInit===void 0&&(i.__webglInit=!0,t.depthTexture.addEventListener(`dispose`,M)),i.__webglTexture===void 0){i.__webglTexture=l.createTexture(),d.bindTexture(l.TEXTURE_CUBE_MAP,i.__webglTexture),_e(l.TEXTURE_CUBE_MAP,t.depthTexture);let e=m.convert(t.depthTexture.format),n=m.convert(t.depthTexture.type),r;t.depthTexture.format===1026?r=l.DEPTH_COMPONENT24:t.depthTexture.format===1027&&(r=l.DEPTH24_STENCIL8);for(let i=0;i<6;i++)l.texImage2D(l.TEXTURE_CUBE_MAP_POSITIVE_X+i,0,r,t.width,t.height,0,e,n,null)}}else ue(t.depthTexture,0);let a=i.__webglTexture,o=Me(t),s=r?l.TEXTURE_CUBE_MAP_POSITIVE_X+n:l.TEXTURE_2D,c=t.depthTexture.format===1027?l.DEPTH_STENCIL_ATTACHMENT:l.DEPTH_ATTACHMENT;if(t.depthTexture.format===1026)Ne(t)?g.framebufferTexture2DMultisampleEXT(l.FRAMEBUFFER,c,s,a,0,o):l.framebufferTexture2D(l.FRAMEBUFFER,c,s,a,0);else if(t.depthTexture.format===1027)Ne(t)?g.framebufferTexture2DMultisampleEXT(l.FRAMEBUFFER,c,s,a,0,o):l.framebufferTexture2D(l.FRAMEBUFFER,c,s,a,0);else throw Error(`THREE.WebGLTextures: Unknown depthTexture format.`)}function Te(e){let t=f.get(e),n=e.isWebGLCubeRenderTarget===!0;if(t.__boundDepthTexture!==e.depthTexture){let n=e.depthTexture;if(t.__depthDisposeCallback&&t.__depthDisposeCallback(),n){let e=()=>{delete t.__boundDepthTexture,delete t.__depthDisposeCallback,n.removeEventListener(`dispose`,e)};n.addEventListener(`dispose`,e),t.__depthDisposeCallback=e}t.__boundDepthTexture=n}if(e.depthTexture&&!t.__autoAllocateDepthBuffer){if(n)for(let n=0;n<6;n++)we(t.__webglFramebuffer[n],e,n);else{let n=e.texture.mipmaps;n&&n.length>0?we(t.__webglFramebuffer[0],e,0):we(t.__webglFramebuffer,e,0)}}else if(n){t.__webglDepthbuffer=[];for(let n=0;n<6;n++)if(d.bindFramebuffer(l.FRAMEBUFFER,t.__webglFramebuffer[n]),t.__webglDepthbuffer[n]===void 0)t.__webglDepthbuffer[n]=l.createRenderbuffer(),Ce(t.__webglDepthbuffer[n],e,!1);else{let r=e.stencilBuffer?l.DEPTH_STENCIL_ATTACHMENT:l.DEPTH_ATTACHMENT,i=t.__webglDepthbuffer[n];l.bindRenderbuffer(l.RENDERBUFFER,i),l.framebufferRenderbuffer(l.FRAMEBUFFER,r,l.RENDERBUFFER,i)}}else{let n=e.texture.mipmaps;if(n&&n.length>0?d.bindFramebuffer(l.FRAMEBUFFER,t.__webglFramebuffer[0]):d.bindFramebuffer(l.FRAMEBUFFER,t.__webglFramebuffer),t.__webglDepthbuffer===void 0)t.__webglDepthbuffer=l.createRenderbuffer(),Ce(t.__webglDepthbuffer,e,!1);else{let n=e.stencilBuffer?l.DEPTH_STENCIL_ATTACHMENT:l.DEPTH_ATTACHMENT,r=t.__webglDepthbuffer;l.bindRenderbuffer(l.RENDERBUFFER,r),l.framebufferRenderbuffer(l.FRAMEBUFFER,n,l.RENDERBUFFER,r)}}d.bindFramebuffer(l.FRAMEBUFFER,null)}function Ee(e,t,n){let r=f.get(e);t!==void 0&&Se(r.__webglFramebuffer,e,e.texture,l.COLOR_ATTACHMENT0,l.TEXTURE_2D,0),n!==void 0&&Te(e)}function De(e){let t=e.texture,n=f.get(e),r=f.get(t);e.addEventListener(`dispose`,P);let i=e.textures,a=e.isWebGLCubeRenderTarget===!0,o=i.length>1;if(o||(r.__webglTexture===void 0&&(r.__webglTexture=l.createTexture()),r.__version=t.version,h.memory.textures++),a){n.__webglFramebuffer=[];for(let e=0;e<6;e++)if(t.mipmaps&&t.mipmaps.length>0){n.__webglFramebuffer[e]=[];for(let r=0;r<t.mipmaps.length;r++)n.__webglFramebuffer[e][r]=l.createFramebuffer()}else n.__webglFramebuffer[e]=l.createFramebuffer()}else{if(t.mipmaps&&t.mipmaps.length>0){n.__webglFramebuffer=[];for(let e=0;e<t.mipmaps.length;e++)n.__webglFramebuffer[e]=l.createFramebuffer()}else n.__webglFramebuffer=l.createFramebuffer();if(o)for(let e=0,t=i.length;e<t;e++){let t=f.get(i[e]);t.__webglTexture===void 0&&(t.__webglTexture=l.createTexture(),h.memory.textures++)}if(e.samples>0&&Ne(e)===!1){n.__webglMultisampledFramebuffer=l.createFramebuffer(),n.__webglColorRenderbuffer=[],d.bindFramebuffer(l.FRAMEBUFFER,n.__webglMultisampledFramebuffer);for(let t=0;t<i.length;t++){let r=i[t];n.__webglColorRenderbuffer[t]=l.createRenderbuffer(),l.bindRenderbuffer(l.RENDERBUFFER,n.__webglColorRenderbuffer[t]);let a=m.convert(r.format,r.colorSpace),o=m.convert(r.type),s=k(r.internalFormat,a,o,r.normalized,r.colorSpace,e.isXRRenderTarget===!0),c=Me(e);l.renderbufferStorageMultisample(l.RENDERBUFFER,c,s,e.width,e.height),l.framebufferRenderbuffer(l.FRAMEBUFFER,l.COLOR_ATTACHMENT0+t,l.RENDERBUFFER,n.__webglColorRenderbuffer[t])}l.bindRenderbuffer(l.RENDERBUFFER,null),e.depthBuffer&&(n.__webglDepthRenderbuffer=l.createRenderbuffer(),Ce(n.__webglDepthRenderbuffer,e,!0)),d.bindFramebuffer(l.FRAMEBUFFER,null)}}if(a){d.bindTexture(l.TEXTURE_CUBE_MAP,r.__webglTexture),_e(l.TEXTURE_CUBE_MAP,t);for(let r=0;r<6;r++)if(t.mipmaps&&t.mipmaps.length>0)for(let i=0;i<t.mipmaps.length;i++)Se(n.__webglFramebuffer[r][i],e,t,l.COLOR_ATTACHMENT0,l.TEXTURE_CUBE_MAP_POSITIVE_X+r,i);else Se(n.__webglFramebuffer[r],e,t,l.COLOR_ATTACHMENT0,l.TEXTURE_CUBE_MAP_POSITIVE_X+r,0);D(t)&&O(l.TEXTURE_CUBE_MAP),d.unbindTexture()}else if(o){for(let t=0,r=i.length;t<r;t++){let r=i[t],a=f.get(r),o=l.TEXTURE_2D;(e.isWebGL3DRenderTarget||e.isWebGLArrayRenderTarget)&&(o=e.isWebGL3DRenderTarget?l.TEXTURE_3D:l.TEXTURE_2D_ARRAY),d.bindTexture(o,a.__webglTexture),_e(o,r),Se(n.__webglFramebuffer,e,r,l.COLOR_ATTACHMENT0+t,o,0),D(r)&&O(o)}d.unbindTexture()}else{let i=l.TEXTURE_2D;if((e.isWebGL3DRenderTarget||e.isWebGLArrayRenderTarget)&&(i=e.isWebGL3DRenderTarget?l.TEXTURE_3D:l.TEXTURE_2D_ARRAY),d.bindTexture(i,r.__webglTexture),_e(i,t),t.mipmaps&&t.mipmaps.length>0)for(let r=0;r<t.mipmaps.length;r++)Se(n.__webglFramebuffer[r],e,t,l.COLOR_ATTACHMENT0,i,r);else Se(n.__webglFramebuffer,e,t,l.COLOR_ATTACHMENT0,i,0);D(t)&&O(i),d.unbindTexture()}e.depthBuffer&&Te(e)}function Oe(e){let t=e.textures;for(let n=0,r=t.length;n<r;n++){let r=t[n];if(D(r)){let t=ee(e),n=f.get(r).__webglTexture;d.bindTexture(t,n),O(t),d.unbindTexture()}}}let ke=[],Ae=[];function je(e){if(e.samples>0){if(Ne(e)===!1){let t=e.textures,n=e.width,r=e.height,i=l.COLOR_BUFFER_BIT,a=e.stencilBuffer?l.DEPTH_STENCIL_ATTACHMENT:l.DEPTH_ATTACHMENT,o=f.get(e),s=t.length>1;if(s)for(let e=0;e<t.length;e++)d.bindFramebuffer(l.FRAMEBUFFER,o.__webglMultisampledFramebuffer),l.framebufferRenderbuffer(l.FRAMEBUFFER,l.COLOR_ATTACHMENT0+e,l.RENDERBUFFER,null),d.bindFramebuffer(l.FRAMEBUFFER,o.__webglFramebuffer),l.framebufferTexture2D(l.DRAW_FRAMEBUFFER,l.COLOR_ATTACHMENT0+e,l.TEXTURE_2D,null,0);d.bindFramebuffer(l.READ_FRAMEBUFFER,o.__webglMultisampledFramebuffer);let c=e.texture.mipmaps;c&&c.length>0?d.bindFramebuffer(l.DRAW_FRAMEBUFFER,o.__webglFramebuffer[0]):d.bindFramebuffer(l.DRAW_FRAMEBUFFER,o.__webglFramebuffer);for(let c=0;c<t.length;c++){if(e.resolveDepthBuffer&&(e.depthBuffer&&(i|=l.DEPTH_BUFFER_BIT),e.stencilBuffer&&e.resolveStencilBuffer&&(i|=l.STENCIL_BUFFER_BIT)),s){l.framebufferRenderbuffer(l.READ_FRAMEBUFFER,l.COLOR_ATTACHMENT0,l.RENDERBUFFER,o.__webglColorRenderbuffer[c]);let e=f.get(t[c]).__webglTexture;l.framebufferTexture2D(l.DRAW_FRAMEBUFFER,l.COLOR_ATTACHMENT0,l.TEXTURE_2D,e,0)}l.blitFramebuffer(0,0,n,r,0,0,n,r,i,l.NEAREST),_===!0&&(ke.length=0,Ae.length=0,ke.push(l.COLOR_ATTACHMENT0+c),e.depthBuffer&&e.storeMultisampledDepthBuffer===!1&&(ke.push(a),Ae.push(a),l.invalidateFramebuffer(l.DRAW_FRAMEBUFFER,Ae)),l.invalidateFramebuffer(l.READ_FRAMEBUFFER,ke))}if(d.bindFramebuffer(l.READ_FRAMEBUFFER,null),d.bindFramebuffer(l.DRAW_FRAMEBUFFER,null),s)for(let e=0;e<t.length;e++){d.bindFramebuffer(l.FRAMEBUFFER,o.__webglMultisampledFramebuffer),l.framebufferRenderbuffer(l.FRAMEBUFFER,l.COLOR_ATTACHMENT0+e,l.RENDERBUFFER,o.__webglColorRenderbuffer[e]);let n=f.get(t[e]).__webglTexture;d.bindFramebuffer(l.FRAMEBUFFER,o.__webglFramebuffer),l.framebufferTexture2D(l.DRAW_FRAMEBUFFER,l.COLOR_ATTACHMENT0+e,l.TEXTURE_2D,n,0)}d.bindFramebuffer(l.DRAW_FRAMEBUFFER,o.__webglMultisampledFramebuffer)}else if(e.depthBuffer&&e.storeMultisampledDepthBuffer===!1&&_){let t=e.stencilBuffer?l.DEPTH_STENCIL_ATTACHMENT:l.DEPTH_ATTACHMENT;l.invalidateFramebuffer(l.DRAW_FRAMEBUFFER,[t])}}}function Me(e){return Math.min(p.maxSamples,e.samples)}function Ne(e){let t=f.get(e);return e.samples>0&&u.has(`WEBGL_multisampled_render_to_texture`)===!0&&t.__useRenderToTexture!==!1}function Pe(e){let t=h.render.frame;b.get(e)!==t&&(b.set(e,t),e.update())}function Fe(e,t){let n=e.colorSpace,r=e.format,i=e.type;return e.isCompressedTexture===!0||e.isVideoTexture===!0||n!==`srgb-linear`&&n!==``&&(Ge.getTransfer(n)===`srgb`?(r!==1023||i!==1009)&&I(`WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType.`):L(`WebGLTextures: Unsupported texture color space:`,n)),t}function Ie(e){return typeof HTMLImageElement<`u`&&e instanceof HTMLImageElement?(v.width=e.naturalWidth||e.width,v.height=e.naturalHeight||e.height):typeof VideoFrame<`u`&&e instanceof VideoFrame?(v.width=e.displayWidth,v.height=e.displayHeight):(v.width=e.width,v.height=e.height),v}this.allocateTextureUnit=ce,this.resetTextureUnits=ie,this.getTextureUnits=ae,this.setTextureUnits=se,this.setTexture2D=ue,this.setTexture2DArray=de,this.setTexture3D=fe,this.setTextureCube=pe,this.rebindTextures=Ee,this.setupRenderTarget=De,this.updateRenderTargetMipmap=Oe,this.updateMultisampleRenderTarget=je,this.setupDepthRenderbuffer=Te,this.setupFrameBufferTexture=Se,this.useMultisampledRTT=Ne,this.isReversedDepthBuffer=function(){return d.buffers.depth.getReversed()}}function Al(e,t){function n(n,r=``){let i,a=Ge.getTransfer(r);if(n===1009)return e.UNSIGNED_BYTE;if(n===1017)return e.UNSIGNED_SHORT_4_4_4_4;if(n===1018)return e.UNSIGNED_SHORT_5_5_5_1;if(n===35902)return e.UNSIGNED_INT_5_9_9_9_REV;if(n===35899)return e.UNSIGNED_INT_10F_11F_11F_REV;if(n===1010)return e.BYTE;if(n===1011)return e.SHORT;if(n===1012)return e.UNSIGNED_SHORT;if(n===1013)return e.INT;if(n===1014)return e.UNSIGNED_INT;if(n===1015)return e.FLOAT;if(n===1016)return e.HALF_FLOAT;if(n===1021)return e.ALPHA;if(n===1022)return e.RGB;if(n===1023)return e.RGBA;if(n===1026)return e.DEPTH_COMPONENT;if(n===1027)return e.DEPTH_STENCIL;if(n===1028)return e.RED;if(n===1029)return e.RED_INTEGER;if(n===1030)return e.RG;if(n===1031)return e.RG_INTEGER;if(n===1033)return e.RGBA_INTEGER;if(n===33776||n===33777||n===33778||n===33779){if(a===`srgb`){if(i=t.get(`WEBGL_compressed_texture_s3tc_srgb`),i!==null){if(n===33776)return i.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null}else if(i=t.get(`WEBGL_compressed_texture_s3tc`),i!==null){if(n===33776)return i.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===33777)return i.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===33778)return i.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===33779)return i.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null}if(n===35840||n===35841||n===35842||n===35843){if(i=t.get(`WEBGL_compressed_texture_pvrtc`),i!==null){if(n===35840)return i.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===35841)return i.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===35842)return i.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===35843)return i.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null}if(n===36196||n===37492||n===37496||n===37488||n===37489||n===37490||n===37491){if(i=t.get(`WEBGL_compressed_texture_etc`),i!==null){if(n===36196||n===37492)return a===`srgb`?i.COMPRESSED_SRGB8_ETC2:i.COMPRESSED_RGB8_ETC2;if(n===37496)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:i.COMPRESSED_RGBA8_ETC2_EAC;if(n===37488)return i.COMPRESSED_R11_EAC;if(n===37489)return i.COMPRESSED_SIGNED_R11_EAC;if(n===37490)return i.COMPRESSED_RG11_EAC;if(n===37491)return i.COMPRESSED_SIGNED_RG11_EAC}else return null}if(n===37808||n===37809||n===37810||n===37811||n===37812||n===37813||n===37814||n===37815||n===37816||n===37817||n===37818||n===37819||n===37820||n===37821){if(i=t.get(`WEBGL_compressed_texture_astc`),i!==null){if(n===37808)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:i.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===37809)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:i.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===37810)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:i.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===37811)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:i.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===37812)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:i.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===37813)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:i.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===37814)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:i.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===37815)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:i.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===37816)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:i.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===37817)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:i.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===37818)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:i.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===37819)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:i.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===37820)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:i.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===37821)return a===`srgb`?i.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:i.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null}if(n===36492||n===36494||n===36495){if(i=t.get(`EXT_texture_compression_bptc`),i!==null){if(n===36492)return a===`srgb`?i.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:i.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===36494)return i.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===36495)return i.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null}if(n===36283||n===36284||n===36285||n===36286){if(i=t.get(`EXT_texture_compression_rgtc`),i!==null){if(n===36283)return i.COMPRESSED_RED_RGTC1_EXT;if(n===36284)return i.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===36285)return i.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===36286)return i.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null}return n===1020?e.UNSIGNED_INT_24_8:e[n]===void 0?null:e[n]}return{convert:n}}var jl=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Ml=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,Nl=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){let n=new Di(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=n}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new qi({vertexShader:jl,fragmentShader:Ml,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new J(new Ii(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Pl=class extends me{constructor(e,t){super();let n=this,r=null,i=1,a=null,o=`local-floor`,s=1,c=null,u=null,f=null,p=null,m=null,h=null,b=typeof XRWebGLBinding<`u`,x=new Nl,S={},C=t.getContextAttributes(),w=null,T=null,E=[],D=[],O=new V,ee=null,k=null,A=new qa;A.viewport=new nt;let j=new qa;j.viewport=new nt;let M=[A,j],N=new co,P=null,te=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(e){let t=E[e];return t===void 0&&(t=new Ft,E[e]=t),t.getTargetRaySpace()},this.getControllerGrip=function(e){let t=E[e];return t===void 0&&(t=new Ft,E[e]=t),t.getGripSpace()},this.getHand=function(e){let t=E[e];return t===void 0&&(t=new Ft,E[e]=t),t.getHandSpace()};function F(e){let t=D.indexOf(e.inputSource);if(t===-1)return;let n=E[t];n!==void 0&&(n.update(e.inputSource,e.frame,c||a),n.dispatchEvent({type:e.type,data:e.inputSource}))}function ne(){r.removeEventListener(`select`,F),r.removeEventListener(`selectstart`,F),r.removeEventListener(`selectend`,F),r.removeEventListener(`squeeze`,F),r.removeEventListener(`squeezestart`,F),r.removeEventListener(`squeezeend`,F),r.removeEventListener(`end`,ne),r.removeEventListener(`inputsourceschange`,re);for(let e=0;e<E.length;e++){let t=D[e];t!==null&&(D[e]=null,E[e].disconnect(t))}P=null,te=null,x.reset();for(let e in S)delete S[e];if(e.setRenderTarget(w),m=null,p=null,f=null,r=null,T=null,L.stop(),n.isPresenting=!1,e.setPixelRatio(ee),e.setSize(O.width,O.height,!1),k!==null){let e=k.camera;e.fov=k.fov,e.zoom=k.zoom,e.updateProjectionMatrix(),k=null}n.dispatchEvent({type:`sessionend`})}this.setFramebufferScaleFactor=function(e){i=e,n.isPresenting===!0&&I(`WebXRManager: Cannot change framebuffer scale while presenting.`)},this.setReferenceSpaceType=function(e){o=e,n.isPresenting===!0&&I(`WebXRManager: Cannot change reference space type while presenting.`)},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(e){c=e},this.getBaseLayer=function(){return p===null?m:p},this.getBinding=function(){return f===null&&b&&(f=new XRWebGLBinding(r,t)),f},this.getFrame=function(){return h},this.getSession=function(){return r},this.setSession=async function(u){if(r=u,r!==null){if(w=e.getRenderTarget(),r.addEventListener(`select`,F),r.addEventListener(`selectstart`,F),r.addEventListener(`selectend`,F),r.addEventListener(`squeeze`,F),r.addEventListener(`squeezestart`,F),r.addEventListener(`squeezeend`,F),r.addEventListener(`end`,ne),r.addEventListener(`inputsourceschange`,re),C.xrCompatible!==!0&&await t.makeXRCompatible(),ee=e.getPixelRatio(),e.getSize(O),b&&`createProjectionLayer`in XRWebGLBinding.prototype){let n=null,a=null,o=null;C.depth&&(o=C.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,n=C.stencil?y:v,a=C.stencil?g:d);let s={colorFormat:t.RGBA8,depthFormat:o,scaleFactor:i};f=this.getBinding(),p=f.createProjectionLayer(s),r.updateRenderState({layers:[p]}),e.setPixelRatio(1),e.setSize(p.textureWidth,p.textureHeight,!1),T=new it(p.textureWidth,p.textureHeight,{format:_,type:l,depthTexture:new Ti(p.textureWidth,p.textureHeight,a,void 0,void 0,void 0,void 0,void 0,void 0,n),stencilBuffer:C.stencil,colorSpace:e.outputColorSpace,samples:C.antialias?4:0,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1,storeMultisampledDepthBuffer:p.ignoreDepthValues===!1,storeMultisampledStencilBuffer:p.ignoreDepthValues===!1})}else{let n={antialias:C.antialias,alpha:!0,depth:C.depth,stencil:C.stencil,framebufferScaleFactor:i};m=new XRWebGLLayer(r,t,n),r.updateRenderState({baseLayer:m}),e.setPixelRatio(1),e.setSize(m.framebufferWidth,m.framebufferHeight,!1),T=new it(m.framebufferWidth,m.framebufferHeight,{format:_,type:l,colorSpace:e.outputColorSpace,stencilBuffer:C.stencil,resolveDepthBuffer:m.ignoreDepthValues===!1,resolveStencilBuffer:m.ignoreDepthValues===!1,storeMultisampledDepthBuffer:m.ignoreDepthValues===!1,storeMultisampledStencilBuffer:m.ignoreDepthValues===!1})}T.isXRRenderTarget=!0,this.setFoveation(s),c=null,a=await r.requestReferenceSpace(o),L.setContext(r),L.start(),n.isPresenting=!0,n.dispatchEvent({type:`sessionstart`})}},this.getEnvironmentBlendMode=function(){if(r!==null)return r.environmentBlendMode},this.getDepthTexture=function(){return x.getDepthTexture()};function re(e){for(let t=0;t<e.removed.length;t++){let n=e.removed[t],r=D.indexOf(n);r>=0&&(D[r]=null,E[r].disconnect(n))}for(let t=0;t<e.added.length;t++){let n=e.added[t],r=D.indexOf(n);if(r===-1){for(let e=0;e<E.length;e++)if(e>=D.length){D.push(n),r=e;break}else if(D[e]===null){D[e]=n,r=e;break}if(r===-1)break}let i=E[r];i&&i.connect(n)}}let ie=new H,ae=new H;function oe(e,t,n){ie.setFromMatrixPosition(t.matrixWorld),ae.setFromMatrixPosition(n.matrixWorld);let r=ie.distanceTo(ae),i=t.projectionMatrix.elements,a=n.projectionMatrix.elements,o=i[14]/(i[10]-1),s=i[14]/(i[10]+1),c=(i[9]+1)/i[5],l=(i[9]-1)/i[5],u=(i[8]-1)/i[0],d=(a[8]+1)/a[0],f=o*u,p=o*d,m=r/(-u+d),h=m*-u;if(t.matrixWorld.decompose(e.position,e.quaternion,e.scale),e.translateX(h),e.translateZ(m),e.matrixWorld.compose(e.position,e.quaternion,e.scale),e.matrixWorldInverse.copy(e.matrixWorld).invert(),i[10]===-1)e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse);else{let t=o+m,n=s+m,i=f-h,a=p+(r-h),u=c*s/n*t,d=l*s/n*t;e.projectionMatrix.makePerspective(i,a,u,d,t,n),e.projectionMatrixInverse.copy(e.projectionMatrix).invert()}}function se(e,t){t===null?e.matrixWorld.copy(e.matrix):e.matrixWorld.multiplyMatrices(t.matrixWorld,e.matrix),e.matrixWorldInverse.copy(e.matrixWorld).invert()}this.updateCamera=function(e){if(r===null)return;let t=e.near,n=e.far;x.texture!==null&&(x.depthNear>0&&(t=x.depthNear),x.depthFar>0&&(n=x.depthFar)),N.near=j.near=A.near=t,N.far=j.far=A.far=n,(P!==N.near||te!==N.far)&&(r.updateRenderState({depthNear:N.near,depthFar:N.far}),P=N.near,te=N.far),N.layers.mask=e.layers.mask|6,A.layers.mask=N.layers.mask&-5,j.layers.mask=N.layers.mask&-3;let i=e.parent,a=N.cameras;se(N,i);for(let e=0;e<a.length;e++)se(a[e],i);a.length===2?oe(N,A,j):N.projectionMatrix.copy(A.projectionMatrix),k===null&&e.isPerspectiveCamera&&(k={camera:e,fov:e.fov,zoom:e.zoom}),ce(e,N,i)};function ce(e,t,n){n===null?e.matrix.copy(t.matrixWorld):(e.matrix.copy(n.matrixWorld),e.matrix.invert(),e.matrix.multiply(t.matrixWorld)),e.matrix.decompose(e.position,e.quaternion,e.scale),e.updateMatrixWorld(!0),e.projectionMatrix.copy(t.projectionMatrix),e.projectionMatrixInverse.copy(t.projectionMatrixInverse),e.isPerspectiveCamera&&(e.fov=ve*2*Math.atan(1/e.projectionMatrix.elements[5]),e.zoom=1)}this.getCamera=function(){return N},this.getFoveation=function(){if(p!==null||m!==null)return s},this.setFoveation=function(e){s=e,p!==null&&(p.fixedFoveation=e),m!==null&&m.fixedFoveation!==void 0&&(m.fixedFoveation=e)},this.hasDepthSensing=function(){return x.texture!==null},this.getDepthSensingMesh=function(){return x.getMesh(N)},this.getCameraTexture=function(e){return S[e]};let le=null;function ue(t,i){if(u=i.getViewerPose(c||a),h=i,u!==null){let t=u.views;m!==null&&(e.setRenderTargetFramebuffer(T,m.framebuffer),e.setRenderTarget(T));let i=!1;t.length!==N.cameras.length&&(N.cameras.length=0,i=!0);for(let n=0;n<t.length;n++){let r=t[n],a=null;if(m!==null)a=m.getViewport(r);else{let t=f.getViewSubImage(p,r);a=t.viewport,n===0&&(e.setRenderTargetTextures(T,t.colorTexture,t.depthStencilTexture),e.setRenderTarget(T))}let o=M[n];o===void 0&&(o=new qa,o.layers.enable(n),o.viewport=new nt,M[n]=o),o.matrix.fromArray(r.transform.matrix),o.matrix.decompose(o.position,o.quaternion,o.scale),o.projectionMatrix.fromArray(r.projectionMatrix),o.projectionMatrixInverse.copy(o.projectionMatrix).invert(),o.viewport.set(a.x,a.y,a.width,a.height),n===0&&(N.matrix.copy(o.matrix),N.matrix.decompose(N.position,N.quaternion,N.scale)),i===!0&&N.cameras.push(o)}let a=r.enabledFeatures;if(a&&a.includes(`depth-sensing`)&&r.depthUsage==`gpu-optimized`&&b){f=n.getBinding();let e=f.getDepthInformation(t[0]);e&&e.isValid&&e.texture&&x.init(e,r.renderState)}if(a&&a.includes(`camera-access`)&&b){e.state.unbindTexture(),f=n.getBinding();for(let e=0;e<t.length;e++){let n=t[e].camera;if(n){let e=S[n];e||(e=new Di,S[n]=e);let t=f.getCameraImage(n);e.sourceTexture=t}}}}for(let e=0;e<E.length;e++){let t=D[e],n=E[e];t!==null&&n!==void 0&&n.update(t,i,c||a)}le&&le(t,i),i.detectedPlanes&&n.dispatchEvent({type:`planesdetected`,data:i}),h=null}let L=new Eo;L.setAnimationLoop(ue),this.setAnimationLoop=function(e){le=e},this.dispose=function(){}}},Fl=new G,Il=new W;Il.set(-1,0,0,0,1,0,0,0,1);function Ll(e,t){function n(e,t){e.matrixAutoUpdate===!0&&e.updateMatrix(),t.value.copy(e.matrix)}function r(t,n){n.color.getRGB(t.fogColor.value,Ui(e)),n.isFog?(t.fogNear.value=n.near,t.fogFar.value=n.far):n.isFogExp2&&(t.fogDensity.value=n.density)}function i(e,t,n,r,i){t.isNodeMaterial?t.uniformsNeedUpdate=!1:t.isMeshBasicMaterial?a(e,t):t.isMeshLambertMaterial?(a(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshToonMaterial?(a(e,t),d(e,t)):t.isMeshPhongMaterial?(a(e,t),u(e,t),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)):t.isMeshStandardMaterial?(a(e,t),f(e,t),t.isMeshPhysicalMaterial&&p(e,t,i)):t.isMeshMatcapMaterial?(a(e,t),m(e,t)):t.isMeshDepthMaterial?a(e,t):t.isMeshDistanceMaterial?(a(e,t),h(e,t)):t.isMeshNormalMaterial?a(e,t):t.isLineBasicMaterial?(o(e,t),t.isLineDashedMaterial&&s(e,t)):t.isPointsMaterial?c(e,t,n,r):t.isSpriteMaterial?l(e,t):t.isShadowMaterial?(e.color.value.copy(t.color),e.opacity.value=t.opacity):t.isShaderMaterial&&(t.uniformsNeedUpdate=!1)}function a(e,r){e.opacity.value=r.opacity,r.color&&e.diffuse.value.copy(r.color),r.emissive&&e.emissive.value.copy(r.emissive).multiplyScalar(r.emissiveIntensity),r.map&&(e.map.value=r.map,n(r.map,e.mapTransform)),r.alphaMap&&(e.alphaMap.value=r.alphaMap,n(r.alphaMap,e.alphaMapTransform)),r.bumpMap&&(e.bumpMap.value=r.bumpMap,n(r.bumpMap,e.bumpMapTransform),e.bumpScale.value=r.bumpScale,r.side===1&&(e.bumpScale.value*=-1)),r.normalMap&&(e.normalMap.value=r.normalMap,n(r.normalMap,e.normalMapTransform),e.normalScale.value.copy(r.normalScale),r.side===1&&e.normalScale.value.negate()),r.displacementMap&&(e.displacementMap.value=r.displacementMap,n(r.displacementMap,e.displacementMapTransform),e.displacementScale.value=r.displacementScale,e.displacementBias.value=r.displacementBias),r.emissiveMap&&(e.emissiveMap.value=r.emissiveMap,n(r.emissiveMap,e.emissiveMapTransform)),r.specularMap&&(e.specularMap.value=r.specularMap,n(r.specularMap,e.specularMapTransform)),r.alphaTest>0&&(e.alphaTest.value=r.alphaTest);let i=t.get(r),a=i.envMap,o=i.envMapRotation;a&&(e.envMap.value=a,e.envMapRotation.value.setFromMatrix4(Fl.makeRotationFromEuler(o)).transpose(),a.isCubeTexture&&a.isRenderTargetTexture===!1&&e.envMapRotation.value.premultiply(Il),e.reflectivity.value=r.reflectivity,e.ior.value=r.ior,e.refractionRatio.value=r.refractionRatio),r.lightMap&&(e.lightMap.value=r.lightMap,e.lightMapIntensity.value=r.lightMapIntensity,n(r.lightMap,e.lightMapTransform)),r.aoMap&&(e.aoMap.value=r.aoMap,e.aoMapIntensity.value=r.aoMapIntensity,n(r.aoMap,e.aoMapTransform))}function o(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform))}function s(e,t){e.dashSize.value=t.dashSize,e.totalSize.value=t.dashSize+t.gapSize,e.scale.value=t.scale}function c(e,t,r,i){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.size.value=t.size*r,e.scale.value=i*.5,t.map&&(e.map.value=t.map,n(t.map,e.uvTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function l(e,t){e.diffuse.value.copy(t.color),e.opacity.value=t.opacity,e.rotation.value=t.rotation,t.map&&(e.map.value=t.map,n(t.map,e.mapTransform)),t.alphaMap&&(e.alphaMap.value=t.alphaMap,n(t.alphaMap,e.alphaMapTransform)),t.alphaTest>0&&(e.alphaTest.value=t.alphaTest)}function u(e,t){e.specular.value.copy(t.specular),e.shininess.value=Math.max(t.shininess,1e-4)}function d(e,t){t.gradientMap&&(e.gradientMap.value=t.gradientMap)}function f(e,t){e.metalness.value=t.metalness,t.metalnessMap&&(e.metalnessMap.value=t.metalnessMap,n(t.metalnessMap,e.metalnessMapTransform)),e.roughness.value=t.roughness,t.roughnessMap&&(e.roughnessMap.value=t.roughnessMap,n(t.roughnessMap,e.roughnessMapTransform)),t.envMap&&(e.envMapIntensity.value=t.envMapIntensity)}function p(e,t,r){e.ior.value=t.ior,t.sheen>0&&(e.sheenColor.value.copy(t.sheenColor).multiplyScalar(t.sheen),e.sheenRoughness.value=t.sheenRoughness,t.sheenColorMap&&(e.sheenColorMap.value=t.sheenColorMap,n(t.sheenColorMap,e.sheenColorMapTransform)),t.sheenRoughnessMap&&(e.sheenRoughnessMap.value=t.sheenRoughnessMap,n(t.sheenRoughnessMap,e.sheenRoughnessMapTransform))),t.clearcoat>0&&(e.clearcoat.value=t.clearcoat,e.clearcoatRoughness.value=t.clearcoatRoughness,t.clearcoatMap&&(e.clearcoatMap.value=t.clearcoatMap,n(t.clearcoatMap,e.clearcoatMapTransform)),t.clearcoatRoughnessMap&&(e.clearcoatRoughnessMap.value=t.clearcoatRoughnessMap,n(t.clearcoatRoughnessMap,e.clearcoatRoughnessMapTransform)),t.clearcoatNormalMap&&(e.clearcoatNormalMap.value=t.clearcoatNormalMap,n(t.clearcoatNormalMap,e.clearcoatNormalMapTransform),e.clearcoatNormalScale.value.copy(t.clearcoatNormalScale),t.side===1&&e.clearcoatNormalScale.value.negate())),t.dispersion>0&&(e.dispersion.value=t.dispersion),t.retroreflectivity>0&&(e.retroreflectivity.value=t.retroreflectivity),t.iridescence>0&&(e.iridescence.value=t.iridescence,e.iridescenceIOR.value=t.iridescenceIOR,e.iridescenceThicknessMinimum.value=t.iridescenceThicknessRange[0],e.iridescenceThicknessMaximum.value=t.iridescenceThicknessRange[1],t.iridescenceMap&&(e.iridescenceMap.value=t.iridescenceMap,n(t.iridescenceMap,e.iridescenceMapTransform)),t.iridescenceThicknessMap&&(e.iridescenceThicknessMap.value=t.iridescenceThicknessMap,n(t.iridescenceThicknessMap,e.iridescenceThicknessMapTransform))),t.transmission>0&&(e.transmission.value=t.transmission,e.transmissionSamplerMap.value=r.texture,e.transmissionSamplerSize.value.set(r.width,r.height),t.transmissionMap&&(e.transmissionMap.value=t.transmissionMap,n(t.transmissionMap,e.transmissionMapTransform)),e.thickness.value=t.thickness,t.thicknessMap&&(e.thicknessMap.value=t.thicknessMap,n(t.thicknessMap,e.thicknessMapTransform)),e.attenuationDistance.value=t.attenuationDistance,e.attenuationColor.value.copy(t.attenuationColor)),t.anisotropy>0&&(e.anisotropyVector.value.set(t.anisotropy*Math.cos(t.anisotropyRotation),t.anisotropy*Math.sin(t.anisotropyRotation)),t.anisotropyMap&&(e.anisotropyMap.value=t.anisotropyMap,n(t.anisotropyMap,e.anisotropyMapTransform))),e.specularIntensity.value=t.specularIntensity,e.specularColor.value.copy(t.specularColor),t.specularColorMap&&(e.specularColorMap.value=t.specularColorMap,n(t.specularColorMap,e.specularColorMapTransform)),t.specularIntensityMap&&(e.specularIntensityMap.value=t.specularIntensityMap,n(t.specularIntensityMap,e.specularIntensityMapTransform))}function m(e,t){t.matcap&&(e.matcap.value=t.matcap)}function h(e,n){let r=t.get(n).light;e.referencePosition.value.setFromMatrixPosition(r.matrixWorld),e.nearDistance.value=r.shadow.camera.near,e.farDistance.value=r.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:i}}function Rl(e,t,n,r){let i={},a={},o=[],s=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function c(e,t){let n=t.program;r.uniformBlockBinding(e,n)}function l(e,n){let o=i[e.id];o===void 0&&(g(e),o=u(e),i[e.id]=o,e.addEventListener(`dispose`,v));let s=n.program;r.updateUBOMapping(e,s);let c=t.render.frame;a[e.id]!==c&&(f(e),a[e.id]=c)}function u(t){let n=d();t.__bindingPointIndex=n;let r=e.createBuffer(),i=t.__size,a=t.usage;return e.bindBuffer(e.UNIFORM_BUFFER,r),e.bufferData(e.UNIFORM_BUFFER,i,a),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,n,r),r}function d(){for(let e=0;e<s;e++)if(o.indexOf(e)===-1)return o.push(e),e;return L(`WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.`),0}function f(t){let n=i[t.id],r=t.uniforms,a=t.__cache;e.bindBuffer(e.UNIFORM_BUFFER,n);for(let e=0,t=r.length;e<t;e++){let t=r[e];if(Array.isArray(t))for(let n=0,r=t.length;n<r;n++)p(t[n],e,n,a);else p(t,e,0,a)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function p(t,n,r,i){if(h(t,n,r,i)===!0){let n=t.__offset,r=t.value;if(Array.isArray(r)){let e=0;for(let n=0;n<r.length;n++){let i=r[n],a=_(i);m(i,t.__data,e),typeof i!=`number`&&typeof i!=`boolean`&&!i.isMatrix3&&!ArrayBuffer.isView(i)&&(e+=a.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(r,t.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,n,t.__data)}}function m(e,t,n){typeof e==`number`||typeof e==`boolean`?t[0]=e:e.isMatrix3?(t[0]=e.elements[0],t[1]=e.elements[1],t[2]=e.elements[2],t[3]=0,t[4]=e.elements[3],t[5]=e.elements[4],t[6]=e.elements[5],t[7]=0,t[8]=e.elements[6],t[9]=e.elements[7],t[10]=e.elements[8],t[11]=0):ArrayBuffer.isView(e)?t.set(new e.constructor(e.buffer,e.byteOffset,t.length)):e.toArray(t,n)}function h(e,t,n,r){let i=e.value,a=t+`_`+n;if(r[a]===void 0)return r[a]=typeof i==`number`||typeof i==`boolean`?i:ArrayBuffer.isView(i)?i.slice():i.clone(),!0;{let e=r[a];if(typeof i==`number`||typeof i==`boolean`){if(e!==i)return r[a]=i,!0}else if(ArrayBuffer.isView(i))return!0;else if(e.equals(i)===!1)return e.copy(i),!0}return!1}function g(e){let t=e.uniforms,n=0;for(let e=0,r=t.length;e<r;e++){let r=Array.isArray(t[e])?t[e]:[t[e]];for(let e=0,t=r.length;e<t;e++){let t=r[e],i=Array.isArray(t.value)?t.value:[t.value];for(let e=0,r=i.length;e<r;e++){let r=i[e],a=_(r),o=n%16,s=o%a.boundary,c=o+s;n+=s,c!==0&&16-c<a.storage&&(n+=16-c),t.__data=new Float32Array(a.storage/Float32Array.BYTES_PER_ELEMENT),t.__offset=n,n+=a.storage}}}let r=n%16;return r>0&&(n+=16-r),e.__size=n,e.__cache={},this}function _(e){let t={boundary:0,storage:0};return typeof e==`number`||typeof e==`boolean`?(t.boundary=4,t.storage=4):e.isVector2?(t.boundary=8,t.storage=8):e.isVector3||e.isColor?(t.boundary=16,t.storage=12):e.isVector4?(t.boundary=16,t.storage=16):e.isMatrix3?(t.boundary=48,t.storage=48):e.isMatrix4?(t.boundary=64,t.storage=64):e.isTexture?I(`WebGLRenderer: Texture samplers can not be part of an uniforms group.`):ArrayBuffer.isView(e)?(t.boundary=16,t.storage=e.byteLength):I(`WebGLRenderer: Unsupported uniform value type.`,e),t}function v(t){let n=t.target;n.removeEventListener(`dispose`,v);let r=o.indexOf(n.__bindingPointIndex);o.splice(r,1),e.deleteBuffer(i[n.id]),delete i[n.id],delete a[n.id]}function y(){for(let t in i)e.deleteBuffer(i[t]);o=[],i={},a={}}return{bind:c,update:l,dispose:y}}var zl=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),Bl=null;function Vl(){return Bl===null&&(Bl=new zr(zl,16,16,S,p),Bl.name=`DFG_LUT`,Bl.minFilter=o,Bl.magFilter=o,Bl.wrapS=t,Bl.wrapT=t,Bl.generateMipmaps=!1,Bl.needsUpdate=!0),Bl}var Hl=class{constructor(e={}){let{canvas:t=se(),context:n=null,depth:r=!0,stencil:i=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:s=!0,preserveDrawingBuffer:f=!1,powerPreference:_=`default`,failIfMajorPerformanceCaveat:v=!1,reversedDepthBuffer:y=!1,outputBufferType:b=l}=e;this.isWebGLRenderer=!0;let S;if(n!==null){if(typeof WebGLRenderingContext<`u`&&n instanceof WebGLRenderingContext)throw Error(`THREE.WebGLRenderer: WebGL 1 is not supported since r163.`);S=n.getContextAttributes().alpha}else S=a;let T=b,E=new Set([w,C,x]),D=new Set([l,d,u,g,m,h]),O=new Uint32Array(4),ee=new Int32Array(4),k=new H,A=null,M=null,N=[],P=[],te=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=0,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let F=this,ne=!1,ie=null,ae=null,oe=null,ce=null;this._outputColorSpace=j;let ue=0,de=0,pe=null,me=-1,he=null,ge=new nt,_e=new nt,ve=null,ye=new q(0),R=0,be=t.width,xe=t.height,Se=1,Ce=null,we=null,Te=new nt(0,0,be,xe),Ee=new nt(0,0,be,xe),De=!1,Oe=new ti,ke=!1,Ae=!1,je=new G,Me=new H,Ne=new nt,Pe={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Fe=!1;function Ie(){return pe===null?Se:1}let z=n;function Le(e,n){return t.getContext(e,n)}let B,Re,V,ze,U,Be,W,Ve,He,Ue,We,Ke,qe,Je,Ye,Xe,Ze,Qe,$e,et,tt,rt,at;try{let e={alpha:!0,depth:r,stencil:i,antialias:o,premultipliedAlpha:s,preserveDrawingBuffer:f,powerPreference:_,failIfMajorPerformanceCaveat:v};if(`setAttribute`in t&&t.setAttribute(`data-engine`,`three.js r186`),t.addEventListener(`webglcontextlost`,ct,!1),t.addEventListener(`webglcontextrestored`,lt,!1),t.addEventListener(`webglcontextcreationerror`,ut,!1),z===null){let t=`webgl2`;if(z=Le(t,e),z===null)throw Le(t)?Error(`THREE.WebGLRenderer: Error creating WebGL context with your selected attributes.`):Error(`THREE.WebGLRenderer: Error creating WebGL context.`)}ot()}catch(e){throw t.removeEventListener(`webglcontextlost`,ct,!1),t.removeEventListener(`webglcontextrestored`,lt,!1),t.removeEventListener(`webglcontextcreationerror`,ut,!1),L(`WebGLRenderer: `+e.message),e}function ot(){B=new os(z),B.init(),tt=new Al(z,B),Re=new Fo(z,B,e,tt),V=new Ol(z,B),Re.reversedDepthBuffer&&y&&V.buffers.depth.setReversed(!0),ae=z.createFramebuffer(),oe=z.createFramebuffer(),ce=z.createFramebuffer(),ze=new ls(z),U=new cl,Be=new kl(z,B,V,U,Re,tt,ze),W=new as(F),Ve=new Do(z),rt=new No(z,Ve),He=new ss(z,Ve,ze,rt),Ue=new ds(z,He,Ve,rt,ze),Qe=new us(z,Re,Be),Ye=new Io(U),We=new sl(F,W,B,Re,rt,Ye),Ke=new Ll(F,U),qe=new fl,Je=new yl(B),Ze=new Mo(F,W,V,Ue,S,s),Xe=new Dl(F,Ue,Re),at=new Rl(z,ze,Re,V),$e=new Po(z,B,ze),et=new cs(z,B,ze),ze.programs=We.programs,F.capabilities=Re,F.extensions=B,F.properties=U,F.renderLists=qe,F.shadowMap=Xe,F.state=V,F.info=ze}T!==1009&&(te=new ps(T,t.width,t.height,o,r,i));let st=new Pl(F,z);this.xr=st,this.getContext=function(){return z},this.getContextAttributes=function(){return z.getContextAttributes()},this.forceContextLoss=function(){let e=B.get(`WEBGL_lose_context`);e&&e.loseContext()},this.forceContextRestore=function(){let e=B.get(`WEBGL_lose_context`);e&&e.restoreContext()},this.getPixelRatio=function(){return Se},this.setPixelRatio=function(e){e!==void 0&&(Se=e,this.setSize(be,xe,!1))},this.getSize=function(e){return e.set(be,xe)},this.setSize=function(e,n,r=!0){if(st.isPresenting){I(`WebGLRenderer: Can't change size while VR device is presenting.`);return}be=e,xe=n,t.width=Math.floor(e*Se),t.height=Math.floor(n*Se),r===!0&&(t.style.width=e+`px`,t.style.height=n+`px`),te!==null&&te.setSize(t.width,t.height),this.setViewport(0,0,e,n)},this.getDrawingBufferSize=function(e){return e.set(be*Se,xe*Se).floor()},this.setDrawingBufferSize=function(e,n,r){be=e,xe=n,Se=r,t.width=Math.floor(e*r),t.height=Math.floor(n*r),this.setViewport(0,0,e,n)},this.setEffects=function(e){if(T===1009){L(`WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.`);return}if(e){for(let t=0;t<e.length;t++)if(e[t].isOutputPass===!0){I(`WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.`);break}}te.setEffects(e||[])},this.getCurrentViewport=function(e){return e.copy(ge)},this.getViewport=function(e){return e.copy(Te)},this.setViewport=function(e,t,n,r){e.isVector4?Te.set(e.x,e.y,e.z,e.w):Te.set(e,t,n,r),V.viewport(ge.copy(Te).multiplyScalar(Se).round())},this.getScissor=function(e){return e.copy(Ee)},this.setScissor=function(e,t,n,r){e.isVector4?Ee.set(e.x,e.y,e.z,e.w):Ee.set(e,t,n,r),V.scissor(_e.copy(Ee).multiplyScalar(Se).round())},this.getScissorTest=function(){return De},this.setScissorTest=function(e){V.setScissorTest(De=e)},this.setOpaqueSort=function(e){Ce=e},this.setTransparentSort=function(e){we=e},this.getClearColor=function(e){return e.copy(Ze.getClearColor())},this.setClearColor=function(){Ze.setClearColor(...arguments)},this.getClearAlpha=function(){return Ze.getClearAlpha()},this.setClearAlpha=function(){Ze.setClearAlpha(...arguments)},this.clear=function(e=!0,t=!0,n=!0){let r=0;if(e){let e=!1;if(pe!==null){let t=pe.texture.format;e=E.has(t)}if(e){let e=pe.texture.type,t=D.has(e),n=Ze.getClearColor(),r=Ze.getClearAlpha(),i=n.r,a=n.g,o=n.b;t?(O[0]=i,O[1]=a,O[2]=o,O[3]=r,z.clearBufferuiv(z.COLOR,0,O)):(ee[0]=i,ee[1]=a,ee[2]=o,ee[3]=r,z.clearBufferiv(z.COLOR,0,ee))}else r|=z.COLOR_BUFFER_BIT}t&&(r|=z.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),n&&(r|=z.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),r!==0&&z.clear(r)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(e){e.setRenderer(this),ie=e},this.dispose=function(){t.removeEventListener(`webglcontextlost`,ct,!1),t.removeEventListener(`webglcontextrestored`,lt,!1),t.removeEventListener(`webglcontextcreationerror`,ut,!1),Ze.dispose(),qe.dispose(),Je.dispose(),U.dispose(),W.dispose(),Ue.dispose(),rt.dispose(),at.dispose(),We.dispose(),st.dispose(),st.removeEventListener(`sessionstart`,_t),st.removeEventListener(`sessionend`,vt),yt.stop()};function ct(e){e.preventDefault(),le(`WebGLRenderer: Context Lost.`),ne=!0}function lt(){le(`WebGLRenderer: Context Restored.`),ne=!1;let e=ze.autoReset,t=Xe.enabled,n=Xe.autoUpdate,r=Xe.needsUpdate,i=Xe.type;ot(),ze.autoReset=e,Xe.enabled=t,Xe.autoUpdate=n,Xe.needsUpdate=r,Xe.type=i}function ut(e){L(`WebGLRenderer: A WebGL context could not be created. Reason: `,e.statusMessage)}function dt(e){let t=e.target;t.removeEventListener(`dispose`,dt),ft(t)}function ft(e){pt(e),U.remove(e)}function pt(e){let t=U.get(e).programs;t!==void 0&&(t.forEach(function(e){We.releaseProgram(e)}),e.isShaderMaterial&&We.releaseShaderCache(e))}this.renderBufferDirect=function(e,t,n,r,i,a){t===null&&(t=Pe);let o=i.isMesh&&i.matrixWorld.determinantAffine()<0,s=kt(e,t,n,r,i);V.setMaterial(r,o);let c=n.index,l=1;if(r.wireframe===!0){if(c=He.getWireframeAttribute(n),c===void 0)return;l=2}let u=n.drawRange,d=n.attributes.position,f=u.start*l,p=(u.start+u.count)*l;a!==null&&(f=Math.max(f,a.start*l),p=Math.min(p,(a.start+a.count)*l)),c===null?d!=null&&(f=Math.max(f,0),p=Math.min(p,d.count)):(f=Math.max(f,0),p=Math.min(p,c.count));let m=p-f;if(m<0||m===1/0)return;rt.setup(i,r,s,n,c);let h,g=$e;if(c!==null&&(h=Ve.get(c),g=et,g.setIndex(h)),i.isMesh)r.wireframe===!0?(V.setLineWidth(r.wireframeLinewidth*Ie()),g.setMode(z.LINES)):g.setMode(z.TRIANGLES);else if(i.isLine){let e=r.linewidth;e===void 0&&(e=1),V.setLineWidth(e*Ie()),i.isLineSegments?g.setMode(z.LINES):i.isLineLoop?g.setMode(z.LINE_LOOP):g.setMode(z.LINE_STRIP)}else i.isPoints?g.setMode(z.POINTS):i.isSprite&&g.setMode(z.TRIANGLES);if(i.isBatchedMesh){if(B.get(`WEBGL_multi_draw`))g.renderMultiDraw(i._multiDrawStarts,i._multiDrawCounts,i._multiDrawCount);else{let e=i._multiDrawStarts,t=i._multiDrawCounts,n=i._multiDrawCount,a=c?Ve.get(c).bytesPerElement:1,o=U.get(r).currentProgram.getUniforms();for(let r=0;r<n;r++)o.setValue(z,`_gl_DrawID`,r),g.render(e[r]/a,t[r])}}else if(i.isInstancedMesh)g.renderInstances(f,m,i.count);else if(n.isInstancedBufferGeometry){let e=n._maxInstanceCount===void 0?1/0:n._maxInstanceCount,t=Math.min(n.instanceCount,e);g.renderInstances(f,m,t)}else g.render(f,m)};function mt(e,t,n,r){ie!==null&&e.isNodeMaterial&&ie.setObject(r,e),ke===!0&&Ye.setState(e,n,!1),e.transparent===!0&&e.side===2&&e.forceSinglePass===!1?(e.side=1,e.needsUpdate=!0,Tt(e,t,r),e.side=0,e.needsUpdate=!0,Tt(e,t,r),e.side=2):Tt(e,t,r)}this.compile=function(e,t,n=null){n===null&&(n=e),ie!==null&&ie.renderStart(e,t,n),M=Je.get(n),M.init(t),P.push(M),n.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(M.pushLight(e),e.castShadow&&M.pushShadow(e))}),e!==n&&e.traverseVisible(function(e){e.isLight&&e.layers.test(t.layers)&&(M.pushLight(e),e.castShadow&&M.pushShadow(e))}),M.setupLights(),ie!==null&&ie.updateLights(M.state.lightsArray),Ae=this.localClippingEnabled,ke=Ye.init(this.clippingPlanes,Ae),ke===!0&&Ye.setGlobalState(this.clippingPlanes,t),ie!==null&&Xe.render(M.state.shadowsArray,n,t);let r=new Set;return e.traverse(function(e){if(!(e.isMesh||e.isPoints||e.isLine||e.isSprite))return;let i=e.material;if(i){if(Array.isArray(i))for(let a=0;a<i.length;a++){let o=i[a];mt(o,n,t,e),r.add(o)}else mt(i,n,t,e),r.add(i)}}),M=P.pop(),ie!==null&&ie.renderEnd(),r},this.compileAsync=function(e,t,n=null){let r=this.compile(e,t,n);return new Promise(t=>{function n(){if(r.forEach(function(e){let t=U.get(e).currentProgram;(t===void 0||t.isReady())&&r.delete(e)}),r.size===0){t(e);return}setTimeout(n,10)}B.get(`KHR_parallel_shader_compile`)===null?setTimeout(n,10):n()})};let ht=null;function gt(e){ht&&ht(e)}function _t(){yt.stop()}function vt(){yt.start()}let yt=new Eo;yt.setAnimationLoop(gt),typeof self<`u`&&yt.setContext(self),this.setAnimationLoop=function(e){ht=e,st.setAnimationLoop(e),e===null?yt.stop():yt.start()},st.addEventListener(`sessionstart`,_t),st.addEventListener(`sessionend`,vt),this.render=function(e,t){if(t!==void 0&&t.isCamera!==!0){L(`WebGLRenderer.render: camera is not an instance of THREE.Camera.`);return}if(ne===!0)return;ie!==null&&ie.renderStart(e,t);let n=st.enabled===!0&&st.isPresenting===!0,r=te!==null&&(pe===null||n)&&te.begin(F,pe);if(e.matrixWorldAutoUpdate===!0&&e.updateMatrixWorld(),t.parent===null&&t.matrixWorldAutoUpdate===!0&&t.updateMatrixWorld(),st.enabled===!0&&st.isPresenting===!0&&(te===null||te.isCompositing()===!1)&&(st.cameraAutoUpdate===!0&&st.updateCamera(t),t=st.getCamera()),e.isScene===!0&&e.onBeforeRender(F,e,t,pe),M=Je.get(e,P.length),M.init(t),M.state.textureUnits=Be.getTextureUnits(),P.push(M),je.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),Oe.setFromProjectionMatrix(je,re,t.reversedDepth),Ae=this.localClippingEnabled,ke=Ye.init(this.clippingPlanes,Ae),A=qe.get(e,N.length),A.init(),N.push(A),st.enabled===!0&&st.isPresenting===!0){let e=F.xr.getDepthSensingMesh();e!==null&&bt(e,t,-1/0,F.sortObjects)}bt(e,t,0,F.sortObjects),A.finish(),ie!==null&&ie.updateLights(M.state.lightsArray),F.sortObjects===!0&&A.sort(Ce,we),Fe=st.enabled===!1||st.isPresenting===!1||st.hasDepthSensing()===!1,Fe&&Ze.addToRenderList(A,e),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),ke===!0&&Ye.beginShadows();let i=M.state.shadowsArray;if(Xe.render(i,e,t),ke===!0&&Ye.endShadows(),(r&&te.hasRenderPass())===!1){let n=A.opaque,r=A.transmissive;if(M.setupLights(),t.isArrayCamera){let i=t.cameras;if(r.length>0)for(let t=0,a=i.length;t<a;t++){let a=i[t];St(n,r,e,a)}Fe&&Ze.render(e);for(let t=0,n=i.length;t<n;t++){let n=i[t];xt(A,e,n,n.viewport)}}else r.length>0&&St(n,r,e,t),Fe&&Ze.render(e),xt(A,e,t)}pe!==null&&de===0&&(Be.updateMultisampleRenderTarget(pe),Be.updateRenderTargetMipmap(pe)),r&&te.end(F),e.isScene===!0&&e.onAfterRender(F,e,t),rt.resetDefaultState(),me=-1,he=null,P.pop(),P.length>0?(M=P[P.length-1],Be.setTextureUnits(M.state.textureUnits),ke===!0&&Ye.setGlobalState(F.clippingPlanes,M.state.camera)):M=null,N.pop(),A=N.length>0?N[N.length-1]:null,ie!==null&&ie.renderEnd()};function bt(e,t,n,r){if(e.visible===!1)return;if(e.layers.test(t.layers)){if(e.isGroup)n=e.renderOrder;else if(e.isLOD)e.autoUpdate===!0&&e.update(t);else if(e.isLightProbeGrid)M.pushLightProbeGrid(e);else if(e.isLight)M.pushLight(e),e.castShadow&&M.pushShadow(e);else if(e.isSprite){if(!e.frustumCulled||e.intersectsFrustum(Oe)){r&&Ne.setFromMatrixPosition(e.matrixWorld).applyMatrix4(je);let i=Ue.update(e),a=e.material;a.visible&&A.push(e,i,a,n,Ne.z,null,t)}}else if((e.isMesh||e.isLine||e.isPoints)&&(!e.frustumCulled||e.intersectsFrustum(Oe))){let i=Ue.update(e),a=e.material;if(r&&(e.boundingSphere===void 0?(i.boundingSphere===null&&i.computeBoundingSphere(),Ne.copy(i.boundingSphere.center)):(e.boundingSphere===null&&e.computeBoundingSphere(),Ne.copy(e.boundingSphere.center)),Ne.applyMatrix4(e.matrixWorld).applyMatrix4(je)),Array.isArray(a)){let r=i.groups;for(let o=0,s=r.length;o<s;o++){let s=r[o],c=a[s.materialIndex];c&&c.visible&&A.push(e,i,c,n,Ne.z,s,t)}}else a.visible&&A.push(e,i,a,n,Ne.z,null,t)}}let i=e.children;for(let e=0,a=i.length;e<a;e++)bt(i[e],t,n,r)}function xt(e,t,n,r){let{opaque:i,transmissive:a,transparent:o}=e;M.setupLightsView(n),ke===!0&&Ye.setGlobalState(F.clippingPlanes,n),r&&V.viewport(ge.copy(r)),i.length>0&&Ct(i,t,n),a.length>0&&Ct(a,t,n),o.length>0&&Ct(o,t,n),V.buffers.depth.setTest(!0),V.buffers.depth.setMask(!0),V.buffers.color.setMask(!0),V.setPolygonOffset(!1)}function St(e,t,n,r){if((n.isScene===!0?n.overrideMaterial:null)!==null)return;if(M.state.transmissionRenderTarget[r.id]===void 0){let e=B.has(`EXT_color_buffer_half_float`)||B.has(`EXT_color_buffer_float`);M.state.transmissionRenderTarget[r.id]=new it(1,1,{generateMipmaps:!0,type:e?p:l,minFilter:c,samples:Math.max(4,Re.samples),stencilBuffer:i,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Ge.workingColorSpace})}let a=M.state.transmissionRenderTarget[r.id],o=r.viewport||ge;a.setSize(o.z*F.transmissionResolutionScale,o.w*F.transmissionResolutionScale);let s=F.getRenderTarget(),u=F.getActiveCubeFace(),d=F.getActiveMipmapLevel();F.setRenderTarget(a),F.getClearColor(ye),R=F.getClearAlpha(),R<1&&F.setClearColor(16777215,.5),F.clear(),Fe&&Ze.render(n);let f=F.toneMapping;F.toneMapping=0;let m=r.viewport;if(r.viewport!==void 0&&(r.viewport=void 0),M.setupLightsView(r),ke===!0&&Ye.setGlobalState(F.clippingPlanes,r),Ct(e,n,r),Be.updateMultisampleRenderTarget(a),Be.updateRenderTargetMipmap(a),B.has(`WEBGL_multisampled_render_to_texture`)===!1){let e=!1;for(let i=0,a=t.length;i<a;i++){let{object:a,geometry:o,material:s,group:c}=t[i];if(s.side===2&&a.layers.test(r.layers)){let t=s.side;s.side=1,s.needsUpdate=!0,wt(a,n,r,o,s,c),s.side=t,s.needsUpdate=!0,e=!0}}e===!0&&(Be.updateMultisampleRenderTarget(a),Be.updateRenderTargetMipmap(a))}F.setRenderTarget(s,u,d),F.setClearColor(ye,R),m!==void 0&&(r.viewport=m),F.toneMapping=f}function Ct(e,t,n){let r=t.isScene===!0?t.overrideMaterial:null;for(let i=0,a=e.length;i<a;i++){let a=e[i],{object:o,geometry:s,group:c}=a,l=a.material;l.allowOverride===!0&&r!==null&&(l=r),o.layers.test(n.layers)&&wt(o,t,n,s,l,c)}}function wt(e,t,n,r,i,a){ie!==null&&i.isNodeMaterial&&ie.setObject(e,i),e.onBeforeRender(F,t,n,r,i,a),e.modelViewMatrix.multiplyMatrices(n.matrixWorldInverse,e.matrixWorld),e.normalMatrix.getNormalMatrix(e.modelViewMatrix),i.onBeforeRender(F,t,n,r,e,a),i.transparent===!0&&i.side===2&&i.forceSinglePass===!1?(i.side=1,i.needsUpdate=!0,F.renderBufferDirect(n,t,r,i,e,a),i.side=0,i.needsUpdate=!0,F.renderBufferDirect(n,t,r,i,e,a),i.side=2):F.renderBufferDirect(n,t,r,i,e,a),e.onAfterRender(F,t,n,r,i,a)}function Tt(e,t,n){t.isScene!==!0&&(t=Pe);let r=U.get(e),i=M.state.lights,a=M.state.shadowsArray,o=i.state.version,s=We.getParameters(e,i.state,a,t,n,M.state.lightProbeGridArray),c=We.getProgramCacheKey(s),l=r.programs;r.environment=e.isMeshStandardMaterial||e.isMeshLambertMaterial||e.isMeshPhongMaterial?t.environment:null,r.fog=t.fog;let u=e.isMeshStandardMaterial||e.isMeshLambertMaterial&&!e.envMap||e.isMeshPhongMaterial&&!e.envMap;r.envMap=W.get(e.envMap||r.environment,u),r.envMapRotation=r.environment!==null&&e.envMap===null?t.environmentRotation:e.envMapRotation,l===void 0&&(e.addEventListener(`dispose`,dt),l=new Map,r.programs=l);let d=l.get(c);if(d!==void 0){if(r.currentProgram===d&&r.lightsStateVersion===o)return Dt(e,s),d}else s.uniforms=We.getUniforms(e),ie!==null&&e.isNodeMaterial&&ie.build(e,n,s),e.onBeforeCompile(s,F),d=We.acquireProgram(s,c),l.set(c,d),r.uniforms=s.uniforms;let f=r.uniforms;return(!e.isShaderMaterial&&!e.isRawShaderMaterial||e.clipping===!0)&&(f.clippingPlanes=Ye.uniform),Dt(e,s),r.needsLights=jt(e),r.lightsStateVersion=o,r.needsLights&&(f.ambientLightColor.value=i.state.ambient,f.lightProbe.value=i.state.probe,f.sunLights.value=i.state.sun,f.sunLightShadows.value=i.state.sunShadow,f.directionalLights.value=i.state.directional,f.directionalLightShadows.value=i.state.directionalShadow,f.spotLights.value=i.state.spot,f.spotLightShadows.value=i.state.spotShadow,f.rectAreaLights.value=i.state.rectArea,f.ltc_1.value=i.state.rectAreaLTC1,f.ltc_2.value=i.state.rectAreaLTC2,f.pointLights.value=i.state.point,f.pointLightShadows.value=i.state.pointShadow,f.hemisphereLights.value=i.state.hemi,f.sunShadowMatrix.value=i.state.sunShadowMatrix,f.sunShadowCascade.value=i.state.sunShadowCascade,f.directionalShadowMatrix.value=i.state.directionalShadowMatrix,f.spotLightMatrix.value=i.state.spotLightMatrix,f.spotLightMap.value=i.state.spotLightMap,f.pointShadowMatrix.value=i.state.pointShadowMatrix),r.lightProbeGrid=M.state.lightProbeGridArray.length>0,r.currentProgram=d,r.uniformsList=null,d}function Et(e){if(e.uniformsList===null){let t=e.currentProgram.getUniforms();e.uniformsList=bc.seqWithValue(t.seq,e.uniforms)}return e.uniformsList}function Dt(e,t){let n=U.get(e);n.outputColorSpace=t.outputColorSpace,n.batching=t.batching,n.batchingColor=t.batchingColor,n.instancing=t.instancing,n.instancingColor=t.instancingColor,n.instancingMorph=t.instancingMorph,n.skinning=t.skinning,n.morphTargets=t.morphTargets,n.morphNormals=t.morphNormals,n.morphColors=t.morphColors,n.morphTargetsCount=t.morphTargetsCount,n.numClippingPlanes=t.numClippingPlanes,n.numIntersection=t.numClipIntersection,n.vertexAlphas=t.vertexAlphas,n.vertexTangents=t.vertexTangents,n.toneMapping=t.toneMapping}function Ot(e,t){if(e.length===0)return null;if(e.length===1)return e[0].texture===null?null:e[0];k.setFromMatrixPosition(t.matrixWorld);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n.texture!==null&&n.boundingBox.containsPoint(k))return n}return null}function kt(e,t,n,r,i){t.isScene!==!0&&(t=Pe),Be.resetTextureUnits();let a=t.fog,o=r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial?t.environment:null,s=pe===null?F.outputColorSpace:pe.isXRRenderTarget===!0?pe.texture.colorSpace:Ge.workingColorSpace,c=r.isMeshStandardMaterial||r.isMeshLambertMaterial&&!r.envMap||r.isMeshPhongMaterial&&!r.envMap,l=W.get(r.envMap||o,c),u=r.vertexColors===!0&&!!n.attributes.color&&n.attributes.color.itemSize===4,d=!!n.attributes.tangent&&(!!r.normalMap||r.anisotropy>0),f=!!n.morphAttributes.position,p=!!n.morphAttributes.normal,m=!!n.morphAttributes.color,h=0;r.toneMapped&&(pe===null||pe.isXRRenderTarget===!0)&&(h=F.toneMapping);let g=n.morphAttributes.position||n.morphAttributes.normal||n.morphAttributes.color,_=g===void 0?0:g.length,v=U.get(r),y=M.state.lights;if(ke===!0&&(Ae===!0||e!==he)){let t=e===he&&r.id===me;Ye.setState(r,e,t)}let b=!1;r.version===v.__version?v.needsLights&&v.lightsStateVersion!==y.state.version?b=!0:v.outputColorSpace===s?i.isBatchedMesh&&v.batching===!1||!i.isBatchedMesh&&v.batching===!0||i.isBatchedMesh&&v.batchingColor===!0&&i._colorsTexture===null||i.isBatchedMesh&&v.batchingColor===!1&&i._colorsTexture!==null||i.isInstancedMesh&&v.instancing===!1||!i.isInstancedMesh&&v.instancing===!0||i.isSkinnedMesh&&v.skinning===!1||!i.isSkinnedMesh&&v.skinning===!0||i.isInstancedMesh&&v.instancingColor===!0&&i.instanceColor===null||i.isInstancedMesh&&v.instancingColor===!1&&i.instanceColor!==null||i.isInstancedMesh&&v.instancingMorph===!0&&i.morphTexture===null||i.isInstancedMesh&&v.instancingMorph===!1&&i.morphTexture!==null?b=!0:v.envMap===l?r.fog===!0&&v.fog!==a||v.numClippingPlanes!==void 0&&(v.numClippingPlanes!==Ye.numPlanes||v.numIntersection!==Ye.numIntersection)?b=!0:v.vertexAlphas===u&&v.vertexTangents===d&&v.morphTargets===f&&v.morphNormals===p&&v.morphColors===m&&v.toneMapping===h&&v.morphTargetsCount===_?!!v.lightProbeGrid!=M.state.lightProbeGridArray.length>0&&(b=!0):b=!0:b=!0:b=!0:(b=!0,v.__version=r.version);let x=v.currentProgram;b===!0&&(x=Tt(r,t,i),ie&&r.isNodeMaterial&&ie.onUpdateProgram(r,x,v));let S=!1,C=!1,w=!1,T=x.getUniforms(),E=v.uniforms;if(V.useProgram(x.program)&&(S=!0,C=!0,w=!0),r.id!==me&&(me=r.id,C=!0),v.needsLights){let e=Ot(M.state.lightProbeGridArray,i);v.lightProbeGrid!==e&&(v.lightProbeGrid=e,C=!0)}if(S||he!==e){V.buffers.depth.getReversed()&&e.reversedDepth!==!0&&(e._reversedDepth=!0,e.updateProjectionMatrix()),T.setValue(z,`projectionMatrix`,e.projectionMatrix),T.setValue(z,`viewMatrix`,e.matrixWorldInverse);let t=T.map.cameraPosition;t!==void 0&&t.setValue(z,Me.setFromMatrixPosition(e.matrixWorld)),Re.logarithmicDepthBuffer&&T.setValue(z,`logDepthBufFC`,2/(Math.log(e.far+1)/Math.LN2)),(r.isMeshPhongMaterial||r.isMeshToonMaterial||r.isMeshLambertMaterial||r.isMeshBasicMaterial||r.isMeshStandardMaterial||r.isShaderMaterial)&&T.setValue(z,`isOrthographic`,e.isOrthographicCamera===!0),he!==e&&(he=e,C=!0,w=!0)}if(v.needsLights&&(y.state.sunShadowMap.length>0&&T.setValue(z,`sunShadowMap`,y.state.sunShadowMap,Be),y.state.directionalShadowMap.length>0&&T.setValue(z,`directionalShadowMap`,y.state.directionalShadowMap,Be),y.state.spotShadowMap.length>0&&T.setValue(z,`spotShadowMap`,y.state.spotShadowMap,Be),y.state.pointShadowMap.length>0&&T.setValue(z,`pointShadowMap`,y.state.pointShadowMap,Be)),i.isSkinnedMesh){T.setOptional(z,i,`bindMatrix`),T.setOptional(z,i,`bindMatrixInverse`);let e=i.skeleton;e&&(e.boneTexture===null&&e.computeBoneTexture(),T.setValue(z,`boneTexture`,e.boneTexture,Be))}i.isBatchedMesh&&(T.setOptional(z,i,`batchingTexture`),T.setValue(z,`batchingTexture`,i._matricesTexture,Be),T.setOptional(z,i,`batchingIdTexture`),T.setValue(z,`batchingIdTexture`,i._indirectTexture,Be),T.setOptional(z,i,`batchingColorTexture`),i._colorsTexture!==null&&T.setValue(z,`batchingColorTexture`,i._colorsTexture,Be));let D=n.morphAttributes;if((D.position!==void 0||D.normal!==void 0||D.color!==void 0)&&Qe.update(i,n,x),(C||v.receiveShadow!==i.receiveShadow)&&(v.receiveShadow=i.receiveShadow,T.setValue(z,`receiveShadow`,i.receiveShadow)),(r.isMeshStandardMaterial||r.isMeshLambertMaterial||r.isMeshPhongMaterial)&&r.envMap===null&&t.environment!==null&&(E.envMapIntensity.value=t.environmentIntensity),E.dfgLUT!==void 0&&(E.dfgLUT.value=Vl()),C){if(T.setValue(z,`toneMappingExposure`,F.toneMappingExposure),v.needsLights&&At(E,w),a&&r.fog===!0&&Ke.refreshFogUniforms(E,a),Ke.refreshMaterialUniforms(E,r,Se,xe,M.state.transmissionRenderTarget[e.id]),v.needsLights&&v.lightProbeGrid){let e=v.lightProbeGrid;E.probesSH.value=e.texture,E.probesMin.value.copy(e.boundingBox.min),E.probesMax.value.copy(e.boundingBox.max),E.probesResolution.value.copy(e.resolution)}bc.upload(z,Et(v),E,Be)}if(r.isShaderMaterial&&r.uniformsNeedUpdate===!0&&(bc.upload(z,Et(v),E,Be),r.uniformsNeedUpdate=!1),r.isSpriteMaterial&&T.setValue(z,`center`,i.center),T.setValue(z,`modelViewMatrix`,i.modelViewMatrix),T.setValue(z,`normalMatrix`,i.normalMatrix),T.setValue(z,`modelMatrix`,i.matrixWorld),r.uniformsGroups!==void 0){let e=r.uniformsGroups;for(let t=0,n=e.length;t<n;t++){let n=e[t];at.update(n,x),at.bind(n,x)}}return x}function At(e,t){e.ambientLightColor.needsUpdate=t,e.lightProbe.needsUpdate=t,e.sunLights.needsUpdate=t,e.sunLightShadows.needsUpdate=t,e.directionalLights.needsUpdate=t,e.directionalLightShadows.needsUpdate=t,e.pointLights.needsUpdate=t,e.pointLightShadows.needsUpdate=t,e.spotLights.needsUpdate=t,e.spotLightShadows.needsUpdate=t,e.rectAreaLights.needsUpdate=t,e.hemisphereLights.needsUpdate=t}function jt(e){return e.isMeshLambertMaterial||e.isMeshToonMaterial||e.isMeshPhongMaterial||e.isMeshStandardMaterial||e.isShadowMaterial||e.isShaderMaterial&&e.lights===!0}this.getActiveCubeFace=function(){return ue},this.getActiveMipmapLevel=function(){return de},this.getRenderTarget=function(){return pe},this.setRenderTargetTextures=function(e,t,n){let r=U.get(e);r.__autoAllocateDepthBuffer=e.resolveDepthBuffer===!1,r.__autoAllocateDepthBuffer===!1&&(r.__useRenderToTexture=!1),U.get(e.texture).__webglTexture=t,U.get(e.depthTexture).__webglTexture=r.__autoAllocateDepthBuffer?void 0:n,r.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(e,t){let n=U.get(e);n.__webglFramebuffer=t,n.__useDefaultFramebuffer=t===void 0},this.setRenderTarget=function(e,t=0,n=0){pe=e,ue=t,de=n;let r=null,i=!1,a=!1;if(e){let o=U.get(e);if(o.__useDefaultFramebuffer!==void 0){V.bindFramebuffer(z.FRAMEBUFFER,o.__webglFramebuffer),ge.copy(e.viewport),_e.copy(e.scissor),ve=e.scissorTest,V.viewport(ge),V.scissor(_e),V.setScissorTest(ve),me=-1;return}if(o.__webglFramebuffer===void 0)Be.setupRenderTarget(e);else if(o.__hasExternalTextures)Be.rebindTextures(e,U.get(e.texture).__webglTexture,U.get(e.depthTexture).__webglTexture);else if(e.depthBuffer){let t=e.depthTexture;if(o.__boundDepthTexture!==t){if(t!==null&&U.has(t)&&(e.width!==t.image.width||e.height!==t.image.height))throw Error(`THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.`);Be.setupDepthRenderbuffer(e)}}let s=e.texture;(s.isData3DTexture||s.isDataArrayTexture||s.isCompressedArrayTexture)&&(a=!0);let c=U.get(e).__webglFramebuffer;e.isWebGLCubeRenderTarget?(r=Array.isArray(c[t])?c[t][n]:c[t],i=!0):r=e.samples>0&&Be.useMultisampledRTT(e)===!1?U.get(e).__webglMultisampledFramebuffer:Array.isArray(c)?c[n]:c,ge.copy(e.viewport),_e.copy(e.scissor),ve=e.scissorTest}else ge.copy(Te).multiplyScalar(Se).floor(),_e.copy(Ee).multiplyScalar(Se).floor(),ve=De;if(n!==0&&(r=ae),V.bindFramebuffer(z.FRAMEBUFFER,r)&&V.drawBuffers(e,r),V.viewport(ge),V.scissor(_e),V.setScissorTest(ve),i){let r=U.get(e.texture);z.framebufferTexture2D(z.FRAMEBUFFER,z.COLOR_ATTACHMENT0,z.TEXTURE_CUBE_MAP_POSITIVE_X+t,r.__webglTexture,n)}else if(a){let r=t;for(let t=0;t<e.textures.length;t++){let i=U.get(e.textures[t]);z.framebufferTextureLayer(z.FRAMEBUFFER,z.COLOR_ATTACHMENT0+t,i.__webglTexture,n,r)}}else if(e!==null&&n!==0){let t=U.get(e.texture);z.framebufferTexture2D(z.FRAMEBUFFER,z.COLOR_ATTACHMENT0,z.TEXTURE_2D,t.__webglTexture,n)}me=-1};function Mt(e){let t=U.get(e);return(t.__readFormat!==e.format||t.__readType!==e.type)&&(t.__readFormat=e.format,t.__readType=e.type,t.__formatReadable=Re.textureFormatReadable(e.format),t.__typeReadable=Re.textureTypeReadable(e.type)),t}this.readRenderTargetPixels=function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget)){L(`WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);return}let c=U.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){V.bindFramebuffer(z.FRAMEBUFFER,c);try{let o=e.textures[s],c=o.format,l=o.type;e.textures.length>1&&z.readBuffer(z.COLOR_ATTACHMENT0+s);let u=Mt(o);if(u.__formatReadable===!1){L(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.`);return}if(u.__typeReadable===!1){L(`WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.`);return}t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i&&z.readPixels(t,n,r,i,tt.convert(c),tt.convert(l),a)}finally{let e=pe===null?null:U.get(pe).__webglFramebuffer;V.bindFramebuffer(z.FRAMEBUFFER,e)}}},this.readRenderTargetPixelsAsync=async function(e,t,n,r,i,a,o,s=0){if(!(e&&e.isWebGLRenderTarget))throw Error(`THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.`);let c=U.get(e).__webglFramebuffer;if(e.isWebGLCubeRenderTarget&&o!==void 0&&(c=c[o]),c){if(t>=0&&t<=e.width-r&&n>=0&&n<=e.height-i){V.bindFramebuffer(z.FRAMEBUFFER,c);let o=e.textures[s],l=o.format,u=o.type;e.textures.length>1&&z.readBuffer(z.COLOR_ATTACHMENT0+s);let d=Mt(o);if(d.__formatReadable===!1)throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.`);if(d.__typeReadable===!1)throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.`);let f=z.createBuffer();z.bindBuffer(z.PIXEL_PACK_BUFFER,f),z.bufferData(z.PIXEL_PACK_BUFFER,a.byteLength,z.STREAM_READ),z.readPixels(t,n,r,i,tt.convert(l),tt.convert(u),0),z.bindBuffer(z.PIXEL_PACK_BUFFER,null);let p=pe===null?null:U.get(pe).__webglFramebuffer;V.bindFramebuffer(z.FRAMEBUFFER,p);let m=z.fenceSync(z.SYNC_GPU_COMMANDS_COMPLETE,0);return z.flush(),await fe(z,m,4),z.bindBuffer(z.PIXEL_PACK_BUFFER,f),z.getBufferSubData(z.PIXEL_PACK_BUFFER,0,a),z.bindBuffer(z.PIXEL_PACK_BUFFER,null),z.deleteBuffer(f),z.deleteSync(m),a}throw Error(`THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.`)}},this.copyFramebufferToTexture=function(e,t=null,n=0){let r=2**-n,i=Math.floor(e.image.width*r),a=Math.floor(e.image.height*r),o=t===null?0:t.x,s=t===null?0:t.y;Be.setTexture2D(e,0),z.copyTexSubImage2D(z.TEXTURE_2D,n,0,0,o,s,i,a),V.unbindTexture()},this.copyTextureToTexture=function(e,t,n=null,r=null,i=0,a=0){let o,s,c,l,u,d,f,p,m,h=e.isCompressedTexture?e.mipmaps[a]:e.image;if(n!==null)o=n.max.x-n.min.x,s=n.max.y-n.min.y,c=n.isBox3?n.max.z-n.min.z:1,l=n.min.x,u=n.min.y,d=n.isBox3?n.min.z:0;else{let t=2**-i;o=Math.floor(h.width*t),s=Math.floor(h.height*t),c=e.isDataArrayTexture?h.depth:e.isData3DTexture?Math.floor(h.depth*t):1,l=0,u=0,d=0}r===null?(f=0,p=0,m=0):(f=r.x,p=r.y,m=r.z);let g=tt.convert(t.format),_=tt.convert(t.type),v;t.isData3DTexture?(Be.setTexture3D(t,0),v=z.TEXTURE_3D):t.isDataArrayTexture||t.isCompressedArrayTexture?(Be.setTexture2DArray(t,0),v=z.TEXTURE_2D_ARRAY):(Be.setTexture2D(t,0),v=z.TEXTURE_2D),V.activeTexture(z.TEXTURE0),V.pixelStorei(z.UNPACK_FLIP_Y_WEBGL,t.flipY),V.pixelStorei(z.UNPACK_PREMULTIPLY_ALPHA_WEBGL,t.premultiplyAlpha),V.pixelStorei(z.UNPACK_ALIGNMENT,t.unpackAlignment);let y=V.getParameter(z.UNPACK_ROW_LENGTH),b=V.getParameter(z.UNPACK_IMAGE_HEIGHT),x=V.getParameter(z.UNPACK_SKIP_PIXELS),S=V.getParameter(z.UNPACK_SKIP_ROWS),C=V.getParameter(z.UNPACK_SKIP_IMAGES);V.pixelStorei(z.UNPACK_ROW_LENGTH,h.width),V.pixelStorei(z.UNPACK_IMAGE_HEIGHT,h.height),V.pixelStorei(z.UNPACK_SKIP_PIXELS,l),V.pixelStorei(z.UNPACK_SKIP_ROWS,u),V.pixelStorei(z.UNPACK_SKIP_IMAGES,d);let w=e.isDataArrayTexture||e.isData3DTexture,T=t.isDataArrayTexture||t.isData3DTexture;if(e.isDepthTexture){let n=U.get(e),r=U.get(t),h=U.get(n.__renderTarget),g=U.get(r.__renderTarget);V.bindFramebuffer(z.READ_FRAMEBUFFER,h.__webglFramebuffer),V.bindFramebuffer(z.DRAW_FRAMEBUFFER,g.__webglFramebuffer);for(let n=0;n<c;n++)w&&(z.framebufferTextureLayer(z.READ_FRAMEBUFFER,z.COLOR_ATTACHMENT0,U.get(e).__webglTexture,i,d+n),z.framebufferTextureLayer(z.DRAW_FRAMEBUFFER,z.COLOR_ATTACHMENT0,U.get(t).__webglTexture,a,m+n)),z.blitFramebuffer(l,u,o,s,f,p,o,s,z.DEPTH_BUFFER_BIT,z.NEAREST);V.bindFramebuffer(z.READ_FRAMEBUFFER,null),V.bindFramebuffer(z.DRAW_FRAMEBUFFER,null)}else if(i!==0||e.isRenderTargetTexture||U.has(e)){let n=U.get(e),r=U.get(t);V.bindFramebuffer(z.READ_FRAMEBUFFER,oe),V.bindFramebuffer(z.DRAW_FRAMEBUFFER,ce);for(let e=0;e<c;e++)w?z.framebufferTextureLayer(z.READ_FRAMEBUFFER,z.COLOR_ATTACHMENT0,n.__webglTexture,i,d+e):z.framebufferTexture2D(z.READ_FRAMEBUFFER,z.COLOR_ATTACHMENT0,z.TEXTURE_2D,n.__webglTexture,i),T?z.framebufferTextureLayer(z.DRAW_FRAMEBUFFER,z.COLOR_ATTACHMENT0,r.__webglTexture,a,m+e):z.framebufferTexture2D(z.DRAW_FRAMEBUFFER,z.COLOR_ATTACHMENT0,z.TEXTURE_2D,r.__webglTexture,a),i===0?T?z.copyTexSubImage3D(v,a,f,p,m+e,l,u,o,s):z.copyTexSubImage2D(v,a,f,p,l,u,o,s):z.blitFramebuffer(l,u,o,s,f,p,o,s,z.COLOR_BUFFER_BIT,z.NEAREST);V.bindFramebuffer(z.READ_FRAMEBUFFER,null),V.bindFramebuffer(z.DRAW_FRAMEBUFFER,null)}else T?e.isDataTexture||e.isData3DTexture?z.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h.data):t.isCompressedArrayTexture?z.compressedTexSubImage3D(v,a,f,p,m,o,s,c,g,h.data):z.texSubImage3D(v,a,f,p,m,o,s,c,g,_,h):e.isDataTexture?z.texSubImage2D(z.TEXTURE_2D,a,f,p,o,s,g,_,h.data):e.isCompressedTexture?z.compressedTexSubImage2D(z.TEXTURE_2D,a,f,p,h.width,h.height,g,h.data):z.texSubImage2D(z.TEXTURE_2D,a,f,p,o,s,g,_,h);V.pixelStorei(z.UNPACK_ROW_LENGTH,y),V.pixelStorei(z.UNPACK_IMAGE_HEIGHT,b),V.pixelStorei(z.UNPACK_SKIP_PIXELS,x),V.pixelStorei(z.UNPACK_SKIP_ROWS,S),V.pixelStorei(z.UNPACK_SKIP_IMAGES,C),a===0&&t.generateMipmaps&&z.generateMipmap(v),V.unbindTexture()},this.initRenderTarget=function(e){U.get(e).__webglFramebuffer===void 0&&Be.setupRenderTarget(e)},this.initTexture=function(e){e.isCubeTexture?Be.setTextureCube(e,0):e.isData3DTexture?Be.setTexture3D(e,0):e.isDataArrayTexture||e.isCompressedArrayTexture?Be.setTexture2DArray(e,0):Be.setTexture2D(e,0),V.unbindTexture()},this.resetState=function(){ue=0,de=0,pe=null,V.reset(),rt.reset()},typeof __THREE_DEVTOOLS__<`u`&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent(`observe`,{detail:this}))}get coordinateSystem(){return re}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorSpace=Ge._getDrawingBufferColorSpace(e),t.unpackColorSpace=Ge._getUnpackColorSpace()}};function Ul(e,t=!1){let n=e[0].index!==null,r=new Set(Object.keys(e[0].attributes)),i=new Set(Object.keys(e[0].morphAttributes)),a={},o={},s=e[0].morphTargetsRelative,c=new Ln,l=0;for(let u=0;u<e.length;++u){let d=e[u],f=0;if(n!==(d.index!==null))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.`),null;for(let e in d.attributes){if(!r.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. All geometries must have compatible attributes; make sure "`+e+`" attribute exists among all geometries, or in none of them.`),null;a[e]===void 0&&(a[e]=[]),a[e].push(d.attributes[e]),f++}if(f!==r.size)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. Make sure all geometries have the same number of attributes.`),null;if(s!==d.morphTargetsRelative)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. .morphTargetsRelative must be consistent throughout all geometries.`),null;for(let e in d.morphAttributes){if(!i.has(e))return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`.  .morphAttributes must be consistent throughout all geometries.`),null;o[e]===void 0&&(o[e]=[]),o[e].push(d.morphAttributes[e])}if(t){let e;if(n)e=d.index.count;else if(d.attributes.position!==void 0)e=d.attributes.position.count;else return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index `+u+`. The geometry must have either an index or a position attribute`),null;c.addGroup(l,e,u),l+=e}}if(n){let t=0,n=[];for(let r=0;r<e.length;++r){let i=e[r].index;for(let e=0;e<i.count;++e)n.push(i.getX(e)+t);t+=e[r].attributes.position.count}c.setIndex(n)}for(let e in a){let t=Wl(a[e]);if(!t)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` attribute.`),null;c.setAttribute(e,t)}for(let e in o){let t=o[e][0].length;if(t!==0){c.morphAttributes=c.morphAttributes||{},c.morphAttributes[e]=[];for(let n=0;n<t;++n){let t=[];for(let r=0;r<o[e].length;++r)t.push(o[e][r][n]);let r=Wl(t);if(!r)return console.error(`THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the `+e+` morphAttribute.`),null;c.morphAttributes[e].push(r)}}}return c}function Wl(e){let t,n,r,i=-1,a=0;for(let o=0;o<e.length;++o){let s=e[o];if(t===void 0&&(t=s.array.constructor),t!==s.array.constructor)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.`),null;if(n===void 0&&(n=s.itemSize),n!==s.itemSize)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.`),null;if(r===void 0&&(r=s.normalized),r!==s.normalized)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.`),null;if(i===-1&&(i=s.gpuType),i!==s.gpuType)return console.error(`THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.`),null;a+=s.count*n}let o=new t(a),s=new Sn(o,n,r),c=0;for(let t=0;t<e.length;++t){let r=e[t];if(r.isInterleavedBufferAttribute){let e=c/n;for(let t=0,i=r.count;t<i;t++)for(let i=0;i<n;i++){let n=r.getComponent(t,i);s.setComponent(t+e,i,n)}}else o.set(r.array,c);c+=r.count*n}return i!==void 0&&(s.gpuType=i),s}function Gl(e,t=1e-4){t=Math.max(t,2**-52);let n={},r=e.getIndex(),i=e.getAttribute(`position`),a=r?r.count:i.count,o=0,s=Object.keys(e.attributes),c={},l={},u=[],d=[`getX`,`getY`,`getZ`,`getW`],f=[`setX`,`setY`,`setZ`,`setW`];for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.attributes[n];c[n]=new r.constructor(new r.array.constructor(r.count*r.itemSize),r.itemSize,r.normalized);let i=e.morphAttributes[n];i&&(l[n]||(l[n]=[]),i.forEach((e,t)=>{let r=new e.array.constructor(e.count*e.itemSize);l[n][t]=new e.constructor(r,e.itemSize,e.normalized)}))}let p=t*.5,m=10**Math.log10(1/t),h=p*m;for(let t=0;t<a;t++){let i=r?r.getX(t):t,a=``;for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.getAttribute(n),o=r.itemSize;for(let e=0;e<o;e++)a+=`${Math.trunc(r[d[e]](i)*m+h)},`}if(a in n)u.push(n[a]);else{for(let t=0,n=s.length;t<n;t++){let n=s[t],r=e.getAttribute(n),a=e.morphAttributes[n],u=r.itemSize,p=c[n],m=l[n];for(let e=0;e<u;e++){let t=d[e],n=f[e];if(p[n](o,r[t](i)),a)for(let e=0,r=a.length;e<r;e++)m[e][n](o,a[e][t](i))}}n[a]=o,u.push(o),o++}}let g=e.clone();for(let t in e.attributes){let e=c[t];if(g.setAttribute(t,new e.constructor(e.array.slice(0,o*e.itemSize),e.itemSize,e.normalized)),t in l)for(let e=0;e<l[t].length;e++){let n=l[t][e];g.morphAttributes[t][e]=new n.constructor(n.array.slice(0,o*n.itemSize),n.itemSize,n.normalized)}}return g.setIndex(u),g}function Kl(e,t){if(t===0)return console.warn(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles.`),e;if(t===2||t===1){let n=e.getIndex();if(n===null){let t=[],r=e.getAttribute(`position`);if(r!==void 0){for(let e=0;e<r.count;e++)t.push(e);e.setIndex(t),n=e.getIndex()}else return console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible.`),e}let r=n.count-2,i=[];if(t===2)for(let e=1;e<=r;e++)i.push(n.getX(0)),i.push(n.getX(e)),i.push(n.getX(e+1));else for(let e=0;e<r;e++)e%2==0?(i.push(n.getX(e)),i.push(n.getX(e+1)),i.push(n.getX(e+2))):(i.push(n.getX(e+2)),i.push(n.getX(e+1)),i.push(n.getX(e)));return i.length/3!==r&&console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.`),e.setIndex(i),e.clearGroups(),e}return console.error(`THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:`,t),e}function ql(e){let t=new Map,n=new Map,r=e.clone();return Jl(e,r,function(e,r){t.set(r,e),n.set(e,r)}),r.traverse(function(e){if(!e.isSkinnedMesh)return;let r=e,i=t.get(e),a=i.skeleton.bones;r.skeleton=i.skeleton.clone(),r.bindMatrix.copy(i.bindMatrix),r.skeleton.bones=a.map(function(e){return n.get(e)}),r.bind(r.skeleton,r.bindMatrix)}),r}function Jl(e,t,n){n(e,t);for(let r=0;r<e.children.length;r++)Jl(e.children[r],t.children[r],n)}var Yl=class extends Da{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(e){return new nu(e)}),this.register(function(e){return new ru(e)}),this.register(function(e){return new fu(e)}),this.register(function(e){return new pu(e)}),this.register(function(e){return new mu(e)}),this.register(function(e){return new au(e)}),this.register(function(e){return new ou(e)}),this.register(function(e){return new su(e)}),this.register(function(e){return new cu(e)}),this.register(function(e){return new tu(e)}),this.register(function(e){return new lu(e)}),this.register(function(e){return new iu(e)}),this.register(function(e){return new du(e)}),this.register(function(e){return new uu(e)}),this.register(function(e){return new $l(e)}),this.register(function(e){return new hu(e,Ql.EXT_MESHOPT_COMPRESSION)}),this.register(function(e){return new hu(e,Ql.KHR_MESHOPT_COMPRESSION)}),this.register(function(e){return new gu(e)})}load(e,t,n,r){let i=this,a;if(this.resourcePath!==``)a=this.resourcePath;else if(this.path!==``){let t=to.extractUrlBase(e);a=to.resolveURL(t,this.path)}else a=to.extractUrlBase(e);this.manager.itemStart(e);let o=function(t){r?r(t):console.error(t),i.manager.itemError(e),i.manager.itemEnd(e)},s=new Aa(this.manager);s.setPath(this.path),s.setResponseType(`arraybuffer`),s.setRequestHeader(this.requestHeader),s.setWithCredentials(this.withCredentials),s.load(e,function(n){try{i.parse(n,a,function(n){t(n),i.manager.itemEnd(e)},o)}catch(e){o(e)}},n,o)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,r){let i,a={},o={},s=new TextDecoder;if(typeof e==`string`)i=JSON.parse(e);else if(e instanceof ArrayBuffer){if(s.decode(new Uint8Array(e,0,4))===_u){try{a[Ql.KHR_BINARY_GLTF]=new bu(e)}catch(e){r&&r(e);return}i=JSON.parse(a[Ql.KHR_BINARY_GLTF].content)}else i=JSON.parse(s.decode(e))}else i=e;if(i.asset===void 0||i.asset.version[0]<2){r&&r(Error(`THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.`));return}let c=new Ku(i,{path:t||this.resourcePath||``,crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let e=0;e<this.pluginCallbacks.length;e++){let t=this.pluginCallbacks[e](c);t.name||console.error(`THREE.GLTFLoader: Invalid plugin found: missing name`),o[t.name]=t,a[t.name]=!0}if(i.extensionsUsed)for(let e=0;e<i.extensionsUsed.length;++e){let t=i.extensionsUsed[e],n=i.extensionsRequired||[];switch(t){case Ql.KHR_MATERIALS_UNLIT:a[t]=new eu;break;case Ql.KHR_DRACO_MESH_COMPRESSION:a[t]=new xu(i,this.dracoLoader);break;case Ql.KHR_TEXTURE_TRANSFORM:a[t]=new Su;break;case Ql.KHR_MESH_QUANTIZATION:a[t]=new Cu;break;default:n.indexOf(t)>=0&&o[t]===void 0&&console.warn(`THREE.GLTFLoader: Unknown extension "`+t+`".`)}}c.setExtensions(a),c.setPlugins(o),c.parse(n,r)}parseAsync(e,t){let n=this;return new Promise(function(r,i){n.parse(e,t,r,i)})}};function Xl(){let e={};return{get:function(t){return e[t]},add:function(t,n){e[t]=n},remove:function(t){delete e[t]},removeAll:function(){e={}}}}function Zl(e,t,n){let r=e.json.materials[t];return r.extensions&&r.extensions[n]?r.extensions[n]:null}var Ql={KHR_BINARY_GLTF:`KHR_binary_glTF`,KHR_DRACO_MESH_COMPRESSION:`KHR_draco_mesh_compression`,KHR_LIGHTS_PUNCTUAL:`KHR_lights_punctual`,KHR_MATERIALS_CLEARCOAT:`KHR_materials_clearcoat`,KHR_MATERIALS_DISPERSION:`KHR_materials_dispersion`,KHR_MATERIALS_IOR:`KHR_materials_ior`,KHR_MATERIALS_SHEEN:`KHR_materials_sheen`,KHR_MATERIALS_SPECULAR:`KHR_materials_specular`,KHR_MATERIALS_TRANSMISSION:`KHR_materials_transmission`,KHR_MATERIALS_IRIDESCENCE:`KHR_materials_iridescence`,KHR_MATERIALS_ANISOTROPY:`KHR_materials_anisotropy`,KHR_MATERIALS_UNLIT:`KHR_materials_unlit`,KHR_MATERIALS_VOLUME:`KHR_materials_volume`,KHR_TEXTURE_BASISU:`KHR_texture_basisu`,KHR_TEXTURE_TRANSFORM:`KHR_texture_transform`,KHR_MESH_QUANTIZATION:`KHR_mesh_quantization`,KHR_MATERIALS_EMISSIVE_STRENGTH:`KHR_materials_emissive_strength`,EXT_MATERIALS_BUMP:`EXT_materials_bump`,EXT_TEXTURE_WEBP:`EXT_texture_webp`,EXT_TEXTURE_AVIF:`EXT_texture_avif`,EXT_MESHOPT_COMPRESSION:`EXT_meshopt_compression`,KHR_MESHOPT_COMPRESSION:`KHR_meshopt_compression`,EXT_MESH_GPU_INSTANCING:`EXT_mesh_gpu_instancing`},$l=class{constructor(e){this.parser=e,this.name=Ql.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,r=t.length;n<r;n++){let r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n=`light:`+e,r=t.cache.get(n);if(r)return r;let i=t.json,a=((i.extensions&&i.extensions[this.name]||{}).lights||[])[e],o,s=new q(16777215);a.color!==void 0&&s.setRGB(a.color[0],a.color[1],a.color[2],M);let c=a.range===void 0?0:a.range;switch(a.type){case`directional`:o=new eo(s),o.target.position.set(0,0,-1),o.add(o.target);break;case`point`:o=new Za(s),o.distance=c;break;case`spot`:o=new Ya(s),o.distance=c,a.spot=a.spot||{},a.spot.innerConeAngle=a.spot.innerConeAngle===void 0?0:a.spot.innerConeAngle,a.spot.outerConeAngle=a.spot.outerConeAngle===void 0?Math.PI/4:a.spot.outerConeAngle,o.angle=a.spot.outerConeAngle,o.penumbra=1-a.spot.innerConeAngle/a.spot.outerConeAngle,o.target.position.set(0,0,-1),o.add(o.target);break;default:throw Error(`THREE.GLTFLoader: Unexpected light type: `+a.type)}return o.position.set(0,0,0),Ru(o,a),a.intensity!==void 0&&(o.intensity=a.intensity),o.name=t.createUniqueName(a.name||`light_`+e),r=Promise.resolve(o),t.cache.add(n,r),r}getDependency(e,t){if(e===`light`)return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],i=(r.extensions&&r.extensions[this.name]||{}).light;return i===void 0?null:this._loadLight(i).then(function(e){return n._getNodeRef(t.cache,i,e)})}},eu=class{constructor(){this.name=Ql.KHR_MATERIALS_UNLIT}getMaterialType(){return mr}extendParams(e,t,n){let r=[];e.color=new q(1,1,1),e.opacity=1;let i=t.pbrMetallicRoughness;if(i){if(Array.isArray(i.baseColorFactor)){let t=i.baseColorFactor;e.color.setRGB(t[0],t[1],t[2],M),e.opacity=t[3]}i.baseColorTexture!==void 0&&r.push(n.assignTexture(e,`map`,i.baseColorTexture,j))}return Promise.all(r)}},tu=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);return n===null||n.emissiveStrength!==void 0&&(t.emissiveIntensity=n.emissiveStrength),Promise.resolve()}},nu=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];if(n.clearcoatFactor!==void 0&&(t.clearcoat=n.clearcoatFactor),n.clearcoatTexture!==void 0&&r.push(this.parser.assignTexture(t,`clearcoatMap`,n.clearcoatTexture)),n.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=n.clearcoatRoughnessFactor),n.clearcoatRoughnessTexture!==void 0&&r.push(this.parser.assignTexture(t,`clearcoatRoughnessMap`,n.clearcoatRoughnessTexture)),n.clearcoatNormalTexture!==void 0&&(r.push(this.parser.assignTexture(t,`clearcoatNormalMap`,n.clearcoatNormalTexture)),n.clearcoatNormalTexture.scale!==void 0)){let e=n.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new V(e,e)}return Promise.all(r)}},ru=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_DISPERSION}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);return n===null||(t.dispersion=n.dispersion===void 0?0:n.dispersion),Promise.resolve()}},iu=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return n.iridescenceFactor!==void 0&&(t.iridescence=n.iridescenceFactor),n.iridescenceTexture!==void 0&&r.push(this.parser.assignTexture(t,`iridescenceMap`,n.iridescenceTexture)),n.iridescenceIor!==void 0&&(t.iridescenceIOR=n.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),n.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=n.iridescenceThicknessMinimum),n.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=n.iridescenceThicknessMaximum),n.iridescenceThicknessTexture!==void 0&&r.push(this.parser.assignTexture(t,`iridescenceThicknessMap`,n.iridescenceThicknessTexture)),Promise.all(r)}},au=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_SHEEN}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];if(t.sheenColor=new q(0,0,0),t.sheenRoughness=0,t.sheen=1,n.sheenColorFactor!==void 0){let e=n.sheenColorFactor;t.sheenColor.setRGB(e[0],e[1],e[2],M)}return n.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=n.sheenRoughnessFactor),n.sheenColorTexture!==void 0&&r.push(this.parser.assignTexture(t,`sheenColorMap`,n.sheenColorTexture,j)),n.sheenRoughnessTexture!==void 0&&r.push(this.parser.assignTexture(t,`sheenRoughnessMap`,n.sheenRoughnessTexture)),Promise.all(r)}},ou=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return n.transmissionFactor!==void 0&&(t.transmission=n.transmissionFactor),n.transmissionTexture!==void 0&&r.push(this.parser.assignTexture(t,`transmissionMap`,n.transmissionTexture)),Promise.all(r)}},su=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_VOLUME}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];t.thickness=n.thicknessFactor===void 0?0:n.thicknessFactor,n.thicknessTexture!==void 0&&r.push(this.parser.assignTexture(t,`thicknessMap`,n.thicknessTexture)),t.attenuationDistance=n.attenuationDistance||1/0;let i=n.attenuationColor||[1,1,1];return t.attenuationColor=new q().setRGB(i[0],i[1],i[2],M),Promise.all(r)}},cu=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_IOR}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);return n===null?Promise.resolve():(t.ior=n.ior===void 0?1.5:n.ior,t.ior===0&&(t.ior=1e3),Promise.resolve())}},lu=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_SPECULAR}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];t.specularIntensity=n.specularFactor===void 0?1:n.specularFactor,n.specularTexture!==void 0&&r.push(this.parser.assignTexture(t,`specularIntensityMap`,n.specularTexture));let i=n.specularColorFactor||[1,1,1];return t.specularColor=new q().setRGB(i[0],i[1],i[2],M),n.specularColorTexture!==void 0&&r.push(this.parser.assignTexture(t,`specularColorMap`,n.specularColorTexture,j)),Promise.all(r)}},uu=class{constructor(e){this.parser=e,this.name=Ql.EXT_MATERIALS_BUMP}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return t.bumpScale=n.bumpFactor===void 0?1:n.bumpFactor,n.bumpTexture!==void 0&&r.push(this.parser.assignTexture(t,`bumpMap`,n.bumpTexture)),Promise.all(r)}},du=class{constructor(e){this.parser=e,this.name=Ql.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return Zl(this.parser,e,this.name)===null?null:Xi}extendMaterialParams(e,t){let n=Zl(this.parser,e,this.name);if(n===null)return Promise.resolve();let r=[];return n.anisotropyStrength!==void 0&&(t.anisotropy=n.anisotropyStrength),n.anisotropyRotation!==void 0&&(t.anisotropyRotation=n.anisotropyRotation),n.anisotropyTexture!==void 0&&r.push(this.parser.assignTexture(t,`anisotropyMap`,n.anisotropyTexture)),Promise.all(r)}},fu=class{constructor(e){this.parser=e,this.name=Ql.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,r=n.textures[e];if(!r.extensions||!r.extensions[this.name])return null;let i=r.extensions[this.name],a=t.options.ktx2Loader;if(!a){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw Error(`THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures`);return null}return t.loadTextureImage(e,i.source,a)}},pu=class{constructor(e){this.parser=e,this.name=Ql.EXT_TEXTURE_WEBP}loadTexture(e){let t=this.name,n=this.parser,r=n.json,i=r.textures[e];if(!i.extensions||!i.extensions[t])return null;let a=i.extensions[t],o=r.images[a.source],s=n.textureLoader;if(o.uri){let e=n.options.manager.getHandler(o.uri);e!==null&&(s=e)}return n.loadTextureImage(e,a.source,s)}},mu=class{constructor(e){this.parser=e,this.name=Ql.EXT_TEXTURE_AVIF}loadTexture(e){let t=this.name,n=this.parser,r=n.json,i=r.textures[e];if(!i.extensions||!i.extensions[t])return null;let a=i.extensions[t],o=r.images[a.source],s=n.textureLoader;if(o.uri){let e=n.options.manager.getHandler(o.uri);e!==null&&(s=e)}return n.loadTextureImage(e,a.source,s)}},hu=class{constructor(e,t){this.name=t,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let e=n.extensions[this.name],r=this.parser.getDependency(`buffer`,e.buffer),i=this.parser.options.meshoptDecoder;if(!i||!i.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw Error(`THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files`);return null}return r.then(function(t){let n=e.byteOffset||0,r=e.byteLength||0,a=e.count,o=e.byteStride,s=new Uint8Array(t,n,r);return i.decodeGltfBufferAsync?i.decodeGltfBufferAsync(a,o,s,e.mode,e.filter).then(function(e){return e.buffer}):i.ready.then(function(){let t=new ArrayBuffer(a*o);return i.decodeGltfBuffer(new Uint8Array(t),a,o,s,e.mode,e.filter),t})})}return null}},gu=class{constructor(e){this.name=Ql.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let r=t.meshes[n.mesh];for(let e of r.primitives)if(e.mode!==Du.TRIANGLES&&e.mode!==Du.TRIANGLE_STRIP&&e.mode!==Du.TRIANGLE_FAN&&e.mode!==void 0)return null;let i=n.extensions[this.name].attributes,a=[],o={};for(let e in i)a.push(this.parser.getDependency(`accessor`,i[e]).then(t=>(o[e]=t,o[e])));return a.length<1?null:(a.push(this.parser.createNodeMesh(e)),Promise.all(a).then(e=>{let t=e.pop(),n=t.isGroup?t.children:[t],r=e[0].count,i=[];for(let e of n){let t=new G,n=new H,a=new ze,s=new H(1,1,1),c=new Zr(e.geometry,e.material,r);for(let e=0;e<r;e++)o.TRANSLATION&&n.fromBufferAttribute(o.TRANSLATION,e),o.ROTATION&&a.fromBufferAttribute(o.ROTATION,e),o.SCALE&&s.fromBufferAttribute(o.SCALE,e),c.setMatrixAt(e,t.compose(n,a,s));let l=null;for(let e in o)if(e===`_COLOR_0`){let t=o[e];c.instanceColor=new Ur(t.array,t.itemSize,t.normalized)}else if(e!==`TRANSLATION`&&e!==`ROTATION`&&e!==`SCALE`){if(l===null){let e=c.geometry;l=new Ln,l.name=e.name;for(let t in e.attributes)l.setAttribute(t,e.attributes[t]);for(let t in e.morphAttributes)l.morphAttributes[t]=e.morphAttributes[t];e.index!==null&&l.setIndex(e.index),l.morphTargetsRelative=e.morphTargetsRelative;for(let t of e.groups)l.addGroup(t.start,t.count,t.materialIndex);e.boundingBox!==null&&(l.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(l.boundingSphere=e.boundingSphere.clone()),l.drawRange.start=e.drawRange.start,l.drawRange.count=e.drawRange.count,l.userData=Object.assign({},e.userData),c.geometry=l}let t=o[e];l.setAttribute(e,new Ur(t.array,t.itemSize,t.normalized))}Nt.prototype.copy.call(c,e),this.parser.assignFinalMaterial(c),i.push(c)}return t.isGroup?(t.clear(),t.add(...i),t):i[0]}))}},_u=`glTF`,vu=12,yu={JSON:1313821514,BIN:5130562},bu=class{constructor(e){this.name=Ql.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,vu),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==_u)throw Error(`THREE.GLTFLoader: Unsupported glTF-Binary header.`);if(this.header.version<2)throw Error(`THREE.GLTFLoader: Legacy binary file detected.`);let r=this.header.length-vu,i=new DataView(e,vu),a=0;for(;a<r;){let t=i.getUint32(a,!0);a+=4;let r=i.getUint32(a,!0);if(a+=4,r===yu.JSON){let r=new Uint8Array(e,vu+a,t);this.content=n.decode(r)}else if(r===yu.BIN){let n=vu+a;this.body=e.slice(n,n+t)}a+=t}if(this.content===null)throw Error(`THREE.GLTFLoader: JSON content not found.`)}},xu=class{constructor(e,t){if(!t)throw Error(`THREE.GLTFLoader: No DRACOLoader instance provided.`);this.name=Ql.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,r=this.dracoLoader,i=e.extensions[this.name].bufferView,a=e.extensions[this.name].attributes,o={},s={},c={};for(let e in a){let t=Mu[e]||e.toLowerCase();o[t]=a[e]}for(let t in e.attributes){let r=Mu[t]||t.toLowerCase();if(a[t]!==void 0){let i=n.accessors[e.attributes[t]];c[r]=Ou[i.componentType].name,s[r]=i.normalized===!0}}return t.getDependency(`bufferView`,i).then(function(e){return new Promise(function(t,n){r.decodeDracoFile(e,function(e){for(let t in e.attributes){let n=e.attributes[t],r=s[t];r!==void 0&&(n.normalized=r)}t(e)},o,c,M,n)})})}},Su=class{constructor(){this.name=Ql.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){if((t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0)return e;if(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),t.rotation!==void 0){let t=Math.cos(e.rotation),n=Math.sin(e.rotation);e.matrix.set(e.repeat.x*t,e.repeat.y*n,e.offset.x,-e.repeat.x*n,e.repeat.y*t,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}},Cu=class{constructor(){this.name=Ql.KHR_MESH_QUANTIZATION}},wu=class extends ia{constructor(e,t,n,r){super(e,t,n,r)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,r=this.valueSize,i=e*r*3+r;for(let e=0;e!==r;e++)t[e]=n[i+e];return t}interpolate_(e,t,n,r){let i=this.resultBuffer,a=this.sampleValues,o=this.valueSize,s=o*2,c=o*3,l=r-t,u=(n-t)/l,d=u*u,f=d*u,p=e*c,m=p-c,h=-2*f+3*d,g=f-d,_=1-h,v=g-d+u;for(let e=0;e!==o;e++){let t=a[m+e+o],n=a[m+e+s]*l,r=a[p+e+o],c=a[p+e]*l;i[e]=_*t+v*n+h*r+g*c}return i}},Tu=new ze,Eu=class extends wu{interpolate_(e,t,n,r){let i=super.interpolate_(e,t,n,r);return Tu.fromArray(i).normalize().toArray(i),i}},Du={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Ou={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},ku={9728:r,9729:o,9984:i,9985:s,9986:a,9987:c},Au={33071:t,33648:n,10497:e},ju={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Mu={POSITION:`position`,NORMAL:`normal`,TANGENT:`tangent`,TEXCOORD_0:`uv`,TEXCOORD_1:`uv1`,TEXCOORD_2:`uv2`,TEXCOORD_3:`uv3`,COLOR_0:`color`,WEIGHTS_0:`skinWeight`,JOINTS_0:`skinIndex`},Nu={scale:`scale`,translation:`position`,rotation:`quaternion`,weights:`morphTargetInfluences`},Pu={CUBICSPLINE:void 0,LINEAR:E,STEP:T},Fu={OPAQUE:`OPAQUE`,MASK:`MASK`,BLEND:`BLEND`};function Iu(e){return e.DefaultMaterial===void 0&&(e.DefaultMaterial=new Yi({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:0})),e.DefaultMaterial}function Lu(e,t,n){for(let r in n.extensions)e[r]===void 0&&(t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[r]=n.extensions[r])}function Ru(e,t){t.extras!==void 0&&(typeof t.extras==`object`?Object.assign(e.userData,t.extras):console.warn(`THREE.GLTFLoader: Ignoring primitive type .extras, `+t.extras))}function zu(e,t,n){let r=!1,i=!1,a=!1;for(let e=0,n=t.length;e<n;e++){let n=t[e];if(n.POSITION!==void 0&&(r=!0),n.NORMAL!==void 0&&(i=!0),n.COLOR_0!==void 0&&(a=!0),r&&i&&a)break}if(!r&&!i&&!a)return Promise.resolve(e);let o=[],s=[],c=[];for(let l=0,u=t.length;l<u;l++){let u=t[l];if(r){let t=u.POSITION===void 0?e.attributes.position:n.getDependency(`accessor`,u.POSITION);o.push(t)}if(i){let t=u.NORMAL===void 0?e.attributes.normal:n.getDependency(`accessor`,u.NORMAL);s.push(t)}if(a){let t=u.COLOR_0===void 0?e.attributes.color:n.getDependency(`accessor`,u.COLOR_0);c.push(t)}}return Promise.all([Promise.all(o),Promise.all(s),Promise.all(c)]).then(function(t){let n=t[0],o=t[1],s=t[2];return r&&(e.morphAttributes.position=n),i&&(e.morphAttributes.normal=o),a&&(e.morphAttributes.color=s),e.morphTargetsRelative=!0,e})}function Bu(e,t){if(e.updateMorphTargets(),t.weights!==void 0)for(let n=0,r=t.weights.length;n<r;n++)e.morphTargetInfluences[n]=t.weights[n];if(t.extras&&Array.isArray(t.extras.targetNames)){let n=t.extras.targetNames;if(e.morphTargetInfluences.length===n.length){e.morphTargetDictionary={};for(let t=0,r=n.length;t<r;t++)e.morphTargetDictionary[n[t]]=t}else console.warn(`THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.`)}}function Vu(e){let t,n=e.extensions&&e.extensions[Ql.KHR_DRACO_MESH_COMPRESSION];if(t=n?`draco:`+n.bufferView+`:`+n.indices+`:`+Hu(n.attributes):e.indices+`:`+Hu(e.attributes)+`:`+e.mode,e.targets!==void 0)for(let n=0,r=e.targets.length;n<r;n++)t+=`:`+Hu(e.targets[n]);return t}function Hu(e){let t=``,n=Object.keys(e).sort();for(let r=0,i=n.length;r<i;r++)t+=n[r]+`:`+e[n[r]]+`;`;return t}function Uu(e){switch(e){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw Error(`THREE.GLTFLoader: Unsupported normalized accessor component type.`)}}function Wu(e){return e.search(/\.jpe?g($|\?)/i)>0||e.search(/^data\:image\/jpeg/)===0?`image/jpeg`:e.search(/\.webp($|\?)/i)>0||e.search(/^data\:image\/webp/)===0?`image/webp`:e.search(/\.ktx2($|\?)/i)>0||e.search(/^data\:image\/ktx2/)===0?`image/ktx2`:`image/png`}var Gu=new G,Ku=class{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new Xl,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,r=-1,i=!1,a=-1;if(typeof navigator<`u`&&navigator.userAgent!==void 0){let e=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(e)===!0;let t=e.match(/Version\/(\d+)/);r=n&&t?parseInt(t[1],10):-1,i=e.indexOf(`Firefox`)>-1,a=i?e.match(/Firefox\/([0-9]+)\./)[1]:-1}this.textureLoader=typeof createImageBitmap>`u`||n&&r<17||i&&a<98?new Na(this.options.manager):new io(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Aa(this.options.manager),this.fileLoader.setResponseType(`arraybuffer`),this.options.crossOrigin===`use-credentials`&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,r=this.json,i=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(e){return e._markDefs&&e._markDefs()}),Promise.all(this._invokeAll(function(e){return e.beforeRoot&&e.beforeRoot()})).then(function(){return Promise.all([n.getDependencies(`scene`),n.getDependencies(`animation`),n.getDependencies(`camera`)])}).then(function(t){let a={scene:t[0][r.scene||0],scenes:t[0],animations:t[1],cameras:t[2],asset:r.asset,parser:n,userData:{}};return Lu(i,a,r),Ru(a,r),Promise.all(n._invokeAll(function(e){return e.afterRoot&&e.afterRoot(a)})).then(function(){for(let e of a.scenes)e.updateMatrixWorld();e(a)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let n=0,r=t.length;n<r;n++){let r=t[n].joints;for(let t=0,n=r.length;t<n;t++)e[r[t]].isBone=!0}for(let t=0,r=e.length;t<r;t++){let r=e[t];r.mesh!==void 0&&(this._addNodeRef(this.meshCache,r.mesh),r.skin!==void 0&&(n[r.mesh].isSkinnedMesh=!0)),r.camera!==void 0&&this._addNodeRef(this.cameraCache,r.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let r=n.clone(),i=(e,t)=>{let n=this.associations.get(e);n!=null&&this.associations.set(t,n);for(let[n,r]of e.children.entries())i(r,t.children[n])};return i(n,r),r.name+=`_instance_`+e.uses[t]++,r}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let r=e(t[n]);if(r)return r}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let r=0;r<t.length;r++){let i=e(t[r]);i&&n.push(i)}return n}getDependency(e,t){let n=e+`:`+t,r=this.cache.get(n);if(!r){switch(e){case`scene`:r=this.loadScene(t);break;case`node`:r=this._invokeOne(function(e){return e.loadNode&&e.loadNode(t)});break;case`mesh`:r=this._invokeOne(function(e){return e.loadMesh&&e.loadMesh(t)});break;case`accessor`:r=this.loadAccessor(t);break;case`bufferView`:r=this._invokeOne(function(e){return e.loadBufferView&&e.loadBufferView(t)});break;case`buffer`:r=this.loadBuffer(t);break;case`material`:r=this._invokeOne(function(e){return e.loadMaterial&&e.loadMaterial(t)});break;case`texture`:r=this._invokeOne(function(e){return e.loadTexture&&e.loadTexture(t)});break;case`skin`:r=this.loadSkin(t);break;case`animation`:r=this._invokeOne(function(e){return e.loadAnimation&&e.loadAnimation(t)});break;case`camera`:r=this.loadCamera(t);break;default:if(r=this._invokeOne(function(n){return n!=this&&n.getDependency&&n.getDependency(e,t)}),!r)throw Error(`Unknown type: `+e)}this.cache.add(n,r)}return r}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,r=this.json[e+(e===`mesh`?`es`:`s`)]||[];t=Promise.all(r.map(function(t,r){return n.getDependency(e,r)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!==`arraybuffer`)throw Error(`THREE.GLTFLoader: `+t.type+` buffer type is not supported.`);if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[Ql.KHR_BINARY_GLTF].body);let r=this.options;return new Promise(function(e,i){n.load(to.resolveURL(t.uri,r.path),e,void 0,function(){i(Error(`THREE.GLTFLoader: Failed to load buffer "`+t.uri+`".`))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency(`buffer`,t.buffer).then(function(e){let n=t.byteLength||0,r=t.byteOffset||0;return e.slice(r,r+n)})}loadAccessor(e){let t=this,n=this.json,r=this.json.accessors[e];if(r.bufferView===void 0&&r.sparse===void 0){let e=ju[r.type],t=Ou[r.componentType],n=r.normalized===!0,i=new t(r.count*e);return Promise.resolve(new Sn(i,e,n))}let i=[];return r.bufferView===void 0?i.push(null):i.push(this.getDependency(`bufferView`,r.bufferView)),r.sparse!==void 0&&(i.push(this.getDependency(`bufferView`,r.sparse.indices.bufferView)),i.push(this.getDependency(`bufferView`,r.sparse.values.bufferView))),Promise.all(i).then(function(e){let i=e[0],a=ju[r.type],o=Ou[r.componentType],s=o.BYTES_PER_ELEMENT,c=s*a,l=r.byteOffset||0,u=r.bufferView===void 0?void 0:n.bufferViews[r.bufferView].byteStride,d=r.normalized===!0,f,p;if(u&&u!==c){let e=Math.floor(l/u),n=`InterleavedBuffer:`+r.bufferView+`:`+r.componentType+`:`+e+`:`+r.count,c=t.cache.get(n);c||(f=new o(i,e*u,r.count*u/s),c=new Rn(f,u/s),t.cache.add(n,c)),p=new Bn(c,a,l%u/s,d)}else f=i===null?new o(r.count*a):new o(i,l,r.count*a),p=new Sn(f,a,d);if(r.sparse!==void 0){let t=ju.SCALAR,n=Ou[r.sparse.indices.componentType],s=r.sparse.indices.byteOffset||0,c=r.sparse.values.byteOffset||0,l=new n(e[1],s,r.sparse.count*t),u=new o(e[2],c,r.sparse.count*a);i!==null&&(p=new Sn(p.array.slice(),p.itemSize,p.normalized)),p.normalized=!1;for(let e=0,t=l.length;e<t;e++){let t=l[e];if(p.setX(t,u[e*a]),a>=2&&p.setY(t,u[e*a+1]),a>=3&&p.setZ(t,u[e*a+2]),a>=4&&p.setW(t,u[e*a+3]),a>=5)throw Error(`THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.`)}p.normalized=d}return p})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,i=t.images[r],a=this.textureLoader;if(i.uri){let e=n.manager.getHandler(i.uri);e!==null&&(a=e)}return this.loadTextureImage(e,r,a)}loadTextureImage(e,t,n){let r=this,i=this.json,a=i.textures[e],o=i.images[t],s=(o.uri||o.bufferView)+`:`+a.sampler;if(this.textureCache[s])return this.textureCache[s];let c=this.loadImageSource(t,n).then(function(t){t.flipY=!1,t.name=a.name||o.name||``,t.name===``&&typeof o.uri==`string`&&o.uri.startsWith(`data:image/`)===!1&&(t.name=o.uri);let n=(i.samplers||{})[a.sampler]||{};return t.magFilter=ku[n.magFilter]||1006,t.minFilter=ku[n.minFilter]||1008,t.wrapS=Au[n.wrapS]||1e3,t.wrapT=Au[n.wrapT]||1e3,t.generateMipmaps=!t.isCompressedTexture&&t.minFilter!==1003&&t.minFilter!==1006,r.associations.set(t,{textures:e}),t}).catch(function(){return null});return this.textureCache[s]=c,c}loadImageSource(e,t){let n=this,r=this.json,i=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(e=>e.clone());let a=r.images[e],o=self.URL||self.webkitURL,s=a.uri||``,c=!1;if(a.bufferView!==void 0)s=n.getDependency(`bufferView`,a.bufferView).then(function(e){c=!0;let t=new Blob([e],{type:a.mimeType});return s=o.createObjectURL(t),s});else if(a.uri===void 0)throw Error(`THREE.GLTFLoader: Image `+e+` is missing URI and bufferView`);let l=Promise.resolve(s).then(function(e){return new Promise(function(n,r){let a=n;t.isImageBitmapLoader===!0&&(a=function(e){let t=new tt(e);t.needsUpdate=!0,n(t)}),t.load(to.resolveURL(e,i.path),a,void 0,r)})}).then(function(e){return c===!0&&o.revokeObjectURL(s),Ru(e,a),e.userData.mimeType=a.mimeType||Wu(a.uri),e}).catch(function(e){throw console.error(`THREE.GLTFLoader: Couldn't load texture`,s),e});return this.sourceCache[e]=l,l}assignTexture(e,t,n,r){let i=this;return this.getDependency(`texture`,n.index).then(function(a){if(!a)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(a=a.clone(),a.channel=n.texCoord),i.extensions[Ql.KHR_TEXTURE_TRANSFORM]){let e=n.extensions===void 0?void 0:n.extensions[Ql.KHR_TEXTURE_TRANSFORM];if(e){let t=i.associations.get(a);a=i.extensions[Ql.KHR_TEXTURE_TRANSFORM].extendTexture(a,e),i.associations.set(a,t)}}return r!==void 0&&(a.colorSpace=r),e[t]=a,a})}assignFinalMaterial(e){let t=e.geometry,n=e.material,r=t.attributes.tangent===void 0,i=t.attributes.color!==void 0,a=t.attributes.normal===void 0;if(e.isPoints){let e=`PointsMaterial:`+n.uuid,t=this.cache.get(e);t||(t=new gi,Kn.prototype.copy.call(t,n),t.color.copy(n.color),t.map=n.map,t.sizeAttenuation=!1,this.cache.add(e,t)),n=t}else if(e.isLine){let e=`LineBasicMaterial:`+n.uuid,t=this.cache.get(e);t||(t=new ni,Kn.prototype.copy.call(t,n),t.color.copy(n.color),t.map=n.map,this.cache.add(e,t)),n=t}if(r||i||a){let e=`ClonedMaterial:`+n.uuid+`:`;r&&(e+=`derivative-tangents:`),i&&(e+=`vertex-colors:`),a&&(e+=`flat-shading:`);let t=this.cache.get(e);t||(t=n.clone(),i&&(t.vertexColors=!0),a&&(t.flatShading=!0),r&&(t.normalScale&&(t.normalScale.y*=-1),t.clearcoatNormalScale&&(t.clearcoatNormalScale.y*=-1)),this.cache.add(e,t),this.associations.set(t,this.associations.get(n))),n=t}e.material=n}getMaterialType(){return Yi}loadMaterial(e){let t=this,n=this.json,r=this.extensions,i=n.materials[e],a,o={},s=i.extensions||{},c=[];if(s[Ql.KHR_MATERIALS_UNLIT]){let e=r[Ql.KHR_MATERIALS_UNLIT];a=e.getMaterialType(),c.push(e.extendParams(o,i,t))}else{let n=i.pbrMetallicRoughness||{};if(o.color=new q(1,1,1),o.opacity=1,Array.isArray(n.baseColorFactor)){let e=n.baseColorFactor;o.color.setRGB(e[0],e[1],e[2],M),o.opacity=e[3]}n.baseColorTexture!==void 0&&c.push(t.assignTexture(o,`map`,n.baseColorTexture,j)),o.metalness=n.metallicFactor===void 0?1:n.metallicFactor,o.roughness=n.roughnessFactor===void 0?1:n.roughnessFactor,n.metallicRoughnessTexture!==void 0&&(c.push(t.assignTexture(o,`metalnessMap`,n.metallicRoughnessTexture)),c.push(t.assignTexture(o,`roughnessMap`,n.metallicRoughnessTexture))),a=this._invokeOne(function(t){return t.getMaterialType&&t.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(t){return t.extendMaterialParams&&t.extendMaterialParams(e,o)})))}i.doubleSided===!0&&(o.side=2);let l=i.alphaMode||Fu.OPAQUE;if(l===Fu.BLEND?(o.transparent=!0,o.depthWrite=!1):(o.transparent=!1,l===Fu.MASK&&(o.alphaTest=i.alphaCutoff===void 0?.5:i.alphaCutoff)),i.normalTexture!==void 0&&a!==mr&&(c.push(t.assignTexture(o,`normalMap`,i.normalTexture)),o.normalScale=new V(1,1),i.normalTexture.scale!==void 0)){let e=i.normalTexture.scale;o.normalScale.set(e,e)}if(i.occlusionTexture!==void 0&&a!==mr&&(c.push(t.assignTexture(o,`aoMap`,i.occlusionTexture)),i.occlusionTexture.strength!==void 0&&(o.aoMapIntensity=i.occlusionTexture.strength)),i.emissiveFactor!==void 0&&a!==mr){let e=i.emissiveFactor;o.emissive=new q().setRGB(e[0],e[1],e[2],M)}return i.emissiveTexture!==void 0&&a!==mr&&c.push(t.assignTexture(o,`emissiveMap`,i.emissiveTexture,j)),Promise.all(c).then(function(){let n=new a(o);return i.name&&(n.name=i.name),Ru(n,i),t.associations.set(n,{materials:e}),i.extensions&&Lu(r,n,i),n})}createUniqueName(e){let t=Co.sanitizeNodeName(e||``);return t in this.nodeNamesUsed?t+`_`+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){let t=this,n=this.extensions,r=this.primitiveCache;function i(e){return n[Ql.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(e,t).then(function(n){return Ju(n,e,t)})}let a=[];for(let n=0,o=e.length;n<o;n++){let o=e[n],s=Vu(o),c=r[s];if(c)a.push(c.promise);else{let e;e=o.extensions&&o.extensions[Ql.KHR_DRACO_MESH_COMPRESSION]?i(o):Ju(new Ln,o,t),o.mode===Du.TRIANGLE_STRIP?e=e.then(e=>Kl(e,1)):o.mode===Du.TRIANGLE_FAN&&(e=e.then(e=>Kl(e,2))),r[s]={primitive:o,promise:e},a.push(e)}}return Promise.all(a)}loadMesh(e){let t=this,n=this.json,r=this.extensions,i=n.meshes[e],a=i.primitives,o=[];for(let e=0,t=a.length;e<t;e++){let t=a[e].material===void 0?Iu(this.cache):this.getDependency(`material`,a[e].material);o.push(t)}return o.push(t.loadGeometries(a)),Promise.all(o).then(async function(n){let o=n.slice(0,n.length-1),s=n[n.length-1],c=[];for(let n=0,l=s.length;n<l;n++){let l=s[n],u=a[n],d,f=o[n];if(u.mode===Du.TRIANGLES||u.mode===Du.TRIANGLE_STRIP||u.mode===Du.TRIANGLE_FAN||u.mode===void 0){let e=i.isSkinnedMesh===!0,t=l.hasAttribute(`skinIndex`)&&l.hasAttribute(`skinWeight`);e&&t===!1&&console.warn(`THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled.`),d=e&&t?new Lr(l,f):new J(l,f),d.isSkinnedMesh===!0&&d.normalizeSkinWeights()}else if(u.mode===Du.LINES)d=new mi(l,f);else if(u.mode===Du.LINE_STRIP)d=new ui(l,f);else if(u.mode===Du.LINE_LOOP)d=new hi(l,f);else if(u.mode===Du.POINTS)d=new xi(l,f);else throw Error(`THREE.GLTFLoader: Primitive mode unsupported: `+u.mode);Object.keys(d.geometry.morphAttributes).length>0&&Bu(d,i),d.name=t.createUniqueName(i.name||`mesh_`+e),Ru(d,i),u.extensions&&Lu(r,d,u),t.assignFinalMaterial(d),c.push(d)}for(let n=0,r=c.length;n<r;n++)t.associations.set(c[n],{meshes:e,primitives:n});if(c.length===1)return i.extensions&&Lu(r,c[0],i),c[0];let l=new K;i.extensions&&Lu(r,l,i),t.associations.set(l,{meshes:e});for(let e=0,t=c.length;e<t;e++)l.add(c[e]);return l})}loadCamera(e){let t,n=this.json.cameras[e],r=n[n.type];if(!r){console.warn(`THREE.GLTFLoader: Missing camera parameters.`);return}return n.type===`perspective`?t=new qa(Re.radToDeg(r.yfov),r.aspectRatio||1,r.znear||1,r.zfar||2e6):n.type===`orthographic`&&(t=new Qa(-r.xmag,r.xmag,r.ymag,-r.ymag,r.znear,r.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),Ru(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let e=0,r=t.joints.length;e<r;e++)n.push(this._loadNodeShallow(t.joints[e]));return t.inverseBindMatrices===void 0?n.push(null):n.push(this.getDependency(`accessor`,t.inverseBindMatrices)),Promise.all(n).then(function(e){let n=e.pop(),r=e,i=[],a=[];for(let e=0,o=r.length;e<o;e++){let o=r[e];if(o){i.push(o);let t=new G;n!==null&&t.fromArray(n.array,e*16),a.push(t)}else console.warn(`THREE.GLTFLoader: Joint "%s" could not be found.`,t.joints[e])}return new Hr(i,a)})}loadAnimation(e){let t=this.json,n=this,r=t.animations[e],i=r.name?r.name:`animation_`+e,a=[],o=[],s=[],c=[],l=[];for(let e=0,t=r.channels.length;e<t;e++){let t=r.channels[e],n=r.samplers[t.sampler],i=t.target,u=i.node,d=r.parameters===void 0?n.input:r.parameters[n.input],f=r.parameters===void 0?n.output:r.parameters[n.output];i.node!==void 0&&(a.push(this.getDependency(`node`,u)),o.push(this.getDependency(`accessor`,d)),s.push(this.getDependency(`accessor`,f)),c.push(n),l.push(i))}return Promise.all([Promise.all(a),Promise.all(o),Promise.all(s),Promise.all(c),Promise.all(l)]).then(function(e){let t=e[0],a=e[1],o=e[2],s=e[3],c=e[4],l=[];for(let e=0,r=t.length;e<r;e++){let r=t[e],i=a[e],u=o[e],d=s[e],f=c[e];if(r===void 0)continue;r.updateMatrix&&r.updateMatrix();let p=n._createAnimationTracks(r,i,u,d,f);if(p)for(let e=0;e<p.length;e++)l.push(p[e])}let u=new xa(i,void 0,l);return Ru(u,r),u})}createNodeMesh(e){let t=this.json,n=this,r=t.nodes[e];return r.mesh===void 0?null:n.getDependency(`mesh`,r.mesh).then(function(e){let t=n._getNodeRef(n.meshCache,r.mesh,e);return r.weights!==void 0&&t.traverse(function(e){if(e.isMesh)for(let t=0,n=r.weights.length;t<n;t++)e.morphTargetInfluences[t]=r.weights[t]}),t})}loadNode(e){let t=this.json,n=this,r=t.nodes[e],i=n._loadNodeShallow(e),a=[],o=r.children||[];for(let e=0,t=o.length;e<t;e++)a.push(n.getDependency(`node`,o[e]));let s=r.skin===void 0?Promise.resolve(null):n.getDependency(`skin`,r.skin);return Promise.all([i,Promise.all(a),s]).then(function(e){let t=e[0],n=e[1],r=e[2];r!==null&&t.traverse(function(e){e.isSkinnedMesh&&e.bind(r,Gu)});for(let e=0,r=n.length;e<r;e++)t.add(n[e]);if(t.userData.pivot!==void 0&&n.length>0){let e=t.userData.pivot,r=n[0];t.pivot=new H().fromArray(e),t.position.x-=e[0],t.position.y-=e[1],t.position.z-=e[2],r.position.set(0,0,0),delete t.userData.pivot}return t})}_loadNodeShallow(e){let t=this.json,n=this.extensions,r=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let i=t.nodes[e],a=i.name?r.createUniqueName(i.name):``,o=[],s=r._invokeOne(function(t){return t.createNodeMesh&&t.createNodeMesh(e)});return s&&o.push(s),i.camera!==void 0&&o.push(r.getDependency(`camera`,i.camera).then(function(e){return r._getNodeRef(r.cameraCache,i.camera,e)})),r._invokeAll(function(t){return t.createNodeAttachment&&t.createNodeAttachment(e)}).forEach(function(e){o.push(e)}),this.nodeCache[e]=Promise.all(o).then(function(t){let o;if(o=i.isBone===!0?new Rr:t.length>1?new K:t.length===1?t[0]:new Nt,o!==t[0])for(let e=0,n=t.length;e<n;e++)o.add(t[e]);if(i.name&&(o.userData.name=i.name,o.name=a),Ru(o,i),i.extensions&&Lu(n,o,i),i.matrix!==void 0){let e=new G;e.fromArray(i.matrix),o.applyMatrix4(e)}else i.translation!==void 0&&o.position.fromArray(i.translation),i.rotation!==void 0&&o.quaternion.fromArray(i.rotation),i.scale!==void 0&&o.scale.fromArray(i.scale);if(!r.associations.has(o))r.associations.set(o,{});else if(i.mesh!==void 0&&r.meshCache.refs[i.mesh]>1){let e=r.associations.get(o);r.associations.set(o,{...e})}return r.associations.get(o).nodes=e,o}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],r=this,i=new K;n.name&&(i.name=r.createUniqueName(n.name)),Ru(i,n),n.extensions&&Lu(t,i,n);let a=n.nodes||[],o=[];for(let e=0,t=a.length;e<t;e++)o.push(r.getDependency(`node`,a[e]));return Promise.all(o).then(function(e){for(let t=0,n=e.length;t<n;t++){let n=e[t];n.parent===null?i.add(n):i.add(ql(n))}return r.associations=(e=>{let t=new Map;for(let[e,n]of r.associations)(e instanceof Kn||e instanceof tt)&&t.set(e,n);return e.traverse(e=>{let n=r.associations.get(e);n!=null&&t.set(e,n)}),t})(i),i})}_createAnimationTracks(e,t,n,r,i){let a=[],o=e.name?e.name:e.uuid,s=[];function c(e){e.morphTargetInfluences&&s.push(e.name?e.name:e.uuid)}Nu[i.path]===Nu.weights?(c(e),e.isGroup&&e.children.forEach(c)):s.push(o);let l;switch(Nu[i.path]){case Nu.weights:l=ga;break;case Nu.rotation:l=va;break;case Nu.translation:case Nu.scale:l=ba;break;default:switch(n.itemSize){case 1:l=ga;break;default:l=ba}}let u=r.interpolation===void 0?E:Pu[r.interpolation],d=this._getArrayFromAccessor(n);for(let e=0,n=s.length;e<n;e++){let n=new l(s[e]+`.`+Nu[i.path],t.array,d,u);r.interpolation===`CUBICSPLINE`&&this._createCubicSplineTrackInterpolant(n),a.push(n)}return a}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let e=Uu(t.constructor),n=new Float32Array(t.length);for(let r=0,i=t.length;r<i;r++)n[r]=t[r]*e;t=n}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(e){return new(this instanceof va?Eu:wu)(this.times,this.values,this.getValueSize()/3,e)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}};function qu(e,t,n){let r=t.attributes,i=new rn;if(r.POSITION!==void 0){let e=n.json.accessors[r.POSITION],t=e.min,a=e.max;if(t!==void 0&&a!==void 0){if(i.set(new H(t[0],t[1],t[2]),new H(a[0],a[1],a[2])),e.normalized){let t=Uu(Ou[e.componentType]);i.min.multiplyScalar(t),i.max.multiplyScalar(t)}}else{console.warn(`THREE.GLTFLoader: Missing min/max properties for accessor POSITION.`);return}}else return;let a=t.targets;if(a!==void 0){let e=new H,t=new H;for(let r=0,i=a.length;r<i;r++){let i=a[r];if(i.POSITION!==void 0){let r=n.json.accessors[i.POSITION],a=r.min,o=r.max;if(a!==void 0&&o!==void 0){if(t.setX(Math.max(Math.abs(a[0]),Math.abs(o[0]))),t.setY(Math.max(Math.abs(a[1]),Math.abs(o[1]))),t.setZ(Math.max(Math.abs(a[2]),Math.abs(o[2]))),r.normalized){let e=Uu(Ou[r.componentType]);t.multiplyScalar(e)}e.max(t)}else console.warn(`THREE.GLTFLoader: Missing min/max properties for accessor POSITION.`)}}i.expandByVector(e)}e.boundingBox=i;let o=new kn;i.getCenter(o.center),o.radius=i.min.distanceTo(i.max)/2,e.boundingSphere=o}function Ju(e,t,n){let r=t.attributes,i=[];function a(t,r){return n.getDependency(`accessor`,t).then(function(t){e.setAttribute(r,t)})}for(let t in r){let n=Mu[t]||t.toLowerCase();n in e.attributes||i.push(a(r[t],n))}if(t.indices!==void 0&&!e.index){let r=n.getDependency(`accessor`,t.indices).then(function(t){e.setIndex(t)});i.push(r)}return Ge.workingColorSpace!==`srgb-linear`&&`COLOR_0`in r&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Ge.workingColorSpace}" not supported.`),Ru(e,t),qu(e,t,n),Promise.all(i).then(function(){return t.targets===void 0?e:zu(e,t.targets,n)})}var Yu=`./assets/`,Xu=[`cliff`,`sand`,`asphalt`,`sandstone`,`rocks`],Zu=[`mesa`,`dune`,`arroyo`,`sidewinder`,`longhorn`,`stingbolt`,`scorchquill`],Qu=`engine-loop.skid-loop.wind-loop.count.go.gate.lap.finallap.finish.boost.pad.tier.land.wall.overtake.style.pickup.launch.warn.explode.mine.shield.recover.wreck.crunch.ignite.nitro.nitro-ready.cork`.split(`.`);function $u(){let e=[],t=(t,n,r,i)=>e.push({key:t,url:Yu+n,kind:r,stage:i});t(`logo`,`ui/logo.webp`,`image`,`boot`);for(let e of[`ui-hover`,`ui-click`,`ui-back`])t(`sfx:${e}`,`audio/${e}.mp3`,`audio`,`boot`);t(`fx`,`fx/atlas.png`,`srgb`,`race`),t(`sky`,`sky/sky.jpg`,`srgb`,`race`);for(let e of Xu)t(`${e}_diff`,`tex/${e}_diff.jpg`,`srgb`,`race`),t(`${e}_nor`,`tex/${e}_nor.jpg`,`tex`,`race`),t(`${e}_arm`,`tex/${e}_arm.jpg`,`tex`,`race`);for(let e of Zu)t(`car:${e}`,`models/${e}.glb`,`model`,`race`);for(let e of[`boulder`,`spire`,`saguaro`])t(`prop:${e}`,`models/${e}.glb`,`model`,`race`);for(let e of[`seeker`,`mine`])t(`prop:${e}`,`models/${e}.glb`,`model`,`extra`);for(let e of Qu)t(`sfx:${e}`,`audio/${e}.mp3`,`audio`,`race`);t(`model:gantry`,`models/gantry.glb`,`model`,`extra`),t(`model:tower`,`models/tower.glb`,`model`,`extra`);for(let e of[`seeker`,`mine`,`shield`])t(`icon:${e}`,`ui/icon-${e}.webp`,`image`,`extra`);return e}var Z=new class{textures=new Map;models=new Map;audio=new Map;images=new Map;entries=$u();state=new Map;waiters=new Map;listeners=new Set;texLoader=new Na;gltf=new Yl;active=0;busy=!1;priority=[];open=new Set([`boot`]);maxAnisotropy=4;constructor(){for(let e of this.entries)this.state.set(e.key,`queued`)}onProgress(e){return this.listeners.add(e),()=>this.listeners.delete(e)}has(e){return this.state.get(e)===`done`}tex(e){return this.textures.get(e)}progress(e){let t=0,n=0;for(let r of this.entries){if(r.stage!==e)continue;n+=1;let i=this.state.get(r.key);(i===`done`||i===`failed`)&&(t+=1)}return{done:t,total:n}}stageReady(e){let t=this.progress(e);return t.done>=t.total}async load(e){let t=[`boot`,`race`,`extra`];for(let n of t.slice(0,t.indexOf(e)+1))this.open.add(n);this.pump();let n=this.entries.filter(n=>t.indexOf(n.stage)<=t.indexOf(e)).map(e=>e.key);await Promise.all(n.map(e=>this.whenSettled(e)))}prefetch(e){this.open.add(e),e===`extra`&&this.open.add(`race`),this.pump()}prioritize(e){this.priority=[...e,...this.priority.filter(t=>!e.includes(t))],this.pump()}setBusy(e){e!==this.busy&&(this.busy=e,e||this.pump())}whenSettled(e){let t=this.state.get(e);return!t||t===`done`||t===`failed`?Promise.resolve():new Promise(t=>{let n=this.waiters.get(e)??[];n.push(t),this.waiters.set(e,n)})}next(){let e=e=>this.state.get(e.key)===`queued`&&this.open.has(e.stage)&&!(this.busy&&e.stage===`extra`);for(let e of this.priority){let t=this.entries.find(t=>t.key===e);if(t&&this.state.get(t.key)===`queued`&&this.open.has(t.stage))return t}for(let t of[`boot`,`race`,`extra`]){let n=this.entries.find(n=>n.stage===t&&e(n));if(n)return n}}pump(){let e=this.busy?1:4;for(;this.active<e;){let e=this.next();if(!e)return;this.active+=1,this.state.set(e.key,`loading`),this.fetchOne(e).then(()=>this.state.set(e.key,`done`)).catch(t=>{console.warn(`[assets] ${e.key} failed`,t),this.state.set(e.key,`failed`)}).finally(()=>{--this.active;for(let t of this.waiters.get(e.key)??[])t();this.waiters.delete(e.key);let t=this.progress(e.stage);for(let n of this.listeners)n(e.stage,t.done,t.total);this.pump()})}}async fetchOne(n){switch(n.kind){case`tex`:case`srgb`:{let r=await this.texLoader.loadAsync(n.url);r.colorSpace=n.kind===`srgb`?j:``,r.wrapS=r.wrapT=n.key===`sky`||n.key===`fx`?t:e,n.key===`sky`&&(r.wrapS=e),r.anisotropy=n.key===`fx`?1:this.maxAnisotropy,this.textures.set(n.key,r);return}case`model`:{let e=await this.gltf.loadAsync(n.url);this.models.set(n.key,e);return}case`audio`:{let e=await fetch(n.url);if(!e.ok)throw Error(`${e.status}`);this.audio.set(n.key.slice(4),await e.arrayBuffer());return}case`image`:{let e=new Image;e.decoding=`async`,e.src=n.url,await e.decode(),this.images.set(n.key,e)}}}},ed=.55*3,td=1.6,nd={ui:[[`ui-hover`,.35,1]],confirm:[[`ui-click`,.55,1]],back:[[`ui-back`,.5,1]],count:[[`count`,.7,1]],go:[[`go`,.8,1]],gate:[[`gate`,.42,1]],lap:[[`lap`,.6,1]],finalLap:[[`finallap`,.75,1]],finish:[[`finish`,.8,1]],pad:[[`pad`,.55,1]],padPerfect:[[`pad`,.6,1.12],[`tier`,.4,1.25]],boost:[[`boost`,.62,1]],driftTier:[[`tier`,.45,1]],item:[[`pickup`,.55,1]],box:[[`pickup`,.35,1.3]],seeker:[[`launch`,.6,1]],warn:[[`warn`,.5,1]],lock:[[`warn`,.6,1.18]],hit:[[`explode`,.75,1]],wreck:[[`wreck`,1,1],[`explode`,.5,.7]],crunch:[[`crunch`,.85,1]],ignite:[[`ignite`,.8,1]],nitro:[[`nitro`,.95,1]],nitroReady:[[`nitro-ready`,.55,1]],nitroDenied:[[`ui-back`,.35,.8]],cork:[[`cork`,.8,1]],shield:[[`shield`,.55,1]],blocked:[[`shield`,.6,1.35],[`wall`,.35,1.4]],mine:[[`mine`,.55,1]],trick:[[`style`,.3,1.25]],trickLand:[[`style`,.55,1],[`land`,.4,1]],crash:[[`wall`,.6,.72],[`land`,.5,.8]],land:[[`land`,.55,1]],wall:[[`wall`,.55,1]],bump:[[`wall`,.35,1.25]],recover:[[`recover`,.55,1]],launchPerfect:[[`boost`,.6,1.1],[`tier`,.45,1.4]],dodge:[[`style`,.4,1.45]],canister:[[`boost`,.55,.9]],overtake:[[`overtake`,.55,1]],style:[[`style`,.5,1]]},rd=class{audio;level;osc;sub;filter;gain;pan;loops;stopped=!1;constructor(e,t,n=1){this.audio=e,this.level=n;let r=e.ctx;this.pan=r.createStereoPanner(),this.pan.connect(t),this.gain=r.createGain(),this.gain.gain.value=0,this.filter=r.createBiquadFilter(),this.filter.type=`lowpass`,this.filter.frequency.value=600,this.filter.Q.value=3,this.osc=r.createOscillator(),this.osc.type=`sawtooth`,this.sub=r.createOscillator(),this.sub.type=`square`,this.osc.connect(this.filter),this.sub.connect(this.filter),this.filter.connect(this.gain).connect(this.pan),this.osc.start(),this.sub.start(),this.loops=[`engine-loop`,`skid-loop`,`wind-loop`].map(e=>{let t=r.createGain();return t.gain.value=0,t.connect(this.pan),{key:e,src:null,gain:t}})}ensureLoops(){for(let e of this.loops){if(e.src)continue;let t=this.audio.buffer(e.key);if(!t)continue;let n=this.audio.ctx.createBufferSource();n.buffer=t,n.loop=!0,n.connect(e.gain),n.start(this.audio.ctx.currentTime,Math.random()*t.duration),e.src=n}}update(e,t,n,r,i,a=0,o=1){if(this.stopped)return;this.ensureLoops();let s=this.audio.ctx.currentTime,c=Math.max(0,e),l=Math.min(5,Math.floor(c/15)),u=.25+(c-l*15)/15*.6+l*.05+t*.08+(i?0:.2),d=55+u*150;this.osc.frequency.setTargetAtTime(d,s,.05),this.sub.frequency.setTargetAtTime(d/2,s,.05),this.filter.frequency.setTargetAtTime(300+u*900+(n?600:0),s,.06);let f=this.loops[0].src!==null,p=this.level*o;this.gain.gain.setTargetAtTime((f?.018:.06+t*.05)*p,s,.06);let[m,h,g]=this.loops;m.src&&(m.src.playbackRate.setTargetAtTime(.62+u*.95+(n?.08:0),s,.05),m.gain.gain.setTargetAtTime((.22+t*.16+(n?.08:0))*p,s,.06)),h.src&&h.gain.gain.setTargetAtTime(r&&i&&c>6?.26*p:0,s,.05),g.src&&(g.src.playbackRate.setTargetAtTime(.8+Math.min(.6,c/120),s,.1),g.gain.gain.setTargetAtTime((Math.min(.2,c/320)+(n?.14:0))*p,s,.08)),this.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,a)),s,.1)}silence(){let e=this.audio.ctx.currentTime;this.gain.gain.setTargetAtTime(0,e,.05);for(let t of this.loops)t.gain.gain.setTargetAtTime(0,e,.05)}dispose(){if(this.stopped)return;this.stopped=!0,this.silence();let e=this.audio.ctx.currentTime+.3;this.osc.stop(e),this.sub.stop(e);for(let t of this.loops)t.src?.stop(e);window.setTimeout(()=>this.pan.disconnect(),500)}},id=class{ctx;master;limiter;music;sfx;noise;lastPlay=new Map;buffers=new Map;decoding=new Set;musicMode=`off`;decks=[];deck=0;constructor(){this.ctx=new AudioContext,this.master=this.ctx.createGain(),this.master.gain.value=.9,this.limiter=this.ctx.createDynamicsCompressor(),this.limiter.threshold.value=-4,this.limiter.knee.value=0,this.limiter.ratio.value=20,this.limiter.attack.value=.003,this.limiter.release.value=.2,this.music=this.ctx.createGain(),this.sfx=this.ctx.createGain(),this.music.connect(this.master),this.sfx.connect(this.master),this.master.connect(this.limiter).connect(this.ctx.destination);let e=this.ctx.sampleRate*2;this.noise=this.ctx.createBuffer(1,e,this.ctx.sampleRate);let t=this.noise.getChannelData(0),n=12345;for(let r=0;r<e;r+=1)n=n*1664525+1013904223>>>0,t[r]=n/4294967296*2-1}unlock(){this.ctx.state===`suspended`&&this.ctx.resume();let e=this.decks[this.deck];e&&this.musicMode!==`off`&&e.el.paused&&e.el.play().catch(()=>{})}setVolumes(e,t,n=!1){let r=this.ctx.currentTime;this.music.gain.setTargetAtTime(n?0:e*ed*.42,r,.05),this.sfx.gain.setTargetAtTime(n?0:t*td,r,.05)}engine(e=1){return new rd(this,this.sfx,e)}buffer(e){let t=this.buffers.get(e);if(t)return t;if(this.decoding.has(e))return null;let n=Z.audio.get(e);return n?(this.decoding.add(e),this.ctx.decodeAudioData(n.slice(0)).then(t=>{this.buffers.set(e,t)}).catch(()=>{}),null):null}warm(){for(let e of Z.audio.keys())this.buffer(e)}sample(e,t,n){let r=this.buffer(e);if(!r)return!1;let i=this.ctx.createBufferSource();i.buffer=r,i.playbackRate.value=n*(.97+Math.random()*.06);let a=this.ctx.createGain();return a.gain.value=t,i.connect(a).connect(this.sfx),i.start(),!0}play(e,t=1){if(this.ctx.state!==`running`)return;let n=this.ctx.currentTime;if(n-(this.lastPlay.get(e)??-1)<.05)return;this.lastPlay.set(e,n);let r=nd[e],i=!1;if(r)for(let[e,n,a]of r)i=this.sample(e,n*t,a)||i;i||this.synth(e,t)}tone(e,t,n,r,i,a=0,o=this.sfx){let s=this.ctx.currentTime+a,c=this.ctx.createOscillator(),l=this.ctx.createGain();c.type=r,c.frequency.setValueAtTime(e,s),c.frequency.exponentialRampToValueAtTime(Math.max(t,20),s+n),l.gain.setValueAtTime(1e-4,s),l.gain.exponentialRampToValueAtTime(i,s+.01),l.gain.exponentialRampToValueAtTime(1e-4,s+n),c.connect(l).connect(o),c.start(s),c.stop(s+n+.05)}burst(e,t,n,r,i=0,a=`bandpass`,o=0){let s=this.ctx.currentTime+i,c=this.ctx.createBufferSource();c.buffer=this.noise;let l=this.ctx.createBiquadFilter();l.type=a,l.frequency.setValueAtTime(t,s),o&&l.frequency.exponentialRampToValueAtTime(o,s+e),l.Q.value=n;let u=this.ctx.createGain();u.gain.setValueAtTime(1e-4,s),u.gain.exponentialRampToValueAtTime(r,s+.01),u.gain.exponentialRampToValueAtTime(1e-4,s+e),c.connect(l).connect(u).connect(this.sfx),c.start(s,Math.random()*1.5),c.stop(s+e+.05)}synth(e,t){let n=t;switch(e){case`ui`:this.tone(660,720,.06,`triangle`,.14*n);break;case`confirm`:this.tone(660,990,.1,`triangle`,.2*n),this.tone(990,1320,.12,`sine`,.14*n,.05);break;case`back`:this.tone(520,380,.1,`triangle`,.16*n);break;case`count`:this.tone(620,620,.18,`square`,.12*n);break;case`go`:this.tone(1240,1240,.45,`square`,.14*n),this.tone(620,620,.45,`triangle`,.16*n);break;case`gate`:this.tone(1320,1580,.09,`sine`,.13*n);break;case`lap`:[784,988,1175].forEach((e,t)=>this.tone(e,e,.16,`triangle`,.18*n,t*.08));break;case`finalLap`:[784,988,1175,1568].forEach((e,t)=>this.tone(e,e,.2,`square`,.12*n,t*.09));break;case`finish`:[523,659,784,1047,1319].forEach((e,t)=>this.tone(e,e*1.01,.4,`triangle`,.2*n,t*.1));break;case`pad`:this.burst(.35,800,1,.22*n,0,`bandpass`,3200),this.tone(300,900,.25,`sawtooth`,.06*n);break;case`padPerfect`:this.burst(.45,900,1,.26*n,0,`bandpass`,4200),this.tone(440,1320,.3,`sawtooth`,.08*n),this.tone(1760,2093,.18,`sine`,.14*n,.08);break;case`boost`:this.burst(.5,600,.9,.24*n,0,`bandpass`,2600),this.tone(180,520,.35,`sawtooth`,.08*n);break;case`driftTier`:this.tone(900,1400,.1,`square`,.08*n);break;case`item`:[880,1175,1568].forEach((e,t)=>this.tone(e,e,.08,`triangle`,.14*n,t*.05));break;case`box`:this.tone(1568,2349,.12,`sine`,.12*n),this.burst(.12,5e3,2,.08*n);break;case`seeker`:this.tone(300,1200,.3,`sawtooth`,.09*n),this.burst(.4,1500,1,.12*n);break;case`warn`:this.tone(880,880,.09,`square`,.1*n),this.tone(880,880,.09,`square`,.1*n,.14);break;case`lock`:[1320,1320,1320].forEach((e,t)=>this.tone(e,e,.06,`square`,.12*n,t*.09));break;case`hit`:this.burst(.6,300,.7,.35*n,0,`lowpass`,80),this.tone(160,40,.5,`sine`,.35*n);break;case`shield`:this.tone(400,1200,.35,`sine`,.16*n),this.tone(600,1800,.35,`triangle`,.08*n,.05);break;case`blocked`:this.tone(1800,900,.3,`triangle`,.2*n),this.burst(.25,3e3,1.5,.15*n);break;case`mine`:this.tone(260,200,.14,`square`,.1*n);break;case`trick`:this.tone(700,1400,.12,`triangle`,.14*n);break;case`trickLand`:[988,1319,1760].forEach((e,t)=>this.tone(e,e,.1,`sine`,.16*n,t*.05)),this.burst(.4,700,1,.2*n,0,`bandpass`,2800);break;case`nitro`:this.burst(.9,900,.6,.4*n,0,`bandpass`,3),this.tone(180,620,.5,`sawtooth`,.12*n);break;case`nitroReady`:this.tone(880,1320,.12,`sine`,.18*n);break;case`nitroDenied`:this.tone(220,160,.12,`square`,.08*n);break;case`cork`:this.burst(1.6,500,1.2,.3*n,0,`bandpass`,2);break;case`wreck`:this.burst(1.1,260,.9,.45*n,0,`lowpass`,60),this.tone(90,30,.9,`sine`,.4*n);break;case`crunch`:this.burst(.3,900,.5,.3*n,0,`bandpass`,400);break;case`ignite`:this.burst(.9,1400,.4,.22*n,0,`bandpass`,900);break;case`crash`:this.burst(.5,400,.6,.32*n,0,`lowpass`,90),this.tone(120,50,.4,`sine`,.3*n);break;case`land`:this.tone(140,60,.18,`sine`,.28*n),this.burst(.2,300,.8,.14*n,0,`lowpass`);break;case`wall`:this.burst(.25,1800,1.2,.2*n,0,`bandpass`,600),this.tone(110,60,.15,`sine`,.2*n);break;case`bump`:this.tone(180,90,.12,`sine`,.24*n),this.burst(.12,900,1,.12*n);break;case`recover`:this.tone(440,880,.35,`sine`,.14*n),this.tone(660,1320,.35,`sine`,.08*n,.1);break;case`wrong`:this.tone(330,300,.25,`square`,.1*n);break;case`launchPerfect`:this.burst(.6,700,.9,.26*n,0,`bandpass`,3e3),[1047,1319,1568].forEach((e,t)=>this.tone(e,e,.12,`triangle`,.16*n,t*.06));break;case`launchEarly`:this.burst(.7,2200,3,.16*n),this.tone(200,160,.5,`sawtooth`,.06*n);break;case`draft`:this.burst(.5,400,.7,.16*n,0,`bandpass`,1600);break;case`dodge`:this.tone(900,1600,.15,`triangle`,.15*n);break;case`canister`:this.tone(300,1500,.4,`triangle`,.14*n);break;case`fizzle`:this.burst(.3,2e3,1,.1*n,0,`bandpass`,300)}}setMusic(e){if(e===this.musicMode)return;this.musicMode=e;let t=this.ctx.currentTime,n=this.decks[this.deck];if(n){n.gain.gain.cancelScheduledValues(t),n.gain.gain.setTargetAtTime(0,t,e===`final`?.25:.5);let r=n.el;window.setTimeout(()=>{this.decks[this.deck]?.el!==r&&r.pause()},2500)}if(e===`off`)return;let r={menu:`m-title`,race:`m-race`,final:`m-final`,results:`m-results`}[e];this.deck=(this.deck+1)%2;let i=this.decks[this.deck];if(!i){let t=new window.Audio;t.preload=`none`,t.crossOrigin=`anonymous`;let n=this.ctx.createGain();n.gain.value=0,this.ctx.createMediaElementSource(t).connect(n).connect(this.music),i={el:t,gain:n,mode:e},this.decks[this.deck]=i}i.mode=e,i.el.loop=e!==`results`,i.el.src=`./assets/audio/${r}.mp3`,i.el.currentTime=0,i.gain.gain.cancelScheduledValues(t),i.gain.gain.setValueAtTime(0,t),i.gain.gain.setTargetAtTime(1,t+.05,e===`final`?.2:.6),i.el.play().catch(()=>{})}},ad={up:[`KeyW`],down:[`KeyS`],left:[`KeyA`],right:[`KeyD`],drift:[`Space`],boost:[`ShiftLeft`],item:[`KeyE`],recover:[`KeyR`]},od={up:[`ArrowUp`],down:[`ArrowDown`],left:[`ArrowLeft`],right:[`ArrowRight`],drift:[`ShiftRight`,`Slash`,`Numpad0`],boost:[`Period`,`Numpad1`],item:[`Comma`,`Numpad2`,`NumpadEnter`],recover:[`KeyL`,`Numpad3`]},sd=new Set([...Object.values(ad),...Object.values(od)].flat()),cd=.14,ld=class{method=`keyboard`;gameplayActive=!1;touch={steer:0,throttle:!1,brake:!1,drift:!1,boost:!1,item:!1,recover:!1};move={x:0,y:0};keys=new Set;latched=new Set;pads=[];prevButtons=new Map;constructor(){window.addEventListener(`keydown`,e=>{this.gameplayActive&&sd.has(e.code)&&e.preventDefault(),!e.repeat&&(this.keys.add(e.code),this.method=`keyboard`,(e.code===`Escape`||e.code===`KeyP`)&&this.latched.add(`pause`))}),window.addEventListener(`keyup`,e=>this.keys.delete(e.code)),window.addEventListener(`blur`,()=>this.keys.clear()),window.addEventListener(`pointerdown`,e=>{e.pointerType===`touch`&&(this.method=`touch`)})}update(){let e=navigator.getGamepads?navigator.getGamepads():[];this.pads=[];for(let t of e)t&&t.connected&&this.pads.push(t);this.move.x=0,this.move.y=0;for(let e of this.pads){let t=this.prevButtons.get(e.index)??[],n=e.buttons.map(e=>e.pressed),r=e=>n[e]&&!t[e];r(0)&&this.latched.add(`confirm`),r(1)&&this.latched.add(`back`),r(9)&&this.latched.add(`pause`);let i=e.axes[0]??0,a=e.axes[1]??0,o=+!!n[15]-!!n[14],s=+!!n[12]-!!n[13];Math.abs(i)>Math.abs(this.move.x)&&(this.move.x=i),Math.abs(a)>Math.abs(this.move.y)&&(this.move.y=-a),o&&(this.move.x=o),s&&(this.move.y=s),(n.some(Boolean)||Math.abs(i)>.5||Math.abs(a)>.5)&&(this.method=`gamepad`),this.prevButtons.set(e.index,n)}}consume(e){let t=this.latched.has(e);return this.latched.delete(e),t}get gamepadCount(){return this.pads.length}held(e){return this.keys.has(e)}any(e){for(let t of e)if(this.keys.has(t))return!0;return!1}readKeys(e,t){this.any(e.up)&&(t.throttle=1),this.any(e.down)&&(t.brake=1);let n=+!!this.any(e.right)-!!this.any(e.left);n&&(t.steer=n),t.drift||=this.any(e.drift),t.boost||=this.any(e.boost),t.item||=this.any(e.item),t.recover||=this.any(e.recover)}readPad(e,t){if(!e)return;let n=t=>e.buttons[t]?.pressed??!1,r=t=>e.buttons[t]?.value??0,i=e.axes[0]??0;i=Math.abs(i)<cd?0:(i-Math.sign(i)*cd)/.86;let a=+!!n(15)-!!n(14)||i;Math.abs(a)>Math.abs(t.steer)&&(t.steer=a),t.throttle=Math.max(t.throttle,r(7),+!!n(0)),t.brake=Math.max(t.brake,r(6),+!!n(2)),t.drift||=n(5)||n(4),t.boost||=n(1),t.item||=n(3),t.recover||=n(8)||n(11)}readTouch(e){let t=this.touch;Math.abs(t.steer)>Math.abs(e.steer)&&(e.steer=t.steer),t.throttle&&(e.throttle=1),t.brake&&(e.brake=1),e.drift||=t.drift,e.boost||=t.boost,e.item||=t.item,e.recover||=t.recover}carInput(e,t){if(t.throttle=0,t.brake=0,t.steer=0,t.drift=t.boost=t.item=t.recover=!1,e===`auto`){this.readKeys(ad,t),this.readKeys(od,t);for(let e of this.pads)this.readPad(e,t);this.readTouch(t)}else e===`kbLeft`?this.readKeys(ad,t):e===`kbRight`?this.readKeys(od,t):e===`pad0`?this.readPad(this.pads[0],t):this.readPad(this.pads[1],t);return t.steer=Math.max(-1,Math.min(1,t.steer)),t}},ud=class{callbacks;stepSeconds;accumulator=0;last=0;handle=0;running=!1;paused=!1;maxFrameSeconds=.25;constructor(e,t=60){this.callbacks=e,this.stepSeconds=1/t}start(){if(this.running)return;this.running=!0,this.last=performance.now();let e=t=>{if(!this.running)return;let n=Math.min((t-this.last)/1e3,this.maxFrameSeconds);if(this.last=t,!this.paused)for(this.accumulator+=n;this.accumulator>=this.stepSeconds;)this.callbacks.step(this.stepSeconds),this.accumulator-=this.stepSeconds;this.callbacks.render(this.paused?1:this.accumulator/this.stepSeconds,n),this.handle=requestAnimationFrame(e)};this.handle=requestAnimationFrame(e)}stop(){this.running=!1,cancelAnimationFrame(this.handle)}resetAccumulator(){this.accumulator=0,this.last=performance.now()}},dd={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

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


		}`},fd=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},pd=new Qa(-1,1,1,-1,0,1),md=new class extends Ln{constructor(){super(),this.setAttribute(`position`,new Tn([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new Tn([0,2,0,0,2,0],2))}},hd=class{constructor(e){this._mesh=new J(md,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,pd)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},gd=class extends fd{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof qi?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=Wi.clone(e.uniforms),this.material=new qi({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new hd(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},_d=class extends fd{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},vd=class extends fd{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},yd=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new V);this._width=n.width,this._height=n.height,t=new it(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:p}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new gd(dd),this.copyPass.material.blending=0,this.timer=new lo}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}_d!==void 0&&(r instanceof _d?n=!0:r instanceof vd&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new V);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},bd=class extends fd{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new q}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},xd={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new q(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},Sd=class e extends fd{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new V(256,256):new V(e.x,e.y),this.clearColor=new q(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new it(i,a,{type:p,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new it(i,a,{type:p,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new it(i,a,{type:p,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=xd;this.highPassUniforms=Wi.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new qi({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new V(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let c=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=c,this.bloomTintColors=[new H(1,1,1),new H(1,1,1),new H(1,1,1),new H(1,1,1),new H(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=Wi.clone(dd.uniforms),this.blendMaterial=new qi({uniforms:this.copyUniforms,vertexShader:dd.vertexShader,fragmentShader:dd.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new q,this._oldClearAlpha=1,this._basic=new mr,this._fsQuad=new hd(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new V(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new qi({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new V(.5,.5)},direction:{value:new V(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new qi({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}};Sd.BlurDirectionX=new V(1,0),Sd.BlurDirectionY=new V(0,1);var Cd={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
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

		}`},wd=class extends fd{constructor(){super(),this.isOutputPass=!0,this.uniforms=Wi.clone(Cd.uniforms),this.material=new Ji({name:Cd.name,uniforms:this.uniforms,vertexShader:Cd.vertexShader,fragmentShader:Cd.fragmentShader}),this._fsQuad=new hd(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},Ge.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Td={low:{pixelRatio:1,shadows:!1,shadowMap:512,bloom:!1,antialias:!1,splitPixelRatio:.85},medium:{pixelRatio:1.5,shadows:!0,shadowMap:1024,bloom:!1,antialias:!0,splitPixelRatio:1},high:{pixelRatio:2,shadows:!0,shadowMap:2048,bloom:!0,antialias:!0,splitPixelRatio:1.25}};function Ed(){let e=matchMedia(`(pointer: coarse)`).matches,t=navigator.hardwareConcurrency??4;return e||t<=4?`medium`:`high`}var Dd=class{canvas;gl;composer;bloom;preset;scene;camera;split=!1;constructor(e,t){this.canvas=e,this.preset=Td[t],this.gl=new Hl({canvas:e,antialias:this.preset.antialias,powerPreference:`high-performance`}),this.gl.outputColorSpace=j,this.gl.toneMapping=4,this.gl.toneMappingExposure=1,this.gl.shadowMap.type=1,this.applyQuality(t),window.addEventListener(`resize`,()=>this.resize())}get shadowsEnabled(){return this.preset.shadows}get shadowMapSize(){return this.preset.shadowMap}applyQuality(e){this.preset=Td[e],this.gl.shadowMap.enabled=this.preset.shadows,this.bloom?.dispose(),this.composer?.dispose(),this.composer=void 0,this.bloom=void 0,this.updatePixelRatio(),this.resize()}updatePixelRatio(){let e=this.split?this.preset.splitPixelRatio:this.preset.pixelRatio;this.gl.setPixelRatio(Math.min(window.devicePixelRatio||1,e))}ensureComposer(e,t){if(!this.preset.bloom)return;if(this.composer&&this.scene===e&&this.camera===t)return this.composer;this.composer?.dispose(),this.bloom?.dispose(),this.scene=e,this.camera=t;let n=this.gl.getSize(new V);return this.composer=new yd(this.gl),this.composer.addPass(new bd(e,t)),this.bloom=new Sd(n,.42,.4,2),this.composer.addPass(this.bloom),this.composer.addPass(new wd),this.composer.setSize(n.x,n.y),this.composer}resize(){let e=this.canvas.clientWidth||window.innerWidth,t=this.canvas.clientHeight||window.innerHeight;this.gl.setSize(e,t,!1),this.composer?.setSize(e,t)}render(e,t){let n=this.canvas.clientWidth||window.innerWidth,r=this.canvas.clientHeight||window.innerHeight,i=t.length>1;if(i!==this.split&&(this.split=i,this.updatePixelRatio(),this.resize()),!i){let i=t[0],a=n/r;Math.abs(i.camera.aspect-a)>.001&&(i.camera.aspect=a,i.camera.updateProjectionMatrix()),i.before?.(),this.gl.setScissorTest(!1),this.gl.setViewport(0,0,n,r);let o=this.ensureComposer(e,i.camera);o?o.render():this.gl.render(e,i.camera);return}this.gl.setScissorTest(!0);for(let i of t){let t=Math.round(i.x*n),a=Math.round(i.y*r),o=Math.round(i.w*n),s=Math.round(i.h*r),c=o/Math.max(1,s);Math.abs(i.camera.aspect-c)>.001&&(i.camera.aspect=c,i.camera.updateProjectionMatrix()),i.before?.(),this.gl.setViewport(t,a,o,s),this.gl.setScissor(t,a,o,s),this.gl.render(e,i.camera)}this.gl.setScissorTest(!1)}},Od=Math.PI*2,Q=(e,t,n)=>e<t?t:e>n?n:e,kd=(e,t,n)=>e+(t-e)*n,Ad=(e,t,n)=>{let r=Q((n-e)/(t-e),0,1);return r*r*(3-2*r)};function jd(e){return e=(e+Math.PI)%Od,e<0&&(e+=Od),e-Math.PI}function Md(e,t){return e=(e+t/2)%t,e<0&&(e+=t),e-t/2}function $(e,t){let n=e%t;return n<0?n+t:n}function Nd(e,t,n){return e<t?Math.min(t,e+n):Math.max(t,e-n)}function Pd(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function Fd(e,t,n,r=0){let i=(r^2654435769)>>>0;return i=Math.imul(i^(e|0),2246822507)>>>0,i=Math.imul(i^i>>>13^(t|0),3266489909)>>>0,i=Math.imul(i^i>>>16^(n|0),668265263)>>>0,i^=i>>>15,(i>>>0)/4294967296}function Id(e,t,n=0){let r=Math.floor(e),i=Math.floor(t),a=e-r,o=t-i,s=a*a*(3-2*a),c=o*o*(3-2*o),l=Fd(r,i,0,n),u=Fd(r+1,i,0,n),d=Fd(r,i+1,0,n),f=Fd(r+1,i+1,0,n);return kd(kd(l,u,s),kd(d,f,s),c)*2-1}function Ld(e,t,n,r=0){let i=0,a=.5,o=1,s=0;for(let c=0;c<n;c+=1)i+=Id(e*o,t*o,r+c*101)*a,s+=a,a*=.5,o*=2.03;return i/s}function Rd(e){let t=2166136261;for(let n=0;n<e.length;n+=1)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return t>>>0}var zd=()=>({x:0,y:0,z:0,fx:0,fy:0,fz:1,nx:0,ny:1,nz:0,lx:1,ly:0,lz:0,stretch:1,kn:0,roll:0}),Bd={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0},Vd={x:0,y:0,z:0},Hd={x:0,y:0,z:0},Ud={len:42,height:19},Wd=30,Gd=.9;function Kd(){return{i:0,s:0,d:0,centerY:0,roadY:0,halfW:10,barrier:13,wall:!1,onRoad:!0,onSurface:!0,tx:0,tz:1,rx:-1,rz:0,slope:0,rampH:0,rampIndex:-1,bank:0}}var qd=48,Jd=class{spec;n;length;ds;x;y;z;tx;tz;rx;rz;slope;vcurv;halfW;bank;curv;canyon;ridge;bridge;heading;gates;pads;ramps;items;corks;bounds;constructor(e){this.spec=e;let t=e.points,n=t.length;if(n<4)throw Error(`track needs at least 4 control points`);let r=n*qd+1,i=new Float64Array(r),a=new Float64Array(r),o=new Float64Array(r),s=new Float64Array(r),c=0;for(let e=0;e<n;e+=1){let r=t[$(e-1,n)],s=t[e],l=t[$(e+1,n)],u=t[$(e+2,n)];for(let e=0;e<qd;e+=1)Yd(r,s,l,u,e/qd,i,a,o,c),c+=1}i[c]=i[0],a[c]=a[0],o[c]=o[0];for(let e=1;e<r;e+=1)s[e]=s[e-1]+Math.hypot(i[e]-i[e-1],a[e]-a[e-1],o[e]-o[e-1]);let l=s[r-1],u=e=>{let t=$(e,n)*qd,i=Math.floor(t);return kd(s[i],s[Math.min(r-1,i+1)],t-i)},d=e=>{e=$(e,l);let t=0,n=r-1;for(;n-t>1;){let r=t+n>>1;s[r]<=e?t=r:n=r}let i=(e-s[t])/Math.max(1e-9,s[n]-s[t]);return(t+i)/qd},f=(e,t)=>{let n=d(e)*qd,s=Math.min(r-2,Math.floor(n)),c=n-s;t[0]=kd(i[s],i[s+1],c),t[1]=kd(a[s],a[s+1],c),t[2]=kd(o[s],o[s+1],c)},p=Math.max(64,Math.round(l/2)),m=l/p;this.n=p,this.length=l,this.ds=m;let h=e.start===void 0?0:u(e.start);e.start===void 0&&(h=Zd(l,m,p,f));let g=()=>new Float64Array(p);this.x=g(),this.y=g(),this.z=g(),this.tx=g(),this.tz=g(),this.rx=g(),this.rz=g(),this.slope=g(),this.vcurv=g(),this.halfW=g(),this.bank=g(),this.curv=g(),this.canyon=g(),this.ridge=g(),this.bridge=g(),this.heading=g();let _=g(),v=[0,0,0];for(let e=0;e<p;e+=1){let t=h+e*m;f(t,v),this.x[e]=v[0],this.y[e]=v[1],this.z[e]=v[2],_[e]=d(t)}let y=e=>$(u(e)-h,l);for(let t of e.features){if(t.type!==`hill`)continue;let e=t.at===void 0?y(t.u??0):$(t.at,l),n=Math.max(20,(t.len??160)/2),r=t.amp??12;for(let t=0;t<p;t+=1){let i=Md(t*m-e,l);Math.abs(i)<n&&(this.y[t]+=r*(.5+.5*Math.cos(Math.PI*i/n)))}}let b=e.features.filter(e=>e.type===`twist`);if(b.length){let e=g(),t=g();for(let n=0;n<p;n+=1){let r=$(n-1,p),i=(n+1)%p,a=this.x[i]-this.x[r],o=this.z[i]-this.z[r],s=Math.hypot(a,o)||1;e[n]=-o/s,t[n]=a/s}let n=g();for(let e of b){let t=e.at===void 0?y(e.u??0):$(e.at,l),r=Math.max(80,e.len??200),i=r/2,a=e.amp??10,o=Math.max(.5,e.cycles??1);for(let e=0;e<p;e+=1){let s=Md(e*m-t,l);if(Math.abs(s)>=i)continue;let c=(.5+.5*Math.cos(Math.PI*s/i))**.6;n[e]+=a*c*Math.sin(2*Math.PI*o*(s+i)/r)}}for(let r=0;r<p;r+=1)this.x[r]+=e[r]*n[r],this.z[r]+=t[r]*n[r]}let x=g(),S=g(),C=g();for(let e=0;e<p;e+=1){let r=Math.floor(_[e])%n,i=_[e]-Math.floor(_[e]),a=t[r],o=t[(r+1)%n];this.halfW[e]=kd(a.w,o.w,Ad(0,1,i))/2;let s=i<1?1-i:0;x[e]=(a.kind===`canyon`?s:0)+(o.kind===`canyon`?i:0),S[e]=(a.kind===`ridge`?s:0)+(o.kind===`ridge`?i:0),C[e]=a.kind===`bridge`&&o.kind===`bridge`?1:a.kind===`bridge`?Ad(.35,0,i):o.kind===`bridge`?Ad(.65,1,i):0}Xd(x,this.canyon,18),Xd(S,this.ridge,18),Xd(C,this.bridge,4);for(let e=0;e<p;e+=1){let t=$(e-1,p),n=(e+1)%p,r=this.x[n]-this.x[t],i=this.z[n]-this.z[t],a=Math.hypot(r,i)||1;r/=a,i/=a,this.tx[e]=r,this.tz[e]=i,this.rx[e]=-i,this.rz[e]=r,this.slope[e]=(this.y[n]-this.y[t])/(2*m),this.heading[e]=Math.atan2(r,i)}let w=g();for(let e=0;e<p;e+=1)w[e]=(this.slope[(e+1)%p]-this.slope[$(e-1,p)])/(2*m);Xd(w,this.vcurv,2);let T=g();for(let e=0;e<p;e+=1)T[e]=jd(this.heading[(e+1)%p]-this.heading[$(e-1,p)])/(2*m);Xd(T,this.curv,5),this.corks=[];let E=g();for(let t of e.features){if(t.type!==`corkscrew`)continue;let e=t.at===void 0?y(t.u??0):$(t.at,l),n=Math.max(80,t.len??120);this.corks.push({index:this.corks.length,s0:e,len:n,radius:Q(t.radius??8,5,14),dir:(t.dir??1)<0?-1:1,hw:Q(t.width??6,4,9)});for(let t=0;t<p;t+=1){let r=Md(t*m-e,l),i=Ad(-40,-18,r)*Ad(n+24,n+6,r);i>E[t]&&(E[t]=i)}}let D=g(),O=g();for(let t of e.features){if(t.type!==`bank`)continue;let e=t.at===void 0?y(t.u??0):$(t.at,l),n=Math.max(30,t.len??120)/2,r=0;for(let t=0;t<p;t+=1)Math.abs(Md(t*m-e,l))<n*.6&&(r+=this.curv[t]);let i=r<0?-1:1,a=Math.tan(Q(t.deg??45,0,66)*Math.PI/180),o=Math.min(n*.45,32),s=Math.max(1,Math.round(15/m));for(let t=0;t<p;t+=1){let r=Math.abs(Md(t*m-e,l));if(r>=n)continue;let c=0;for(let e=-s;e<=s;e+=1){let n=this.curv[$(t+e,p)]*i;n>c&&(c=n)}let u=900*c/Wd,d=c<=0?.18:Gd*u>=1?a:(u+Gd)/(1-Gd*u),f=Ad(n,n-o,r);f>D[t]&&(D[t]=f,O[t]=i*Math.min(a,d))}}let ee=g();for(let e=0;e<p;e+=1)ee[e]=kd(Q(this.curv[e]*7,-.18,.18),O[e],D[e]);let k=Math.max(1,Math.round(8/m));for(let e=0;e<p;e+=1){let t=0;for(let n=-k;n<=k;n+=1)t+=ee[$(e+n,p)];this.bank[e]=t/(2*k+1)*(1-this.bridge[e])*(1-E[e]),this.halfW[e]*=kd(1,1/Math.sqrt(1+this.bank[e]*this.bank[e]),.6)}this.gates=[];for(let e=0;e<16;e+=1){let t=$((e+1)*l/16,l);if(e<15)for(let e of this.corks){let n=Md(t-e.s0,l);n>-5&&n<e.len+5&&(t=$(n<e.len/2?e.s0-7:e.s0+e.len+7,l))}this.gates.push({index:e,s:t,sample:Math.round(t/m)%p})}this.pads=[],this.ramps=[],this.items=[];for(let t of e.features){if(t.type===`hill`||t.type===`bank`||t.type===`twist`||t.type===`corkscrew`)continue;let e=t.at===void 0?y(t.u??0):$(t.at,l);(e<70||e>l-40)&&(e=$(e+110,l));let n=this.halfW[Math.round(e/m)%p];t.type===`boost`?this.pads.push({index:this.pads.length,s:e,d:Q(t.lane??0,-n+2.2,n-2.2),len:10,halfW:2.1,cork:-1}):t.type===`ramp`?this.ramps.push({index:this.ramps.length,s0:$(e-14,l),len:14,height:2.4,mega:!1}):t.type===`mega`?this.ramps.push({index:this.ramps.length,s0:$(e-Ud.len,l),len:Ud.len,height:Ud.height,mega:!0}):t.type===`items`&&this.items.push({index:this.items.length,s:e,lanes:[-.62,-.2,.2,.62].map(e=>e*n)})}for(let e of this.corks){let t=this.halfW[this.sampleIndex(e.s0-20)];for(let n of[22,8])for(let r of[-.55,0,.55])this.pads.push({index:this.pads.length,s:$(e.s0-n,l),d:r*(t-2.2),len:10,halfW:2.1,cork:-1});[.3,.5,.7].forEach((t,n)=>this.pads.push({index:this.pads.length,s:$(e.s0+e.len*t,l),d:(n%2?-1:1)*e.dir*e.hw*.42,len:9,halfW:2,cork:e.index}))}let A=1/0,j=-1/0,M=1/0,N=-1/0,P=1/0,te=-1/0;for(let e=0;e<p;e+=1)A=Math.min(A,this.x[e]),j=Math.max(j,this.x[e]),M=Math.min(M,this.z[e]),N=Math.max(N,this.z[e]),P=Math.min(P,this.y[e]),te=Math.max(te,this.y[e]);this.bounds={minX:A,maxX:j,minZ:M,maxZ:N,minY:P,maxY:te}}sampleIndex(e){return $(Math.round(e/this.ds),this.n)}barrierAt(e){return this.halfW[e]+3+.4}isWall(e){return this.canyon[e]>.5&&this.bridge[e]<.5}rampAt(e){for(let t of this.ramps){let n=Md(e-t.s0,this.length);if(n>=0&&n<=t.len){let e=n/t.len;return{h:t.height*Math.sin(Math.PI*e),index:t.index}}}return{h:0,index:-1}}corkAt(e){for(let t of this.corks){let n=Md(e-t.s0,this.length);if(n>=0&&n<t.len)return t.index}return-1}corkAhead(e,t){let n=1/0,r=-1;for(let i of this.corks){let a=Md(i.s0-e,this.length);a>=0&&a<t&&a<n&&(n=a,r=i.index)}return{dist:n,index:r}}corkU(e,t){return Q(Md(t-e.s0,this.length)/e.len,0,1)}corkPhi(e,t){let n=this.corkU(e,t);return Math.PI*2*n*n*n*(n*(n*6-15)+10)}corkHalfW(e,t){let n=this.corkU(e,t),r=Ad(0,.16,n)*Ad(1,.84,n);return kd(this.halfW[this.sampleIndex(t)],e.hw,r)}corkPoint(e,t,n,r,i){this.frameAt(t,Bd);let a=this.corkPhi(e,t),o=Math.cos(a),s=Math.sin(a)*e.dir,c=e.radius,l=c*s,u=c*(1-o);i.x=Bd.x+Bd.rx*(l+n*o-r*s),i.z=Bd.z+Bd.rz*(l+n*o-r*s),i.y=Bd.y+u+n*s+r*o}corkFrame(e,t,n,r){let i=2.5;this.corkPoint(e,t-i,n,0,Vd),this.corkPoint(e,t+i,n,0,Hd),this.corkPoint(e,t,n,0,r);let a=Hd.x-Vd.x,o=Hd.y-Vd.y,s=Hd.z-Vd.z,c=Math.hypot(a,o,s)||1;a/=c,o/=c,s/=c;let l=this.corkPhi(e,t),u=Math.cos(l),d=Math.sin(l)*e.dir;this.frameAt(t,Bd);let f=Bd.rx*u,p=d,m=Bd.rz*u,h=f*a+p*o+m*s;f-=a*h,p-=o*h,m-=s*h;let g=Math.hypot(f,p,m)||1;f/=g,p/=g,m/=g;let _=p*s-m*o,v=m*a-f*s,y=f*o-p*a,b=u,x=-Bd.rx*d,S=-Bd.rz*d;_*x+v*b+y*S<0&&(_=-_,v=-v,y=-y),r.fx=a,r.fy=o,r.fz=s,r.nx=_,r.ny=v,r.nz=y,r.lx=f,r.ly=p,r.lz=m;let C=c/(2*i);r.stretch=C;let w=(Hd.x-2*r.x+Vd.x)/(i*i),T=(Hd.y-2*r.y+Vd.y)/(i*i),E=(Hd.z-2*r.z+Vd.z)/(i*i);return r.kn=(w*_+T*v+E*y)/(C*C),r.roll=l*e.dir,r}frameAt(e,t){let n=$(e,this.length)/this.ds,r=Math.floor(n)%this.n,i=(r+1)%this.n,a=n-Math.floor(n);t.x=kd(this.x[r],this.x[i],a),t.y=kd(this.y[r],this.y[i],a),t.z=kd(this.z[r],this.z[i],a);let o=kd(this.tx[r],this.tx[i],a),s=kd(this.tz[r],this.tz[i],a),c=Math.hypot(o,s)||1;o/=c,s/=c,t.tx=o,t.tz=s,t.rx=-s,t.rz=o,t.halfW=kd(this.halfW[r],this.halfW[i],a),t.bank=kd(this.bank[r],this.bank[i],a)}pavedW(e){let t=Q((Math.abs(this.bank[e])-.45)/.35,0,1);return this.halfW[e]+3*t}locate(e,t,n,r,i){let a=this.n,o=0,s=1/0;if(r<0)for(let r=0;r<a;r+=1){let i=e-this.x[r],a=n-this.z[r],c=(t-this.y[r])*2,l=i*i+a*a+c*c;l<s&&(s=l,o=r)}else for(let i=-28;i<=28;i+=1){let c=$(r+i,a),l=e-this.x[c],u=n-this.z[c],d=(t-this.y[c])*2,f=l*l+u*u+d*d;f<s&&(s=f,o=c)}let c=o,l=e-this.x[c],u=n-this.z[c],d=Q(l*this.tx[c]+u*this.tz[c],-this.ds,this.ds),f=l*this.rx[c]+u*this.rz[c],p=$(c*this.ds+d,this.length),m=this.halfW[c],h=this.y[c]+this.slope[c]*d,g=Math.abs(f)<=m+.5?this.rampAt(p):{h:0,index:-1};return i.i=c,i.s=p,i.d=f,i.centerY=h,i.halfW=m,i.barrier=this.barrierAt(c),i.wall=this.isWall(c),i.onRoad=Math.abs(f)<=this.pavedW(c),i.onSurface=Math.abs(f)<=m+3+.5,i.rampH=g.h,i.rampIndex=g.index,i.roadY=h+this.bank[c]*Q(f,-m-3,m+3)+g.h,i.tx=this.tx[c],i.tz=this.tz[c],i.rx=this.rx[c],i.rz=this.rz[c],i.slope=this.slope[c],i.bank=this.bank[c],i}maxCurvature(e,t,n){let r=0,i=Math.floor((e+t)/this.ds),a=Math.ceil((e+n)/this.ds);for(let e=i;e<=a;e+=1)r=Math.max(r,Math.abs(this.curv[$(e,this.n)]));return r}};function Yd(e,t,n,r,i,a,o,s,c){let l=(e,t)=>Math.max(1e-4,Math.sqrt(Math.hypot(t.x-e.x,t.y-e.y,t.z-e.z))),u=0+l(e,t),d=u+l(t,n),f=d+l(n,r),p=kd(u,d,i),m=(e,t,n,r)=>{let i=(u-p)/(u-0)*e+(p-0)/(u-0)*t,a=(d-p)/(d-u)*t+(p-u)/(d-u)*n,o=(f-p)/(f-d)*n+(p-d)/(f-d)*r,s=(d-p)/(d-0)*i+(p-0)/(d-0)*a,c=(f-p)/(f-u)*a+(p-u)/(f-u)*o;return(d-p)/(d-u)*s+(p-u)/(d-u)*c};a[c]=m(e.x,t.x,n.x,r.x),o[c]=m(e.y,t.y,n.y,r.y),s[c]=m(e.z,t.z,n.z,r.z)}function Xd(e,t,n){let r=e.length,i=0;for(let t=-n;t<=n;t+=1)i+=e[$(t,r)];let a=2*n+1;for(let o=0;o<r;o+=1)t[o]=i/a,i+=e[$(o+n+1,r)]-e[$(o-n,r)]}function Zd(e,t,n,r){let i=new Float64Array(n),a=new Float64Array(n),o=[0,0,0];for(let e=0;e<n;e+=1)r(e*t,o),i[e]=o[0],a[e]=o[2];let s=new Float64Array(n);for(let e=0;e<n;e+=1)s[e]=Math.atan2(i[(e+1)%n]-i[$(e-1,n)],a[(e+1)%n]-a[$(e-1,n)]);let c=0,l=1/0,u=Math.round(140/t),d=Math.round(60/t);for(let e=0;e<n;e+=4){let t=0;for(let r=-u;r<=d;r+=2)t=Math.max(t,Math.abs(jd(s[$(e+r+1,n)]-s[$(e+r-1,n)])));t<l&&(l=t,c=e)}return c*t}var Qd=(e,t,n,r,i)=>({x:e,y:n,z:t,w:r*1.22,kind:i}),$d={id:`canyon-circuit`,name:`Canyon Rush Circuit`,seed:1977,start:.5,points:[Qd(0,380,3,22,`open`),Qd(0,200,3,22,`open`),Qd(15,60,6,20,`canyon`),Qd(80,-50,12,18,`canyon`),Qd(95,-190,20,18,`canyon`),Qd(45,-300,28,18,`canyon`),Qd(-55,-320,36,22,`canyon`),Qd(-110,-240,44,24,`canyon`),Qd(-80,-150,51,22,`canyon`),Qd(-150,-80,58,18,`canyon`),Qd(-270,-110,70,18,`ridge`),Qd(-380,-210,82,18,`ridge`),Qd(-500,-230,88,19,`ridge`),Qd(-600,-150,87,20,`bridge`),Qd(-640,-30,85,20,`bridge`),Qd(-615,90,79,20,`ridge`),Qd(-535,190,62,20,`ridge`),Qd(-420,250,40,20,`canyon`),Qd(-300,320,21,20,`canyon`),Qd(-190,440,8,24,`open`),Qd(-100,520,4,26,`open`),Qd(-25,490,3,22,`open`)],features:[{type:`corkscrew`,at:170,len:110,radius:8,dir:1,width:6},{type:`items`,at:334},{type:`ramp`,at:300},{type:`bank`,at:356,len:80,deg:32},{type:`twist`,at:488,len:190,amp:8,cycles:1.5},{type:`hill`,at:405,amp:5,len:80},{type:`hill`,at:468,amp:-6,len:80},{type:`hill`,at:528,amp:5,len:80},{type:`boost`,at:580,lane:0},{type:`bank`,at:682,len:210,deg:58},{type:`bank`,at:968,len:196,deg:64},{type:`items`,at:1080},{type:`boost`,at:1112,lane:4},{type:`twist`,at:1118,len:140,amp:8},{type:`hill`,at:1150,amp:-6,len:90},{type:`hill`,at:1240,amp:14,len:150},{type:`bank`,at:1365,len:200,deg:52},{type:`boost`,at:1480,lane:-4},{type:`boost`,at:1600,lane:0},{type:`ramp`,at:1662},{type:`boost`,at:1745,lane:0},{type:`twist`,at:1772,len:146,amp:9},{type:`items`,at:1862},{type:`hill`,at:1900,amp:13,len:156},{type:`mega`,at:2012},{type:`corkscrew`,at:2330,len:120,radius:9,dir:-1,width:7},{type:`bank`,at:2556,len:196,deg:62},{type:`boost`,at:2544,lane:-3},{type:`mega`,at:2702}]},ef={name:`Mesa Sprint`,seed:4242,size:1,twist:.55,hills:.5,width:20,canyon:.5,ramps:2,pads:5,items:2};function tf(e){let t=(e,t,n,r)=>typeof e==`number`&&Number.isFinite(e)?Q(e,t,n):r;return{name:typeof e.name==`string`&&e.name.trim()?e.name.trim().slice(0,24):ef.name,seed:Math.floor(t(e.seed,0,999999,ef.seed)),size:t(e.size,.7,1.3,ef.size),twist:t(e.twist,0,1,ef.twist),hills:t(e.hills,0,1,ef.hills),width:t(e.width,16,24,ef.width),canyon:t(e.canyon,0,1,ef.canyon),ramps:Math.round(t(e.ramps,0,4,ef.ramps)),pads:Math.round(t(e.pads,0,10,ef.pads)),items:Math.round(t(e.items,0,4,ef.items))}}function nf(e){return`lab-${Rd(JSON.stringify({...e,name:``})).toString(36)}`}function rf(e){return`CC1-${[e.seed,Math.round(e.size*100),Math.round(e.twist*100),Math.round(e.hills*100),Math.round(e.width),Math.round(e.canyon*100),e.ramps,e.pads,e.items].map(e=>e.toString(36)).join(`.`)}-${encodeURIComponent(e.name).replace(/-/g,`%2D`)}`}function af(e){let t=/^CC1-([0-9a-z.]+)-(.*)$/i.exec(e.trim());if(!t)return null;let n=t[1].split(`.`).map(e=>parseInt(e,36));if(n.length!==9||n.some(e=>!Number.isFinite(e)))return null;let r=ef.name;try{r=decodeURIComponent(t[2])}catch{}return tf({name:r,seed:n[0],size:n[1]/100,twist:n[2]/100,hills:n[3]/100,width:n[4],canyon:n[5]/100,ramps:n[6],pads:n[7],items:n[8]})}function of(e,t){let n=Pd(e.seed*7919+17),r=12+Math.round(t*4),i=380*e.size,a=n()*Od,o=.72+n()*.26,s=[];for(let c=0;c<r;c+=1){let l=Od*c/r+(n()-.5)*.3*(Od/r),u=i*(1+(n()-.5)*.8*t);c%3==1&&(u-=i*.22*t);let d=u*Math.cos(l),f=u*Math.sin(l)*o,p=Math.max(2,3+e.hills*(22+22*Math.sin(l*2+a))+e.hills*10*(n()-.5));s.push({x:d,y:p,z:f,w:e.width,kind:`open`})}for(let t=0;t<r;t+=1){let r=n();s[t].kind=r<e.canyon?`canyon`:s[t].y>20?`ridge`:`open`}if(e.hills>.35){let e=0;for(let t=1;t<r;t+=1)s[t].y>s[e].y&&(e=t);s[e].kind=`bridge`,s[(e+1)%r].kind=`bridge`,s[(e+r-1)%r].kind=s[(e+r-1)%r].kind===`canyon`?`ridge`:s[(e+r-1)%r].kind}let c=[];for(let t=0;t<e.ramps;t+=1)c.push({type:t%2==1?`mega`:`ramp`,u:(t+.5)/e.ramps*r+.55});if(e.hills>.05){let t=2+Math.round(e.hills*4);for(let i=0;i<t;i+=1){let a=i%3!=2,o=4+e.hills*8+n()*2;c.push({type:`hill`,u:(i+.8)/t*r+.1,amp:(a?1:-1)*o,len:Math.max(70+n()*40,o*11)})}}let l=c.filter(e=>e.type===`ramp`||e.type===`mega`).map(e=>e.u??0),u=e=>l.every(t=>Math.abs((e-t+r*1.5)%r-r/2)>1.1);for(let i=1;i<r;i+=3)s[i].kind!==`bridge`&&c.push({type:`bank`,u:i,deg:34+28*t+n()*6,len:110+50*e.size});if(t>.25){let e=0;for(let i=2;i<r&&e<(t>.6?2:1);i+=3){let a=i+.5;u(a)&&s[i].kind!==`bridge`&&s[(i+1)%r].kind!==`bridge`&&(c.push({type:`twist`,u:a,amp:5+5*t,len:130+n()*20}),e+=1)}}for(let t=0;t<e.pads;t+=1)c.push({type:`boost`,u:(t+.3)/e.pads*r+.35,lane:[-4,0,4][t%3]});for(let t=0;t<e.items;t+=1)c.push({type:`items`,u:(t+.15)/e.items*r+.2});return{id:nf(e),name:e.name,seed:e.seed,points:s,features:c}}function sf(e){let t=0,n=0;for(let r=0;r<e.n;r+=1)t=Math.max(t,Math.abs(e.curv[r])),n=Math.max(n,Math.abs(e.slope[r]));let r=1/0,i=Math.round(90/e.ds);for(let t=0;t<e.n;t+=3)for(let n=t+i;n<e.n;n+=3){if(e.n-(n-t)<i||Math.abs(e.y[t]-e.y[n])>16)continue;let a=Math.hypot(e.x[t]-e.x[n],e.z[t]-e.z[n])-(e.halfW[t]+e.halfW[n]+6);r=Math.min(r,a)}let a=t>0?1/t:1/0;return{ok:a>=24&&r>=22&&n<=.46&&e.length>=1400,length:e.length,minRadius:a,minGap:r,maxSlope:n}}function cf(e){let t=tf(e),n=t.twist,r=null;for(let e=0;e<10;e+=1){let e=of(t,n),i=new Jd(e),a=sf(i);if(r={spec:e,track:i,check:a},a.ok)return r;n*=.8}return r}var lf=`canyon-circuit.save`,uf={name:`Canyon One`,chassis:0,primary:`#e0561b`,secondary:`#1d1d20`,accent:`#f2c14e`,wheels:`street`,aero:`clean`,bodyKit:`stock`,hood:`smooth`,spoiler:`ducktail`,paintFinish:`metallic`,paintPattern:`stripe`,power:50,grip:50,boost:50};function df(){return{version:3,musicVolume:.7,sfxVolume:.8,muted:!1,quality:`high`,reducedMotion:!1,cameraShake:!0,assistP1:`strong`,assistP2:`strong`,playerName:`RACER`,chassis:0,livery:0,p2Chassis:1,p2Livery:2,p1Device:`kbLeft`,p2Device:`kbRight`,aiSkill:`pro`,items:!0,customCar:null,points:0,racesPlayed:0,upgrades:{power:0,grip:0,boost:0},controlsSeen:!1,bests:{},customTracks:[]}}var ff=(e,t)=>typeof e==`number`&&Number.isFinite(e)?Math.min(1,Math.max(0,e)):t,pf=(e,t,n)=>typeof e==`number`&&Number.isInteger(e)&&e>=0&&e<t?e:n,mf=[`auto`,`kbLeft`,`kbRight`,`pad0`,`pad1`],hf=[`off`,`light`,`strong`],gf=[`street`,`grip`,`dirt`,`slick`,`beadlock`,`neon`],_f=[`clean`,`wing`,`rally`],vf=[`stock`,`wide`,`street`,`retro`],yf=[`smooth`,`vented`,`carbon`],bf=[`none`,`ducktail`,`gt`,`drift`],xf=[`metallic`,`matte`,`pearl`,`chrome`],Sf=[`solid`,`split`,`stripe`,`sunset`],Cf=(e,t)=>typeof e==`string`&&/^#[0-9a-f]{6}$/i.test(e)?e.toLowerCase():t,wf=e=>{if(!e||typeof e!=`object`||Array.isArray(e))return null;let t=e,n=(e,t)=>typeof e==`number`&&Number.isFinite(e)?Math.min(100,Math.max(0,Math.round(e))):t;return{name:typeof t.name==`string`&&t.name.trim()&&t.name.trim().replace(/[^\w .-]/g,``).slice(0,18)||uf.name,chassis:pf(t.chassis,7,uf.chassis),primary:Cf(t.primary,uf.primary),secondary:Cf(t.secondary,uf.secondary),accent:Cf(t.accent,uf.accent),wheels:gf.includes(t.wheels)?t.wheels:uf.wheels,aero:_f.includes(t.aero)?t.aero:uf.aero,bodyKit:vf.includes(t.bodyKit)?t.bodyKit:uf.bodyKit,hood:yf.includes(t.hood)?t.hood:uf.hood,spoiler:bf.includes(t.spoiler)?t.spoiler:uf.spoiler,paintFinish:xf.includes(t.paintFinish)?t.paintFinish:uf.paintFinish,paintPattern:Sf.includes(t.paintPattern)?t.paintPattern:uf.paintPattern,power:n(t.power,uf.power),grip:n(t.grip,uf.grip),boost:n(t.boost,uf.boost)}},Tf=(e,t)=>hf.includes(e)?e:t===!1?`off`:`strong`;function Ef(e){let t=df();if(!e)return t;let n;try{let r=JSON.parse(e);if(!r||typeof r!=`object`||Array.isArray(r))return t;n=r}catch{return t}if(n.version!==2&&n.version!==3)return t;let r={};if(n.bests&&typeof n.bests==`object`&&!Array.isArray(n.bests))for(let[e,t]of Object.entries(n.bests).slice(0,64)){let n=t;typeof e==`string`&&e.length<=40&&n&&Number.isFinite(n.total)&&n.total>0&&Number.isFinite(n.lap)&&n.lap>=0&&(r[e]={total:n.total,lap:n.lap,...n.totalAssist===!0?{totalAssist:!0}:{},...n.lapAssist===!0?{lapAssist:!0}:{}})}let i=Array.isArray(n.customTracks)?n.customTracks.filter(e=>e&&typeof e==`object`).slice(0,12).map(e=>tf(e)):[];return{version:3,musicVolume:ff(n.musicVolume,t.musicVolume),sfxVolume:ff(n.sfxVolume,t.sfxVolume),muted:n.muted===!0,quality:n.quality===`low`||n.quality===`medium`||n.quality===`high`?n.quality:t.quality,reducedMotion:n.reducedMotion===!0,cameraShake:n.cameraShake!==!1,assistP1:Tf(n.assistP1,n.cornerAssist),assistP2:Tf(n.assistP2,n.cornerAssist),playerName:typeof n.playerName==`string`&&n.playerName.trim()&&n.playerName.trim().replace(/[^\w .-]/g,``).slice(0,14)||t.playerName,chassis:pf(n.chassis,7,t.chassis),livery:pf(n.livery,8,t.livery),p2Chassis:pf(n.p2Chassis,7,t.p2Chassis),p2Livery:pf(n.p2Livery,8,t.p2Livery),p1Device:mf.includes(n.p1Device)?n.p1Device:t.p1Device,p2Device:mf.includes(n.p2Device)?n.p2Device:t.p2Device,aiSkill:n.aiSkill===`relaxed`?`relaxed`:`pro`,items:n.items!==!1,customCar:wf(n.customCar),points:typeof n.points==`number`&&Number.isFinite(n.points)?Math.max(0,Math.min(999999,Math.floor(n.points))):t.points,racesPlayed:typeof n.racesPlayed==`number`&&Number.isFinite(n.racesPlayed)?Math.max(0,Math.min(9999,Math.floor(n.racesPlayed))):t.racesPlayed,upgrades:n.upgrades&&typeof n.upgrades==`object`&&!Array.isArray(n.upgrades)?{power:typeof n.upgrades.power==`number`?Math.max(0,Math.min(10,Math.floor(n.upgrades.power))):0,grip:typeof n.upgrades.grip==`number`?Math.max(0,Math.min(10,Math.floor(n.upgrades.grip))):0,boost:typeof n.upgrades.boost==`number`?Math.max(0,Math.min(10,Math.floor(n.upgrades.boost))):0}:t.upgrades,controlsSeen:n.controlsSeen===!0,bests:r,customTracks:i}}function Df(e,t,n,r=!1,i=!1){if(!(t>0))return null;let a=!e||t<e.total,o=n>0&&(!e||!(e.lap>0)||n<e.lap);if(e&&!a&&!o)return null;let s={total:a?t:e.total,lap:o?n:e?.lap??0},c=a?r:e?.totalAssist===!0,l=o?i:e?.lapAssist===!0;return c&&(s.totalAssist=!0),l&&(s.lapAssist=!0),s}var Of=class{storage;data;constructor(e=globalThis.localStorage){this.storage=e;let t=null;try{t=this.storage?.getItem(`canyon-circuit.save`)??null}catch{t=null}this.data=Ef(t)}update(e){this.data={...this.data,...e};try{this.storage?.setItem(lf,JSON.stringify(this.data))}catch{}}},kf=`canyon-ghost-v1`,Af=63,jf=15;function Mf(e){return e.steer=Math.round(Math.max(-1,Math.min(1,e.steer))*Af)/Af,e.throttle=Math.round(Math.max(0,Math.min(1,e.throttle))*jf)/jf,e.brake=Math.round(Math.max(0,Math.min(1,e.brake))*jf)/jf,e}function Nf(e){let t=Math.round(e.throttle*jf),n=Math.round(e.brake*jf),r=Math.round(e.steer*Af)+Af,i=+!!e.drift|(e.boost?2:0)|(e.item?4:0)|(e.recover?8:0);return t|n<<4|r<<8|i<<15}function Pf(e,t){t.throttle=(e&15)/jf,t.brake=(e>>4&15)/jf,t.steer=((e>>8&127)-Af)/Af;let n=e>>15;return t.drift=!!(n&1),t.boost=!!(n&2),t.item=!!(n&4),t.recover=!!(n&8),t}var Ff=e=>Math.round(e*100)/100;function If(e){return[Ff(e.x),Ff(e.y),Ff(e.z)]}function Lf(e,t){return e.length===t.length&&e.every((e,n)=>Math.abs(e-t[n])<=.011)}function Rf(e){return typeof e==`string`&&/^[A-HJ-NP-Z2-9]{4,6}$/.test(e)}function zf(e){return(typeof e==`string`?e.replace(/[^\w .-]/g,``).trim().slice(0,14):``)||`Racer`}var Bf=1e3/60,Vf=`canyon-circuit.resume`,Hf=class{status=`idle`;message=``;room=``;seat=-1;lobby=null;results=null;race=null;onChange=()=>{};onRaceStart=()=>{};onResults=()=>{};ws=null;url=``;offset=0;rtt=120;pingTimer=0;flushTimer=0;retryTimer=0;retries=0;wanted=!1;profile={name:`Racer`,chassis:0,livery:0};inputs=[];sentUpTo=0;frames=new Map;checks=new Map;resync=null;lastResyncAsk=0;async discover(){try{let e=await fetch(new URL(`multiplayer/bootstrap.json`,document.baseURI).toString(),{cache:`no-store`});if(!e.ok)return null;let t=await e.json();return typeof t.signalingUrl!=`string`||!t.signalingUrl||t.build!==`canyon-ghost-v1`?null:{build:t.build,signalingUrl:t.signalingUrl}}catch{return null}}async connect(e,t){this.disconnect(),this.profile=t,this.status=`loading`,this.message=`Finding the ghost service…`,this.onChange();let n=await this.discover();if(!n){this.status=`unavailable`,this.message=`Online ghost racing still needs a hosted room service. Solo and Track Lab are ready offline.`,this.onChange();return}let r=e.trim().toUpperCase();if(r&&!Rf(r)){this.status=`idle`,this.message=`Room codes are 4–6 letters or digits.`,this.onChange();return}this.url=n.signalingUrl,this.room=r,this.wanted=!0,this.retries=0,this.open()}open(){let e=new URLSearchParams({build:kf});this.room&&e.set(`room`,this.room);let t=this.room?this.readResume(this.room):``;t&&e.set(`resume`,t),this.status=this.retries>0?`reconnecting`:`connecting`,this.message=this.retries>0?`Connection lost — reconnecting…`:`Connecting…`,this.onChange();let n;try{n=new WebSocket(`${this.url}${this.url.includes(`?`)?`&`:`?`}${e.toString()}`)}catch{this.fail(`Could not open a connection to the ghost service.`);return}this.ws=n,n.onmessage=e=>this.receive(e.data),n.onclose=()=>{if(this.ws===n&&(this.ws=null,clearInterval(this.pingTimer),clearInterval(this.flushTimer),this.wanted)){if(this.retries+=1,this.retries>6){this.fail(`The ghost service is unreachable right now. Try again in a moment.`);return}this.status=`reconnecting`,this.message=`Connection lost — reconnecting…`,this.onChange(),this.retryTimer=window.setTimeout(()=>this.open(),Math.min(8e3,500*2**this.retries))}}}fail(e){this.wanted=!1,this.status=`closed`,this.message=e,this.onChange()}disconnect(){if(this.wanted=!1,clearTimeout(this.retryTimer),clearInterval(this.pingTimer),clearInterval(this.flushTimer),this.ws){try{this.send({t:`leave`})}catch{}this.ws.close()}this.ws=null,this.status=`idle`,this.message=``,this.lobby=null,this.seat=-1,this.race=null,this.results=null,this.frames.clear()}send(e){this.ws&&this.ws.readyState===WebSocket.OPEN&&this.ws.send(JSON.stringify(e))}readResume(e){try{let t=sessionStorage.getItem(Vf),n=t?JSON.parse(t):null;return n&&n.room===e?n.token:``}catch{return``}}writeResume(e,t){try{sessionStorage.setItem(Vf,JSON.stringify({room:e,token:t}))}catch{}}receive(e){if(typeof e!=`string`||e.length>2e5)return;let t;try{t=JSON.parse(e)}catch{return}switch(t.t){case`welcome`:{if(t.build!==`canyon-ghost-v1`)return this.fail(`This game version does not match the ghost service. Refresh the page.`);this.room=String(t.room),this.seat=Number(t.seat),typeof t.resume==`string`&&this.writeResume(this.room,t.resume),this.retries=0,this.status=`connected`,this.message=this.seat<0?`Room is full — watching as a spectator.`:``,this.offset=Number(t.now)-performance.now(),this.send({t:`join`,...this.profile}),this.ping(),this.pingTimer=window.setInterval(()=>this.ping(),1e3),this.flushTimer=window.setInterval(()=>this.flush(),50);let e=Number(t.nextTick);Number.isFinite(e)&&e>0&&this.race&&Number(t.raceId)===this.race.raceId&&(this.sentUpTo=e-1),this.onChange();break}case`pong`:{let e=Number(t.c),n=Number(t.s),r=performance.now(),i=r-e;if(!(i>=0&&i<5e3))return;this.rtt=this.rtt*.8+i*.2;let a=n+i/2-r;this.offset=Math.abs(a-this.offset)>250?a:this.offset*.85+a*.15;break}case`lobby`:this.lobby=t.lobby,this.lobby.phase===`lobby`&&this.race&&this.results&&(this.race=null),this.onChange();break;case`start`:{let e=t;if(this.race&&this.race.raceId===e.raceId)break;this.race={raceId:e.raceId,startAt:e.startAt,track:e.track,seats:e.seats,seed:e.seed},this.results=null,this.inputs.length=0,this.sentUpTo=0,this.frames.clear(),this.checks.clear(),this.resync=null,this.seat>=0&&e.seats.includes(this.seat)&&this.onRaceStart(this.race),this.onChange();break}case`ghosts`:{let e=t.cars;if(!Array.isArray(e))return;for(let t of e.slice(0,3)){if(!t||typeof t.seat!=`number`)continue;let e=this.frames.get(t.seat)??[];e.length&&e[e.length-1].tick>=t.tick||(e.push(t),e.length>40&&e.splice(0,e.length-40),this.frames.set(t.seat,e))}break}case`ack`:{let e=Number(t.tick),n=t.c,r=this.checks.get(e);r&&Array.isArray(n)&&!Lf(r.split(`,`).map(Number),n)&&this.askResync();break}case`state`:this.resync=t.snap;break;case`rewind`:{let e=Number(t.next);this.race&&Number(t.raceId)===this.race.raceId&&Number.isInteger(e)&&e>=1&&(this.sentUpTo=Math.min(this.sentUpTo,e-1));break}case`results`:this.results=t.rows,this.onResults(this.results),this.onChange();break;case`error`:this.message=typeof t.message==`string`?t.message:`The ghost service rejected a message.`,t.fatal?this.fail(this.message):this.onChange()}}ping(){this.send({t:`ping`,c:performance.now()})}flush(){if(!this.race||this.seat<0)return;let e=this.sentUpTo+1,t=Math.min(this.inputs.length-1,this.sentUpTo+240);if(t<e)return;let n=[];for(let r=e;r<=t;r+=1)n.push(this.inputs[r]??0);this.send({t:`in`,raceId:this.race.raceId,from:e,v:n}),this.sentUpTo=t}askResync(){let e=performance.now();e-this.lastResyncAsk<2e3||(this.lastResyncAsk=e,this.send({t:`resync`}))}setReady(e){this.send({t:`ready`,v:e})}setTrack(e){this.send({t:`track`,track:e})}start(){this.send({t:`start`})}updateProfile(e){this.profile=e,this.send({t:`join`,...e})}get isHost(){return!!this.lobby&&this.lobby.host===this.seat}get latency(){return Math.round(this.rtt)}serverNow(){return performance.now()+this.offset}targetTick(){return this.race?Math.floor((this.serverNow()-this.race.startAt)/Bf):0}pushInput(e,t){this.inputs[e]=t}ghostFrames(){return this.frames}ghostProfile(e){let t=this.lobby?.players.find(t=>t.seat===e);return t?{name:t.name,chassis:t.chassis,livery:t.livery,custom:t.custom}:null}takeResync(){let e=this.resync;return this.resync=null,e}recordCheck(e,t){if(this.checks.set(e,t.join(`,`)),this.checks.size>1200){let t=e-1100;for(let e of this.checks.keys())e<t&&this.checks.delete(e)}}},Uf=class{input;active;repairsLeft;raceOpen;pauseRace;setStable;root;steerId=-1;steerX=0;constructor(e,t,n,r=()=>0,i=n,a=()=>{},o=()=>{}){this.input=t,this.active=n,this.repairsLeft=r,this.raceOpen=i,this.pauseRace=a,this.setStable=o,this.root=document.createElement(`div`),this.root.className=`touch`,this.root.innerHTML=`
      <div class="t-steer" data-steer aria-label="Steering"><div class="t-knob" data-knob></div><span>STEER</span></div>
      <div class="t-buttons" aria-label="Driving controls">
        <button type="button" class="t-btn t-reverse" data-k="brake" aria-label="Reverse"><span>▼</span><small>REV</small></button>
        <button type="button" class="t-btn t-forward" data-k="throttle" aria-label="Forward"><span>▲</span><small>GO</small></button>
      </div>
      <div class="t-top-actions"><button type="button" class="t-repair" data-repair aria-label="Repair car"><span>✚</span><small>FIX <b data-repair-count>2</b></small></button><button type="button" class="t-stable" data-stable aria-pressed="false" aria-label="Toggle Stable Mode"><span>◎</span><small>STABLE</small></button><button type="button" class="t-pause" data-pause aria-label="Pause">Ⅱ</button></div>`,this.root.insertAdjacentHTML(`beforeend`,`<div class="orientation-gate" data-orientation-gate role="dialog" aria-modal="true" aria-live="polite"><div class="orientation-card"><span class="orientation-icon" aria-hidden="true">↻</span><b>Rotate to landscape</b><p>Canyon Rush is built for a wide race view. Turn your phone sideways to continue driving.</p><button type="button" class="btn primary" data-orientation-lock>Try landscape mode</button></div></div>`),e.appendChild(this.root);let s=this.root.querySelector(`[data-steer]`),c=this.root.querySelector(`[data-knob]`),l=this.root.querySelector(`[data-repair]`),u=this.root.querySelector(`[data-repair-count]`),d=this.root.querySelector(`[data-stable]`),f=e=>{let t=s.getBoundingClientRect(),n=Math.max(-1,Math.min(1,(e-(t.left+t.width/2))/(t.width*.38)));this.input.touch.steer=n,c.style.transform=`translateX(${n*t.width*.34}px)`};s.addEventListener(`pointerdown`,e=>{this.steerId=e.pointerId,this.steerX=e.clientX,s.setPointerCapture(e.pointerId),f(e.clientX)}),s.addEventListener(`pointermove`,e=>{e.pointerId===this.steerId&&f(e.clientX)});let p=e=>{e.pointerId===this.steerId&&(this.steerId=-1,this.input.touch.steer=0,c.style.transform=``)};s.addEventListener(`pointerup`,p),s.addEventListener(`pointercancel`,p),this.steerX;for(let e of this.root.querySelectorAll(`[data-k]`)){let t=e.dataset.k,n=n=>{this.input.touch[t]=n,e.classList.toggle(`on`,n)};e.addEventListener(`pointerdown`,t=>{t.preventDefault(),e.setPointerCapture(t.pointerId),n(!0)}),e.addEventListener(`pointerup`,()=>n(!1)),e.addEventListener(`pointercancel`,()=>n(!1)),e.addEventListener(`lostpointercapture`,()=>n(!1))}this.root.querySelector(`[data-pause]`).addEventListener(`click`,()=>window.dispatchEvent(new Event(`game:pause`))),this.root.querySelector(`[data-repair]`).addEventListener(`click`,e=>{e.preventDefault(),window.dispatchEvent(new Event(`game:repair`))}),d.addEventListener(`click`,e=>{e.preventDefault();let t=!d.classList.contains(`on`);d.classList.toggle(`on`,t),d.setAttribute(`aria-pressed`,String(t)),this.setStable(t)}),this.root.querySelector(`[data-orientation-lock]`).addEventListener(`click`,async()=>{try{let e=document.documentElement;!document.fullscreenElement&&e.requestFullscreen&&await e.requestFullscreen(),await screen.orientation.lock?.(`landscape`)}catch{}});let m=!1,h=()=>{let e=this.active(),t=navigator.maxTouchPoints>0||window.matchMedia(`(pointer: coarse)`).matches,n=window.innerHeight>window.innerWidth,r=t&&n&&e;this.root.querySelector(`[data-orientation-gate]`).classList.toggle(`show`,r),r&&!m?(m=!0,this.pauseRace()):r||(m=!1),this.root.classList.toggle(`show`,e||r);let i=Math.max(0,this.repairsLeft());u.textContent=String(i),l.classList.toggle(`empty`,i===0),(!e||r)&&(this.input.touch.steer=0,this.input.touch.throttle=!1,this.input.touch.brake=!1,this.input.touch.drift=!1,this.input.touch.boost=!1,this.input.touch.item=!1,this.input.touch.recover=!1,c.style.transform=``),this.raceOpen()||(d.classList.remove(`on`),d.setAttribute(`aria-pressed`,`false`),this.setStable(!1)),requestAnimationFrame(h)};h(),window.setInterval(h,250)}},Wf={car:{maxSpeed:58,accel:30,brake:50,reverseSpeed:14,coastDrag:5,turnLow:2.3,turnHigh:.9,grip:9,driftGrip:2.6,driftBase:1.15,driftSteer:.7,driftMinSpeed:17,boostSpeed:74,boostAccel:38,nitroTime:1.4,nitroCooldown:8,nitroAccel:26,corkSteer:7,draftBonus:6,gravity:30,airTurn:1.3,shoulderFactor:.7,rampKick:.27,megaKick:.52,downhillBonus:26,bankGrip:.9,bankMagnet:!0,bankTurn:.8},race:{aiPace:1,itemRespawn:3},camera:{fov:68,distance:7.4,height:2.7,follow:9}},Gf=structuredClone(Wf),Kf=48;function qf(){return{gates:0,lapStart:0,lapTimes:[],gateTimes:[],penalty:0,recoveries:0,finished:!1,dnf:!1,finishTime:0}}var Jf=e=>Math.min(3,Math.floor(e.gates/16)+1),Yf=e=>e.gates%16,Xf=e=>e.finishTime+e.penalty;function Zf(e,t,n,r){if(t<=0)return!1;let i=Md(e-n,r);return i<0&&i+t>=0}function Qf(e,t){return e.finished||e.dnf?`none`:(e.gates+=1,e.gateTimes.push(t),e.gates%16==0?(e.lapTimes.push(t-e.lapStart),e.lapStart=t,e.gates>=Kf?(e.finished=!0,e.finishTime=t,`finish`):`lap`):`gate`)}function $f(e){e.finished||e.dnf||(e.recoveries+=1)}function ep(e,t){return e.finished||e.dnf||t<300?!1:(e.dnf=!0,!0)}function tp(e,t){let n=e.progress.finished,r=t.progress.finished;return n&&r?Xf(e.progress)-Xf(t.progress)||e.id-t.id:n===r?e.progress.dnf===t.progress.dnf?t.progress.gates-e.progress.gates||e.toNext-t.toNext||e.id-t.id:e.progress.dnf?1:-1:n?-1:1}function np(e){return e.lapTimes.length?Math.min(...e.lapTimes):0}function rp(e){(!Number.isFinite(e)||e<0)&&(e=0);let t=Math.floor(e/60),n=e-t*60;return`${t}:${n<10?`0`:``}${n.toFixed(3)}`}function ip(e){let t=[`th`,`st`,`nd`,`rd`],n=e%100;return e+(t[(n-20)%10]||t[n]||t[0])}var ap=1/60,op=1.55,sp=.5,cp=[.9,1.9,3],lp=[.7,1.15,1.7],up=1.05,dp=.35,fp=.7,pp=1.6,mp=3,hp={speed:1,power:1,grip:1,boost:1},gp={wall:1,car:2,item:3,landing:4},_p=()=>({throttle:0,brake:0,steer:0,drift:!1,boost:!1,item:!1,recover:!1});function vp(e,t,n,r,i=hp){let a={id:e,tune:{...i},x:0,y:0,z:0,yaw:0,vx:0,vz:0,vy:0,vF:0,grounded:!0,airTime:0,loc:Kd(),odo:r,lastDs:0,prevS:0,drift:!1,driftDir:0,driftCharge:0,driftTier:0,driftHeld:0,boostTime:0,meter:1,meterBoosting:!1,nitro:0,prevBoost:!1,cork:-1,corkFall:0,draftCharge:0,drafting:!1,trick:0,trickT:0,tricks:0,spin:0,wheelspin:0,shield:0,immune:0,ghostT:0,item:null,itemRequest:!1,recovering:0,wrongWay:0,stuck:0,throttlePressAt:-1,prevDrift:!1,prevItem:!1,prevRecover:!1,prevThrottle:!1,lastPad:-1,padTimer:0,rampIndex:-1,place:e+1,progress:qf(),stats:{topSpeed:0,nitros:0,corks:0,driftBoosts:0,perfectPads:0,pads:0,tricks:0,draftTime:0,airTime:0,hits:0,dodges:0,blocks:0,itemsUsed:0,wallHits:0,wrecks:0,launch:`none`},damage:0,wreck:0,hold:0,holdPress:-1,warnSeeker:-1,warnLocked:!1,warnLockD:0,warnMine:-1,slip:0,anchor:1,steerVis:0,landImpact:0};return bp(a,t,$(r,t.length),n),a}var yp={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};function bp(e,t,n,r){t.frameAt(n,yp),e.x=yp.x+yp.rx*r,e.z=yp.z+yp.rz*r,e.y=yp.y+yp.bank*r,e.yaw=Math.atan2(yp.tx,yp.tz),t.locate(e.x,e.y,e.z,t.sampleIndex(n),e.loc),e.y=e.loc.roadY,e.prevS=e.loc.s,e.grounded=!0,e.vy=0,e.rampIndex=e.loc.rampIndex}function xp(e,t,n){let r=t.throttle>.5;r&&!e.prevThrottle&&(e.throttlePressAt=n),r||(e.throttlePressAt=-1),e.prevThrottle=r,e.prevDrift=t.drift,e.prevItem=t.item,e.prevRecover=t.recover,e.prevBoost=t.boost}function Sp(e,t){let n=e.throttlePressAt;n<0||(n<=.4?(e.boostTime=Math.max(e.boostTime,1.3),e.stats.launch=`perfect`,t.push({type:`launchPerfect`,car:e.id})):n>1&&(e.wheelspin=.7,e.stats.launch=`early`,t.push({type:`launchEarly`,car:e.id})))}var Cp=e=>e.recovering>0||e.wreck>0||e.hold>0;function wp(e,t,n,r){if(t<=0||e.progress.finished||Cp(e)||e.ghostT>0)return;let i=e.damage;if(e.damage=Math.min(1,i+t/2),n.push({type:`damage`,car:e.id,value:e.damage,other:r}),e.damage>=1){e.wreck=pp,e.drift=!1,e.driftCharge=0,e.driftTier=0,e.trick=0,e.tricks=0,e.boostTime=0,e.meterBoosting=!1,e.nitro=0,e.cork>=0&&(e.cork=-1,e.grounded=!1),e.spin=0,e.stats.wrecks+=1,n.push({type:`explode`,car:e.id,other:r});return}i<.7&&e.damage>=.7?n.push({type:`onFire`,car:e.id}):i<.35&&e.damage>=.35&&n.push({type:`smoking`,car:e.id})}function Tp(e,t,n){Cp(e)||e.progress.finished||(e.recovering=.6,e.drift=!1,e.driftCharge=0,e.trick=0,e.tricks=0,e.vx=e.vz=e.vy=0,e.vF=0,e.meterBoosting=!1,e.nitro=0,e.cork=-1,e.corkFall=0,t.push({type:`recoverStart`,car:e.id,value:n===`manual`?0:n===`fell`?1:2}))}function Ep(e,t,n,r){e.slip=0,e.anchor=1;let i=t.length,a=e.loc.s,o=t.corkAt(a);o>=0&&(a=$(t.corks[o].s0-30,i));let s=t.gates[Yf(e.progress)].s;Md(s-a,i)<10&&(a=$(s-10,i));let c=Q(e.loc.d,-e.loc.halfW+2.5,e.loc.halfW-2.5)*.35;e.odo+=Md(a-e.loc.s,i),bp(e,t,a,c),e.vx=e.vz=e.vy=e.vF=0,e.lastDs=0,e.prevS=e.loc.s,e.hold=mp,e.holdPress=-1,e.ghostT=mp+1.2,e.immune=Math.max(e.immune,mp+1.2),e.damage=0,e.wreck=0,e.recovering=0,e.boostTime=0,e.nitro=0,e.meterBoosting=!1,e.cork=-1,e.corkFall=0,e.wrongWay=0,e.stuck=0,e.spin=0,e.wheelspin=0,e.drafting=!1,e.draftCharge=0,$f(e.progress),n.push({type:`recovered`,car:e.id,value:+!!r})}function Dp(e,t,n){let r=t.barrier-up,i=Math.abs(t.d)-r;if(i<=0)return;let a=Math.sign(t.d);e.x-=t.rx*a*i,e.z-=t.rz*a*i;let o=(e.vx*t.rx+e.vz*t.rz)*a;if(o>0){e.vx-=t.rx*a*o*1.3,e.vz-=t.rz*a*o*1.3;let r=Q(o/45,0,.35);e.vx*=1-r,e.vz*=1-r,n&&o>5&&(e.stats.wallHits+=1,n.push({type:`wall`,car:e.id,value:o}),o>10&&e.drift&&(e.drift=!1,n.push({type:`driftLost`,car:e.id})),o>14&&wp(e,(o-14)/30,n,gp.wall))}t.d=a*r}function Op(e,t,n){let r=ap;e.wreck-=r;let i=Math.exp(-2.4*r);e.vx*=i,e.vz*=i,e.x+=e.vx*r,e.z+=e.vz*r,e.grounded||(e.vy-=Gf.car.gravity*r,e.y+=e.vy*r);let a=e.loc.s;t.locate(e.x,e.y,e.z,e.loc.i,e.loc),Dp(e,e.loc,null),(e.grounded||e.y<=e.loc.roadY)&&(e.y=e.loc.roadY,e.vy=0,e.grounded=!0);let o=Md(e.loc.s-a,t.length);e.odo+=o,e.prevS=a,e.lastDs=0,e.vF=e.vx*Math.sin(e.yaw)+e.vz*Math.cos(e.yaw),e.wreck<=0&&Ep(e,t,n,!0)}function kp(e,t,n,r){let i=t.throttle>.5;i&&!n&&(e.holdPress=e.hold),i||(e.holdPress=-1),e.hold-=ap,e.vx=e.vz=e.vy=e.vF=0,e.lastDs=0,e.prevS=e.loc.s,!(e.hold>1e-9)&&(e.hold=0,e.ghostT=Math.max(e.ghostT,1),e.immune=Math.max(e.immune,1),r.push({type:`holdGo`,car:e.id}),e.holdPress>=0&&e.holdPress<=.4&&(e.boostTime=Math.max(e.boostTime,1.1),r.push({type:`launchPerfect`,car:e.id,value:1})),e.holdPress=-1)}function Ap(e,t,n){Ep(e,t,n,!1)}function jp(e,t,n,r){let i=Gf.car,a=e.tune,o=ap,s=t.drift&&!e.prevDrift,c=t.item&&!e.prevItem,l=t.recover&&!e.prevRecover,u=t.boost&&!e.prevBoost;e.prevBoost=t.boost;let d=e.prevThrottle;if(e.prevDrift=t.drift,e.prevItem=t.item,e.prevRecover=t.recover,e.prevThrottle=t.throttle>.5,c&&e.item&&!Cp(e)&&e.spin<=0&&e.cork<0&&(e.itemRequest=!0),e.immune=Math.max(0,e.immune-o),e.shield=Math.max(0,e.shield-o),e.ghostT=Math.max(0,e.ghostT-o),e.spin=Math.max(0,e.spin-o),e.wheelspin=Math.max(0,e.wheelspin-o),e.padTimer=Math.max(0,e.padTimer-o),e.landImpact=Math.max(0,e.landImpact-o*3),e.wreck>0){Op(e,n,r);return}if(e.hold>0){kp(e,t,d,r);return}if(e.recovering>0){e.recovering-=o,e.recovering<=0&&Ap(e,n,r);return}if(l&&!e.progress.finished){Tp(e,r,`manual`);return}if(e.corkFall>0&&(e.corkFall-=o,e.corkFall<=0)){e.corkFall=0,Tp(e,r,`fell`);return}let f=Q(t.steer,-1,1),p=Q(t.throttle,0,1),m=Q(t.brake,0,1);e.spin>0&&(p=0,m=0,f=0),e.wheelspin>0&&(p=0),e.steerVis=Nd(e.steerVis,f,o*6),e.nitro>0?(e.nitro=Math.max(0,e.nitro-o),e.boostTime=Math.max(e.boostTime,Math.min(e.nitro,o*2))):e.progress.finished||(e.meter=Math.min(1,e.meter+o/i.nitroCooldown)),u&&e.spin<=0&&e.nitro<=0&&(e.meter>=1?(e.nitro=i.nitroTime,e.meter=0,e.boostTime=Math.max(e.boostTime,i.nitroTime),e.stats.nitros+=1,r.push({type:`nitro`,car:e.id})):r.push({type:`nitroDenied`,car:e.id,value:e.meter})),e.meterBoosting=e.nitro>0;let h=e.boostTime>0;e.boostTime=Math.max(0,e.boostTime-o);let g=e.nitro>0?i.nitroAccel*a.boost:0;if(e.cork>=0){Pp(e,n,r,f,p,m,h,g);return}let _=Math.sin(e.yaw),v=Math.cos(e.yaw),y=e.vx*_+e.vz*v,b=e.loc,x=Math.abs(y),S=0,C=0;if(e.grounded){let s=0;if(Math.abs(b.bank)>.25){let t=Math.max(0,e.vx*b.tx+e.vz*b.tz),r=Fp(b.bank,n.curv[b.i],t),a=i.bankGrip*r.normal;S=r.sin,i.bankMagnet?e.anchor=Math.max(1,r.normal/i.gravity):r.pull>a?(e.anchor=r.normal/i.gravity,s=Q((r.pull-a)/(.6*i.gravity),0,1),C=(r.pull-a)*r.cos*1.6):e.anchor=r.normal/i.gravity}else e.anchor=1;let c=e.slip;e.slip=Nd(e.slip,s,o*(s>e.slip?5:3)),e.slip>.25&&c<=.25&&r.push({type:`unanchored`,car:e.id});let l=b.onRoad?1:i.shoulderFactor,u=Q(-b.slope*(_*b.tx+v*b.tz),0,.4)*i.downhillBonus,d=i.maxSpeed*a.speed,w=(h?i.boostSpeed*a.boost:d*l)+(e.drafting?i.draftBonus:0)+u;if(p>.05&&y>=-.5){let e=w*p;if(y<e){let t=i.accel*a.power*(1-.55*Q(y/d,0,1))+(h?i.boostAccel*a.boost:0)+g;y=Math.min(e,y+t*o)}}else y=p>.05?Math.min(0,y+i.brake*o):m>.05?y>.5?Math.max(0,y-i.brake*m*o):Math.max(-i.reverseSpeed,y-16*m*o):Nd(y,0,i.coastDrag*o);y>w&&(y=Math.max(w,y-(h?8:20)*o));let T=_*b.tx+v*b.tz;if(y-=i.gravity*b.slope*T*.42*o,!e.drift&&t.drift&&e.driftHeld<.45&&Math.abs(f)>.35&&y>i.driftMinSpeed&&e.spin<=0&&(e.drift=!0,e.driftDir=Math.sign(f),e.driftCharge=0,e.driftTier=0,r.push({type:`driftStart`,car:e.id,value:e.driftDir})),e.drift){if(!t.drift)e.driftTier>0&&(e.boostTime=Math.max(e.boostTime,lp[e.driftTier-1]),e.meter=Math.min(1,e.meter+.06*e.driftTier),e.stats.driftBoosts+=1,r.push({type:`driftBoost`,car:e.id,value:e.driftTier})),e.drift=!1;else if(y<11||e.spin>0)e.drift=!1,r.push({type:`driftLost`,car:e.id});else{e.driftCharge+=o*(.75+.5*Math.max(0,f*e.driftDir));let t=e.driftCharge>=cp[2]?3:e.driftCharge>=cp[1]?2:+(e.driftCharge>=cp[0]);t>e.driftTier&&r.push({type:`driftTier`,car:e.id,value:t}),e.driftTier=t}}let E;if(e.drift)E=e.driftDir*(i.driftBase+i.driftSteer*f*e.driftDir)*Q(x/22,.4,1);else{let e=kd(i.turnLow,i.turnHigh+i.bankTurn*S,Q(x/d,0,1))*Q(x/4,0,1)*(.96+a.grip*.04);E=f*e*(y<-.5?-1:1)}E*=1-.6*e.slip,e.spin>0&&(E=9*(e.id%2?1:-1)*(e.spin/1)),e.yaw=jd(e.yaw-E*o);let D=y,O=Math.sin(e.yaw),ee=Math.cos(e.yaw),k=-ee,A=O,j=_*D+-v*(e.vx*-v+e.vz*_),M=v*D+_*(e.vx*-v+e.vz*_),N=j*O+M*ee,P=j*k+M*A,te=(e.drift?i.driftGrip:i.grip)*a.grip*(b.onRoad?1:.8)*(e.spin>0?.15:1)*(1-e.slip)*(1-e.slip),F=P*Math.exp(-te*o),ne=Math.hypot(N,P),re=Math.sqrt(Math.max(0,ne*ne-F*F));if(N+=(Math.sign(N||1)*re-N)*.92,P=F,e.vx=O*N+k*P,e.vz=ee*N+A*P,C>0){let t=-Math.sign(b.bank);e.vx+=b.rx*t*C*o,e.vz+=b.rz*t*C*o}_=O,v=ee,y=N}else{e.slip=Nd(e.slip,0,o*2),e.anchor=0,e.vy-=i.gravity*o;let t=f*i.airTurn*o;e.yaw=jd(e.yaw-t);let n=Math.cos(-t*.5),a=Math.sin(-t*.5),c=e.vx*n+e.vz*a,l=-e.vx*a+e.vz*n;e.vx=c*(1-.1*o),e.vz=l*(1-.1*o),e.airTime+=o,s&&e.trick===0&&e.airTime>.08&&e.spin<=0&&(e.trick=f<-.35?2:f>.35?3:1,e.trickT=0,r.push({type:`trickStart`,car:e.id,value:e.trick})),e.trick!==0&&(e.trickT+=o,e.trickT>=.5&&(e.tricks+=1,r.push({type:`trick`,car:e.id,value:e.trick}),e.trick=0,e.trickT=0)),_=Math.sin(e.yaw),v=Math.cos(e.yaw),y=e.vx*_+e.vz*v}e.driftHeld=t.drift?e.driftHeld+o:0;let w=e.y;e.x+=e.vx*o,e.z+=e.vz*o,e.grounded||(e.y+=e.vy*o);let T=e.loc.s,E=e.rampIndex;n.locate(e.x,e.y,e.z,e.loc.i,e.loc);let D=e.loc;if(Dp(e,D,r),e.wreck>0)return;if(e.grounded){if(!D.onSurface)e.grounded=!1;else if(E>=0&&D.rampIndex<0&&Md(D.s-T,n.length)>0){e.grounded=!1;let t=n.ramps[E]?.mega??!1;e.vy=Math.max(e.vy,(t?i.megaKick:i.rampKick)*Q(y,0,t?64:80)+(t?4:2)),e.airTime=0,e.tricks=0,r.push({type:`launch`,car:e.id,value:y,other:+!!t})}else if(D.roadY<w-.9)e.grounded=!1,e.airTime=0,e.tricks=0;else if(!i.bankMagnet&&e.slip>.7&&Math.abs(D.bank)>1.35){e.grounded=!1;let t=-Math.sign(D.bank);e.vx+=D.rx*t*3,e.vz+=D.rz*t*3,e.vy=1.5,e.airTime=0,e.tricks=0,r.push({type:`peel`,car:e.id})}else Lp(e,n,_,v,y)?(e.grounded=!1,e.vy=D.slope*y*(_*D.tx+v*D.tz),e.y=w+e.vy*o,e.airTime=0,e.tricks=0,r.push({type:`crest`,car:e.id,value:y})):(e.vy=Q((D.roadY-w)/o,-40,40),e.y=D.roadY)}else if(e.corkFall<=0&&D.onSurface&&e.y<=D.roadY&&(e.airTime>.1&&e.vy<=Rp(e)+.4||e.y<D.roadY-.35)){e.y=D.roadY;let t=Rp(e)-e.vy;e.vy=0,e.grounded=!0,e.stats.airTime+=e.airTime,e.landImpact=Q(t/20,0,1);let n=Math.atan2(e.vx,e.vz),i=Math.abs(jd(e.yaw-n));e.trick===0?e.tricks>0?(e.boostTime=Math.max(e.boostTime,.5+.45*e.tricks),e.meter=Math.min(1,e.meter+.1*e.tricks),e.stats.tricks+=e.tricks,r.push({type:`trickLand`,car:e.id,value:e.tricks})):e.airTime>.3&&r.push({type:`land`,car:e.id,value:e.landImpact}):(e.vx*=.55,e.vz*=.55,e.spin=.55,e.drift=!1,r.push({type:`crash`,car:e.id}),wp(e,.25,r,gp.landing)),i>.9&&Math.hypot(e.vx,e.vz)>8&&(e.vx*=.8,e.vz*=.8,r.push({type:`rough`,car:e.id})),e.trick=0,e.trickT=0,e.tricks=0,e.airTime=0}if(e.rampIndex=e.grounded?D.rampIndex:-1,e.grounded&&e.corkFall<=0){let t=n.corkAt(D.s);if(t>=0){let i=n.corks[t],a=Md(D.s-i.s0,n.length),o=e.vx*D.tx+e.vz*D.tz;a<14&&o>0?(e.cork=t,e.vF=o,e.drift=!1,e.slip=0,r.push({type:`corkEnter`,car:e.id,value:o})):(e.grounded=!1,e.corkFall=.9,r.push({type:`corkFall`,car:e.id}))}}!e.grounded&&!D.onSurface&&e.y<D.roadY-12&&Tp(e,r,`fell`),!e.grounded&&e.airTime>8&&Tp(e,r,`fell`),e.grounded&&Mp(e,n,r);let O=Md(D.s-T,n.length);e.lastDs=O,e.prevS=T,e.odo+=O,y=e.vx*_+e.vz*v,e.vF=y,e.stats.topSpeed=Math.max(e.stats.topSpeed,y),_*D.tx+v*D.tz<-.25&&O<0&&e.grounded?e.wrongWay+=o:e.wrongWay=Math.max(0,e.wrongWay-o*2),Math.abs(y)<1.2&&p>.5&&e.spin<=0&&e.wheelspin<=0?e.stuck+=o:e.stuck=0,e.stuck>3&&!e.progress.finished&&Tp(e,r,`stuck`)}function Mp(e,t,n){let r=e.loc;for(let i of t.pads){if(i.cork>=0!=e.cork>=0)continue;let a=Md(r.s-i.s+i.len/2,t.length);if(a<0||a>i.len)continue;let o=Math.abs(r.d-i.d);if(o>i.halfW+.6||e.lastPad===i.index&&e.padTimer>0)continue;let s=o<=.85;e.boostTime=Math.max(e.boostTime,s?1.6:1.05),s&&(e.meter=Math.min(1,e.meter+.08)),e.lastPad=i.index,e.padTimer=2,e.stats.pads+=1,s&&(e.stats.perfectPads+=1),n.push({type:`pad`,car:e.id,value:+!!s})}}var Np=zd();function Pp(e,t,n,r,i,a,o,s){let c=Gf.car,l=e.tune,u=ap,d=t.corks[e.cork],f=t.length;e.drift=!1,e.driftCharge=0,e.driftTier=0,e.trick=0,e.slip=0,e.airTime=0,e.grounded=!0,e.driftHeld=0;let p=e.loc,m=p.s,h=p.d;t.corkFrame(d,m,h,Np);let g=e.vF,_=o?c.boostSpeed*l.boost:c.maxSpeed*l.speed;if(i>.05){let e=_*i;g<e&&(g=Math.min(e,g+(c.accel*l.power*(1-.55*Q(g/(c.maxSpeed*l.speed),0,1))+(o?c.boostAccel*l.boost:0)+s)*u))}else g=a>.05?Math.max(0,g-c.brake*a*u):Nd(g,0,c.coastDrag*u);g>_&&(g=Math.max(_,g-8*u)),g-=c.gravity*Np.fy*u;let v=t.corkHalfW(d,m);h=Q(h+r*c.corkSteer*Q(g/20,.3,1)*u,-v+1.3,v-1.3);let y=m;m=$(m+Math.max(0,g)*u/Np.stretch,f);let b=Md(m-d.s0,f);t.corkFrame(d,m,h,Np),e.x=Np.x,e.y=Np.y,e.z=Np.z,e.yaw=Math.atan2(Np.fx,Np.fz),e.vx=Np.fx*g,e.vz=Np.fz*g,e.vy=Np.fy*g,e.vF=g;let x=g*g*Np.kn+c.gravity*Np.ny;e.anchor=x/c.gravity,e.steerVis=Nd(e.steerVis,r,u*6),t.locate(e.x,e.y,e.z,t.sampleIndex(m),p),p.s=m,p.i=t.sampleIndex(m),p.d=h,p.roadY=e.y,p.onRoad=!0,p.onSurface=!0,p.rampIndex=-1,p.rampH=0,p.bank=0;let S=Md(m-y,f);if(e.lastDs=S,e.prevS=y,e.odo+=S,e.stats.topSpeed=Math.max(e.stats.topSpeed,g),e.wrongWay=0,e.stuck=0,Mp(e,t,n),b>=d.len-1e-6||b<0){e.cork=-1;let t=Math.hypot(Np.fx,Np.fz)||1;e.vx=Np.fx/t*g,e.vz=Np.fz/t*g,e.vy=0,e.stats.corks+=1,n.push({type:`corkExit`,car:e.id,value:g});return}(Np.ny<.25&&x<-.1*c.gravity||g<5)&&(e.cork=-1,e.grounded=!1,e.corkFall=.9,e.vx+=Np.nx*1.5,e.vy+=Np.ny*1.5,e.vz+=Np.nz*1.5,n.push({type:`corkFall`,car:e.id,value:g}))}function Fp(e,t,n){let r=Gf.car.gravity,i=1/Math.sqrt(1+e*e),a=Math.abs(e)*i,o=n*n*Math.abs(t);return{normal:r*i+o*a,pull:r*a-o*i,cos:i,sin:a}}function Ip(e,t){let n=Gf.car.bankGrip,r=1/Math.sqrt(1+e*e),i=Math.abs(e)*r,a=Gf.car.gravity*(i-n*r)/Math.max(1e-6,r+n*i);return a<=0?0:Math.sqrt(a/Math.max(Math.abs(t),1e-4))}function Lp(e,t,n,r,i){let a=e.loc,o=i*(n*a.tx+r*a.tz);return o<18||a.rampIndex>=0?!1:t.vcurv[a.i]*o*o<-Gf.car.gravity*1.05}function Rp(e){let t=e.loc;return t.slope*(e.vx*t.tx+e.vz*t.tz)}function zp(e,t){let n=document.createElement(`canvas`);return n.width=e,n.height=t,[n,n.getContext(`2d`)]}function Bp(t,n=!0){let r=new wi(t);return r.colorSpace=j,n&&(r.wrapS=r.wrapT=e),r.anisotropy=8,r}var Vp=99,Hp=()=>(Vp=Vp*16807%2147483647,Vp/2147483647);function Up(){let[e,t]=zp(512,1024);t.clearRect(0,0,512,1024);for(let e of[128,256,384]){let n=t.createLinearGradient(e-70,0,e+70,0);n.addColorStop(0,`rgba(22,18,18,0)`),n.addColorStop(.5,`rgba(22,18,18,0.22)`),n.addColorStop(1,`rgba(22,18,18,0)`),t.fillStyle=n,t.fillRect(e-70,0,140,1024)}for(let e=0;e<8;e+=1)t.fillStyle=e%2?`#e9e4da`:`#b8352b`,t.fillRect(0,e*128,22,128),t.fillRect(490,e*128,22,128);t.fillStyle=`rgba(0,0,0,0.25)`,t.fillRect(20,0,3,1024),t.fillRect(489,0,3,1024),t.fillStyle=`rgba(236,230,216,0.92)`,t.fillRect(28,0,7,1024),t.fillRect(477,0,7,1024),t.fillStyle=`rgba(236,230,216,0.78)`;for(let e of[171,341])for(let n=0;n<1024;n+=512)t.fillRect(e-3,n,6,260);t.globalCompositeOperation=`destination-out`;for(let e=0;e<2600;e+=1)t.fillStyle=`rgba(0,0,0,${.25+Hp()*.5})`,t.fillRect(Hp()*512,Hp()*1024,1+Hp()*2.5,1+Hp()*2.5);t.globalCompositeOperation=`source-over`;let n=Bp(e);return n.repeat.set(1,.5),n}function Wp(){let[e,t]=zp(128,256);t.fillStyle=`#1b1030`,t.fillRect(0,0,128,256);for(let e=0;e<4;e+=1){let n=e*64;t.fillStyle=e%2?`#ff8a1f`:`#ffd23f`,t.beginPath(),t.moveTo(8,n+56),t.lineTo(64,n+12),t.lineTo(120,n+56),t.lineTo(120,n+36),t.lineTo(64,n-8),t.lineTo(8,n+36),t.closePath(),t.fill()}return t.fillStyle=`rgba(126,249,255,0.95)`,t.fillRect(56,0,16,256),Bp(e)}function Gp(){let[e,t]=zp(256,128);t.fillStyle=`#1b1030`,t.fillRect(0,0,256,128),t.fillStyle=`#ffcf33`;for(let e=0;e<3;e+=1){let n=30+e*72;t.beginPath(),t.moveTo(n,14),t.lineTo(n+44,64),t.lineTo(n,114),t.lineTo(n+22,114),t.lineTo(n+66,64),t.lineTo(n+22,14),t.closePath(),t.fill()}return Bp(e,!1)}function Kp(){let[e,t]=zp(256,64);for(let e=0;e<8;e+=1)t.fillStyle=e%2?`#1b1030`:`#ffc233`,t.beginPath(),t.moveTo(e*32,0),t.lineTo(e*32+32,0),t.lineTo(e*32+16,64),t.lineTo(e*32-16,64),t.closePath(),t.fill();return Bp(e)}function qp(){let[e,t]=zp(256,64);for(let e=0;e<4;e+=1)for(let n=0;n<16;n+=1)t.fillStyle=(n+e)%2?`#111`:`#f5f5f5`,t.fillRect(n*16,e*16,16,16);return Bp(e)}function Jp(e,t=`#1b1030`,n=`#ffd23f`){let[r,i]=zp(1024,128);return i.fillStyle=t,i.fillRect(0,0,1024,128),i.fillStyle=`#ff6b35`,i.fillRect(0,0,1024,10),i.fillRect(0,118,1024,10),i.font=`800 78px Sora, system-ui, sans-serif`,i.textAlign=`center`,i.textBaseline=`middle`,i.lineWidth=10,i.strokeStyle=`#1b1030`,i.strokeText(e,512,68),i.fillStyle=n,i.fillText(e,512,68),Bp(r,!1)}function Yp(e){let[t,n]=zp(512,96);return n.fillStyle=`#1b1030`,n.fillRect(0,0,512,96),n.font=`800 64px Sora, system-ui, sans-serif`,n.textAlign=`center`,n.textBaseline=`middle`,n.fillStyle=`#fff7e8`,n.fillText(`GATE ${e}`,256,52),n.fillStyle=`#ff6b35`,n.fillRect(0,0,512,6),n.fillRect(0,90,512,6),Bp(t,!1)}function Xp(e,t){let[n,r]=zp(256,64);return r.fillStyle=`rgba(27,16,48,0.78)`,r.beginPath(),r.roundRect(4,4,248,56,28),r.fill(),r.fillStyle=t,r.beginPath(),r.arc(34,32,12,0,Math.PI*2),r.fill(),r.font=`700 30px Figtree, system-ui, sans-serif`,r.textBaseline=`middle`,r.fillStyle=`#fff7e8`,r.fillText(e.slice(0,12),56,34),Bp(n,!1)}function Zp(){let[e,t]=zp(128,128);return t.clearRect(0,0,128,128),t.strokeStyle=`#f7f1e4`,t.lineWidth=8,t.strokeRect(10,10,108,108),Bp(e,!1)}var Qp=[{name:`Sandvane GT`,blurb:`Long-tail coupe with a towering rear wing.`},{name:`Talusfin`,blurb:`Closed-cockpit prototype with a shark-fin spine.`},{name:`Gullyjack`,blurb:`Compact cup coupe with a short, punchy stance.`},{name:`Basaltback GT`,blurb:`Mid-engine GT with wide rear haunches.`},{name:`Nightmesa`,blurb:`Classic long-tail endurance prototype.`},{name:`Stingbolt`,blurb:`Five-door hot hatch with a honeycomb grille and a roof wing.`,dims:[2.02,1.412,4.445]},{name:`Scorchquill`,blurb:`Open-wheel single-seater with a cockpit halo, sculpted sidepods and a two-plane rear wing.`,dims:[2,.97,5.6]}],$p=[{name:`Sunset Crimson`,primary:`#b3121f`,secondary:`#f1ede4`,accent:`#1a1a1d`},{name:`Canyon Orange`,primary:`#e0561b`,secondary:`#1d1d20`,accent:`#f2c14e`},{name:`Turquoise Mesa`,primary:`#128a8c`,secondary:`#f3efe6`,accent:`#e0561b`},{name:`Desert Gold`,primary:`#c79a3a`,secondary:`#231f1c`,accent:`#b3121f`},{name:`Midnight`,primary:`#1d2233`,secondary:`#d9dde6`,accent:`#e8a33c`},{name:`Pearl`,primary:`#e9e6df`,secondary:`#1a3f73`,accent:`#c8102e`},{name:`Stingbolt Yellow`,primary:`#d0b200`,secondary:`#141414`,accent:`#141414`,finish:`solid`,stripe:!1},{name:`Quill Violet`,primary:`#4b2a8c`,secondary:`#efe8dc`,accent:`#ff7a1a`,finish:`solid`,stripe:!0}],em=[`wheel-front-left`,`wheel-front-right`,`wheel-rear-left`,`wheel-rear-right`],tm=null,nm=null,rm=null;function im(e,t){let n=Z.tex(`fx`);if(!n)return null;let r=n.clone();return r.repeat.set(.25,.5),r.offset.set(e*.25,t===0?.5:0),r.needsUpdate=!0,r}function am(){if(rm)return rm;let e=document.createElement(`canvas`);e.width=e.height=128;let t=e.getContext(`2d`),n=t.createRadialGradient(64,64,4,64,64,62);return n.addColorStop(0,`rgba(0,0,0,0.62)`),n.addColorStop(.55,`rgba(0,0,0,0.35)`),n.addColorStop(1,`rgba(0,0,0,0)`),t.fillStyle=n,t.fillRect(0,0,128,128),rm=new wi(e),rm}var om=()=>new qi({transparent:!0,depthWrite:!1,blending:2,uniforms:{uTime:{value:0},uColor:{value:new q(`#6ff3ff`)},uFlash:{value:0}},vertexShader:`
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
      gl_Position = projectionMatrix * mv;
    }`,fragmentShader:`
    uniform float uTime; uniform vec3 uColor; uniform float uFlash;
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main() {
      float rim = pow(1.0 - abs(dot(vN, vV)), 2.4);
      float bands = smoothstep(0.82, 1.0, sin(vP.y * 9.0 - uTime * 6.0) * 0.5 + 0.5) * 0.35;
      float hex = smoothstep(0.9, 1.0, abs(sin(vP.x * 7.0 + uTime) * sin(vP.z * 7.0 - uTime))) * 0.25;
      float a = clamp(rim * 0.9 + bands * rim + hex * rim + uFlash * 0.5, 0.0, 1.0);
      gl_FragColor = vec4(uColor * (0.6 + uFlash), a * 0.85);
    }`});function sm(e,t,n,r){let i=new Map,a=e=>{let i;switch(e.name){case`paint`:i=new Xi({color:t.primary,metalness:.45,roughness:.3,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.95});break;case`accent`:i=new Xi({color:t.secondary,metalness:.3,roughness:.35,clearcoat:.8,clearcoatRoughness:.12,envMapIntensity:.85});break;case`glass`:i=new Xi({color:`#141c24`,metalness:.1,roughness:.04,clearcoat:1,envMapIntensity:1.1,transparent:!0,opacity:.86});break;case`white`:i=new Yi({color:`#efebe2`,roughness:.4,metalness:0,emissive:`#fff3d6`,emissiveIntensity:.18,envMapIntensity:.6});break;case`alloy`:i=new Yi({color:`#c3c6ca`,metalness:.85,roughness:.28,envMapIntensity:.9});break;case`steel`:i=new Yi({color:`#6c7075`,metalness:.7,roughness:.45,envMapIntensity:.6});break;case`rubber`:i=new Yi({color:`#141414`,metalness:0,roughness:.94,envMapIntensity:.2});break;default:i=new Yi({color:e.color?.getStyle?.()??`#111`,metalness:.1,roughness:.7,envMapIntensity:.4})}return i.name=e.name,n&&(i.transparent=!0,i.opacity=.38,i.depthWrite=!1),r.push(i),i};e.traverse(e=>{let t=e;if(!t.isMesh)return;let r=t.material,o=i.get(r);o||(o=a(r),i.set(r,o)),t.material=o,t.castShadow=!n,t.receiveShadow=!n})}var cm=4.6;function lm(e,t,n,r){let i=new Xi({map:e.map,normalMap:e.normalMap,roughnessMap:e.roughnessMap,metalnessMap:e.metalnessMap,roughness:1,metalness:1,clearcoat:.55,clearcoatRoughness:.18,envMapIntensity:.7});e.normalMap&&i.normalScale.copy(e.normalScale);let a={uPrimary:{value:new q(t.primary)},uSecondary:{value:new q(t.secondary)},uAccent:{value:new q(t.accent)},uScorch:r,uStripe:{value:t.stripe===!1?0:1},uPattern:{value:t.pattern===`split`?1:t.pattern===`stripe`?2:t.pattern===`sunset`?3:0},uPaintMetal:{value:t.finish===`chrome`?.92:t.finish===`matte`?.04:t.finish===`solid`?0:t.finish===`pearl`?.55:.35},uPaintRough:{value:t.finish===`chrome`?.12:t.finish===`matte`?.72:t.finish===`solid`?.26:t.finish===`pearl`?.22:.32}};return i.onBeforeCompile=e=>{Object.assign(e.uniforms,a),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vObj;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vObj = position;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vObj;
uniform vec3 uPrimary; uniform vec3 uSecondary; uniform vec3 uAccent; uniform float uScorch; uniform float uStripe; uniform float uPattern; uniform float uPaintMetal; uniform float uPaintRough;
float paintMask; float scorchK;`).replace(`#include <map_fragment>`,`#include <map_fragment>
  {
    vec3 c = diffuseColor.rgb;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    paintMask = smoothstep(0.34, 0.6, lum) * (1.0 - smoothstep(0.1, 0.22, sat));
    float stripe = (1.0 - smoothstep(0.018, 0.024, abs(abs(vObj.z) - 0.045))) * step(0.02, vObj.y) * uStripe;
    float split = step(0.0, vObj.x) * 0.78;
    float sunset = smoothstep(-0.45, 0.45, vObj.z);
    float isSplit = 1.0 - step(0.5, abs(uPattern - 1.0));
    float isStripe = 1.0 - step(0.5, abs(uPattern - 2.0));
    float isSunset = 1.0 - step(0.5, abs(uPattern - 3.0));
    vec3 paint = uPrimary;
    paint = mix(paint, uSecondary, isSplit * split);
    paint = mix(paint, uSecondary, isStripe * stripe);
    paint = mix(paint, uAccent, isSunset * sunset * 0.65);
    paint *= clamp(lum * 1.25, 0.0, 1.2);
    diffuseColor.rgb = mix(c, paint, paintMask);
    // Damage scorch: patchy soot that spreads as the car takes damage (burnt shell when wrecked).
    float n = fract(sin(dot(floor(vObj * 22.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float n2 = fract(sin(dot(floor(vObj * 7.0), vec3(39.34, 11.13, 83.17))) * 24634.6345);
    scorchK = smoothstep(0.0, 0.35, uScorch * 1.5 - (n * 0.45 + n2 * 0.55));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.04, 0.036) * (0.7 + 0.6 * n), scorchK);
  }`).replace(`#include <metalnessmap_fragment>`,`#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, uPaintMetal, paintMask);`).replace(`#include <roughnessmap_fragment>`,`#include <roughnessmap_fragment>
roughnessFactor = mix(mix(roughnessFactor, uPaintRough, paintMask), 0.92, scorchK);`)},i.customProgramCacheKey=()=>`livery-paint`,n&&(i.transparent=!0,i.opacity=.38,i.depthWrite=!1),i}function um(e,t,n,r,i,a){let o=e.clone(!0);o.traverse(e=>{let a=e;if(!a.isMesh)return;let o=lm(a.material,t,n,i);r.push(o),a.material=o,a.castShadow=!n,a.receiveShadow=!n});let s=new K;o.rotation.y=-Math.PI/2,s.add(o),s.updateMatrixWorld(!0);let c=new rn().setFromObject(s),l=c.getSize(new H),u=(a?.[2]??cm)/Math.max(.001,l.z);return a?o.scale.set(u,a[1]/Math.max(.001,l.y),a[0]/Math.max(.001,l.x)):o.scale.setScalar(u),s.updateMatrixWorld(!0),c=new rn().setFromObject(s),o.position.set(-(c.min.x+c.max.x)/2,-c.min.y,-(c.min.z+c.max.z)/2),s.updateMatrixWorld(!0),c=new rn().setFromObject(s),{body:s,wheels:[],front:[],size:c.getSize(new H),min:c.min.clone(),max:c.max.clone(),wheelR:.34}}function dm(e){let t=!1;return e.traverse(e=>{let n=e.material;n&&n.name?.startsWith(`tripo`)&&(t=!0)}),t}function fm(e,t,n,r,i,a){if(dm(e))return um(e,t,n,r,i,a);let o=e.clone(!0);sm(o,t,n,r),o.updateMatrixWorld(!0);let s=new rn().setFromObject(o),c=[],l=[],u=.34;for(let e of em){let t=o.getObjectByName(e);if(!t||!t.parent)continue;let n=new K;n.position.copy(t.position),t.parent.add(n),t.position.set(0,0,0),n.add(t),c.push(t),e.includes(`front`)&&l.push(n),u=Math.max(.2,n.position.y)}return{body:o,wheels:c,front:l,size:s.getSize(new H),min:s.min.clone(),max:s.max.clone(),wheelR:u}}function pm(e,t,n){let r=new Xi({color:e.primary,roughness:.35,metalness:.4,clearcoat:1,transparent:t,opacity:t?.38:1});n.push(r);let i=new K,a=new J(new ki(.75,3,6,12),r);return a.rotation.x=Math.PI/2,a.scale.set(1.25,1,.55),a.position.y=.62,i.add(a),{body:i,wheels:[],front:[],size:new H(2,1.2,4.6),min:new H(-1,0,-2.3),max:new H(1,1.2,2.3),wheelR:.34}}var mm=class e{chassis;livery;ghost;root=new K;tilt=new K;trickGroup=new K;body=new K;flames=[];shield;tag;exhausts=[new H(-.4,.45,-2.3),new H(.4,.45,-2.3)];rearWheels=[new H(-.85,.1,-1.4),new H(.85,.1,-1.4)];wheelR=.34;length=4.6;rig;wheelAngle=0;owned=[];brakeMat;headMat;flameMats=[];lights=new K;customParts=new K;customOwned=[];customLook;blob;disposed=!1;shieldFlash=0;lastV=0;brakeHold=0;scorch={value:0};constructor(e,t,n=!1,r=``,i){this.chassis=e,this.livery=t,this.ghost=n;let a=i??$p[t]??$p[0];this.customLook=a;let o=`car:${Zu[e]??Zu[0]}`,s=Z.models.get(o);this.rig=s?fm(s.scene,a,n,this.owned,this.scorch,Qp[e]?.dims):pm(a,n,this.owned),this.body.add(this.rig.body),this.body.add(this.customParts),this.brakeMat=new qn({color:`#ff2a1a`,blending:2,depthWrite:!1,transparent:!0,opacity:.5,toneMapped:!1}),this.headMat=new qn({color:`#fff1cf`,blending:2,depthWrite:!1,transparent:!0,opacity:.32,toneMapped:!1}),this.body.add(this.lights);let c=new mr({map:am(),transparent:!0,depthWrite:!1,opacity:n?.25:1});this.owned.push(c),this.blob=new J(new Ii(1,1),c),this.blob.rotation.x=-Math.PI/2,this.blob.position.y=.04,this.blob.renderOrder=1,this.tilt.add(this.blob);let l=om();this.owned.push(l),this.shield=new J(new Li(1,32,16),l),this.shield.visible=!1,this.body.add(this.shield);let u=Xp(r||Qp[e]?.name||`Racer`,a.primary);this.tag=new sr(new qn({map:u,depthTest:!1,transparent:!0,opacity:n?.7:.95})),this.tag.scale.set(2.3,.575,1),this.tag.position.set(0,3.4,0),this.tag.renderOrder=20,this.root.add(this.tag),this.trickGroup.add(this.body),this.tilt.add(this.trickGroup),this.root.add(this.tilt),this.layout(),s||Z.whenSettled(o).then(()=>{let t=Z.models.get(o);t&&!this.disposed&&(this.body.remove(this.rig.body),this.rig=fm(t.scene,a,n,this.owned,this.scorch,Qp[e]?.dims),this.body.add(this.rig.body),this.layout())}),Z.has(`fx`)||Z.whenSettled(`fx`).then(()=>!this.disposed&&this.layout())}layout(){let{min:e,max:t,size:n,wheelR:r}=this.rig;this.wheelR=r,this.length=n.z;let i=n.x/2,a=Math.min(.42,n.y*.3);this.exhausts=[new H(-.42,a,e.z+.05),new H(.42,a,e.z+.05)];let o=this.rig.wheels.map(e=>e.parent).filter(e=>!this.rig.front.includes(e)),s=o.length?o[0].position.z:-1.4;this.rearWheels=[new H(-i+.3,.08,s),new H(i-.3,.08,s)],this.blob.scale.set(n.x*1.35,n.z*1.18,1),this.shield.scale.set(i*1.55,n.y*1.05,n.z*.66),this.shield.position.set(0,n.y*.5,(e.z+t.z)/2),this.rebuildCustomParts(),this.lights.clear(),tm??=im(0,1),nm??=im(2,0),tm&&(this.brakeMat.map=tm,this.headMat.map=tm,this.brakeMat.needsUpdate=this.headMat.needsUpdate=!0);for(let t of[-1,1]){let r=new sr(this.brakeMat);r.position.set(t*(i-.32),Math.min(.78,n.y*.55),e.z+.05),r.scale.setScalar(.34),this.lights.add(r)}for(let e of this.flames)e.parent?.remove(e);this.flames.length=0;for(let e of this.flameMats)e.dispose();this.flameMats.length=0;let c=new Ii(.55,1.8);c.rotateX(-Math.PI/2),c.translate(0,0,-.9);for(let e of this.exhausts){let t=new mr({map:nm,color:`#ffffff`,transparent:!0,blending:2,depthWrite:!1,side:2,toneMapped:!1,opacity:nm?1:.8});this.flameMats.push(t);let n=new K,r=new J(c,t),i=new J(c,t);i.rotation.z=Math.PI/2,n.add(r,i),n.position.copy(e),n.visible=!1,this.body.add(n),this.flames.push(n)}}rebuildCustomParts(){for(let e of[...this.customParts.children])e.traverse(e=>{e.geometry?.dispose?.()}),this.customParts.remove(e);for(let e of this.customOwned)e.dispose();this.customOwned.length=0;let e=this.customLook;if(!e.bodyKit&&!e.hood&&!e.spoiler)return;let{size:t,min:n,max:r}=this.rig,i=(e,t=.35,n=.3)=>{let r=new Yi({color:e,metalness:t,roughness:n,transparent:this.ghost,opacity:this.ghost?.42:1});return this.customOwned.push(r),r},a=(e,t,n,r,a,o,s,c=.35)=>{let l=new J(new Oi(e,t,n),i(s,c));l.position.set(r,a,o),l.castShadow=!this.ghost,l.receiveShadow=!this.ghost,this.customParts.add(l)},o=e.accent,s=e.secondary,c=r.z-.18,l=n.z+.22,u=(n.z+r.z)/2,d=e.bodyKit??`stock`;if(d===`wide`||d===`street`){let e=d===`wide`?.18:.1;a(e,.18,t.z*.55,-(t.x/2+e*.35),.28,u,o),a(e,.18,t.z*.55,t.x/2+e*.35,.28,u,o),d===`street`&&a(t.x*.72,.08,.3,0,.22,c,s,.55)}else d===`retro`&&(a(t.x*.88,.13,.24,0,.3,c,s,.6),a(t.x*.9,.12,.2,0,.28,l,o,.55));if(e.hood===`vented`||e.hood===`carbon`){let n=e.hood===`carbon`?`#17171b`:o;a(.16,.055,.48,-t.x*.18,t.y*.63,c-.42,n,.55),a(.16,.055,.48,t.x*.18,t.y*.63,c-.42,n,.55)}let f=e.spoiler??`none`;if(f!==`none`){let e=f===`gt`?t.x*.96:f===`drift`?t.x*.82:t.x*.68,n=t.y*(f===`gt`?.92:f===`drift`?.78:.7),r=l+(f===`ducktail`?.08:0);a(e,.08,f===`gt`?.34:.2,0,n,r,s,.5),f!==`ducktail`&&(a(.07,n-t.y*.52,.07,-e*.33,(n+t.y*.52)/2,r,o,.45),a(.07,n-t.y*.52,.07,e*.33,(n+t.y*.52)/2,r,o,.45))}let p=e.wheels??`street`,m=i(p===`dirt`?`#8b5a35`:p===`beadlock`?`#d48a43`:p===`neon`?o:p===`grip`?`#aeb8c2`:`#e1e4e8`,p===`neon`?.25:.8,p===`dirt`?.68:.24);p===`neon`&&m.emissive.set(o).multiplyScalar(.75);let h=this.rig.wheels.length?this.rig.wheels.map(e=>e.parent?.position.clone()??new H):[-1,1].flatMap(e=>[-1,1].map(n=>new H(e*(t.x*.43),Math.max(.22,t.y*.27),n<0?l+.16:c-.62)));for(let e of h){let t=new J(new Ri(Math.max(.16,this.rig.wheelR*.55),p===`beadlock`?.075:.05,8,16),m);t.rotation.y=Math.PI/2,t.position.copy(e),t.castShadow=!this.ghost,this.customParts.add(t)}}yaw=0;pose(e,t,n,r,i,a,o,s,c){this.root.position.set(e,t,n),this.root.rotation.set(0,r,0),this.yaw=r;let l=i?i.vF:0;this.wheelAngle+=l*a/this.wheelR;for(let e of this.rig.wheels)e.rotation.x=this.wheelAngle;let u=i?i.steerVis:0;for(let e of this.rig.front)e.rotation.y=-u*.42;if(!i){this.tilt.rotation.set(s,0,c);for(let e of this.flames)e.visible&&e.scale.set(1,1,.85+Math.sin(o*55+e.position.x*9)*.2);return}let d=i.drift?i.driftDir*.07:0,f=i.grounded?-u*Math.min(1,Math.abs(l)/40)*.045:0;this.tilt.rotation.set(s,i.drift?-i.driftDir*.28:0,c+d+f);let p=i.trick===0?0:Math.min(1,i.trickT/sp),m=p*p*(3-2*p),h=i.wreck>0?1:Math.min(.8,Math.max(0,(i.damage-.18)/.82));if(this.scorch.value+=(h-this.scorch.value)*Math.min(1,a*6),i.wreck>0){let e=1-i.wreck/pp,t=Math.min(1,e/.38);this.trickGroup.rotation.set(Math.sin(t*Math.PI)*.5,t*1.3,t*Math.PI),this.trickGroup.position.y=Math.sin(t*Math.PI)*2.6+(t>=1?this.rig.size.y*.92:t*this.rig.size.y*.92)}else this.trickGroup.rotation.set(i.trick===1?-Math.PI*2*m:0,i.spin>0?i.spin*14:0,i.trick===2?Math.PI*2*m:i.trick===3?-Math.PI*2*m:0),this.trickGroup.position.y=i.trick===0?0:Math.sin(m*Math.PI)*.8;this.body.position.y=-i.landImpact*.16,this.blob.visible=i.grounded||this.trickGroup.position.y<2,this.blob.material.opacity=(this.ghost?.25:1)*(i.grounded?1:.45);let g=i.boostTime>0||i.meterBoosting,_=i.meterBoosting;for(let e=0;e<this.flames.length;e+=1){let t=this.flames[e];if(t.visible=g&&i.wreck<=0,g){let n=.85+Math.sin(o*61+e*2.1)*.12+Math.sin(o*37+e)*.08,r=i.nitro>0?Math.min(1,i.nitro/.3)*(1+.8*Math.max(0,(i.nitro-1.05)/.35)):0,a=_?1.2+r*.25:1;t.scale.set(a*1.15,a*1.15,n*(_?2.2+r*1.6:1.1));let s=this.flameMats[e];if(s){s.color.set(_?r>1.2?`#dcebff`:`#6f9cff`:`#ffffff`);let e=_&&tm?tm:nm;e&&s.map!==e&&(s.map=e,s.needsUpdate=!0)}}}let v=a>0?(this.lastV-i.vF)/a:0;this.lastV=i.vF,this.brakeHold=v>7&&i.vF>2?.25:Math.max(0,this.brakeHold-a);let y=this.brakeHold>0;if(this.brakeMat.opacity=y?.9:0,this.lights.visible=y,this.shield.visible=i.shield>0,this.shield.visible){let e=this.shield.material.uniforms;e.uTime.value=o,this.shieldFlash=Math.max(0,this.shieldFlash-a*2.5),e.uFlash.value=this.shieldFlash}let b=i.ghostT>0&&(i.hold>0?o*3%1<.22:Math.floor(o*12)%2==0);this.body.visible=!b||this.ghost}orient(t,n,r,i,a,o){let s=e.tf.set(t,n,r).normalize(),c=e.tn.set(i,a,o).normalize(),l=e.tx.crossVectors(c,s).normalize();e.tm.makeBasis(l,c,s),this.root.quaternion.setFromRotationMatrix(e.tm),this.tilt.rotation.set(0,this.tilt.rotation.y,0)}static tf=new H;static tn=new H;static tx=new H;static tm=new G;flashShield(){this.shieldFlash=1}dispose(){this.disposed=!0,this.shield.geometry.dispose(),this.blob.geometry.dispose();for(let e of this.owned)e.dispose();for(let e of this.customOwned)e.dispose();for(let e of this.flameMats)e.map?.dispose(),e.dispose();this.brakeMat.dispose(),this.headMat.dispose(),this.tag.material.map?.dispose(),this.tag.material.dispose()}},hm=new Map;function gm(e){return`prop:${e}`}function _m(e,t,n=!0){let r=`${e}:${t}`,i=hm.get(r);if(i)return i;let a=Z.models.get(gm(e));if(!a)return null;let o=null;if(a.scene.traverse(e=>{!o&&e.isMesh&&(o=e)}),!o)return null;let s=o;s.updateWorldMatrix(!0,!1);let c=ym(s.geometry);c.applyMatrix4(s.matrixWorld),c.attributes.normal||c.computeVertexNormals(),t===`length`&&c.rotateY(-Math.PI/2),c.computeBoundingBox();let l=c.boundingBox,u=l.getSize(new H),d=l.getCenter(new H);if(t===`radius`){c.translate(-d.x,-d.y,-d.z);let e=2/Math.max(u.x,u.y,u.z);c.scale(e,e,e)}else if(t===`base`){c.translate(-d.x,-l.min.y,-d.z);let e=1/u.y;c.scale(e,e,e)}else{c.translate(-d.x,-d.y,-d.z);let e=1/u.z;c.scale(e,e,e)}c.computeBoundingBox(),c.computeBoundingSphere();let f=s.material,p=new Yi({map:f.map,normalMap:f.normalMap,roughnessMap:f.roughnessMap,metalnessMap:n?null:f.metalnessMap,metalness:+!n,roughness:1});f.normalMap&&p.normalScale.copy(f.normalScale),p.envMapIntensity=n?.3:.6;let m={geometry:c,material:p,size:c.boundingBox.getSize(new H)};return hm.set(r,m),m}function vm(e,t){Z.has(gm(e))?t():Z.whenSettled(gm(e)).then(()=>{Z.has(gm(e))&&t()})}function ym(e){let t=new Ln;for(let[n,r]of Object.entries(e.attributes)){let e=r,i=new Float32Array(e.count*e.itemSize);for(let t=0;t<e.count;t+=1)i[t*e.itemSize]=e.getX(t),e.itemSize>1&&(i[t*e.itemSize+1]=e.getY(t)),e.itemSize>2&&(i[t*e.itemSize+2]=e.getZ(t)),e.itemSize>3&&(i[t*e.itemSize+3]=e.getW(t));t.setAttribute(n,new Sn(i,e.itemSize))}return e.index&&t.setIndex(e.index.clone()),t}var bm={diff:xm(255,255,255,!0),nor:xm(128,128,255,!1),arm:xm(255,200,0,!1)};function xm(e,t,n,r){let i=new zr(new Uint8Array([e,t,n,255]),1,1);return i.colorSpace=r?j:``,i.needsUpdate=!0,i}var Sm={cliff:`#a4745a`,sand:`#c99a6c`,asphalt:`#5d5a58`,sandstone:`#b0603f`,rocks:`#9d8069`};function Cm(e,t,n,r){let i=()=>{let i=Z.tex(`${n}_diff`),a=Z.tex(`${n}_nor`),o=Z.tex(`${n}_arm`);i&&(e[`${t}Diff`].value=i),a&&(e[`${t}Nor`].value=a),o&&(e[`${t}Arm`].value=o),i&&r()};i(),Z.has(`${n}_diff`)||Promise.all([Z.whenSettled(`${n}_diff`),Z.whenSettled(`${n}_nor`),Z.whenSettled(`${n}_arm`)]).then(i)}var wm=`
uniform sampler2D tDiff; uniform sampler2D tNor; uniform sampler2D tArm;
uniform sampler2D tTopDiff; uniform sampler2D tTopNor;
uniform float uScale; uniform float uNormalScale; uniform float uTint; uniform float uBright;
uniform float uTopAmount; uniform float uLoaded; uniform float uGray; uniform float uStreaks;
varying vec3 vTriPos; varying vec3 vTriNrm;
vec3 triWeights(vec3 n) { vec3 w = pow(abs(n), vec3(5.0)); return w / (w.x + w.y + w.z + 1e-5); }
vec4 triSample(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}
vec3 triNormal(sampler2D t, vec3 p, vec3 n, vec3 w, float strength) {
  vec3 nx = texture2D(t, p.zy).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(t, p.xz).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(t, p.xy).xyz * 2.0 - 1.0;
  nx.xy *= strength; ny.xy *= strength; nz.xy *= strength;
  nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
  ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
  nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
  return normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
}
`;function Tm(e){let t=new Yi({color:e.color??`#ffffff`,roughness:e.roughness??1,metalness:0,side:e.side??0,vertexColors:e.vertexColors??!1,map:e.overlay??null});t.envMapIntensity=e.envIntensity??.25;let n={tDiff:{value:bm.diff},tNor:{value:bm.nor},tArm:{value:bm.arm},tTopDiff:{value:bm.diff},tTopNor:{value:bm.nor},uScale:{value:e.scale},uNormalScale:{value:e.normalScale??1},uTint:{value:e.tint??0},uBright:{value:e.bright??1},uTopAmount:{value:e.top?e.topAmount??.6:0},uLoaded:{value:0},uGray:{value:e.gray??0},uStreaks:{value:e.streaks??0},uPlaceholder:{value:new q(Sm[e.set])}};if(Cm(n,`t`,e.set,()=>{n.uLoaded.value=1}),e.top){let t=e.top,r=()=>{let e=Z.tex(`${t}_diff`),r=Z.tex(`${t}_nor`);e&&(n.tTopDiff.value=e),r&&(n.tTopNor.value=r)};r(),Z.whenSettled(`${t}_diff`).then(r)}let r=!!e.planar,i=!!e.overlay;return t.onBeforeCompile=e=>{Object.assign(e.uniforms,n),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vTriPos;
varying vec3 vTriNrm;`).replace(`#include <worldpos_vertex>`,`#include <worldpos_vertex>
  {
    vec4 triWp = vec4(transformed, 1.0);
    vec3 triN = objectNormal;
    #ifdef USE_INSTANCING
      triWp = instanceMatrix * triWp;
      triN = mat3(instanceMatrix) * triN;
    #endif
    triWp = modelMatrix * triWp;
    vTriPos = triWp.xyz;
    vTriNrm = normalize(mat3(modelMatrix) * triN);
  }`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\n${wm}\nuniform vec3 uPlaceholder;`).replace(`#include <map_fragment>`,r?`
  vec3 tn = normalize(vTriNrm);
  vec2 tp = vTriPos.xz * uScale;
  vec3 texA = texture2D(tDiff, tp).rgb;
  vec3 texB = texture2D(tDiff, tp * 0.173 + 0.31).rgb;
  vec4 triArm = texture2D(tArm, tp);
  float macro = 0.82 + 0.36 * texture2D(tDiff, vTriPos.xz * uScale * 0.031).g;
  vec3 albedo = mix(texA, texA * (0.7 + 0.6 * texB), 0.5) * macro * mix(1.0, triArm.r, 0.5);
  albedo = mix(uPlaceholder, albedo, uLoaded) * uBright;
  ${i?`vec4 paint = texture2D(map, vMapUv); albedo = mix(albedo, paint.rgb, paint.a);`:``}
  diffuseColor.rgb *= albedo;
`:`
  vec3 tn = normalize(vTriNrm);
  vec3 tw = triWeights(tn);
  vec3 tp = vTriPos * uScale;
  vec3 texA = triSample(tDiff, tp, tw).rgb;
  vec3 texB = triSample(tDiff, tp * 0.21 + 0.37, tw).rgb;
  vec4 triArm = triSample(tArm, tp, tw);
  vec3 albedo = mix(texA, texB, 0.4) * mix(1.0, triArm.r, 0.55);
  float lumA = dot(albedo, vec3(0.299, 0.587, 0.114));
  albedo = mix(albedo, vec3(clamp(lumA * 2.3, 0.0, 1.35)), uGray * uLoaded);
  // Desert-varnish streaks running down steep faces.
  float steep = 1.0 - smoothstep(0.35, 0.75, abs(tn.y));
  vec2 sp = vec2((tn.x * tn.x > tn.z * tn.z ? vTriPos.z : vTriPos.x) * 0.045, vTriPos.y * 0.004);
  float streak = texture2D(tDiff, sp).g;
  albedo *= mix(1.0, 0.62 + 0.62 * streak, steep * uStreaks * uLoaded);
  float topMask = smoothstep(0.62, 0.86, tn.y + (texA.r - 0.5) * 0.35) * uTopAmount;
  vec3 topCol = texture2D(tTopDiff, vTriPos.xz * uScale * 1.7).rgb;
  albedo = mix(albedo, topCol, topMask);
  albedo = mix(uPlaceholder, albedo, uLoaded) * uBright;
  ${i?`vec4 paint = texture2D(map, vMapUv); albedo = mix(albedo, paint.rgb, paint.a);`:``}
  diffuseColor.rgb *= albedo;
`).replace(`#include <color_fragment>`,`
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  diffuseColor.rgb *= mix(vec3(1.0), vColor.rgb, uTint);
#endif`).replace(`#include <roughnessmap_fragment>`,`float roughnessFactor = roughness * mix(1.0, triArm.g, uLoaded);`).replace(`#include <normal_fragment_maps>`,r?`
  {
    vec3 nm = texture2D(tNor, tp).xyz * 2.0 - 1.0;
    vec3 wn = normalize(tn + vec3(nm.x, 0.0, -nm.y) * uNormalScale * uLoaded);
    normal = normalize((viewMatrix * vec4(wn * faceDirection, 0.0)).xyz);
  }`:`
  {
    vec3 wn = triNormal(tNor, tp, tn, tw, uNormalScale * uLoaded);
    vec3 topN = texture2D(tTopNor, vTriPos.xz * uScale * 1.7).xyz * 2.0 - 1.0;
    wn = normalize(mix(wn, normalize(tn + vec3(topN.x, 0.0, -topN.y) * 0.6), topMask));
    normal = normalize((viewMatrix * vec4(wn * faceDirection, 0.0)).xyz);
  }`)},t.customProgramCacheKey=()=>`surf-${r?`p`:`t`}-${i?`o`:``}`,t}var Em=`#e8a37f`,Dm=.105;function Om(e){let t=Math.atan2(e.x,e.z)/(Math.PI*2),n={tSky:{value:bm.diff},uLoaded:{value:0},uOffset:{value:.3125-t},uHaze:{value:new q(Em)}},r=()=>{let e=Z.tex(`sky`);e&&(n.tSky.value=e,n.uLoaded.value=1)};r(),Z.whenSettled(`sky`).then(r);let i=new qi({uniforms:n,side:1,depthWrite:!1,fog:!1,vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,fragmentShader:`
      uniform sampler2D tSky; uniform float uLoaded; uniform float uOffset; uniform vec3 uHaze;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float elev = asin(clamp(d.y, -1.0, 1.0));
        float u = fract(atan(d.x, d.z) / 6.2831853 + uOffset);
        float v = elev >= 0.0 ? ${Dm} + (1.0 - ${Dm}) * pow(elev / 1.5707963, 0.92) : ${Dm} * (1.0 + elev / 0.1);
        vec3 col = texture2D(tSky, vec2(u, clamp(v, 0.004, 0.996))).rgb;
        float below = smoothstep(0.02, -0.05, elev);
        col = mix(col, uHaze, below);
        vec3 grad = mix(uHaze, vec3(0.30, 0.52, 0.86), smoothstep(0.0, 0.9, elev));
        gl_FragColor = vec4(mix(grad, col, uLoaded), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}),a=new J(new Li(4e3,48,24),i);return a.frustumCulled=!1,a.renderOrder=-10,a.onBeforeRender=(e,t,n)=>a.position.copy(n.position),a}function km(e,t){let n=new Ht,r=Om(t);r.onBeforeRender=()=>{},n.add(r);let i=new J(new Ai(3e3,32),new mr({color:`#a8734c`}));i.rotation.x=-Math.PI/2,i.position.y=-40,n.add(i);let a=new Yo(e),o=a.fromScene(n,.02,1,5e3);return a.dispose(),r.geometry.dispose(),r.material.dispose(),i.geometry.dispose(),i.material.dispose(),o.texture}var Am=[0,.8,2.4,4.8,8.5,13.5,20,29,40,54,72],jm=72,Mm=new H(-.62,.5,.6).normalize(),Nm=[`#a8401f`,`#c25a2a`,`#d9773c`,`#9a3a1c`,`#e39a5c`,`#8e3319`,`#cc6a34`,`#e8b27a`].map(e=>new q(e)),Pm=new q(`#d9965a`),Fm=new q(`#b87440`),Im=class{scene=new Ht;sun;track;gorges=[];buttes=[];ext;wallH;nearestCache={i:0,side:1,x:0};gateGroups=[];gateMat;gateHi;curtain;padTex;boxes=[];disposables=[];highlighted=-1;disposed=!1;constructor(e,t,n){this.track=e;let r=e.n;this.ext=new Float64Array(r*2),this.wallH=new Float64Array(r);for(let t=0;t<r;t+=1)this.wallH[t]=30+34*(.5+.5*Id(t*e.ds/210,3.7,e.spec.seed));this.scene.background=new q(Em),this.scene.fog=new Vt(Em,420,2600),this.scene.add(Om(Mm));let i=new Fa(`#b9cdea`,`#8a4a26`,.72);this.scene.add(i),this.sun=new eo(`#ffcf9a`,3.4),this.sun.position.copy(Mm).multiplyScalar(300),this.sun.castShadow=n,this.sun.shadow.mapSize.set(t,t);let a=this.sun.shadow.camera;a.left=-70,a.right=70,a.top=70,a.bottom=-70,a.near=10,a.far=700,this.sun.shadow.bias=-4e-4,this.sun.shadow.normalBias=.6,this.scene.add(this.sun,this.sun.target),this.findGorges(),this.placeButtes(),this.computeExtents(),this.scene.add(this.road()),this.scene.add(this.shoulders()),this.scene.add(this.barriers()),this.scene.add(this.ribbons()),this.scene.add(this.terrain()),this.scene.add(this.bridges()),this.scene.add(this.rivers()),this.gateMat=new Yi({color:`#34373e`,roughness:.55,metalness:.35,envMapIntensity:.3}),this.gateHi=new Yi({color:`#8ff1f7`,emissive:`#1fb8c6`,emissiveIntensity:.6,roughness:.6}),this.scene.add(this.gates());let o=new mr({color:`#7ef9ff`,transparent:!0,opacity:.12,side:2,depthWrite:!1,blending:2});this.curtain=new J(new Ii(1,1),o),this.curtain.renderOrder=5,this.scene.add(this.curtain),this.padTex=Wp(),this.scene.add(this.pads()),this.scene.add(this.ramps()),this.scene.add(this.corkscrews()),this.scene.add(this.startLine()),this.scene.add(this.itemBoxes()),this.scene.add(this.signs()),this.scene.add(this.props()),this.dressing(),this.setHighlight(0)}setHighlight(e){if(e===this.highlighted)return;if(this.highlighted>=0)for(let e of this.gateParts(this.highlighted))e.material=this.gateMat;if(this.highlighted=e,e<0){this.curtain.visible=!1;return}for(let t of this.gateParts(e))t.material=this.gateHi;let t=this.gateGroups[e];this.curtain.visible=!0,this.curtain.position.copy(t.position).add(new H(0,4.2,0)),this.curtain.rotation.set(0,t.rotation.y,0),this.curtain.scale.set(t.userData.width,8.4,1)}gateParts(e){return this.gateGroups[e]?.userData.parts??[]}focus(e,t,n){this.sun.target.position.set(e,t,n),this.sun.position.set(e+Mm.x*300,t+Mm.y*300,n+Mm.z*300),this.sun.target.updateMatrixWorld()}update(e,t){this.padTex.offset.y=-e*1.6;let n=1+Math.sin(e*6)*.35;this.gateHi.emissiveIntensity=.5*n,this.curtain.material.opacity=.09+Math.sin(e*4)*.04;for(let n=0;n<this.boxes.length;n+=1){let r=this.boxes[n],i=t?.boxes[n],a=t&&(!i||i.respawn>0)?.001:1,o=kd(r.scale.x,a,.2);r.scale.setScalar(o),r.visible=o>.02,r.rotation.y=e*1.4+n,r.position.y=r.userData.baseY+Math.sin(e*2.2+n)*.25}if(!t)for(let e of this.boxes)e.visible=!0}dispose(){this.disposed=!0,this.scene.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose();let n=t.material;Array.isArray(n)?n.forEach(e=>e.dispose()):n?.dispose()});for(let e of this.disposables)e.dispose()}natural(e,t){let n=this.track.spec.seed,r=2+6*Ld(e/280,t/280,3,n)+1.4*Id(e/45,t/45,n+9);for(let i of this.buttes){let a=Math.hypot(e-i.x,t-i.z);if(a>i.r+40)continue;let o=Ad(i.r+36,i.r+4,a)*.35+Ad(i.r+6,i.r-6,a)*.65,s=i.h+3*Id(e/30,t/30,n+3);r=Math.max(r,kd(r,s,o))}for(let i of this.gorges){let a=(e-i.cx)*i.dx+(t-i.cz)*i.dz,o=Math.abs((e-i.cx)*i.nx+(t-i.cz)*i.nz),s=Math.max(0,Math.abs(a)-i.ext)*.5,c=i.floor+Math.max(0,o-24)*1.45+s+2*Id(e/20,t/20,n+5);r=Math.min(r,c)}return r}edgeY(e,t){let n=this.track;return n.y[e]+n.bank[e]*t*(n.halfW[e]+3)}canyonW(e){return this.track.canyon[e]*(1-this.track.bridge[e])}ribbonHeight(e,t,n,r,i,a=-1){let o=this.edgeY(e,t),s=this.canyonW(e),c=this.wallH[e]*(1-Math.exp(-n/8.5)),l=kd(-.7,this.natural(r,i)-o,Ad(2,54,n)**.85),u=a>0?(Fd(e,a,t,this.track.spec.seed)-.5)*3.4*Math.min(1,n/4)*s:0;return o+s*c+(1-s)*l+u}nearest(e,t){let n=this.track,r=0,i=1/0;for(let a=0;a<n.n;a+=6){let o=(e-n.x[a])**2+(t-n.z[a])**2;o<i&&(i=o,r=a)}for(let a=-7;a<=7;a+=1){let o=$(r+a,n.n),s=(e-n.x[o])**2+(t-n.z[o])**2;s<i&&(i=s,r=o)}let a=(e-n.x[r])*n.rx[r]+(t-n.z[r])*n.rz[r];return this.nearestCache.i=r,this.nearestCache.side=a>=0?1:-1,this.nearestCache.x=Math.sqrt(i)-n.barrierAt(r),this.nearestCache}terrainAt(e,t){let n=this.track,{i:r,side:i,x:a}=this.nearest(e,t),o=this.natural(e,t);if(a<24){let i=(e-n.x[r])*n.rx[r]+(t-n.z[r])*n.rz[r],a=n.halfW[r]+3;return Math.min(o,n.y[r]+n.bank[r]*Q(i,-a,a)-3,n.y[r]-Math.abs(n.bank[r])*a*.35-3)}let s=this.ext[r*2+ +(i>0)],c=this.canyonW(r),l=kd(o,this.edgeY(r,i)+this.wallH[r]+3*Id(e/40,t/40,11),c*(1-Ad(s+40,s+190,a)));if(a<=s){let n=this.ribbonHeight(r,i,a/s*jm,e,t);return Math.min(l,n-2.2)}return l}surfaceAt(e,t){let{i:n,side:r,x:i}=this.nearest(e,t);if(i<0)return this.track.y[n];let a=this.ext[n*2+ +(r>0)];return i<=a?this.ribbonHeight(n,r,i/a*jm,e,t):this.terrainAt(e,t)}findGorges(){let e=this.track,t=0,n=new Uint8Array(e.n);for(t=0;t<e.n;t+=1){if(n[t]||e.bridge[t]<.5)continue;let r=t;for(;e.bridge[$(r-1,e.n)]>=.5&&r>t-e.n;)--r;let i=t;for(;e.bridge[$(i+1,e.n)]>=.5&&i<t+e.n;)i+=1;for(let t=r;t<=i;t+=1)n[$(t,e.n)]=1;let a=$(Math.round((r+i)/2),e.n),o={cx:e.x[a],cz:e.z[a],dx:e.rx[a],dz:e.rz[a],nx:e.tx[a],nz:e.tz[a],ext:700,floor:Math.min(e.y[a]-60,-20)};for(let t of[1,-1])for(let n=40;n<900;n+=20){let r=o.cx+o.dx*n*t,i=o.cz+o.dz*n*t,s=!1;for(let t=0;t<e.n;t+=3)if(!(Math.min(Math.abs(t-a),e.n-Math.abs(t-a))*e.ds<120)&&(r-e.x[t])**2+(i-e.z[t])**2<9025){s=!0;break}if(s){o.ext=Math.min(o.ext,n-60);break}}o.ext=Math.max(60,o.ext),this.gorges.push(o)}}placeButtes(){let e=this.track,t=Pd(e.spec.seed*13+1),n=e.bounds;for(let r=0;r<90&&this.buttes.length<16;r+=1){let r=kd(n.minX-1e3,n.maxX+1e3,t()),i=kd(n.minZ-1e3,n.maxZ+1e3,t()),a=50+t()*120,o=55+t()*95,s=!0;for(let t=0;t<e.n;t+=5)if((r-e.x[t])**2+(i-e.z[t])**2<(a+190)**2){s=!1;break}for(let e of this.buttes)Math.hypot(e.x-r,e.z-i)<e.r+a+60&&(s=!1);s&&this.buttes.push({x:r,z:i,r:a,h:o})}}computeExtents(){let e=this.track,t=e.n;for(let n=0;n<t;n+=1)for(let r of[-1,1]){let i=e.rx[n]*r,a=e.rz[n]*r,o=400;for(let r=0;r<t;r+=2){if(Math.min(Math.abs(r-n),t-Math.abs(r-n))*e.ds<70)continue;let s=e.x[r]-e.x[n],c=e.z[r]-e.z[n],l=s*i+c*a;l<=0||Math.abs(s*-a+c*i)>l*1.1+20||(o=Math.min(o,Math.hypot(s,c)-e.halfW[r]-3-6))}let s=Q((o-e.barrierAt(n))*.5,6,jm);this.ext[n*2+ +(r>0)]=s}let n=new Float64Array(this.ext.length);for(let e=0;e<2;e+=1){for(let e=0;e<t;e+=1)for(let r=0;r<2;r+=1){let i=1/0;for(let n=-4;n<=4;n+=1)i=Math.min(i,this.ext[$(e+n,t)*2+r]);n[e*2+r]=i}this.ext.set(n)}}road(){let e=this.track,t=e.n,n=new Float32Array((t+1)*2*3),r=new Float32Array((t+1)*2*2);for(let i=0;i<=t;i+=1){let a=i%t,o=this.inCorkZone(a*e.ds);for(let t=0;t<2;t+=1){let s=o?0:(t===0?-1:1)*e.pavedW(a),c=(i*2+t)*3;n[c]=e.x[a]+e.rx[a]*s,n[c+1]=e.y[a]+e.bank[a]*s+(o?-.4:.03),n[c+2]=e.z[a]+e.rz[a]*s,r[(i*2+t)*2]=t,r[(i*2+t)*2+1]=i*e.ds/12}}let i=Rm(n,r,t,2),a=Up();this.disposables.push(a);let o=new J(i,Tm({set:`asphalt`,planar:!0,scale:1/5.5,overlay:a,roughness:1,normalScale:.9,bright:1.75,color:`#d8d2cc`,envIntensity:.12}));return o.receiveShadow=!0,o}shoulders(){let e=this.track,t=e.n,n=new K,r=Tm({set:`sand`,planar:!0,scale:1/7,roughness:1,normalScale:1.1,color:`#f3dcc0`});for(let i of[-1,1]){let a=new Float32Array((t+1)*2*3),o=new Float32Array((t+1)*2*2);for(let n=0;n<=t;n+=1){let r=n%t;for(let t=0;t<2;t+=1){let s=i*(t===0?e.pavedW(r)-.05:Math.max(e.pavedW(r),e.barrierAt(r)+.2)),c=(n*2+t)*3;a[c]=e.x[r]+e.rx[r]*s,a[c+1]=e.y[r]+e.bank[r]*Q(s,-e.halfW[r]-3,e.halfW[r]+3)+.015,a[c+2]=e.z[r]+e.rz[r]*s,o[(n*2+t)*2]=a[c]/6,o[(n*2+t)*2+1]=a[c+2]/6}}let s=new J(Rm(a,o,t,2,i>0),r);s.receiveShadow=!0,n.add(s)}return n}barriers(){let e=this.track,t=e.n,n=new K,r=Tm({set:`sandstone`,scale:1/2.6,roughness:1,normalScale:1.2,side:2,color:`#e6c9b4`}),i=new Yi({color:`#a3a8ae`,roughness:.5,metalness:.45,side:2,envMapIntensity:.3}),a=new Yi({color:`#4a4448`,roughness:.8,metalness:.1}),o=[],s=[],c=[],l=new G;for(let n of[-1,1])for(let r=0;r<t;r+=1){let i=(r+1)%t,a=e.isWall(r),u=a?1.5:1.05,d=(t,r,i,c,l,u)=>{let d=e.x[t]+e.rx[t]*n*i,f=e.z[t]+e.rz[t]*n*i,p=e.x[r]+e.rx[r]*n*c,m=e.z[r]+e.rz[r]*n*c,h=this.edgeY(t,n),g=this.edgeY(r,n);(a?o:s).push(d,h+l,f,p,g+l,m,p,g+u,m,d,h+u,f)},f=e.barrierAt(r)+.15,p=e.barrierAt(i)+.15;if(a){d(r,i,f,p,-.4,u);let t=e.x[r]+e.rx[r]*n*f,a=e.z[r]+e.rz[r]*n*f,s=e.x[i]+e.rx[i]*n*p,c=e.z[i]+e.rz[i]*n*p,l=e.x[r]+e.rx[r]*n*(f+.9),m=e.z[r]+e.rz[r]*n*(f+.9),h=e.x[i]+e.rx[i]*n*(p+.9),g=e.z[i]+e.rz[i]*n*(p+.9),_=this.edgeY(r,n)+u,v=this.edgeY(i,n)+u;o.push(t,_,a,s,v,c,h,v,g,l,_,m)}else d(r,i,f,p,.55,.95),r%2==0&&(l.makeTranslation(e.x[r]+e.rx[r]*n*(f+.12),this.edgeY(r,n)+.45,e.z[r]+e.rz[r]*n*(f+.12)),c.push(l.clone()))}n.add(zm(o,r,!0)),n.add(zm(s,i,!1));let u=new Zr(new Oi(.18,1,.18),a,c.length);return c.forEach((e,t)=>u.setMatrixAt(t,e)),n.add(u),n}ribbons(){let e=this.track,t=e.n,n=Am.length,r=[],i=[],a=[],o=new q;for(let s of[-1,1]){let c=r.length/3;for(let a=0;a<t;a+=1){let t=this.ext[a*2+ +(s>0)],c=this.canyonW(a);for(let l=0;l<n;l+=1){let n=Am[l],u=e.barrierAt(a)+.15+n/jm*t,d=l>1?(Fd(a,l,s+7,e.spec.seed)-.5)*1.6*c:0,f=e.x[a]+e.rx[a]*s*(u+d),p=e.z[a]+e.rz[a]*s*(u+d),m=l===0?this.edgeY(a,s)-.4:this.ribbonHeight(a,s,n,f,p,l);r.push(f,m,p);let h=Nm[$(Math.floor((m+Id(a*.05,l,2)*3)/5.5),Nm.length)],g=(1-c)*(1-Ad(0,1,l/3)*.4);o.copy(h).lerp(l<2?Fm:Pm,g);let _=.88+Fd(a,l,s,5)*.2;i.push(o.r*_,o.g*_,o.b*_)}}for(let r=0;r<t;r+=1){let i=(r+1)%t;if(!(e.bridge[r]>.5||e.bridge[i]>.5))for(let e=0;e<n-1;e+=1){let t=c+r*n+e,o=c+i*n+e,l=c+i*n+e+1,u=c+r*n+e+1;s>0?a.push(t,u,o,o,u,l):a.push(t,o,u,o,l,u)}}}let s=new Ln;s.setAttribute(`position`,new Tn(r,3)),s.setAttribute(`color`,new Tn(i,3)),s.setIndex(a),s.computeVertexNormals();let c=new J(s,Tm({set:`cliff`,scale:1/13,tint:1,gray:.85,streaks:1,top:`sand`,topAmount:.75,vertexColors:!0,roughness:1,normalScale:1.5,side:2}));return c.receiveShadow=!0,c.castShadow=!0,c}terrain(){let e=this.track.bounds,t=this.sun.castShadow?1250:900,n=e.minX-t,r=e.maxX+t,i=e.minZ-t,a=e.maxZ+t,o=this.sun.castShadow?210:150,s=new Ii(r-n,a-i,o,o);s.rotateX(-Math.PI/2),s.translate((n+r)/2,0,(i+a)/2);let c=s.attributes.position,l=new Float32Array(c.count*3),u=new q;for(let e=0;e<c.count;e+=1){let t=c.getX(e),n=c.getZ(e),r=t+(Fd(e,1,2)-.5)*5,i=n+(Fd(e,3,4)-.5)*5,a=this.terrainAt(r,i);c.setXYZ(e,r,a,i),a>14?u.copy(Nm[$(Math.floor((a+Id(t/60,n/60,4)*4)/7),Nm.length)]):u.copy(Pm).lerp(Fm,.5+.5*Id(t/90,n/90,8)),a<-8&&u.lerp(new q(`#8a4a2e`),.6);let o=.9+Fd(e,7,7)*.16;l[e*3]=u.r*o,l[e*3+1]=u.g*o,l[e*3+2]=u.b*o}s.setAttribute(`color`,new Sn(l,3)),s.computeVertexNormals();let d=new J(s,Tm({set:`cliff`,scale:1/16,tint:1,gray:.8,streaks:.7,top:`sand`,topAmount:1,vertexColors:!0,roughness:1,normalScale:1.2}));return d.receiveShadow=!0,d}bridges(){let e=this.track,t=e.n,n=new K,r=[],i=[],a=[],o=new G,s=new ze;for(let n=0;n<t;n+=1){let c=(n+1)%t;if(e.bridge[n]<.3&&e.bridge[c]<.3)continue;let l=e.barrierAt(n)+.3,u=e.barrierAt(c)+.3,d=(t,n,r)=>[e.x[t]+e.rx[t]*n,e.y[t]+e.bank[t]*n+r,e.z[t]+e.rz[t]*n];for(let e of[-1,1]){let t=d(n,e*l,0),i=d(c,e*u,0),a=d(c,e*u*.7,-3.2),o=d(n,e*l*.7,-3.2);r.push(...t,...i,...a,...o)}let f=d(n,-l*.7,-3.2),p=d(c,-u*.7,-3.2),m=d(c,u*.7,-3.2),h=d(n,l*.7,-3.2);if(r.push(...f,...p,...m,...h),n%18==0&&e.bridge[n]>.6)for(let t of[-.45,.45]){let[r,a,c]=d(n,t*l,-3),u=this.natural(r,c),f=Math.max(2,a-u+2);o.compose(new H(r,a-f/2,c),s.setFromAxisAngle(new H(0,1,0),e.heading[n]),new H(1,f,1)),i.push(o.clone())}if(e.bridge[n]>.5&&n%3==0)for(let t of[-1,1]){let[r,i,o]=d(n,t*(l-.1),1);a.push(r,i,o,r,i+5+3*Math.sin(n*e.ds/40),o)}}if(n.add(zm(r,new Yi({color:`#6b605c`,roughness:.85,metalness:.1,side:2,envMapIntensity:.25}),!0)),i.length){let e=new Zr(new Oi(2.4,1,3.2),Tm({set:`sandstone`,scale:1/3,roughness:1,color:`#d8c2b2`}),i.length);i.forEach((t,n)=>e.setMatrixAt(n,t)),e.castShadow=!0,n.add(e)}if(a.length){let e=new Ln;e.setAttribute(`position`,new Tn(a,3)),n.add(new mi(e,new ni({color:`#cfc6ba`})))}return n}rivers(){let e=new K,t=new Yi({color:`#3f7f86`,roughness:.22,metalness:0,envMapIntensity:.55});for(let n of this.gorges){let r=new Ii(38,n.ext*2+120);r.rotateX(-Math.PI/2);let i=new J(r,t);i.position.set(n.cx,n.floor+2.4,n.cz),i.rotation.y=Math.atan2(n.dx,n.dz),e.add(i)}return e}gates(){let e=this.track,t=new K;for(let n of e.gates){let r=n.sample,i=e.barrierAt(r)+.8,a=new K;a.position.set(e.x[r],e.y[r],e.z[r]),a.rotation.y=e.heading[r];let o=n.index===e.gates.length-1,s=new Oi(1.1,9.4,1.1),c=[];for(let t of[-1,1]){let n=new J(s,this.gateMat);n.position.set(t*i,4.7+e.bank[r]*t*i*-1,0),n.castShadow=!0,a.add(n),c.push(n)}let l=o?Jp(`FINISH`,`#111`,`#fff`):Yp(n.index+1);this.disposables.push(l);let u=new mr({map:l}),d=new J(new Oi(i*2+1.1,1.7,.7),[this.gateMat,this.gateMat,this.gateMat,this.gateMat,u,u]);if(d.position.set(0,8.9,0),d.castShadow=!0,a.add(d),c.push(d),o){let e=qp();e.repeat.set(4,1),this.disposables.push(e);let t=new J(new Ii(i*2,1.2),new mr({map:e,side:2}));t.position.set(0,7.5,0),a.add(t)}a.userData.parts=c,a.userData.width=i*2,this.gateGroups.push(a),t.add(a)}return t}pads(){let e=this.track,t=new K,n=new mr({map:this.padTex,toneMapped:!1});this.padTex.repeat.set(1,1.5);let r={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};for(let i of e.pads){let a=new Float32Array(42),o=new Float32Array(28),s=i.cork>=0?e.corks[i.cork]:null;for(let t=0;t<=6;t+=1){let n=i.s-i.len/2+t/6*i.len;e.frameAt(n,r);for(let c=0;c<2;c+=1){let l=i.d+(c===0?-i.halfW:i.halfW),u=(t*2+c)*3;s?(e.corkPoint(s,n,l,.1,this.cp),a[u]=this.cp.x,a[u+1]=this.cp.y,a[u+2]=this.cp.z):(a[u]=r.x+r.rx*l,a[u+1]=r.y+r.bank*l+.07,a[u+2]=r.z+r.rz*l),o[(t*2+c)*2]=c,o[(t*2+c)*2+1]=t/6}}if(s){let e=new J(Lm(a,o,6,2),this.padRibbonMat??=Object.assign(n.clone(),{side:2}));t.add(e)}else t.add(new J(Rm(a,o,6,2,!1,!1),n))}return t}cp={x:0,y:0,z:0};padRibbonMat;inCorkZone(e){let t=this.track;for(let n of t.corks){let r=$(e-n.s0,t.length);if(r>.4&&r<n.len-.4)return!0}return!1}corkscrews(){let e=this.track,t=new K;if(!e.corks.length)return t;let n=Up();this.disposables.push(n);let r=Tm({set:`asphalt`,scale:1/5.5,overlay:n,roughness:1,normalScale:.9,bright:1.75,color:`#d8d2cc`,envIntensity:.12,side:2}),i=new Yi({color:`#3a3d42`,roughness:.62,metalness:.35,envMapIntensity:.3,side:2}),a=new Yi({color:`#c8552a`,roughness:.5,metalness:.15,envMapIntensity:.3,side:2}),o=new Yi({color:`#ffd9a0`,emissive:`#ff9d3c`,emissiveIntensity:.35,roughness:.5,metalness:0,side:2}),s=new Yi({color:`#4a4f57`,roughness:.55,metalness:.4,envMapIntensity:.3});this.disposables.push(r,i,a,o,s);let c=[],l=[],u=new H(0,1,0),d=new G,f=new ze,p=(e,t,n,r)=>{let i=new H().subVectors(t,e),a=i.length();a<.05||(f.setFromUnitVectors(u,i.divideScalar(a)),r.push(d.compose(new H().addVectors(e,t).multiplyScalar(.5),f,new H(n,a,n)).clone()))};for(let n of e.corks){let s=Math.ceil(n.len/.8),u=e=>n.s0+e/s*n.len,d=(r,i,a=!1)=>{let o=new Float32Array((s+1)*r.length*3),c=new Float32Array((s+1)*r.length*2);for(let t=0;t<=s;t+=1){let i=u(t),s=e.corkHalfW(n,i);r.forEach(([l,u],d)=>{e.corkPoint(n,i,l*s+(Math.abs(l)>1?Math.sign(l)*(Math.abs(l)-1):0),u,this.cp);let f=(t*r.length+d)*3;o[f]=this.cp.x,o[f+1]=this.cp.y,o[f+2]=this.cp.z,c[(t*r.length+d)*2]=a?(l+1)/2:d/(r.length-1),c[(t*r.length+d)*2+1]=(i-n.s0)*1.12/12})}let l=new J(Lm(o,c,s,r.length),i);l.castShadow=!0,l.receiveShadow=!0,t.add(l)};d([[-1,.05],[-.5,.05],[0,.05],[.5,.05],[1,.05]],r,!0),d([[-1,-.6],[0,-.75],[1,-.6]],i);for(let e of[-1,1])d([[e,-.6],[e,.05]],i),d([[e*1.02,.02],[e*1.02,1]],a),d([[e*.975,.07],[e*.93,.07]],o);let f=Math.hypot(n.radius,n.hw+1.2)+1.6,m=Math.max(3,Math.round(n.len/18)),h={x:0,y:0,z:0,tx:0,tz:1,rx:1,rz:0,halfW:0,bank:0};for(let t=0;t<=m;t+=1){let r=n.s0+3+t/m*(n.len-6);e.frameAt(r,h);let i=Math.min(h.y-.6,this.natural(h.x,h.z)+.2),a=h.y+n.radius+f,o=[-1,1].map(e=>new H(h.x+h.rx*e*f,0,h.z+h.rz*e*f));for(let e of o)p(new H(e.x,i,e.z),new H(e.x,a+.4,e.z),.8,c);p(new H(o[0].x,a,o[0].z),new H(o[1].x,a,o[1].z),.7,c);let s=r-n.s0;if(s>4&&s<n.len-4){let t=e.corkFrame(n,r,0,this.cf),o=new H(t.x-t.nx*.7,t.y-t.ny*.7,t.z-t.nz*.7),s=new H(-t.nx,-t.ny,-t.nz),c=e=>(e.x-h.x)*h.rx+(e.z-h.z)*h.rz,u=s.x*h.rx+s.z*h.rz,d=1/0;if(Math.abs(u)>.001){let e=(u>0?f:-f)-c(o);e/u>0&&(d=Math.min(d,e/u))}s.y>.001&&(d=Math.min(d,(a-o.y)/s.y)),s.y<-.001&&(d=Math.min(d,(i-o.y)/s.y)),Number.isFinite(d)&&d>.3&&p(o,o.clone().addScaledVector(s,d),.45,l)}}e.frameAt(n.s0-5,h);let g=Math.min(e.barrierAt(e.sampleIndex(n.s0-5))+.4,f),_=h.y+9.5;for(let e of[-1,1])p(new H(h.x+h.rx*e*g,h.y-.5,h.z+h.rz*e*g),new H(h.x+h.rx*e*g,_+1,h.z+h.rz*e*g),.9,c);let v=Jp(`CORKSCREW  ·  KEEP SPEED`,`#1b1030`,`#ffd23f`);this.disposables.push(v);let y=new mr({map:v,side:2});this.disposables.push(y);let b=new J(new Ii(g*2,2.2),y);b.position.set(h.x,_,h.z),b.rotation.y=Math.atan2(h.tx,h.tz)+Math.PI,t.add(b),this.corkBanners.push(b)}let m=new Oi(1,1,1),h=new ji(.5,.5,1,8);this.disposables.push(m,h);for(let[e,n]of[[c,m],[l,h]]){if(!e.length)continue;let r=new Zr(n,s,e.length);e.forEach((e,t)=>r.setMatrixAt(t,e)),r.castShadow=!0,r.receiveShadow=!0,t.add(r)}return t}cf=zd();corkBanners=[];ramps(){let e=this.track,t=new K,n=Kp();n.repeat.set(3,1),this.disposables.push(n);let r=new Yi({map:n,roughness:.6}),i=new Yi({color:`#3b2f45`,roughness:.8,side:2}),a={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};for(let n of e.ramps){let o=new Float32Array(54),s=new Float32Array(36),c=[],l=[];for(let t=0;t<=8;t+=1){let r=n.s0+t/8*n.len;e.frameAt(r,a);let i=n.height*Math.sin(t/8*Math.PI);for(let e=0;e<2;e+=1){let n=(e===0?-1:1)*(a.halfW+.5),r=(t*2+e)*3;o[r]=a.x+a.rx*n,o[r+1]=a.y+a.bank*n+i+.04,o[r+2]=a.z+a.rz*n,s[(t*2+e)*2]=e,s[(t*2+e)*2+1]=t/8}if(t<8){let r=n.s0+(t+1)/8*n.len,o={...a};e.frameAt(r,o);let s=n.height*Math.sin(Math.PI*((t+1)/8));for(let e of[-1,1]){let t=e*(a.halfW+.5),n=e*(o.halfW+.5),r=a.x+a.rx*t,l=a.z+a.rz*t,u=a.y+a.bank*t,d=o.x+o.rx*n,f=o.z+o.rz*n,p=o.y+o.bank*n;c.push(r,u,l,d,p,f,d,p+s,f,r,u+i,l)}}else{let e=a.x+a.rx*-(a.halfW+.5),t=a.z+a.rz*-(a.halfW+.5),n=a.x+a.rx*(a.halfW+.5),r=a.z+a.rz*(a.halfW+.5);l=[e,a.y-a.bank*(a.halfW+.5),t,n,a.y+a.bank*(a.halfW+.5),r,n,a.y+a.bank*(a.halfW+.5)+i,r,e,a.y-a.bank*(a.halfW+.5)+i,t]}}let u=new J(Rm(o,s,8,2,!1,!1),r);u.castShadow=!0,u.receiveShadow=!0,t.add(u),t.add(zm([...c,...l],i,!1)),n.mega&&t.add(this.megaDressing(n.s0,n.len,n.height))}return t}megaDressing(e,t,n){let r=this.track,i=new K,a=new Yi({color:`#3a3d44`,roughness:.55,metalness:.5}),o=new Yi({color:`#f08a1c`,roughness:.6,emissive:`#5a2200`,emissiveIntensity:.25}),s={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0},c=new Oi(1,1,1),l=(e,t,n,r,a,o,s,l,u=0)=>{let d=new J(c,e);d.position.set(t,n,r),d.rotation.set(u,l,0,`YXZ`),d.scale.set(a,o,s),d.castShadow=!0,i.add(d)};for(let i=0;i<6;i+=1){let c=e+i/6*t,u=e+(i+1)/6*t;r.frameAt((c+u)/2,s);let d=n*(i+.5)/6,f=-Math.atan2(n,t),p=Math.atan2(s.tx,s.tz);for(let e of[-1,1]){let t=e*(s.halfW+.7);l(i%2?a:o,s.x+s.rx*t,s.y+s.bank*t+d+.55,s.z+s.rz*t,.45,.7,(u-c)*1.02,p,f)}}r.frameAt(e+t,s);let u=Math.atan2(s.tx,s.tz);for(let e=-2;e<=2;e+=1){let t=e/2*s.halfW;l(a,s.x+s.rx*t+s.tx*.8,s.y+n/2,s.z+s.rz*t+s.tz*.8,.6,n,.6,u)}for(let e=1;e<=3;e+=1)l(a,s.x+s.tx*.8,s.y+n*e/4,s.z+s.tz*.8,s.halfW*2,.35,.35,u);r.frameAt(e-6,s);for(let e of[-1,1]){let t=e*(s.halfW+2.2),n=s.x+s.rx*t,r=s.z+s.rz*t;l(a,n,s.y+4,r,.8,8,.8,u);for(let e=0;e<3;e+=1)l(o,n,s.y+5.2+e*1.1,r,.95,.45,.95,u)}return i}startLine(){let e=this.track,t=new K,n=qp();n.repeat.set(3,1),this.disposables.push(n);let r={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};e.frameAt(0,r);let i=new J(new Ii(r.halfW*2,2.4),new Yi({map:n,roughness:.8}));i.rotation.set(-Math.PI/2,0,0);let a=new K;a.position.set(r.x,r.y+.06,r.z),a.rotation.y=Math.atan2(r.tx,r.tz),a.add(i),t.add(a);let o=Zp();this.disposables.push(o);let s=new mr({map:o,transparent:!0,depthWrite:!1});for(let n of[-5,0,5]){e.frameAt(e.length-14,r);let i=new J(new Ii(3.2,5.4),s);i.rotation.set(-Math.PI/2,0,Math.atan2(r.tx,r.tz)),i.position.set(r.x+r.rx*n*Q(e.halfW[0]/10,.8,1.2),r.y+r.bank*n+.06,r.z+r.rz*n*Q(e.halfW[0]/10,.8,1.2)),t.add(i)}e.frameAt(e.length-40,r);let c=Jp(this.track.spec.name.toUpperCase());this.disposables.push(c);let l=r.halfW*2+8,u=new J(new Ii(l,l/8),new mr({map:c,side:2}));u.position.set(r.x,r.y+11,r.z),u.rotation.y=Math.atan2(r.tx,r.tz)+Math.PI,t.add(u);let d=new ji(.35,.45,13,8),f=new Yi({color:`#3a3438`,roughness:.7,metalness:.15});for(let e of[-1,1]){let n=new J(d,f);n.position.set(r.x+r.rx*e*(l/2),r.y+6.5,r.z+r.rz*e*(l/2)),t.add(n)}return t}itemBoxes(){let e=this.track,t=new K,n=new Yi({color:`#ff8ad9`,emissive:`#a0206f`,emissiveIntensity:.45,roughness:.18,metalness:0,flatShading:!0,transparent:!0,opacity:.88,envMapIntensity:.6}),r=new mr({color:`#fff3a8`}),i=new Fi(1.15,0),a=new Pi(.42,0),o={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};for(let s of e.items){e.frameAt(s.s,o);for(let e of s.lanes){let s=new K,c=new J(i,n);c.scale.set(1,1.3,1),c.castShadow=!0,s.add(c,new J(a,r)),s.position.set(o.x+o.rx*e,o.y+o.bank*e+1.3,o.z+o.rz*e),s.userData.baseY=s.position.y,this.boxes.push(s),t.add(s)}}return t}signs(){let t=this.track,n=new K,r=Gp();this.disposables.push(r);let i=new mr({map:r,side:2}),a=r.clone();a.repeat.set(-1,1),a.offset.set(1,0),a.wrapS=e,a.needsUpdate=!0,this.disposables.push(a);let o=new mr({map:a,side:2}),s=new Ii(3.2,1.6),c=-99;for(let e=0;e<t.n;e+=1){let r=t.curv[e];if(Math.abs(r)<1/75||e-c<7)continue;c=e;let a=r<0?-1:1,l=t.barrierAt(e)+.9,u=new J(s,r<0?i:o);u.position.set(t.x[e]+t.rx[e]*a*l,this.edgeY(e,a)+2.2,t.z[e]+t.rz[e]*a*l),u.rotation.y=t.heading[e]+Math.PI,n.add(u)}return n}props(){let e=this.track,t=new K,n=Pd(e.spec.seed*7+3),r=Um(11),i=Tm({set:`rocks`,scale:1/3.2,tint:.35,roughness:1,normalScale:1.4}),a=[],o=Vm(),s=[],c=new ji(2.2,4.6,1,11,6);Bm(c,.45,5);let l=[],u=new G,d=new ze,f=new gt;for(let t=0;t<900;t+=1){let t=Math.floor(n()*e.n),r=n()<.5?-1:1,i=this.ext[t*2+ +(r>0)],o=this.canyonW(t),c=n();if(!(e.bridge[t]>.3)){if(c<.45){let o=.8+n()*2.6,s=e.barrierAt(t)+2+o+n()*Math.min(i,14),c=e.x[t]+e.rx[t]*r*s,l=e.z[t]+e.rz[t]*r*s;if(this.nearest(c,l).x<o+1.5)continue;let p=this.surfaceAt(c,l);u.compose(new H(c,p+o*.3,l),d.setFromEuler(f.set(n()*3,n()*3,n()*3)),new H(o,o*(.6+n()*.5),o)),a.push({m:u.clone(),c:Nm[Math.floor(n()*Nm.length)].clone().multiplyScalar(.85+n()*.2)})}else if(c<.8&&o<.4){let i=e.barrierAt(t)+8+n()*180,a=e.x[t]+e.rx[t]*r*i,o=e.z[t]+e.rz[t]*r*i;if(this.nearest(a,o).x<6)continue;let c=this.surfaceAt(a,o),l=.8+n()*.7;u.compose(new H(a,c-.3,o),d.setFromEuler(f.set(0,n()*6.28,0)),new H(l,l,l)),s.push(u.clone())}else if(o<.3){let i=e.barrierAt(t)+40+n()*260,a=e.x[t]+e.rx[t]*r*i,o=e.z[t]+e.rz[t]*r*i;if(this.nearest(a,o).x<30)continue;let s=this.surfaceAt(a,o),c=14+n()*34,p=.7+n()*.8,m=n()*6.28;u.compose(new H(a,s+c/2-1,o),d.setFromEuler(f.set(0,m,0)),new H(p,c,p)),l.push({m:u.clone(),c:Nm[Math.floor(n()*Nm.length)].clone(),x:a,y:s,z:o,h:c,rot:m})}}}let p=new Zr(r,i,a.length);a.forEach((e,t)=>{p.setMatrixAt(t,e.m),p.setColorAt(t,e.c)}),p.castShadow=!0,p.receiveShadow=!0,t.add(p);let m=new Zr(o,new Yi({color:`#5a7a44`,roughness:.85,metalness:0}),s.length);s.forEach((e,t)=>m.setMatrixAt(t,e)),m.castShadow=!0,t.add(m);let h=new Zr(c,Tm({set:`sandstone`,scale:1/7,tint:.45,roughness:1,normalScale:1.2}),l.length);l.forEach((e,t)=>{h.setMatrixAt(t,e.m),h.setColorAt(t,e.c)}),h.castShadow=!0,t.add(h);let g=new q;return vm(`boulder`,()=>{let e=_m(`boulder`,`radius`);e&&!this.disposed&&(p.geometry=e.geometry,p.material=e.material,a.forEach((e,t)=>p.setColorAt(t,g.setScalar(.82+Fd(t,3,9)*.26))),p.instanceColor&&(p.instanceColor.needsUpdate=!0))}),vm(`saguaro`,()=>{let e=_m(`saguaro`,`base`);if(!e||this.disposed)return;let t=e.geometry.clone();t.scale(7,7,7),t.translate(0,.25,0),m.geometry=t,m.material=e.material}),vm(`spire`,()=>{let e=_m(`spire`,`base`);e&&!this.disposed&&(h.geometry=e.geometry,h.material=e.material,l.forEach((e,t)=>{let n=e.h*(.75+Fd(t,5,1)*.3);u.compose(new H(e.x,e.y-1.5,e.z),d.setFromEuler(f.set(0,e.rot,0)),new H(n,e.h*1.15,n)),h.setMatrixAt(t,u),h.setColorAt(t,g.setScalar(.85+Fd(t,2,2)*.2))}),h.instanceMatrix.needsUpdate=!0,h.instanceColor&&(h.instanceColor.needsUpdate=!0),h.computeBoundingSphere())}),t}dressing(){let e=this.track,t={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0},n=(e,t)=>{let n=()=>{let n=Z.models.get(e);n&&!this.disposed&&t(n.scene)};Z.has(e)?n():Z.whenSettled(e).then(n)};n(`model:gantry`,n=>{e.frameAt(e.length-6,t);let r=n.clone(!0),i=new rn().setFromObject(r),a=i.max.x-i.min.x,o=(e.barrierAt(0)+1.5)*2/Math.max(1,a);r.scale.set(o,Math.max(1,o*.8),Math.max(1,o*.6)),r.position.set(t.x,t.y,t.z),r.rotation.y=Math.atan2(t.tx,t.tz),r.traverse(e=>{let t=e;t.isMesh&&(t.castShadow=!0,t.receiveShadow=!0,Hm(t.material,!0))}),this.scene.add(r)}),n(`model:tower`,n=>{for(let r of[e.length-70,e.length-30,24])for(let i of[-1,1]){e.frameAt($(r,e.length),t);let a=n.clone(!0),o=e.barrierAt(0)+3.2;a.scale.setScalar(1.6),a.position.set(t.x+t.rx*i*o,this.edgeY(0,i)-.2,t.z+t.rz*i*o),a.rotation.y=Math.atan2(t.tx,t.tz)+(i>0?Math.PI/2:-Math.PI/2),a.traverse(e=>{let t=e;t.isMesh&&(t.castShadow=!0,Hm(t.material))}),this.scene.add(a)}})}};function Lm(e,t,n,r){let i=[];for(let e=0;e<n;e+=1)for(let t=0;t<r-1;t+=1){let n=e*r+t,a=(e+1)*r+t;i.push(n,n+1,a,a,n+1,a+1)}let a=new Ln;return a.setAttribute(`position`,new Sn(e,3)),a.setAttribute(`uv`,new Sn(t,2)),a.setIndex(i),a.computeVertexNormals(),a}function Rm(e,t,n,r,i=!1,a=!0){if(!i&&r>=2){let t=e[0],n=e[1],a=e[2],o=e[r*3]-t,s=e[r*3+1]-n,c=e[r*3+2]-a,l=e[3]-t,u=e[4]-n,d=e[5]-a,f=c*l-o*d;Math.abs(f)>.5*Math.hypot(s*d-c*u,f,o*u-s*l)&&f<0&&(i=!0)}let o=[];for(let e=0;e<n;e+=1)for(let t=0;t<r-1;t+=1){let n=e*r+t,a=(e+1)*r+t;i?o.push(n,n+1,a,a,n+1,a+1):o.push(n,a,n+1,a,a+1,n+1)}let s=new Ln;s.setAttribute(`position`,new Sn(e,3)),s.setAttribute(`uv`,new Sn(t,2)),s.setIndex(o),s.computeVertexNormals();let c=s.attributes.normal;for(let e=0;e<c.count;e+=1)c.getY(e)<0&&c.setXYZ(e,-c.getX(e),-c.getY(e),-c.getZ(e));return s}function zm(e,t,n){let r=e.length/12,i=[];for(let e=0;e<r;e+=1){let t=e*4;i.push(t,t+1,t+2,t,t+2,t+3)}let a=new Ln;a.setAttribute(`position`,new Tn(e,3)),a.setIndex(i),a.computeVertexNormals();let o=new J(a,t);return o.castShadow=n,o.receiveShadow=!0,t.side||=2,o}function Bm(e,t,n){let r=e.attributes.position,i=new Map;for(let e=0;e<r.count;e+=1){let a=`${r.getX(e).toFixed(3)},${r.getY(e).toFixed(3)},${r.getZ(e).toFixed(3)}`,o=i.get(a);o||(o=[(Fd(e,1,n)-.5)*t,(Fd(e,2,n)-.5)*t,(Fd(e,3,n)-.5)*t],i.set(a,o)),r.setXYZ(e,r.getX(e)+o[0],r.getY(e)+o[1],r.getZ(e)+o[2])}e.computeVertexNormals()}function Vm(){let e=[],t=new ji(.45,.55,6,14,4);t.translate(0,3,0),e.push(t);for(let[t,n,r]of[[1,2.6,2.2],[-1,3.4,1.8]]){let i=new ji(.32,.34,1.4,10);i.rotateZ(Math.PI/2),i.translate(t*.9,n,0);let a=new ji(.3,.32,r,10);a.translate(t*1.5,n+r/2,0),e.push(i,a)}return Ul(e.map(e=>e.toNonIndexed()))}function Hm(e,t=!1){for(let n of Array.isArray(e)?e:[e]){let e=n;e.isMeshStandardMaterial&&(t&&!e.map&&e.color.r+e.color.g+e.color.b>1.8?(e.color.set(`#3b3e45`),e.metalness=.4,e.roughness=.5):t&&e.map&&e.color.setRGB(.42,.43,.46),e.metalness=Math.min(e.metalness,.3),e.roughness=Math.max(e.roughness,.45),e.envMapIntensity=.35,e.emissiveIntensity>.6&&(e.emissiveIntensity=.6))}}function Um(e){let t=new Pi(1,3);t.deleteAttribute(`normal`),t.deleteAttribute(`uv`),t=Gl(t);let n=t.attributes.position,r=new H;for(let t=0;t<n.count;t+=1){r.fromBufferAttribute(n,t).normalize();let i=Id(r.x*1.7+r.z*.6,r.y*1.7-r.z*.4,e),a=Id(r.x*4.1-r.y*1.3,r.z*4.1+r.y,e+3),o=.82+i*.32+a*.1;r.y<-.2&&(o*=.85+.15*(1+r.y));let s=Math.max(0,r.dot(new H(.6,.5,.62))-.72);o-=s*.6,r.multiplyScalar(o),n.setXYZ(t,r.x,r.y,r.z)}return t.computeVertexNormals(),t}var Wm={drift1:[150,`MINI-TURBO`],drift2:[300,`SUPER TURBO`],drift3:[550,`ULTRA TURBO`],pad:[60,`BOOST PAD`],padPerfect:[180,`PERFECT PAD`],trick:[400,`TRICK`],dodge:[350,`DODGE`],block:[250,`BLOCK`],draft:[120,`SLIPSTREAM`],overtake:[300,`OVERTAKE`],launch:[250,`PERFECT START`],air:[100,`BIG AIR`],wall:[320,`WALL RIDE`],cork:[450,`CORKSCREW`]},Gm=3.2,Km=class{chain=0;mult=1;timer=0;last=``;total=0;best=0;onBank=null;add(e,t=1){let[n,r]=Wm[e];this.chain+=n*t*this.mult,this.mult=Math.min(8,this.mult+ +(this.timer>0)),this.timer=Gm,this.last=t>1?`${r} ×${t}`:r}break(){this.chain<=0||(this.chain=0,this.mult=1,this.timer=0,this.last=`CHAIN BROKEN`,this.onBank?.(0))}update(e){if(this.timer<=0||(this.timer-=e,this.timer>0))return;let t=Math.round(this.chain);this.total+=t,this.best=Math.max(this.best,t),this.chain=0,this.mult=1,this.onBank?.(t)}snapshot(){return{chain:Math.round(this.chain),mult:this.mult,window:Math.max(0,this.timer/Gm),last:this.last,total:this.total,best:this.best}}},qm={smoke:0,dust:1,flame:2,spark:3,glow:4,ring:5,confetti:6,line:7},Jm=`
  attribute vec3 iPos;
  attribute vec3 iDir;
  attribute vec4 iColor;
  attribute vec4 iMisc; // size, stretch, rotation, cell
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vCell;
  varying float vFade;
  void main() {
    vUv = uv;
    vColor = iColor;
    vCell = iMisc.w;
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    vec2 q = position.xy;
    float size = iMisc.x;
    // Never let effects block the driver's view: fade sprites that are close to the camera
    // (the chase camera sits ~7.4 m behind the car) or that would cover a big part of the screen.
    float dist = max(-mv.z, 0.05);
    float cover = size * max(iMisc.y, 1.0) / dist;
    vFade = smoothstep(1.6, 5.2, dist) * (1.0 - smoothstep(0.4, 1.1, cover) * 0.85);
    if (iMisc.y > 0.0) {
      vec3 dv = (viewMatrix * vec4(iDir, 0.0)).xyz;
      vec2 a = length(dv.xy) > 1e-4 ? normalize(dv.xy) : vec2(1.0, 0.0);
      vec2 b = vec2(-a.y, a.x);
      mv.xy += a * q.x * size * iMisc.y + b * q.y * size;
    } else {
      float c = cos(iMisc.z), s = sin(iMisc.z);
      mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
    }
    gl_Position = projectionMatrix * mv;
  }`,Ym=e=>`
  uniform sampler2D tAtlas;
  uniform float uLoaded;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vCell;
  varying float vFade;
  void main() {
    float col = mod(vCell, 4.0);
    float row = floor(vCell / 4.0);
    vec2 uv = vec2((col + vUv.x) * 0.25, (1.0 - row) * 0.5 + vUv.y * 0.5);
    vec4 tex = texture2D(tAtlas, uv);
    // Fallback before the atlas streams in: soft round dot.
    float d = length(vUv - 0.5) * 2.0;
    tex = mix(vec4(1.0, 1.0, 1.0, smoothstep(1.0, 0.2, d)), tex, uLoaded);
    vec4 c = tex * vColor;
    c.a *= vFade;
    ${e?`gl_FragColor = vec4(c.rgb * c.a, c.a);`:`if (c.a < 0.004) discard; gl_FragColor = c;`}
  }`,Xm=class e{max;mesh;geo;aPos;aDir;aColor;aMisc;p;v;c;s;static S=12;count=0;budget=1;col=new q;constructor(t,n,r){this.max=t;let i=new Ii(1,1);this.geo=new no,this.geo.index=i.index,this.geo.setAttribute(`position`,i.getAttribute(`position`)),this.geo.setAttribute(`uv`,i.getAttribute(`uv`)),this.aPos=new Ur(new Float32Array(t*3),3).setUsage(ne),this.aDir=new Ur(new Float32Array(t*3),3).setUsage(ne),this.aColor=new Ur(new Float32Array(t*4),4).setUsage(ne),this.aMisc=new Ur(new Float32Array(t*4),4).setUsage(ne),this.geo.setAttribute(`iPos`,this.aPos),this.geo.setAttribute(`iDir`,this.aDir),this.geo.setAttribute(`iColor`,this.aColor),this.geo.setAttribute(`iMisc`,this.aMisc),this.geo.instanceCount=0;let a=new qi({uniforms:r,vertexShader:Jm,fragmentShader:Ym(n),transparent:!0,depthWrite:!1,blending:n?5:1,blendSrc:201,blendDst:205});n&&(a.blendSrc=201,a.blendDst=201),this.mesh=new J(this.geo,a),this.mesh.frustumCulled=!1,this.mesh.renderOrder=n?12:11,this.p=new Float32Array(t*3),this.v=new Float32Array(t*3),this.c=new Float32Array(t*3),this.s=new Float32Array(t*e.S)}spawn(t,n,r,i,a,o,s){if(this.budget<1&&Math.random()>this.budget||this.count>=this.max)return;let c=this.count;this.count+=1,this.p[c*3]=t,this.p[c*3+1]=n,this.p[c*3+2]=r,this.v[c*3]=i,this.v[c*3+1]=a,this.v[c*3+2]=o,this.col.set(s.color),this.c[c*3]=this.col.r,this.c[c*3+1]=this.col.g,this.c[c*3+2]=this.col.b;let l=e.S,u=this.s;u[c*l]=s.life,u[c*l+1]=s.life,u[c*l+2]=s.size,u[c*l+3]=s.grow??1,u[c*l+4]=s.gravity??0,u[c*l+5]=s.drag??1.5,u[c*l+6]=s.spin??0,u[c*l+7]=Math.random()*Math.PI*2,u[c*l+8]=s.stretch??0,u[c*l+9]=s.cell,u[c*l+10]=s.alpha??1,u[c*l+11]=s.fadeIn??.08}kill(t){let n=this.count-1;t!==n&&(this.p.copyWithin(t*3,n*3,n*3+3),this.v.copyWithin(t*3,n*3,n*3+3),this.c.copyWithin(t*3,n*3,n*3+3),this.s.copyWithin(t*e.S,n*e.S,n*e.S+e.S)),--this.count}update(t){let n=e.S,r=this.s;for(let e=this.count-1;e>=0;--e)r[e*n]-=t,r[e*n]<=0&&this.kill(e);let i=this.aPos.array,a=this.aDir.array,o=this.aColor.array,s=this.aMisc.array;for(let e=0;e<this.count;e+=1){let c=e*3,l=Math.exp(-t*r[e*n+5]);this.v[c+1]-=r[e*n+4]*t,this.v[c]*=l,this.v[c+1]*=l,this.v[c+2]*=l,this.p[c]+=this.v[c]*t,this.p[c+1]+=this.v[c+1]*t,this.p[c+2]+=this.v[c+2]*t,r[e*n+7]+=r[e*n+6]*t;let u=1-r[e*n]/r[e*n+1],d=r[e*n+11],f=(u<d?u/Math.max(.001,d):1-(u-d)/(1-d))*r[e*n+10],p=r[e*n+2]*(1+(r[e*n+3]-1)*u);i[c]=this.p[c],i[c+1]=this.p[c+1],i[c+2]=this.p[c+2],a[c]=this.v[c],a[c+1]=this.v[c+1],a[c+2]=this.v[c+2],o[e*4]=this.c[c],o[e*4+1]=this.c[c+1],o[e*4+2]=this.c[c+2],o[e*4+3]=Math.max(0,f),s[e*4]=p,s[e*4+1]=r[e*n+8],s[e*4+2]=r[e*n+7],s[e*4+3]=r[e*n+9]}this.geo.instanceCount=this.count;for(let e of[this.aPos,this.aDir,this.aColor,this.aMisc])e.needsUpdate=!0,e.clearUpdateRanges(),e.addUpdateRange(0,this.count*e.itemSize)}clear(){this.count=0,this.geo.instanceCount=0}},Zm=class{group=new K;items=[];next=0;constructor(e){let t=new Ii(2,2);t.rotateX(-Math.PI/2);for(let n=0;n<e;n+=1){let e=new mr({transparent:!0,depthWrite:!1,blending:2,toneMapped:!1,polygonOffset:!0,polygonOffsetFactor:-2}),n=new J(t,e);n.visible=!1,n.renderOrder=10,this.group.add(n),this.items.push({mesh:n,mat:e,life:0,max:1,r0:1,r1:2})}}setTexture(e){for(let t of this.items)t.mat.map=e,t.mat.needsUpdate=!0}spawn(e,t,n,r,i,a,o,s=0,c=0){let l=this.items[this.next];this.next=(this.next+1)%this.items.length,l.mesh.position.set(e,t,n),l.mesh.rotation.set(s,c,0),l.mat.color.set(o),l.life=a,l.max=a,l.r0=r,l.r1=i,l.mesh.visible=!0}update(e){for(let t of this.items){if(!t.mesh.visible)continue;if(t.life-=e,t.life<=0){t.mesh.visible=!1;continue}let n=1-t.life/t.max,r=1-(1-n)*(1-n);t.mesh.scale.setScalar(t.r0+(t.r1-t.r0)*r),t.mat.opacity=(1-n)*(1-n)}}clear(){for(let e of this.items)e.mesh.visible=!1}},Qm=[`#ffd27a`,`#56c8ff`,`#ff8a2a`,`#e45cff`],$m=e=>Qm[Math.max(0,Math.min(3,e))],eh=class{group=new K;add;alpha;rings;uniforms={tAtlas:{value:null},uLoaded:{value:0}};seekerMeshes=new Map;mineMeshes=new Map;lockMarkers=[];frame={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};seekerParts;mineParts;lockRingMat=new mr({color:`#ff3b4a`,transparent:!0,depthWrite:!1,blending:2,toneMapped:!1});beamMat=new mr({color:`#ff3b4a`,transparent:!0,opacity:.18,depthWrite:!1,blending:2,side:2,toneMapped:!1});glowMat=new qn({color:`#ff3b4a`,transparent:!0,depthWrite:!1,blending:2,toneMapped:!1});mineRingMat=new mr({color:`#ff3b4a`,transparent:!0,opacity:.55,depthWrite:!1,blending:2,toneMapped:!1});quad=new Ii(2,2).rotateX(-Math.PI/2);beamGeo=new ji(1.4,1.4,24,20,1,!0);constructor(){this.add=new Xm(1600,!0,this.uniforms),this.alpha=new Xm(900,!1,this.uniforms),this.rings=new Zm(24),this.group.add(this.alpha.mesh,this.add.mesh,this.rings.group);let e=()=>{let e=Z.tex(`fx`);if(!e)return;this.uniforms.tAtlas.value=e,this.uniforms.uLoaded.value=1;let t=e.clone();t.repeat.set(.25,.5),t.offset.set(.25,0),t.needsUpdate=!0,this.rings.setTexture(t),this.lockRingMat.map=t,this.mineRingMat.map=t;let n=e.clone();n.repeat.set(.25,.5),n.offset.set(0,0),n.needsUpdate=!0,this.glowMat.map=n;for(let e of[this.lockRingMat,this.mineRingMat,this.glowMat])e.needsUpdate=!0};e(),Z.whenSettled(`fx`).then(e);let t=new ji(.22,.26,1.7,14);t.rotateX(Math.PI/2);let n=new Mi(.22,.6,14);n.rotateX(Math.PI/2),n.translate(0,0,1.15);let r=new Oi(.9,.04,.4);r.translate(0,0,-.7),this.seekerParts={body:t,nose:n,fin:r,bodyMat:new Yi({color:`#d9d6d0`,roughness:.4,metalness:.4,envMapIntensity:.6}),noseMat:new Yi({color:`#d7263d`,roughness:.35,metalness:.2,emissive:`#5a0610`,emissiveIntensity:.6}),finMat:new Yi({color:`#2a2a2e`,roughness:.6,metalness:.3})};let i=new ji(.95,1.1,.42,24),a=new Li(.34,16,10,0,Math.PI*2,0,Math.PI/2);a.translate(0,.21,0);let o=new Mi(.1,.42,8);o.translate(0,.2,0),this.mineParts={body:i,cap:a,spike:o,metal:new Yi({color:`#3b3a3f`,roughness:.55,metalness:.5,envMapIntensity:.5}),dark:new Yi({color:`#8a1320`,roughness:.3,metalness:.1,emissive:`#ff2a3a`,emissiveIntensity:.7})}}get activeCount(){return this.add.count+this.alpha.count}setBudget(e){this.add.budget=e,this.alpha.budget=e}spray(e,t,n,r,i,a,o,s=.5,c=1){let l=e===`add`?this.add:this.alpha;for(let e=0;e<i;e+=1){let e=Math.random()*Math.PI*2,i=Math.random()*2-1,u=Math.sqrt(1-i*i)*c,d=a*(.35+Math.random()*.65);l.spawn(t,n,r,Math.cos(e)*u*d,(Math.abs(i)*(1-s)+s)*d,Math.sin(e)*u*d,{...o,life:o.life*(.65+Math.random()*.6),size:o.size*(.7+Math.random()*.6)})}}flash(e,t,n,r,i=6,a=.22){this.add.spawn(e,t,n,0,0,0,{cell:qm.glow,life:a,size:i,grow:1.6,color:r,fadeIn:.05})}shock(e,t,n,r,i=7,a=.5){this.rings.spawn(e,t+.12,n,.6,i,a,r)}burst(e,t,n,r,i,a,o=.25,s=.6,c=9,l=`glow`,u=0){if(l===`dust`){this.spray(`alpha`,e,t,n,Math.ceil(r*.7),i*.8,{cell:qm.dust,life:s*1.6,size:o*4.2,grow:2.2,color:a,alpha:.75,gravity:-c*.2,drag:2.2,spin:(Math.random()-.5)*1.5,fadeIn:.12},.35);return}this.spray(`add`,e,t,n,r,i*1.2,{cell:qm.spark,life:s,size:o*2.6,color:a,gravity:c,drag:1.2,stretch:u||3.2},.4),this.spray(`add`,e,t,n,Math.ceil(r/3),i*.5,{cell:qm.glow,life:s*.8,size:o*5,grow:.3,color:a,gravity:c*.2,drag:3},.4),this.flash(e,t,n,a,3+o*10,.18)}driftSparks(e,t,n,r,i,a){let o=$m(a),s=a>0?3:1;for(let c=0;c<s;c+=1)this.add.spawn(e,t,n,-r*.12+(Math.random()-.5)*7,2+Math.random()*4.5,-i*.12+(Math.random()-.5)*7,{cell:qm.spark,life:.25+Math.random()*.25,size:a>0?.55:.35,color:o,gravity:16,drag:.8,stretch:3.5});a>0&&Math.random()<.5&&this.add.spawn(e,t+.1,n,0,.4,0,{cell:qm.glow,life:.12,size:1.3+a*.3,color:o,fadeIn:.1})}tyreSmoke(e,t,n,r,i,a,o=`#ded2c4`){Math.random()>a||this.alpha.spawn(e+(Math.random()-.5)*.6,t+.35,n+(Math.random()-.5)*.6,r*.15+(Math.random()-.5)*2,.8+Math.random()*1.2,i*.15+(Math.random()-.5)*2,{cell:qm.smoke,life:1.1+Math.random()*.8,size:1.2+Math.random()*.8,grow:3.2,color:o,alpha:.42,gravity:-.6,drag:1.4,spin:(Math.random()-.5)*1.2,fadeIn:.12})}dustTrail(e,t,n,r,i=`#cfa274`){Math.random()>r||this.alpha.spawn(e+(Math.random()-.5),t+.4,n+(Math.random()-.5),(Math.random()-.5)*2.5,1+Math.random()*1.8,(Math.random()-.5)*2.5,{cell:qm.dust,life:1.2+Math.random()*.8,size:1.6+Math.random()*1.2,grow:2.6,color:i,alpha:.6,gravity:-.3,drag:1.6,spin:Math.random()-.5,fadeIn:.1})}exhaust(e,t,n,r,i,a,o){let s=o?`#7ff3ff`:`#ffb04a`;this.add.spawn(e,t,n,r*8+(Math.random()-.5),i*8+Math.random()*.6,a*8+(Math.random()-.5),{cell:qm.flame,life:.14+Math.random()*.08,size:.9,grow:.4,color:s,drag:3,spin:(Math.random()-.5)*4}),Math.random()<.35&&this.alpha.spawn(e,t,n,r*4,.6,a*4,{cell:qm.smoke,life:.8,size:.6,grow:3,color:`#6a625c`,alpha:.25,gravity:-.8,drag:2})}nitroJet(e,t,n,r,i,a,o,s,c,l){let u=20+l*14;for(let d=0;d<4;d+=1){let f=.8,p=d===0;this.add.spawn(e,t,n,o+r*u+(Math.random()-.5)*f,s+i*u+(Math.random()-.5)*f,c+a*u+(Math.random()-.5)*f,{cell:p?qm.flame:qm.glow,life:.16+Math.random()*.1,size:(p?1.1:1.3)+l*.8,grow:p?.3:.9,color:p?`#ffffff`:d===1?`#a9c6ff`:`#4d7dff`,drag:1.2,spin:(Math.random()-.5)*6,stretch:2.8})}this.add.spawn(e,t,n,o,s,c,{cell:qm.glow,life:.06,size:2.2+l*1.4,color:`#7fa6ff`}),Math.random()<.55&&this.add.spawn(e+r*.9,t+i*.9,n+a*.9,o+r*6,s,c+a*6,{cell:qm.glow,life:.09,size:1.5+l,color:`#8fb4ff`,fadeIn:.2}),Math.random()<.3&&this.add.spawn(e,t,n,o+r*10+(Math.random()-.5)*4,s+Math.random()*2,c+a*10+(Math.random()-.5)*4,{cell:qm.spark,life:.3,size:.22,color:`#bfe0ff`,gravity:4,drag:1,stretch:3}),Math.random()<.25&&this.alpha.spawn(e+r*1.5,t,n+a*1.5,o*.6+r*3,.8,c*.6+a*3,{cell:qm.smoke,life:.6,size:.8,grow:2.6,color:`#9aa7c0`,alpha:.16,gravity:-.6,drag:2})}nitroIgnite(e,t,n,r,i){this.flash(e,t+.5,n,`#9cc2ff`,7,.2),this.shock(e,t+.2,n,`#7fa8ff`,6.5,.4),this.shock(e,t+.2,n,`#e3f0ff`,3.5,.28);for(let a=0;a<26;a+=1){let o=(Math.random()-.5)*1.4,s=10+Math.random()*14,c=Math.cos(o),l=Math.sin(o);this.add.spawn(e,t+.4,n,(r*c-i*l)*s,1+Math.random()*4,(i*c+r*l)*s,{cell:qm.spark,life:.35+Math.random()*.25,size:.26,color:a%3?`#a9c8ff`:`#ffffff`,gravity:9,drag:1.2,stretch:3.5})}}corkRing(e,t,n,r,i,a){this.shock(e,t,n,a,4.5,.35);for(let o=0;o<24;o+=1){let s=o/24*Math.PI*2,c=6+Math.random()*4;this.add.spawn(e,t+1,n,Math.cos(s)*c*i+r*8,Math.sin(s)*c,-Math.cos(s)*c*r+i*8,{cell:qm.spark,life:.45,size:.3,color:a,drag:1.8,stretch:3})}}streak(e,t,n,r,i,a,o=`#ffffff`){this.add.spawn(e,t,n,r,i,a,{cell:qm.line,life:.32,size:.22,color:o,alpha:.6,drag:0,stretch:9,fadeIn:.25})}confetti(e,t,n,r=60){let i=[`#ffcf3f`,`#ff5a36`,`#3fd0ff`,`#ffffff`,`#ff4fa3`,`#7dff8a`];for(let a=0;a<r;a+=1){let r=Math.random()*Math.PI*2,o=4+Math.random()*9;this.alpha.spawn(e,t,n,Math.cos(r)*o,6+Math.random()*9,Math.sin(r)*o,{cell:qm.confetti,life:1.8+Math.random()*1.2,size:.32+Math.random()*.2,color:i[a%i.length],gravity:7,drag:1.8,spin:(Math.random()-.5)*16,fadeIn:.02})}}explosion(e,t,n){this.flash(e,t+1,n,`#ffb45a`,14,.3),this.spray(`add`,e,t+1,n,26,14,{cell:qm.flame,life:.45,size:2.2,grow:1.8,color:`#ff8a3a`,drag:3.5,spin:3},.3),this.spray(`add`,e,t+1,n,40,22,{cell:qm.spark,life:.6,size:.7,color:`#ffd07a`,gravity:14,drag:.9,stretch:4},.35),this.spray(`alpha`,e,t+1,n,18,6,{cell:qm.smoke,life:2.2,size:3.2,grow:2.4,color:`#4a423e`,alpha:.6,gravity:-1.2,drag:1.4,spin:.8,fadeIn:.1},.5),this.shock(e,t,n,`#ff9a4a`,11,.6)}debris(e,t,n,r,i=0,a=0,o=`#2a2624`){let s=[o,`#1b1918`,`#3c3733`,`#6b6258`];for(let o=0;o<r;o+=1){let r=Math.random()*Math.PI*2,c=4+Math.random()*10;this.alpha.spawn(e,t,n,Math.cos(r)*c+i*.4,4+Math.random()*9,Math.sin(r)*c+a*.4,{cell:qm.confetti,life:1.1+Math.random()*.9,size:.3+Math.random()*.35,color:s[o%s.length],gravity:22,drag:.7,spin:(Math.random()-.5)*22,fadeIn:.01})}}engineSmoke(e,t,n,r,i,a){let o=a>.5&&Math.random()<.5?2:1;for(let s=0;s<o;s+=1){let o=a>.5?Math.random()<.5?`#1f1c1a`:`#2e2a27`:Math.random()<.5?`#6f6a66`:`#8d8782`;this.alpha.spawn(e+(Math.random()-.5)*.7,t,n+(Math.random()-.5)*.7,r*.98+(Math.random()-.5)*1.6,2.2+Math.random()*2.4,i*.98+(Math.random()-.5)*1.6,{cell:qm.smoke,life:1.4+Math.random()*1.1+a*.9,size:.95+Math.random()*.55+a*.75,grow:3.4+a*1.3,color:o,alpha:.48+a*.27,gravity:-1.4,drag:.12,spin:(Math.random()-.5)*1.4,fadeIn:.08})}}fire(e,t,n,r,i,a=1){let o=Math.ceil(a*2);for(let s=0;s<o;s+=1)this.add.spawn(e+(Math.random()-.5)*.9*a,t+Math.random()*.3,n+(Math.random()-.5)*.9*a,r+(Math.random()-.5),2.5+Math.random()*3*a,i+(Math.random()-.5),{cell:qm.flame,life:.28+Math.random()*.24,size:(.95+Math.random()*.7)*a,grow:.6,color:Math.random()<.3?`#ffd27a`:`#ff7a2a`,drag:.5,spin:(Math.random()-.5)*4,fadeIn:.06});Math.random()<.35*a&&this.add.spawn(e,t+.4,n,r*.5+(Math.random()-.5)*3,4+Math.random()*5,i*.5+(Math.random()-.5)*3,{cell:qm.spark,life:.6+Math.random()*.5,size:.28,color:`#ffb347`,gravity:3,drag:1,stretch:2}),Math.random()<.5&&this.add.spawn(e,t+.2,n,0,.5,0,{cell:qm.glow,life:.16,size:1.7*a,color:`#ff8a3a`,fadeIn:.1})}wreckBlast(e,t,n,r,i){this.explosion(e,t,n),this.flash(e,t+1.5,n,`#fff0c8`,22,.35),this.spray(`add`,e,t+1.2,n,34,18,{cell:qm.flame,life:.7,size:3.2,grow:2.2,color:`#ff7a2a`,drag:3,spin:3},.45),this.spray(`add`,e,t+1,n,60,30,{cell:qm.spark,life:.9,size:.8,color:`#ffcf6b`,gravity:16,drag:.7,stretch:4},.4),this.spray(`alpha`,e,t+2,n,26,7,{cell:qm.smoke,life:2.6,size:3.2,grow:2.2,color:`#221f1d`,alpha:.5,gravity:-2.2,drag:1.2,spin:.6,fadeIn:.12},.7),this.debris(e,t+1,n,34,r,i),this.shock(e,t,n,`#ffb45a`,18,.8),this.rings.spawn(e,t+.2,n,1,26,1.1,`#ffe2b8`)}syncItems(e,t){let n=e.track,r=new Set,i=this.seekerParts;for(let a of e.seekers){r.add(a.id);let e=this.seekerMeshes.get(a.id);if(!e){e=new K;let t=new K,n=_m(`seeker`,`length`,!1);if(n){let e=new J(n.geometry,n.material);e.scale.setScalar(2.4),t.add(e)}else{t.add(new J(i.body,i.bodyMat),new J(i.nose,i.noseMat));let e=new J(i.fin,i.finMat),n=new J(i.fin,i.finMat);n.rotation.z=Math.PI/2,t.add(e,n)}t.traverse(e=>{e.castShadow=!0}),e.add(t);let r=new sr(this.glowMat);r.scale.setScalar(2.4),r.position.z=-1,e.add(r),this.group.add(e),this.seekerMeshes.set(a.id,e)}n.frameAt($(a.odo,n.length),this.frame);let o=this.frame,s=e.position.clone();e.position.set(o.x+o.rx*a.d,o.y+o.bank*a.d+1.2+Math.sin(t*10)*.12,o.z+o.rz*a.d),e.rotation.set(0,Math.atan2(o.tx,o.tz),0),e.children[0].rotation.z=t*9;let c=-o.tx,l=-o.tz;this.add.spawn(e.position.x+c*1.1,e.position.y,e.position.z+l*1.1,c*6,0,l*6,{cell:qm.flame,life:.12,size:.8,grow:.5,color:`#ff9a4a`,drag:4}),s.distanceToSquared(e.position)<400&&this.alpha.spawn(e.position.x+c*1.3,e.position.y,e.position.z+l*1.3,Math.random()-.5,.5,Math.random()-.5,{cell:qm.smoke,life:1.1,size:.7,grow:3.4,color:`#bdb3aa`,alpha:.4,gravity:-.4,drag:1.2,spin:1})}for(let[e,t]of this.seekerMeshes)r.has(e)||(this.group.remove(t),this.seekerMeshes.delete(e));let a=0;for(let r of e.seekers){if(!r.locked)continue;let i=e.cars[r.target];if(!i)continue;let o=this.lockMarkers[a];if(!o){o=new K;let e=new J(this.quad,this.lockRingMat);e.renderOrder=10;let t=new J(this.beamGeo,this.beamMat);t.position.y=12,o.add(e,t),this.lockMarkers.push(o),this.group.add(o)}n.frameAt($(i.loc.s+6,n.length),this.frame);let s=this.frame;o.visible=!0,o.position.set(s.x+s.rx*r.lockD,s.y+s.bank*r.lockD+.14,s.z+s.rz*r.lockD);let c=1+Math.sin(t*14)*.12;o.children[0].scale.setScalar(2.3*c),this.lockRingMat.opacity=.75+Math.sin(t*14)*.25,a+=1}for(let e=a;e<this.lockMarkers.length;e+=1)this.lockMarkers[e].visible=!1;let o=new Set,s=this.mineParts;for(let n of e.mines){o.add(n.id);let e=this.mineMeshes.get(n.id);if(!e){e=new K;let t=_m(`mine`,`radius`,!1);if(t){let n=new J(t.geometry,t.material);n.scale.setScalar(1.15),n.position.y=.05,n.castShadow=!0,e.add(n)}else{let t=new J(s.body,s.metal);t.castShadow=!0,e.add(t),e.add(new J(s.cap,s.dark))}for(let n=0;n<(t?0:8);n+=1){let t=new J(s.spike,s.metal),r=n/8*Math.PI*2;t.position.set(Math.cos(r)*.95,0,Math.sin(r)*.95),t.rotation.set(0,0,0),t.lookAt(Math.cos(r)*3,.4,Math.sin(r)*3),t.rotateX(Math.PI/2),e.add(t)}let r=new sr(this.glowMat);r.position.y=.5,r.scale.setScalar(1.8),e.add(r);let i=new J(this.quad,this.mineRingMat);i.scale.setScalar(2.8),i.position.y=-.18,i.renderOrder=10,e.add(i),e.position.set(n.x,n.y+.3,n.z),e.userData.glow=r,e.userData.ring=i,this.group.add(e),this.mineMeshes.set(n.id,e)}let r=n.arm<=0,i=Math.floor(t*(r?4:10))%2==0;e.userData.glow.visible=i,e.userData.ring.visible=r,r&&e.userData.ring.scale.setScalar(2.8+Math.sin(t*5)*.15),e.rotation.y=t*.8}for(let[e,t]of this.mineMeshes)o.has(e)||(this.group.remove(t),this.mineMeshes.delete(e))}update(e){this.add.update(e),this.alpha.update(e),this.rings.update(e)}clear(){for(let e of this.seekerMeshes.values())this.group.remove(e);for(let e of this.mineMeshes.values())this.group.remove(e);this.seekerMeshes.clear(),this.mineMeshes.clear();for(let e of this.lockMarkers)e.visible=!1;this.add.clear(),this.alpha.clear(),this.rings.clear()}},th={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0},nh=class{carId;skill;rand;lane=0;laneTimer=0;launchAt;itemHold=0;itemPulse=!1;dodgeDecided=!1;dodgeWill=!1;boostHold=!1;recoverPulse=!1;latA;driftSkill;pace;constructor(e,t,n,r=1){this.carId=e,this.skill=t,this.rand=Pd(n*31+e*977+5),this.launchAt=t===`pro`?.1+this.rand()*.3:.1+this.rand()*.9,this.latA=t===`pro`?31:25,this.driftSkill=t===`pro`?.9:.5,this.pace=Math.min(1,Math.max(.72,r*(t===`pro`?1:.94)))}think(e){let t=e.cars[this.carId],n=e.track,r=_p();if(e.phase===`countdown`)return r.throttle=+(e.countdown<=this.launchAt),r;if(t.recovering>0||t.wreck>0)return r;if(t.hold>0)return r.throttle=+(t.hold<=this.launchAt),r;if(this.recoverPulse)return this.recoverPulse=!1,r;if((t.stuck>1.6||t.wrongWay>2.5)&&!t.progress.finished)return this.recoverPulse=!0,r.recover=!0,r;let i=Math.max(0,t.vF),a=t.loc.s,o=t.loc.halfW;this.laneTimer-=ap,this.laneTimer<=0&&(this.lane=(this.rand()-.5)*2*(o-3)*.55,this.laneTimer=2+this.rand()*3);let s=this.lane;for(let e of n.pads){let t=Md(e.s-a,n.length);t>8&&t<70&&(this.skill===`pro`||e.index%2==0)&&(s=e.d)}for(let r of e.cars){if(r===t)continue;let e=Md(r.loc.s-a,n.length);e>2&&e<18&&Math.abs(r.loc.d-s)<3&&r.vF<i+2&&(s=r.loc.d+(r.loc.d>0?-4.5:4.5))}for(let t of e.mines){let e=Md(t.s-a,n.length);e>0&&e<55&&Math.abs(t.d-s)<3.6&&(s=t.d+(t.d>0?-4.8:4.8))}t.warnLocked?(this.dodgeDecided||(this.dodgeDecided=!0,this.dodgeWill=this.rand()<(this.skill===`pro`?.85:.5)),this.dodgeWill&&(s=t.warnLockD+(t.warnLockD>0?-5.5:5.5))):this.dodgeDecided=!1,s=Q(s,-o+2.2,o-2.2);let c=9+i*.42;n.frameAt(a+c,th);let l=th.x+th.rx*s,u=th.z+th.rz*s,d=jd(Math.atan2(l-t.x,u-t.z)-t.yaw);r.steer=Q(-d*2.4,-1,1);let f=n.maxCurvature(a,4,22+i*1.5),p=this.latA*Gf.race.aiPace*(t.drift?1.35:1),m=Math.sqrt(p/Math.max(f,1e-4));for(let e=0;e<=30+i*1.2;e+=6){let t=n.sampleIndex(a+e),r=n.bank[t];if(Math.abs(r)<.25)continue;let i=Math.abs(n.curv[t]),o=Math.abs(r)/Math.sqrt(1+r*r);m=Math.max(m,Math.sqrt((p+Gf.car.gravity*o*1.1)/Math.max(i,1e-4)),Ip(r,i)*1.3+4)}m=Math.min(m,Gf.car.maxSpeed*this.pace),i>m+3?r.brake=Q((i-m)/14,.15,1):r.throttle=1;let h=n.sampleIndex(a+12),g=Math.abs(n.curv[h]),_=n.curv[h]<0?1:-1;if(t.drift){let e=n.maxCurvature(a,0,20),o=!1;for(let e of[6,16,28]){let r=n.curv[n.sampleIndex(a+e)];Math.abs(r)>1/400&&(r<0?1:-1)!==t.driftDir&&(o=!0)}let s=e>1/130&&t.driftTier<3&&!o;if(r.drift=s,s){let e=Q((i*Math.abs(n.curv[n.sampleIndex(a+8)])-Gf.car.driftBase)/Gf.car.driftSteer,-1,1);r.steer=Q(t.driftDir*e+Q(-d*1.5,-.7,.7),-1,1),r.throttle=1,r.brake=0}}else{let e=n.curv[n.sampleIndex(a+34)],o=Math.abs(e)<1/400||(e<0?1:-1)===_;g>1/75&&i>28&&t.grounded&&o&&this.rand()<this.driftSkill*.25&&(r.drift=!0,r.steer=_)}if(!t.grounded&&t.trick===0&&t.tricks===0&&t.airTime>.1&&t.vy>3){let e=Gf.car.gravity,n=Math.max(0,t.y-t.loc.roadY);(t.vy+Math.sqrt(t.vy*t.vy+2*e*n))/e>.7&&this.rand()<(this.skill===`pro`?.2:.06)&&(r.drift=!0)}let v=n.maxCurvature(a,0,140)<1/260,y=n.corkAhead(a,60);if(r.boost=this.pace>.82&&t.meter>=1&&t.nitro<=0&&t.grounded&&(v&&t.cork<0&&y.index<0||y.index>=0&&t.vF<46||t.cork>=0&&t.vF<34)&&!this.boostHold,this.boostHold=r.boost,t.item){this.itemHold+=ap;let i=!1;t.item===`canister`?i=this.itemHold>.5:t.item===`shield`?i=t.warnSeeker>=0&&t.warnSeeker<160:t.item===`seeker`?i=t.place>1&&this.itemHold>1.2:t.item===`mine`&&(i=e.cars.some(e=>e!==t&&$(t.loc.s-e.loc.s,n.length)<60&&Math.abs(e.loc.d-t.loc.d)<5)&&this.itemHold>.6||this.itemHold>9),i&&!this.itemPulse?(r.item=!0,this.itemPulse=!0,this.itemHold=0):this.itemPulse=!1}else this.itemHold=0,this.itemPulse=!1;return r}},rh={off:0,light:.5,strong:1},ih={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0},ah=3.2,oh=30;function sh(e,t,n,r,i=1){if(r&&(r.level=0),!(i>0))return;let a=Math.min(1,i);if(!e.grounded||e.cork>=0||e.recovering>0||e.wreck>0||e.hold>0||e.spin>0||e.progress.finished||e.progress.dnf)return;let o=e.vF;if(o<9)return;let s=e.loc.s,c=e.loc.i;if(Math.cos(jd(e.yaw-t.heading[c]))<.4)return;let l=e.loc.halfW,u=e.loc.d,d=Q(n.steer,-1,1),f=0;t.frameAt(s,ih);let p=e.vx*ih.rx+e.vz*ih.rz,m=l-Math.abs(u),h=Math.sign(u)!==0&&Math.sign(p)===Math.sign(u)&&Math.abs(p)>.6,g=0,_=Q(u,-(l-2.6),l-2.6);m<ah&&h&&(g=Q((ah-m)/ah,0,1)*.75*a,_=Math.sign(u)*Math.max(0,l-4.6));let v=8+o*.38;t.frameAt(s+v,ih);let y=ih.x+ih.rx*_,b=ih.z+ih.rz*_,x=Q(-jd(Math.atan2(y-e.x,b-e.z)-e.yaw)*2.2,-1,1);if(!e.drift){let e=0;if(Math.abs(x)>.12&&t.maxCurvature(s,0,18+o*.8)>1/320&&(Math.abs(d)<.15||d*x>0)&&(e=(Math.abs(d)<Math.abs(x)?.5:.15)*a),e=Math.max(e,g),e>0){let t=d+(x-d)*e;f=Math.max(f,Math.min(1,Math.abs(t-d)*1.6)),n.steer=Q(t,-1,1)}}else if(g>0){let e=Q(d+(x-d)*g*.5,-1,1);f=Math.max(f,Math.min(1,Math.abs(e-d)*1.6)),n.steer=e}if(e.nitro<=0&&!e.drift&&n.throttle>0&&n.brake<=0){let e=t.maxCurvature(s,4,22+o*1.5),r=Math.sqrt(oh/Math.max(e,1e-4));for(let e=0;e<=30+o*1.2;e+=6){let n=t.sampleIndex(s+e),i=t.bank[n];if(Math.abs(i)<.25)continue;let a=Math.abs(t.curv[n]),o=Math.abs(i)/Math.sqrt(1+i*i);r=Math.max(r,Math.sqrt((oh+Gf.car.gravity*o*1.1)/Math.max(a,1e-4)),Ip(i,a)*1.3+4)}t.corkAhead(s,90).index>=0&&(r=1/0);let i=o-r;i>(a>=1?4:8)&&(n.throttle=0,a>=1&&i>10&&(n.brake=Q((i-10)/20,.1,.5)),f=Math.max(f,Q(i/16,.3,1)))}r&&(r.level=f)}function ch(e,t,n,r){if(r&&(r.level=0),!e.grounded||e.cork>=0||e.recovering>0||e.wreck>0||e.hold>0||e.spin>0||e.progress.finished||e.progress.dnf||e.vF<5||e.drift)return;let i=e.loc.s;t.frameAt(i,ih);let a=9+e.vF*.28;t.frameAt(i+a,ih);let o=ih.x,s=ih.z,c=Q(-jd(Math.atan2(o-e.x,s-e.z)-e.yaw)*2.8,-1,1),l=Q(-e.loc.d/Math.max(2,e.loc.halfW-2.2),-1,1),u=Q(c*.62+l*.58,-1,1),d=Q(n.steer,-1,1),f=d+(u-d)*.42;n.steer=Q(f,-1,1),n.drift=!1,r&&(r.level=Math.min(1,Math.abs(f-d)*1.5))}var lh=[-5,0,5],uh=2.6,dh=2.3,fh=class{track;cars;items;boxes=[];seekers=[];mines=[];events=[];phase=`countdown`;clock=-3;tick=0;order=[];rand;nextId=1;constructor(e){this.track=e.track,this.items=e.items,this.rand=Pd(e.seed),this.cars=[];for(let t=0;t<e.cars;t+=1){let n=e.slots?.[t]??t;this.cars.push(vp(t,this.track,lh[n%lh.length]*Q(this.track.halfW[0]/10,.8,1.2),-14-Math.floor(n/3)*10,e.tunes?.[t]))}if(this.order=this.cars.map(e=>e.id),e.items){let e={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};for(let t of this.track.items){this.track.frameAt(t.s,e);for(let n of t.lanes)this.boxes.push({row:t.index,lane:n,x:e.x+e.rx*n,y:e.y+e.bank*n+1.3,z:e.z+e.rz*n,respawn:0})}}}get countdown(){return this.phase===`countdown`?-this.clock:0}drainEvents(){return this.events.splice(0,this.events.length)}exportState(){return{tick:this.tick,clock:this.clock,phase:this.phase,cars:structuredClone(this.cars)}}importState(e){this.tick=e.tick,this.clock=e.clock,this.phase=e.phase;for(let t=0;t<this.cars.length&&t<e.cars.length;t+=1)Object.assign(this.cars[t],structuredClone(e.cars[t]))}step(e){if(this.phase!==`finished`){if(this.tick+=1,this.phase===`countdown`){this.clock+=ap;for(let t of this.cars)xp(t,e[t.id],-this.clock);if(this.clock>=-1e-9){this.clock=0,this.phase=`racing`,this.events.push({type:`go`,car:-1});for(let e of this.cars)Sp(e,this.events)}return}this.clock+=ap;for(let t of this.cars)jp(t,e[t.id],this.track,this.events);this.collide(),this.draft(),this.gates(),this.items&&this.stepItems(),this.standings();for(let e of this.cars)ep(e.progress,this.clock)&&this.events.push({type:`dnf`,car:e.id});this.cars.every(e=>e.progress.finished||e.progress.dnf)&&(this.phase=`finished`,this.events.push({type:`raceOver`,car:-1}))}}collide(){let e=this.cars;for(let t=0;t<e.length;t+=1){let n=e[t];if(!(Cp(n)||n.ghostT>0))for(let r=t+1;r<e.length;r+=1){let t=e[r];if(Cp(t)||t.ghostT>0||Math.abs(n.y-t.y)>1.6)continue;let i=t.x-n.x,a=t.z-n.z,o=i*i+a*a,s=op*2;if(o>=s*s||o<1e-8)continue;let c=Math.sqrt(o),l=i/c,u=a/c,d=(s-c)/2;n.x-=l*d,n.z-=u*d,t.x+=l*d,t.z+=u*d;let f=(t.vx-n.vx)*l+(t.vz-n.vz)*u;if(f<0){let e=-f*1.3/2;if(n.vx-=l*e,n.vz-=u*e,t.vx+=l*e,t.vz+=u*e,-f>3&&this.events.push({type:`bump`,car:n.id,other:t.id,value:-f}),-f>14){let e=(-f-14)/40;wp(n,e,this.events,gp.car),wp(t,e,this.events,gp.car)}}}}}draft(){for(let e of this.cars){let t=!1;if(e.grounded&&e.vF>25&&!Cp(e)){let n=Math.sin(e.yaw),r=Math.cos(e.yaw);for(let i of this.cars){if(i===e||Cp(i)||i.vF<20)continue;let a=i.x-e.x,o=i.z-e.z,s=a*n+o*r,c=Math.abs(a*-r+o*n);if(s>5&&s<32&&c<3.5&&Math.abs(i.y-e.y)<3){t=!0;break}}}e.draftCharge=t?Math.min(1.2,e.draftCharge+ap):Math.max(0,e.draftCharge-ap*2);let n=e.drafting;e.drafting=e.draftCharge>=.8,e.drafting&&(e.meter=Math.min(1,e.meter+.08*ap),e.stats.draftTime+=ap),e.drafting&&!n&&this.events.push({type:`draft`,car:e.id})}}gates(){let e=this.track.length;for(let t of this.cars){let n=t.progress;if(n.finished||n.dnf||Cp(t)||t.lastDs<=0)continue;let r=this.track.gates[Yf(n)];if(!Zf(t.prevS,t.lastDs,r.s,e)||Math.abs(t.loc.d)>t.loc.barrier+1.5)continue;let i=Qf(n,this.clock);this.events.push({type:i,car:t.id,value:n.gates})}}standings(){let e=this.track.length,t=this.cars.map(t=>({id:t.id,progress:t.progress,toNext:$(this.track.gates[Yf(t.progress)].s-t.loc.s,e)}));t.sort(tp),this.order=t.map(e=>e.id),t.forEach((e,t)=>this.cars[e.id].place=t+1)}rollItem(e){let t=this.rand();return e.place===1?t<.4?`mine`:t<.7?`shield`:`canister`:t<.32?`seeker`:t<.6?`mine`:t<.8?`shield`:`canister`}stepItems(){let e=Gf.race.itemRespawn;for(let t of this.boxes){if(t.respawn>0){t.respawn=Math.max(0,t.respawn-ap);continue}for(let n of this.cars){if(Cp(n))continue;let r=n.x-t.x,i=n.z-t.z;if(!(r*r+i*i>2.7*2.7||Math.abs(n.y+.8-t.y)>3)){t.respawn=e,this.events.push({type:`box`,car:n.id,value:this.boxes.indexOf(t)}),n.item||(n.item=this.rollItem(n),this.events.push({type:`item`,car:n.id,value:[`seeker`,`mine`,`shield`,`canister`].indexOf(n.item)}));break}}}for(let e of this.cars){if(!e.itemRequest)continue;e.itemRequest=!1;let t=e.item;if(t){if(e.item=null,e.stats.itemsUsed+=1,t===`shield`)e.shield=8,this.events.push({type:`useShield`,car:e.id});else if(t===`canister`)e.meter=1,this.events.push({type:`useCanister`,car:e.id});else if(t===`mine`){let t=Math.sin(e.yaw),n=Math.cos(e.yaw),r=e.x-t*4.5,i=e.z-n*4.5,a={...e.loc};this.track.locate(r,e.y,i,e.loc.i,a),this.mines.push({id:this.nextId++,owner:e.id,x:r,y:a.onSurface?a.roadY:e.y,z:i,s:a.s,d:a.d,arm:.6,life:30}),this.mines.length>8&&this.mines.shift(),this.events.push({type:`useMine`,car:e.id})}else{let t=this.order.indexOf(e.id),n=t>0?this.order[t-1]:-1,r=n>=0?this.cars[n]:null,i=r?$(r.loc.s-e.loc.s,this.track.length):0,a=r?r.odo-Math.max(4,i):e.odo+3;this.seekers.push({id:this.nextId++,owner:e.id,target:n,odo:a,d:e.loc.d,speed:85,locked:!1,lockD:0,life:r?14:3}),this.events.push({type:`useSeeker`,car:e.id,other:n})}}}for(let e of this.cars)e.warnSeeker=-1,e.warnLocked=!1,e.warnMine=-1;for(let e=this.seekers.length-1;e>=0;--e){let t=this.seekers[e];t.life-=ap;let n=t.target>=0?this.cars[t.target]:null;if(!n){t.odo+=t.speed*ap,t.life<=0&&(this.seekers.splice(e,1),this.events.push({type:`fizzle`,car:t.owner}));continue}if(Cp(n)||n.progress.finished||t.life<=0){this.seekers.splice(e,1),this.events.push({type:`fizzle`,car:t.owner});continue}t.speed=Math.max(80,n.vF+42);let r=t.speed-n.vF;t.odo+=t.speed*ap;let i=n.odo-t.odo;if(t.locked?t.d+=Q(t.lockD-t.d,-20*ap,20*ap):(t.d+=Q(n.loc.d-t.d,-10*ap,10*ap),i<r*.8&&(t.locked=!0,t.lockD=n.loc.d,this.events.push({type:`seekerLock`,car:n.id,other:t.owner}))),n.warnSeeker=n.warnSeeker<0?Math.max(0,i):Math.min(n.warnSeeker,Math.max(0,i)),t.locked&&(n.warnLocked=!0,n.warnLockD=t.lockD),i<=0){this.seekers.splice(e,1);let r=Math.abs(n.loc.d-t.lockD)<uh,i=n.y-n.loc.roadY<2;r&&i&&n.immune<=0?this.hit(n,t.owner,`seeker`):(n.stats.dodges+=1,this.events.push({type:`dodged`,car:n.id,other:t.owner}))}}let t=this.track.length;for(let e=this.mines.length-1;e>=0;--e){let n=this.mines[e];if(n.life-=ap,n.arm=Math.max(0,n.arm-ap),n.life<=0){this.mines.splice(e,1);continue}let r=null;for(let e of this.cars){if(Cp(e))continue;let i=Md(n.s-e.loc.s,t);if(i>0&&i<90&&Math.abs(n.d-e.loc.d)<6&&(e.warnMine=e.warnMine<0?i:Math.min(e.warnMine,i)),n.arm>0||e.immune>0)continue;let a=e.x-n.x,o=e.z-n.z;if(a*a+o*o<dh*dh&&e.y-n.y<1.8){r=e;break}}r&&(this.mines.splice(e,1),this.hit(r,n.owner,`mine`))}}hit(e,t,n){if(e.shield>0){e.shield=0,e.immune=.8,e.stats.blocks+=1,this.events.push({type:`blocked`,car:e.id,other:t});return}e.spin=1,e.vx*=.45,e.vz*=.45,e.drift=!1,e.driftCharge=0,e.trick=0,e.immune=2,e.stats.hits+=1,this.events.push({type:`hit`,car:e.id,other:t}),wp(e,.3,this.events,gp.item)}digest(){let e=[this.phase,this.tick.toString(),this.clock.toFixed(6)];for(let t of this.cars)e.push([t.x,t.y,t.z,t.yaw,t.vx,t.vz,t.vy,t.meter,t.boostTime,t.damage,t.wreck,t.hold].map(e=>e.toFixed(6)).join(`,`),String(t.progress.gates),String(t.item),t.progress.penalty.toFixed(3));return e.push(String(this.seekers.length),String(this.mines.length),this.boxes.map(e=>e.respawn.toFixed(3)).join(`,`)),e.join(`|`)}},ph=new H(0,1,0),mh=new ze,hh=new ze,gh=class{camera=new qa(68,1,.3,4200);yaw=0;pos=new H;look=new H;height=0;fov=68;shake=0;loc=Kd();reducedMotion=!1;shakeEnabled=!0;reset(e,t,n,r){this.yaw=r,this.height=t,this.roll=0,this.corkW=0,this.camera.up.set(0,1,0);let i=Gf.camera.distance;this.pos.set(e-Math.sin(r)*i,t+Gf.camera.height,n-Math.cos(r)*i),this.look.set(e,t+1.2,n),this.camera.position.copy(this.pos),this.camera.lookAt(this.look)}kick(e){this.shakeEnabled&&!this.reducedMotion&&(this.shake=Math.min(1,this.shake+e))}air=0;roll=0;corkW=0;cf=zd();cn=new H(0,1,0);cfw=new H(0,0,1);update(e,t,n,r,i,a,o){let s=a?Math.hypot(a.vx,a.vz):0,c=i;a&&s>6&&(c=i+jd(Math.atan2(a.vx,a.vz)-i)*(a.drift?.55:.35)),a&&a.spin>0&&(c=this.yaw);let l=1-Math.exp(-e*Gf.camera.follow*(a&&!a.grounded?.5:1));this.yaw+=jd(c-this.yaw)*l,this.height+=(n-this.height)*(1-Math.exp(-e*(a&&!a.grounded?3:10))),this.height=Q(this.height,n-2.2,n+1.6);let u=a&&!a.grounded?Q((n-a.loc.roadY)/12,0,1):0,d=!!a&&(a.boostTime>0||a.meterBoosting);this.air+=(u-this.air)*(1-Math.exp(-e*3));let f=Gf.camera.distance+Q(s/70,0,1)*1.6+(d?.8:0)+this.air*3.5,p=new H(t-Math.sin(this.yaw)*f,this.height+Gf.camera.height+Q(s/80,0,1)*.5+this.air*1.8,r-Math.cos(this.yaw)*f);o.locate(p.x,p.y,p.z,a?a.loc.i:0,this.loc);let m=Math.abs(o.bank[this.loc.i]??0),h=m>.45?Math.min(this.loc.barrier-.8,o.pavedW(this.loc.i)-1.8):this.loc.barrier-.8;if(Math.abs(this.loc.d)>h){let e=Math.abs(this.loc.d)-h,t=Math.sign(this.loc.d);p.x-=this.loc.rx*t*e,p.z-=this.loc.rz*t*e,this.loc.roadY-=o.bank[this.loc.i]*t*e}let g=this.loc.roadY+1.2+Math.min(m,2)*.9;p.y<g&&(p.y=g),this.look.set(t+Math.sin(this.yaw)*4,(this.height+n)/2+1.3-this.air*1.2,r+Math.cos(this.yaw)*4);let _=!!a&&a.cork>=0&&a.wreck<=0;if(_&&a){let e=o.corkFrame(o.corks[a.cork],a.loc.s,a.loc.d,this.cf);this.cn.set(e.nx,e.ny,e.nz),this.cfw.set(e.fx,e.fy,e.fz)}this.corkW+=(+!!_-this.corkW)*(1-Math.exp(-e*(_?5:2.5))),this.corkW<.002&&(this.corkW=0);let v=this.corkW*this.corkW*(3-2*this.corkW);if(v>0){let e=Gf.camera.distance+Q(s/70,0,1)*1.2,i=Gf.camera.height+.2,a=t-this.cfw.x*e+this.cn.x*i,o=n-this.cfw.y*e+this.cn.y*i,c=r-this.cfw.z*e+this.cn.z*i;p.set(kd(p.x,a,v),kd(p.y,o,v),kd(p.z,c,v)),this.look.set(kd(this.look.x,t+this.cfw.x*6+this.cn.x*1.1,v),kd(this.look.y,n+this.cfw.y*6+this.cn.y*1.1,v),kd(this.look.z,r+this.cfw.z*6+this.cn.z*1.1,v))}if(this.pos.lerp(p,1-Math.exp(-e*(v>.2?20:14))),this.camera.position.copy(this.pos),this.shake>.001){let t=this.shake*.35;this.camera.position.x+=(Math.random()-.5)*t,this.camera.position.y+=(Math.random()-.5)*t,this.shake*=Math.exp(-e*7)}let y=v*(this.reducedMotion?.35:1);y>0?(mh.setFromUnitVectors(this.cn.normalize(),ph),hh.identity().slerp(mh,1-y),this.camera.up.copy(this.cn).applyQuaternion(hh).normalize()):this.camera.up.set(0,1,0),this.camera.lookAt(this.look);let b=0;if(a&&!this.reducedMotion&&a.wreck<=0){let e=a.loc.i,t=Math.cos(jd(a.yaw-o.heading[e]))>0?-1:1;b=Math.atan(o.bank[e]??0)*t*(a.grounded?.5:.3)}b*=1-v,this.roll+=(b-this.roll)*(1-Math.exp(-e*3.5)),Math.abs(this.roll)>1e-4&&this.camera.rotateZ(-this.roll);let x=this.reducedMotion?0:Q(s/70,0,1)*10+(d?7:0)+v*6;this.fov+=(Gf.camera.fov+x-this.fov)*(1-Math.exp(-e*4)),Math.abs(this.camera.fov-this.fov)>.05&&(this.camera.fov=this.fov,this.camera.updateProjectionMatrix())}},_h=2.4,vh=2,yh=class{seat;model;constructor(e,t,n,r,i){this.seat=e;let a=i?{name:i.name,primary:i.primary,secondary:i.secondary,accent:i.accent,finish:i.paintFinish,pattern:i.paintPattern,stripe:i.aero!==`clean`,bodyKit:i.bodyKit,hood:i.hood,spoiler:i.spoiler,wheels:i.wheels}:void 0;this.model=new mm(n,r,!0,t,a)}},bh=class{world;input;audio;hooks;sim;mode;track;trackId;racers;humans=[];cams=[];models=[];fx=new eh;group=new K;online;stableMode=!1;ai;inputs;prev;cf=zd();lastMeter=[1,1,1];tmpM=new H;curr;engines=[];ghosts=new Map;ghostSmooth=new Map;history=[];time=0;lastCount=4;ending=-1;done=!1;autopilot;wallRide=[0,0];styles=[];lastHold=[0,0];lastPlace=[];tmpV=new H;paused=!1;reducedMotion=!1;assistModes=[`strong`,`strong`];assistUsed=[];assistLaps=[];assistLevel=[];assistOut={level:0};results=null;repairsLeft=2;assistMode(e){let t=this.humans.indexOf(e);return t<0?`off`:this.assistModes[t]??`off`}constructor(e,t,n,r,i){this.world=t,this.input=n,this.audio=r,this.hooks=i,this.mode=e.mode,this.track=e.track,this.trackId=e.trackId,this.racers=e.racers,this.online=e.online;let a=e.online?[e.online.seat]:void 0;this.sim=new fh({track:e.track,cars:e.racers.length,seed:e.seed,items:e.items,slots:a,tunes:e.racers.map(e=>e.tune)}),this.ai=e.racers.map((t,n)=>new nh(n,t.human?`relaxed`:e.aiSkill,e.seed,e.aiPace)),this.autopilot=e.racers.map(()=>!1),this.inputs=e.racers.map(()=>_p()),e.racers.forEach((e,t)=>{e.human&&this.humans.push(t);let n=new mm(e.chassis,e.livery,!1,e.customName??e.name,e.customLivery);this.models.push(n),this.group.add(n.root)}),this.prev=this.sim.cars.map(e=>({x:e.x,y:e.y,z:e.z,yaw:e.yaw})),this.curr=this.sim.cars.map(e=>({x:e.x,y:e.y,z:e.z,yaw:e.yaw}));for(let e of this.humans){let t=new gh,n=this.sim.cars[e];t.reset(n.x,n.y,n.z,n.yaw),this.cams.push(t)}this.group.add(this.fx.group),t.scene.add(this.group);for(let e=0;e<this.sim.cars.length;e+=1)this.engines.push(r.engine(this.racers[e].human?1:.55));this.humans.forEach((e,t)=>{let n=new Km;n.onBank=e=>{e>0&&(this.hooks.popup(t,`STYLE +${e.toLocaleString(`en-US`)}`,`great`),this.audio.play(`style`,.8),this.juice(t,`bank`,e))},this.styles.push(n),this.lastPlace[t]=this.sim.cars[e].place})}styleOf(e){return this.styles[e]?.snapshot()??null}juice(e,t,n){e>=0&&this.hooks.juice?.(e,t,n)}style(e,t,n=1){e>=0&&this.styles[e]?.add(t,n)}get phase(){return this.done?`done`:this.ending>=0?`ending`:this.sim.phase===`countdown`?`countdown`:`racing`}repair(e=0){let t=this.humans[e],n=t===void 0?void 0:this.sim.cars[t];return!n||this.repairsLeft<=0||n.damage<=0||n.progress.finished||n.progress.dnf?!1:(--this.repairsLeft,n.damage=0,n.wreck=0,n.recovering=0,n.hold=0,n.immune=Math.max(n.immune,1.5),n.spin=0,this.audio.play(`recover`,.9),this.hooks.popup(e,`FIELD REPAIR · ${this.repairsLeft} LEFT`,`great`),this.juice(e,`recover`),!0)}step(){if(!this.done){if(this.online){let e=this.online.targetTick();if(this.sim.tick>e+1)return;let t=0;do this.stepOnce(),t+=1;while(this.sim.tick<e-1&&t<240&&!this.done);this.applyResync();return}this.stepOnce()}}stepOnce(){let e=this.sim;for(let t=0;t<this.prev.length;t+=1){e.cars[t];let n=this.prev[t],r=this.curr[t];n.x=r.x,n.y=r.y,n.z=r.z,n.yaw=r.yaw}for(let t=0;t<e.cars.length;t+=1){let n=this.racers[t],r=e.cars[t];if(n.human&&!this.autopilot[t]&&!this.paused){this.input.carInput(n.device??`auto`,this.inputs[t]),this.assistOut.level=0;let e=this.assistMode(t);e===`off`?this.assistOut.level=0:(sh(r,this.track,this.inputs[t],this.assistOut,rh[e]),this.sim.phase===`racing`&&!r.progress.finished&&(this.assistUsed[t]=!0,(this.assistLaps[t]??=[])[r.progress.lapTimes.length]=!0)),this.stableMode&&t===0&&ch(r,this.track,this.inputs[t],this.assistOut);let i=this.assistLevel[t]??0;this.assistLevel[t]=this.assistOut.level>i?this.assistOut.level:i*.9,this.online&&Mf(this.inputs[t])}else n.human&&this.paused?Object.assign(this.inputs[t],_p()):Object.assign(this.inputs[t],this.ai[t].think(e));n.human&&(r.progress.finished||r.progress.dnf)&&!this.autopilot[t]&&(this.autopilot[t]=!0)}if(this.online){Mf(this.inputs[0]);let t=Nf(this.inputs[0]);this.history[e.tick+1]=t,this.online.pushInput(e.tick+1,t)}e.step(this.inputs),this.online&&this.online.recordCheck(e.tick,If(e.cars[0]));for(let t=0;t<e.cars.length;t+=1){let n=e.cars[t],r=this.curr[t];r.x=n.x,r.y=n.y,r.z=n.z,r.yaw=n.yaw,(n.recovering>.5||Math.hypot(r.x-this.prev[t].x,r.z-this.prev[t].z)>12)&&(this.prev[t].x=r.x,this.prev[t].y=r.y,this.prev[t].z=r.z,this.prev[t].yaw=r.yaw)}for(let t of e.drainEvents())this.onEvent(t);this.checkEnd()}applyResync(){let e=this.online?.takeResync();if(!e)return;let t=this.sim.tick;if(e.tick>t)return;this.sim.importState(e);let n=_p();for(;this.sim.tick<t;){let e=this.history[this.sim.tick+1]??0;this.sim.step([Pf(e,n)]),this.online?.recordCheck(this.sim.tick,If(this.sim.cars[0]))}this.sim.drainEvents();let r=this.sim.cars[0];this.curr[0]={x:r.x,y:r.y,z:r.z,yaw:r.yaw},this.prev[0]={...this.curr[0]}}setStableMode(e){this.stableMode=e,e&&this.inputs[0]&&(this.inputs[0].drift=!1)}checkEnd(){this.ending>=0||this.done||(this.humans.every(e=>{let t=this.sim.cars[e].progress;return t.finished||t.dnf})||this.sim.phase===`finished`)&&(this.ending=0)}fastForward(){let e=0;for(;this.sim.phase!==`finished`&&e<19800;){for(let e=0;e<this.sim.cars.length;e+=1)Object.assign(this.inputs[e],this.ai[e].think(this.sim));this.sim.step(this.inputs),this.sim.drainEvents(),e+=1}}finish(){if(this.done)return;this.done=!0,this.online||this.fastForward();let e=[...this.sim.cars.map((e,t)=>({id:t,name:this.racers[t].name,chassis:this.racers[t].chassis,livery:this.racers[t].livery,customName:this.racers[t].customName,human:this.racers[t].human,humanIndex:this.humans.indexOf(t),place:0,finished:e.progress.finished,dnf:e.progress.dnf||!e.progress.finished,total:e.progress.finished?Xf(e.progress):1/0,penalty:e.progress.penalty,bestLap:np(e.progress),lapTimes:[...e.progress.lapTimes],assisted:this.racers[t].human&&this.assistUsed[t]===!0,lapAssist:e.progress.lapTimes.map((e,n)=>this.racers[t].human&&this.assistLaps[t]?.[n]===!0),gates:e.progress.gates,recoveries:e.progress.recoveries,stats:{...e.stats}}))].sort((e,t)=>e.finished===t.finished?e.finished?e.total-t.total:t.gates-e.gates:e.finished?-1:1);e.forEach((e,t)=>e.place=t+1),this.results=e;for(let e of this.engines)e.silence();this.hooks.finished(e)}viewOf(e){return this.humans.indexOf(e)}near(e){let t=this.sim.cars[e];if(!t)return 0;let n=1/0;for(let e of this.humans){let r=this.sim.cars[e];n=Math.min(n,Math.hypot(r.x-t.x,r.z-t.z))}return Q(1-n/70,0,1)}sfx(e,t,n=1){if(t<0)return this.audio.play(e,n);let r=this.viewOf(t)>=0?1:this.near(t)*.6;r>.05&&this.audio.play(e,n*r)}onEvent(e){let t=this.viewOf(e.car),n=e.car>=0?this.sim.cars[e.car]:null,r=(e,n)=>t>=0&&this.hooks.popup(t,e,n),i=this.fx;switch(e.type){case`go`:this.audio.play(`go`),this.humans.forEach((e,t)=>this.juice(t,`go`));break;case`launchPerfect`:r(`PERFECT START!`,`great`),this.sfx(`launchPerfect`,e.car),this.style(t,`launch`),n&&(i.burst(n.x,n.y+.5,n.z,24,8,`#7ef9ff`,.25,.6,4),i.shock(n.x,n.y,n.z,`#7ef9ff`,6,.45)),this.juice(t,`boost`,2);break;case`launchEarly`:r(`TOO EARLY — WHEELSPIN`,`bad`),this.sfx(`launchEarly`,e.car);break;case`gate`:this.sfx(`gate`,e.car,.8),n&&t>=0&&(i.flash(n.x,n.y+3,n.z,`#7ef9ff`,9,.25),i.spray(`add`,n.x,n.y+4,n.z,18,10,{cell:3,life:.5,size:.5,color:`#9ff6ff`,gravity:6,drag:1.5,stretch:3},.2)),this.juice(t,`gate`,e.value);break;case`lap`:{let a=n?.progress,o=a?Jf(a):1;r(o===3?`FINAL LAP!`:`LAP ${o} / 3`,`info`),this.sfx(o===3?`finalLap`:`lap`,e.car),n&&t>=0&&(i.confetti(n.x,n.y+4,n.z,o===3?70:40),i.shock(n.x,n.y,n.z,o===3?`#ff7a3a`:`#ffd23f`,10,.6),o===3&&this.audio.setMusic(`final`)),this.juice(t,o===3?`final`:`lap`,o);break}case`finish`:t>=0&&(this.hooks.localFinished?.(t),this.audio.play(`finish`),this.styles[t]?.update(99),this.juice(t,`finish`,n?.place),n&&(i.confetti(n.x,n.y+5,n.z,120),i.flash(n.x,n.y+3,n.z,`#fff1c4`,16,.35),i.shock(n.x,n.y,n.z,`#ffd23f`,14,.8)));break;case`dnf`:r(`TIME LIMIT`,`bad`);break;case`pad`:if(this.sfx(e.value?`padPerfect`:`pad`,e.car),e.value&&r(`PERFECT PAD!`,`great`),n){let t=e.value?`#7ef9ff`:`#ffb020`;i.burst(n.x,n.y+.3,n.z,e.value?26:14,9,t,.22,.5,2),i.shock(n.x,n.y,n.z,t,e.value?8:5.5,.45)}this.style(t,e.value?`padPerfect`:`pad`),this.juice(t,`pad`,e.value?2:1),t>=0&&this.cams[t].kick(.15);break;case`nitro`:if(r(`NITRO!`,`good`),this.sfx(`nitro`,e.car),n){let e=-Math.sin(n.yaw),t=-Math.cos(n.yaw);i.nitroIgnite(n.x+e*2.3,n.y+.4,n.z+t*2.3,e,t)}this.juice(t,`nitro`),t>=0&&this.cams[t].kick(.22);break;case`nitroDenied`:t>=0&&(this.audio.play(`nitroDenied`,.8),this.juice(t,`nitroDenied`,e.value));break;case`corkEnter`:r(`CORKSCREW!`,`great`),this.sfx(`cork`,e.car),n&&i.corkRing(n.x,n.y,n.z,Math.sin(n.yaw),Math.cos(n.yaw),`#ffd23f`),this.juice(t,`cork`,1),t>=0&&this.cams[t].kick(.12);break;case`corkExit`:this.style(t,`cork`),this.sfx(`land`,e.car,.5),n&&(i.corkRing(n.x,n.y,n.z,Math.sin(n.yaw),Math.cos(n.yaw),`#7ef9ff`),i.burst(n.x,n.y+.3,n.z,16,7,`#ffd23f`,.24,.5,3)),this.juice(t,`cork`,2);break;case`corkFall`:r(`TOO SLOW — FELL OFF!`,`bad`),this.sfx(`crunch`,e.car,.6),n&&i.burst(n.x,n.y,n.z,14,6,`#ffb020`,.22,.5,8),this.juice(t,`warn`);break;case`driftStart`:break;case`driftTier`:if(this.sfx(`driftTier`,e.car,.7),n){let t=n.x-Math.sin(n.yaw)*1.8,r=n.z-Math.cos(n.yaw)*1.8;i.flash(t,n.y+.4,r,$m(e.value??1),3.5,.2),i.shock(t,n.y,r,$m(e.value??1),3.2,.35)}this.juice(t,`tier`,e.value);break;case`driftBoost`:if(r([``,`MINI-TURBO`,`SUPER TURBO`,`ULTRA TURBO`][e.value??1]??`TURBO`,(e.value??1)>=3?`great`:`good`),this.sfx(`boost`,e.car),n){let t=$m(e.value??1),r=n.x-Math.sin(n.yaw)*2.2,a=n.z-Math.cos(n.yaw)*2.2;i.burst(r,n.y+.5,a,18+(e.value??1)*6,7,t,.25,.45,2),i.shock(r,n.y,a,t,5+(e.value??1)*1.5,.45)}this.style(t,[`drift1`,`drift1`,`drift2`,`drift3`][e.value??1]??`drift1`),this.juice(t,`boost`,e.value),t>=0&&this.cams[t].kick(.1+(e.value??1)*.05);break;case`driftLost`:break;case`launch`:this.sfx(`land`,e.car,.5),e.other===1&&(r(`MEGA RAMP — SEND IT!`,`great`),this.sfx(`boost`,e.car,.9),this.style(t,`air`),n&&(i.burst(n.x,n.y+.4,n.z,30,10,`#ffb020`,.3,.6,6),i.shock(n.x,n.y,n.z,`#ffb020`,10,.55)),this.juice(t,`boost`,2),t>=0&&this.cams[t].kick(.35));break;case`crest`:n&&t>=0&&(e.value??0)>45&&(i.burst(n.x,n.y+.1,n.z,10,4,`#d9b48a`,.5,.7,1,`dust`),this.cams[t].kick(.12));break;case`damage`:{let r=(e.value??0)>=fp;this.sfx(`crunch`,e.car,.9),n&&(i.debris(n.x,n.y+.8,n.z,8+Math.round((e.value??0)*12),n.vx,n.vz),i.burst(n.x,n.y+.7,n.z,18,10,`#ffcf6b`,.16,.45,12,`glow`,3)),t>=0&&(this.cams[t].kick(.35+(e.value??0)*.4),this.juice(t,`damage`,e.value),r&&this.styles[t]?.break());break}case`smoking`:r(`ENGINE DAMAGED!`,`warn`);break;case`onFire`:r(`ON FIRE — ONE MORE HIT AND YOU BLOW!`,`bad`),this.sfx(`ignite`,e.car),n&&i.fire(n.x,n.y+1,n.z,n.vx,n.vz,2);break;case`explode`:r(`WRECKED!`,`bad`),this.sfx(`wreck`,e.car),n&&i.wreckBlast(n.x,n.y,n.z,n.vx,n.vz),this.humans.forEach((t,r)=>{let i=this.sim.cars[t],a=n?Math.hypot(i.x-n.x,i.z-n.z):999;t===e.car?this.cams[r].kick(1.4):a<60&&this.cams[r].kick(1.1*(1-a/60))}),t>=0&&(this.styles[t]?.break(),this.juice(t,`wreck`));break;case`holdGo`:r(`GO!`,`great`),t>=0&&this.sfx(`go`,e.car,.8),n&&(i.shock(n.x,n.y,n.z,`#7ef9ff`,8,.45),i.burst(n.x,n.y+.6,n.z,20,7,`#7ef9ff`,.25,.5,3)),this.juice(t,`go`);break;case`trickStart`:this.sfx(`trick`,e.car);break;case`trick`:break;case`trickLand`:{let a=e.value??1;r(a>1?`TRICK ×${a}!`:`TRICK LANDED!`,`great`),this.sfx(`trickLand`,e.car),n&&(i.burst(n.x,n.y+.8,n.z,22+a*6,7,`#ffd23f`,.28,.6,4),i.shock(n.x,n.y,n.z,`#ffd23f`,8,.55),i.burst(n.x,n.y+.2,n.z,12,5,`#d9b48a`,.6,.9,1,`dust`)),this.style(t,`trick`,a),this.juice(t,`boost`,1);break}case`crash`:r(`SLOPPY LANDING`,`bad`),this.sfx(`crash`,e.car),t>=0&&this.styles[t]?.break(),this.juice(t,`hit`),n&&i.burst(n.x,n.y+.4,n.z,20,6,`#c7925d`,.6,.9,3,`dust`),t>=0&&this.cams[t].kick(.6);break;case`land`:(e.value??0)>.3&&(this.sfx(`land`,e.car,e.value),n&&(i.burst(n.x,n.y+.2,n.z,14,5,`#d9b48a`,.6,.9,1,`dust`),i.rings.spawn(n.x,n.y+.1,n.z,1,6+(e.value??0)*4,.5,`#ffe2b8`)),t>=0&&this.cams[t].kick((e.value??0)*.4),(e.value??0)>.6&&this.style(t,`air`),this.juice(t,`land`,e.value));break;case`rough`:break;case`wall`:if(this.sfx(`wall`,e.car,Q((e.value??5)/15,.3,1)),n){let e=n.x+n.loc.rx*Math.sign(n.loc.d)*1.2,t=n.z+n.loc.rz*Math.sign(n.loc.d)*1.2;i.burst(e,n.y+.5,t,16,9,`#ffcf6b`,.14,.4,12,`glow`,3),i.burst(e,n.y+.4,t,6,3,`#cfa27a`,.5,.8,1,`dust`)}t>=0&&(this.cams[t].kick(.2),(e.value??0)>12&&this.styles[t]?.break()),this.juice(t,`wall`,e.value);break;case`unanchored`:r(`TOO SLOW — LOSING THE WALL!`,`warn`),this.sfx(`warn`,e.car,.7),n&&i.burst(n.x,n.y+.3,n.z,12,4,`#cfa27a`,.6,.9,1,`dust`),this.juice(t,`warn`);break;case`peel`:r(`PEELED OFF THE WALL!`,`bad`),this.sfx(`crunch`,e.car,.6),n&&(i.burst(n.x,n.y+.4,n.z,22,7,`#d8b08a`,.8,1.2,1,`dust`),i.burst(n.x,n.y+.5,n.z,14,10,`#ffcf6b`,.12,.35,14,`glow`,3)),t>=0&&(this.cams[t].kick(.45),this.styles[t]?.break()),this.juice(t,`wall`,14);break;case`bump`:this.sfx(`bump`,e.car),t>=0&&this.cams[t].kick(.2);break;case`draft`:r(`SLIPSTREAM`,`good`),this.sfx(`draft`,e.car),this.style(t,`draft`);break;case`box`:this.sfx(`box`,e.car),n&&(i.burst(n.x,n.y+1.3,n.z,20,7,`#ff8ad9`,.3,.5,6),i.flash(n.x,n.y+1.3,n.z,`#ffb3ec`,5,.2));break;case`item`:r(`GOT ${[`SEEKER`,`DUST MINE`,`SHIELD`,`NITRO CANISTER`][e.value??0]}`,`info`),this.sfx(`item`,e.car),this.juice(t,`item`,e.value);break;case`useCanister`:this.sfx(`canister`,e.car);break;case`useShield`:this.sfx(`shield`,e.car),this.models[e.car]?.flashShield(),n&&i.shock(n.x,n.y,n.z,`#6ff3ff`,5,.4);break;case`useMine`:this.sfx(`mine`,e.car);break;case`useSeeker`:this.sfx(`seeker`,e.car);break;case`seekerLock`:{let t=this.viewOf(e.car);t>=0&&this.hooks.popup(t,`SEEKER LOCKED — SWITCH LANES!`,`warn`),this.sfx(`lock`,e.car),this.juice(t,`warn`);break}case`dodged`:r(`DODGED!`,`great`),this.sfx(`dodge`,e.car),this.style(t,`dodge`);break;case`blocked`:r(`BLOCKED!`,`good`),this.sfx(`blocked`,e.car),this.models[e.car]?.flashShield(),n&&(i.burst(n.x,n.y+1,n.z,30,10,`#7ef9ff`,.25,.5,2),i.shock(n.x,n.y,n.z,`#7ef9ff`,7,.45)),this.style(t,`block`),this.juice(t,`block`);break;case`hit`:r(`HIT!`,`bad`),this.sfx(`hit`,e.car),n&&i.explosion(n.x,n.y,n.z),t>=0&&(this.cams[t].kick(.8),this.styles[t]?.break()),this.juice(t,`hit`);{let t=this.viewOf(e.other??-1);t>=0&&this.hooks.popup(t,`DIRECT HIT!`,`good`)}break;case`fizzle`:this.sfx(`fizzle`,e.car);break;case`recoverStart`:r(`RESET — ${3 .toFixed(0)} s HOLD`,`bad`),this.sfx(`recover`,e.car);break;case`recovered`:r(e.value?`RESPAWNED — HOLD FOR 3`:`BACK ON TRACK — HOLD FOR 3`,`info`),this.sfx(`recover`,e.car,.7),n&&(i.burst(n.x,n.y+1,n.z,22,5,`#7ef9ff`,.25,.6,0),i.shock(n.x,n.y,n.z,`#7ef9ff`,6,.5),i.flash(n.x,n.y+1,n.z,`#bdfaff`,6,.3))}}render(e,t){this.time+=t;let n=this.sim;if(this.ending>=0&&!this.done&&!this.paused&&(this.ending+=t,this.ending>_h&&this.finish()),n.phase===`countdown`&&!this.paused){let e=Math.ceil(n.countdown);e<this.lastCount&&e>=1&&(this.audio.play(`count`),this.humans.forEach((t,n)=>this.juice(n,`count`,e))),this.lastCount=e}let r=this.paused?1:e;for(let e=0;e<n.cars.length;e+=1){let i=n.cars[e],a=this.prev[e],o=this.curr[e],s=kd(a.x,o.x,r),c=kd(a.y,o.y,r),l=kd(a.z,o.z,r),u=a.yaw+jd(o.yaw-a.yaw)*r,d=this.track.bank[i.loc.i]??0,f=i.grounded?-Math.atan(i.loc.slope):-Math.atan2(i.vy,Math.max(8,Math.abs(i.vF)))*.6,p=i.grounded?Math.atan(d)*(Math.cos(jd(i.yaw-this.track.heading[i.loc.i]))>0?-1:1):0;if(this.models[e].pose(s,c,l,u,i,this.paused?0:t,this.time,f,p),i.cork>=0){let t=this.track.corkFrame(this.track.corks[i.cork],i.loc.s,i.loc.d,this.cf);this.models[e].orient(t.fx,t.fy,t.fz,t.nx,t.ny,t.nz)}!this.paused&&!this.done&&this.effectsFor(i,e,t);let m=this.engines[e];if(this.done||this.paused)m.silence();else{let t=this.viewOf(e)>=0?this.humans.length>1?.7:1:this.near(e);m.update(Math.abs(i.vF),this.inputs[e].throttle,i.boostTime>0||i.meterBoosting,i.drift,i.grounded,0,t)}}this.renderGhosts(t),!this.paused&&!this.done&&this.humans.forEach((e,r)=>{this.styles[r].update(t);let i=this.sim.cars[e];i.grounded&&Math.abs(this.track.bank[i.loc.i]??0)>1&&i.slip<.05?this.wallRide[r]+=t:(Math.abs(this.track.bank[i.loc.i]??0)<.6||!i.grounded||i.slip>.25)&&(this.wallRide[r]>1.2&&this.style(r,`wall`,Math.min(3,Math.floor(this.wallRide[r]/1.5)+1)),this.wallRide[r]=0);let a=n.cars[e],o=this.lastPlace[r];n.phase!==`countdown`&&!a.progress.finished&&a.place!==o&&(a.place<o&&(this.hooks.popup(r,a.place===1?`TAKE THE LEAD!`:`OVERTAKE!`,`good`),this.audio.play(`overtake`,.8),this.style(r,`overtake`)),this.juice(r,`place`,a.place)),this.lastPlace[r]=a.place;let s=a.hold>0?Math.ceil(a.hold):0;s>0&&s!==this.lastHold[r]&&(this.audio.play(`count`,.8),this.juice(r,`hold`,s)),this.lastHold[r]=s,a.meter>=1&&this.lastMeter[r]<1&&a.nitro<=0&&n.phase!==`countdown`&&(this.audio.play(`nitroReady`,.8),this.juice(r,`nitroReady`)),this.lastMeter[r]=a.meter}),this.paused||this.fx.update(t),this.fx.syncItems(n,this.time),this.world.update(this.time,n.items?n:void 0);let i=[],a=this.cams.length;return this.cams.forEach((e,r)=>{let o=this.humans[r],s=this.models[o].root,c=n.cars[o];e.reducedMotion=this.reducedMotion,this.paused||e.update(t,s.position.x,s.position.y,s.position.z,this.models[o].yaw,c,this.track);let l=c.progress.finished?-1:Yf(c.progress);i.push({camera:e.camera,x:0,y:a>1&&r===0?.5:0,w:1,h:a>1?.5:1,before:()=>{this.world.setHighlight(l),this.world.focus(c.x,c.y,c.z),this.models.forEach((e,t)=>e.tag.visible=t!==o)}})}),i}dmgAcc=[];effectsFor(e,t,n){let r=this.fx,i=this.models[t],a=Math.sin(e.yaw),o=Math.cos(e.yaw),s=Math.cos(e.yaw),c=-Math.sin(e.yaw),l=-Math.cos(e.yaw),u=Math.sin(e.yaw),d=e.grounded?this.track.bank[e.loc.i]??0:0,f=e.cork>=0;f&&i.root.updateMatrixWorld();let p=t=>{if(f)return this.tmpV.copy(t).applyMatrix4(i.root.matrixWorld);let n=s*t.x+a*t.z,r=c*t.x+o*t.z;return this.tmpV.set(e.x+n,e.y+t.y+d*(n*e.loc.rx+r*e.loc.rz),e.z+r)},m=Math.abs(e.vF),h=this.viewOf(t)>=0;if(e.drift&&e.grounded)for(let t of i.rearWheels){let n=p(t);r.driftSparks(n.x,n.y+.1,n.z,e.vx,e.vz,e.driftTier),r.tyreSmoke(n.x,n.y,n.z,e.vx,e.vz,e.loc.onRoad?.55:.2)}if(e.grounded&&e.slip>.1)for(let t of i.rearWheels){let n=p(t);r.tyreSmoke(n.x,n.y,n.z,e.vx,e.vz,Math.min(.9,.3+e.slip),`#e9dccb`)}if(e.grounded&&!e.loc.onRoad&&m>6)for(let e of i.rearWheels){let t=p(e);r.dustTrail(t.x,t.y,t.z,Math.min(.9,m/40))}if(e.wheelspin>0&&e.grounded)for(let e of i.rearWheels){let t=p(e);r.tyreSmoke(t.x,t.y,t.z,0,0,.7,`#e6ddd2`)}let g=e.boostTime>0||e.meterBoosting;if(e.nitro>0&&e.wreck<=0){let t=Q((e.nitro-(Gf.car.nitroTime-.35))/.35,0,1),n=-a,s=0,c=-o;if(f){let e=i.root.quaternion,t=this.tmpM.set(0,0,-1).applyQuaternion(e);n=t.x,s=t.y,c=t.z}for(let a of i.exhausts){let i=p(a);r.nitroJet(i.x,i.y,i.z,n,s,c,e.vx,e.vy*+!!f,e.vz,t)}}else if(g)for(let t of i.exhausts){let n=p(t);r.exhaust(n.x,n.y,n.z,-a,0,-o,e.meterBoosting)}if(h&&!f&&(g||m>52)&&Math.random()<(g?.85:.35)){let t=(Math.random()-.5)*8,n=Math.random()*3.4;r.streak(e.x+l*t+a*7,e.y+n,e.z+u*t+o*7,-a*34+e.vx*.6,0,-o*34+e.vz*.6,e.meterBoosting?`#9ff6ff`:g?`#ffd08a`:`#fff6e8`)}if(e.wreck>0||e.damage>=.35)for(this.dmgAcc[t]=Math.min(4,(this.dmgAcc[t]??0)+n*60);this.dmgAcc[t]>=1;){--this.dmgAcc[t];let n=i.length,s=e.x+a*n*.28,c=e.z+o*n*.28;if(e.wreck>0)r.fire(e.x+(Math.random()-.5)*2,e.y+1.1,e.z+(Math.random()-.5)*3,0,0,1.6),Math.random()<.6&&r.engineSmoke(e.x,e.y+2,e.z,0,0,1);else{let t=e.damage>=.7?1:Q((e.damage-dp)/(fp-dp),0,1)*.5;r.engineSmoke(s,e.y+1.2,c,e.vx,e.vz,t),e.damage>=.7?r.fire(s,e.y+1.25,c,e.vx,e.vz,1.3):Math.random()<.08&&r.burst(s,e.y+.9,c,3,4,`#ffcf6b`,.12,.3,10,`glow`,2)}}else this.dmgAcc[t]=0;if(e.hold>0&&Math.floor(this.time*2)!==Math.floor((this.time-1/60)*2)&&r.shock(e.x,e.y,e.z,`#7ef9ff`,4.5,.5),e.drafting&&Math.random()<.6){let t=(Math.random()-.5)*3;r.streak(e.x+l*t+a*3,e.y+.6+Math.random()*1.5,e.z+u*t+o*3,e.vx*.5-a*20,0,e.vz*.5-o*20,`#ffffff`)}}renderGhosts(e){let t=this.online;if(!t)return;let n=t.ghostFrames(),r=this.sim.tick-vh;for(let[i,a]of n){if(i===t.seat||a.length===0)continue;let n=this.ghosts.get(i);if(!n){let e=t.ghostProfile(i)??{name:`Racer ${i+1}`,chassis:i%5,livery:i%6};n=new yh(i,e.name,e.chassis,e.livery,e.custom),this.ghosts.set(i,n),this.group.add(n.model.root)}let o=a[0],s=a[a.length-1];for(let e=0;e<a.length-1;e+=1)if(a[e].tick<=r&&a[e+1].tick>=r){o=a[e],s=a[e+1];break}let c,l,u,d;if(s.tick>o.tick&&r<=s.tick){let e=Q((r-o.tick)/(s.tick-o.tick),0,1);c=kd(o.x,s.x,e),l=kd(o.y,s.y,e),u=kd(o.z,s.z,e),d=o.yaw+jd(s.yaw-o.yaw)*e}else{let e=a[a.length-1],t=a.length>1?a[a.length-2]:e,n=Math.max(1,e.tick-t.tick),i=e===t||e.f&8?0:Q(jd(e.yaw-t.yaw)/n,-.05,.05),o=Q(r-e.tick,0,36);c=e.x,l=e.y,u=e.z,d=e.yaw;for(let t=0;t<o;t+=3){let n=Math.min(3,o-t);d+=i*n,c+=Math.sin(d)*e.v*(n/60),u+=Math.cos(d)*e.v*(n/60)}o>0&&t!==e&&(l=e.y+(e.y-t.y)/n*Math.min(o,12)),s=e}let f=this.ghostSmooth.get(i);if(!f||Math.hypot(f.x-c,f.z-u)>25)this.ghostSmooth.set(i,{x:c,y:l,z:u,yaw:d});else{let t=1-Math.exp(-e*14);f.x+=(c-f.x)*t,f.y+=(l-f.y)*t,f.z+=(u-f.z)*t,f.yaw+=jd(d-f.yaw)*t}let p=this.ghostSmooth.get(i);n.model.pose(p.x,p.y,p.z,p.yaw,null,e,this.time,0,0);for(let e of n.model.flames)e.visible=!!(s.f&2);n.model.root.visible=!(s.f&64)}}hud(e){let t=this.humans[e],n=this.sim.cars[t],r=n.progress,i=n.place,a=this.sim.cars.length;if(this.online){let e=this.online.ghostFrames();a=1;for(let[t,n]of e)t!==this.online.seat&&n.length&&(a+=1);i=this.onlinePlace()}return{car:n,lap:Jf(r),gate:Yf(r)+1,place:i,total:a,countdown:this.sim.countdown,clock:r.finished?r.finishTime:Math.max(0,this.sim.clock),bestLap:np(r),lastLap:r.lapTimes.length?r.lapTimes[r.lapTimes.length-1]:0,gatesDone:r.gates}}onlinePlace(){let e=this.online,t=this.sim.cars[0],n=1;for(let[r,i]of e.ghostFrames())r!==e.seat&&i.length&&i[i.length-1].gates>t.progress.gates&&(n+=1);return n}markers(){let e=this.sim.cars.map((e,t)=>({x:e.x,z:e.z,livery:this.racers[t].livery,human:this.racers[t].human,ghost:!1}));if(this.online)for(let[t,n]of this.online.ghostFrames()){if(t===this.online.seat||!n.length)continue;let r=n[n.length-1],i=this.online.ghostProfile(t);e.push({x:r.x,z:r.z,livery:i?.livery??0,human:!1,ghost:!0})}return e}get totalGates(){return Kf}dispose(){this.world.scene.remove(this.group),this.fx.clear();for(let e of this.models)e.dispose();for(let e of this.ghosts.values())e.model.dispose();for(let e of this.engines)e.dispose();this.world.setHighlight(-1)}get elapsed(){return this.time}get ticks(){return this.sim.tick}modIndex(e){return $(e,this.sim.cars.length)}},xh=[];function Sh(e,t,n,r,i,a,o,s){let c=Gf[e],l=Wf[e];xh.push({control:Object.freeze({id:`${e}.${t}`,type:`number`,category:e===`car`?`Handling`:e===`camera`?`Camera`:`Race`,label:n,description:s===`run`?`Applies when the next race starts.`:`Updates this preview immediately.`,unit:o,default:l[t],min:r,max:i,step:a,applyMode:s===`run`?`NEXT_RUN`:`LIVE`,integrity:e===`camera`?`COSMETIC`:`GAMEPLAY`}),boundary:s,read:()=>c[t],write:e=>{c[t]=e}})}Sh(`car`,`maxSpeed`,`Top speed`,30,80,1,`m/s`),Sh(`car`,`accel`,`Acceleration`,10,60,1,`m/s²`),Sh(`car`,`turnHigh`,`High-speed steering`,.4,2,.05,`rad/s`),Sh(`car`,`grip`,`Grip`,3,20,.5,``),Sh(`car`,`driftGrip`,`Drift grip`,1,6,.1,``),Sh(`car`,`boostSpeed`,`Boost top speed`,40,110,1,`m/s`),Sh(`car`,`gravity`,`Gravity`,10,60,1,`m/s²`),Sh(`camera`,`fov`,`Field of view`,45,100,1,`°`),Sh(`camera`,`distance`,`Camera distance`,4,14,.1,`m`),Sh(`camera`,`height`,`Camera height`,1,6,.1,`m`),Sh(`camera`,`follow`,`Camera follow speed`,2,20,1,``),Sh(`race`,`aiPace`,`AI cornering pace`,.6,1.4,.05,`×`,`run`),Sh(`race`,`itemRespawn`,`Item crystal respawn`,1,10,.5,`s`,`run`);var Ch=new Map(xh.map(e=>[e.control.id,e])),wh=Object.fromEntries(xh.map(({control:e})=>[e.id,e.default])),Th=e=>e[`car.maxSpeed`]<e[`car.boostSpeed`],Eh=!1,Dh=()=>xh.some(e=>e.control.integrity===`GAMEPLAY`&&e.read()!==e.control.default),Oh={get unranked(){return Eh},controls:Object.freeze(xh.map(e=>e.control)),read(){return{requested:{...wh},active:Object.fromEntries(xh.map(e=>[e.control.id,e.read()]))}},apply(e){if(!e||typeof e!=`object`||Array.isArray(e))throw Error(`Invalid patch`);let t=Object.entries(e);if(t.length>xh.length)throw Error(`Invalid patch`);for(let[e,n]of t){let t=Ch.get(e)?.control;if(!t||typeof n!=`number`||!Number.isFinite(n)||n<t.min||n>t.max)throw Error(`Invalid value`);let r=(n-t.min)/t.step;if(n!==t.default&&Math.abs(r-Math.round(r))>1e-7)throw Error(`Invalid increment`)}let n={...wh,...e},r=this.read().active;for(let[e,n]of t)Ch.get(e).control.applyMode===`LIVE`&&(r[e]=n);if(!Th(n)||!Th(r))throw Error(`Top speed must stay below boost top speed`);wh=n;for(let[e,n]of t){let t=Ch.get(e);t.control.applyMode===`LIVE`&&t.write(n)}Eh||=Dh()},activate(e){for(let t of xh)t.boundary===e&&t.write(wh[t.control.id]);Eh=e===`run`?Dh():Eh||Dh()}},kh=[`Vega`,`Juno`,`Sable`,`Rook`,`Mica`,`Atlas`,`Nova`,`Kite`,`Echo`];function Ah(e){return{name:e.name,primary:e.primary,secondary:e.secondary,accent:e.accent,finish:e.paintFinish,pattern:e.paintPattern,stripe:e.aero!==`clean`,bodyKit:e.bodyKit,hood:e.hood,spoiler:e.spoiler,wheels:e.wheels}}function jh(e,t={power:0,grip:0,boost:0}){return{speed:.94+e.power*.0012+t.power*.012,power:.94+e.power*.0012+t.power*.012,grip:.92+e.grip*.0016+t.grip*.012,boost:.92+e.boost*.0016+t.boost*.012}}var Mh={id:`canyon-circuit`,name:`Canyon Rush Circuit`},Nh=class{renderer;input;audio;save;net;hooks;session=null;config=null;mode=`menu`;worlds=new Map;garageWorld=null;garageCar=null;garageCam=new qa(42,1,.3,4200);garageTime=0;garageKey=``;reducedMotion=!1;assistModes=[`strong`,`strong`];env=null;setStableMode(e){this.session?.setStableMode(e)}constructor(e,t,n,r,i,a){this.renderer=e,this.input=t,this.audio=n,this.save=r,this.net=i,this.hooks=a}trackRefs(){return[Mh,...this.save.data.customTracks.map(e=>({id:nf(e),name:e.name,lab:e}))]}onlineCode(e){return e.lab?rf(e.lab):`main`}refFromOnline(e){if(e===`main`)return Mh;let t=af(e);return t?{id:nf(t),name:t.name,lab:t}:Mh}buildTrack(e){return e.lab?cf(e.lab).track:new Jd($d)}async worldFor(e){let t=this.worlds.get(e.id);if(t)return t;this.hooks.loading(`Carving ${e.name}…`),await new Promise(e=>requestAnimationFrame(()=>setTimeout(e,30)));for(let[t,n]of this.worlds)t!==Mh.id&&t!==e.id&&n.world!==this.garageWorld&&(n.world.dispose(),this.worlds.delete(t));let n=this.buildTrack(e),r=new Im(n,this.renderer.shadowMapSize,this.renderer.shadowsEnabled);r.scene.environment=this.environment(),r.scene.environmentIntensity=.8;let i={track:n,world:r};return this.worlds.set(e.id,i),this.renderer.gl.compile(r.scene,this.garageCam),this.hooks.loading(null),i}environment(){return this.env?this.env:(this.env=km(this.renderer.gl,Mm),Z.has(`sky`)||Z.whenSettled(`sky`).then(()=>{let e=this.env;this.env=km(this.renderer.gl,Mm);for(let e of this.worlds.values())e.world.scene.environment=this.env;e?.dispose()}),this.env)}async ensureRaceAssets(e){if(Z.prioritize(e.map(e=>`car:${Zu[e]??Zu[0]}`)),Z.stageReady(`race`))return;let t=Z.onProgress((e,t,n)=>{e===`race`&&this.hooks.loading(`Loading race assets… ${Math.round(t/n*100)}%`)}),n=Z.progress(`race`);this.hooks.loading(`Loading race assets… ${Math.round(n.done/n.total*100)}%`),await Promise.race([Z.load(`race`),new Promise(e=>setTimeout(e,15e3))]),t(),this.hooks.loading(null),this.audio.warm()}async enterGarage(){let{world:e}=await this.worldFor(Mh);this.garageWorld=e,this.mode=`menu`;let t=this.save.data.customCar;this.previewCar(t?.chassis??this.save.data.chassis,this.save.data.livery,t)}previewCar(e,t,n){let r=n?`custom:${JSON.stringify(n)}`:`${e}:${t}`;if(r===this.garageKey&&this.garageCar)return;this.garageKey=r,Z.prioritize([`car:${Zu[e]??Zu[0]}`]),this.garageCar&&(this.garageWorld?.scene.remove(this.garageCar.root),this.garageCar.dispose()),this.garageCar=new mm(e,t,!1,n?.name??``,n?Ah(n):void 0),this.garageCar.tag.visible=!1;let i=this.worlds.get(Mh.id)?.track;if(i&&this.garageWorld){let e={x:0,y:0,z:0,tx:0,tz:1,rx:-1,rz:0,halfW:10,bank:0};i.frameAt(i.length-22,e),this.garageCar.root.position.set(e.x,e.y,e.z),this.garageCar.root.userData.heading=Math.atan2(e.tx,e.tz),this.garageWorld.scene.add(this.garageCar.root)}}hideGarageCar(){this.garageCar&&(this.garageCar.root.visible=!1)}racers(e){let t=this.save.data,n=t.customCar,r=t.upgrades,i=r.power||r.grip||r.boost?{speed:1+r.power*.012,power:1+r.power*.012,grip:1+r.grip*.012,boost:1+r.boost*.012}:void 0,a={name:t.playerName,chassis:n?.chassis??t.chassis,livery:t.livery,human:!0,device:e===`split`?t.p1Device:`auto`,customName:n?.name,customLivery:n?Ah(n):void 0,tune:n?jh(n,t.upgrades):i};if(e===`test`||e===`online`)return[a];let o=new Set([`${t.chassis}`]),s=new Set([t.livery]),c=[a];e===`split`&&(c.push({name:`Player 2`,chassis:t.p2Chassis,livery:t.p2Livery,human:!0,device:t.p2Device}),o.add(`${t.p2Chassis}`),s.add(t.p2Livery));let l=0;for(;c.length<10;){let e=[...Array(Qp.length).keys()].find(e=>!o.has(`${e}`))??l%Qp.length,t=[...Array($p.length).keys()].find(e=>!s.has(e))??l%$p.length;o.add(`${e}`),s.add(t),c.push({name:kh[l%kh.length],chassis:e,livery:t,human:!1}),l+=1}return c}async startRace(e,t){this.endSession(),this.config=e;let n=this.racers(e.mode);await this.ensureRaceAssets(n.map(e=>e.chassis));let{track:r,world:i}=await this.worldFor(e.track);this.hideGarageCar(),Oh.activate(`run`);let a=t?t.seed:Rd(`${e.track.id}:${Date.now()}`)%1e5+1;this.session=new bh({mode:e.mode,track:r,trackId:e.track.id,racers:n,items:e.items&&e.mode!==`online`&&e.mode!==`test`,seed:a,aiSkill:e.aiSkill,aiPace:.76+Math.min(.14,this.save.data.racesPlayed*.014),online:t?this.net:void 0},i,this.input,this.audio,{popup:(e,t,n)=>this.hooks.popup(e,t,n),finished:e=>this.onFinished(e),localFinished:e=>this.hooks.localFinished(e),juice:(e,t,n)=>this.hooks.juice?.(e,t,n)}),this.session.reducedMotion=this.reducedMotion,this.session.assistModes[0]=this.assistModes[0],this.session.assistModes[1]=this.assistModes[1],this.mode=`race`,this.input.gameplayActive=!0,this.input.consume(`pause`),this.audio.setMusic(`race`)}onFinished(e){let t=this.config;if(!t)return;this.mode=`results`,this.input.gameplayActive=!1;let n=[],r=e.find(e=>e.human&&e.humanIndex===0);if(t.mode!==`test`&&t.mode!==`online`&&r&&!Oh.unranked){let e=r.finished?Math.max(1,r.place):10,t=(r.finished?100:25)+Math.max(0,11-e)*10;this.save.update({points:this.save.data.points+t,racesPlayed:this.save.data.racesPlayed+1})}let i={...this.save.data.bests},a=!1;for(let r of e){if(!r.human||Oh.unranked)continue;let e=i[t.track.id],o=r.bestLap>0&&r.lapAssist[r.lapTimes.indexOf(r.bestLap)]===!0,s=r.finished?Df(e,r.total,r.bestLap,r.assisted,o):null;n[r.humanIndex]={total:!!s&&(!e||s.total<e.total),lap:!!s&&(!e||r.bestLap>0&&s.lap<e.lap),totalAssist:r.assisted,lapAssist:o},s&&(i[t.track.id]=s,a=!0)}a&&this.save.update({bests:i}),this.audio.setMusic(`results`),this.hooks.finished(e,t,n)}repair(e=0){return this.session?.repair(e)??!1}endSession(){this.session&&=(this.session.dispose(),null),this.input.gameplayActive=!1}async rematch(){this.config&&this.config.mode!==`online`&&await this.startRace(this.config)}toGarage(){this.endSession(),this.mode=`menu`,this.audio.setMusic(`menu`),this.garageCar&&(this.garageCar.root.visible=!0),this.enterGarage()}pause(){this.mode===`race`&&this.session&&(this.mode=`paused`,this.session.paused=!0,this.input.gameplayActive=!1)}resume(){this.mode===`paused`&&this.session&&(this.mode=`race`,this.session.paused=!1,this.input.gameplayActive=!0)}step(){let e=this.session;e&&(this.mode===`race`||this.mode===`results`||this.mode===`paused`&&e.online)&&(this.mode===`paused`&&e.online&&(e.paused=!0),e.step())}render(e,t){let n=this.session;if(n){let r=n.render(e,t);this.renderer.render(this.worldOf(n),r);return}let r=this.garageWorld;if(!r)return;this.garageTime+=t;let i=this.garageCar;if(i){let e=this.garageTime,n=i.root.userData.heading??0;i.pose(i.root.position.x,i.root.position.y,i.root.position.z,n+e*.35,null,t,e,0,0);let a=8.2,o=n+Math.PI*.8,s=i.root.position;this.garageCam.position.set(s.x+Math.sin(o)*a,s.y+2.6,s.z+Math.cos(o)*a),this.garageCam.lookAt(s.x-Math.sin(o)*1.5,s.y+.9,s.z-Math.cos(o)*1.5),r.focus(s.x,s.y,s.z)}r.setHighlight(-1),r.update(this.garageTime);let a={camera:this.garageCam,x:0,y:0,w:1,h:1};this.renderer.render(r.scene,[a])}worldOf(e){return(this.worlds.get(e.trackId)?.world??this.garageWorld).scene}setQuality(){for(let e of this.worlds.values())e.world.sun.castShadow=this.renderer.shadowsEnabled,e.world.sun.shadow.map?.dispose(),e.world.sun.shadow.map=null,e.world.sun.shadow.mapSize.set(this.renderer.shadowMapSize,this.renderer.shadowMapSize)}};function Ph(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]??e)}var Fh=`./`,Ih={seeker:{name:`SEEKER`,icon:`<img src="${Fh}assets/ui/icon-seeker.webp" alt="">`,hint:`Homes on the racer ahead — they get a lane warning.`,color:`#ffb020`},mine:{name:`DUST MINE`,icon:`<img src="${Fh}assets/ui/icon-mine.webp" alt="">`,hint:`Drops behind you. Armed mines blink red.`,color:`#ff4d5e`},shield:{name:`SHIELD`,icon:`<img src="${Fh}assets/ui/icon-shield.webp" alt="">`,hint:`Blocks one hit for 6 seconds.`,color:`#4fd8ff`},canister:{name:`NITRO`,icon:`<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="nz" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#bff8ff"/><stop offset="1" stop-color="#2d8cff"/></linearGradient></defs><rect x="20" y="10" width="24" height="44" rx="9" fill="url(#nz)" stroke="#e8fdff" stroke-width="3"/><rect x="26" y="4" width="12" height="8" rx="2" fill="#e8fdff"/><path d="M32 20 L25 36 H31 L28 48 L40 30 H33 L37 20 Z" fill="#fff6c2" stroke="#1b1030" stroke-width="1.5"/></svg>`,hint:`Instant boost burst.`,color:`#7ef9ff`}},Lh=[`#ffe08a`,`#4fb8ff`,`#ff9a2a`,`#c86bff`],Rh=300,zh=class{values=new Map;text(e,t,n){e&&this.values.get(t)!==n&&(this.values.set(t,n),e.textContent=n)}html(e,t,n){e&&this.values.get(t)!==n&&(this.values.set(t,n),e.innerHTML=n)}cls(e,t,n,r){let i=`${t}:${n}`,a=r?`1`:`0`;e&&this.values.get(i)!==a&&(this.values.set(i,a),e.classList.toggle(n,r))}style(e,t,n,r){let i=`${t}:${n}`;e&&this.values.get(i)!==r&&(this.values.set(i,r),e.style.setProperty(n,r))}reset(){this.values.clear()}};function Bh(e){return`
  <div class="hud-view" data-view="${e}">
    <div class="hud-flash" data-h="flash"></div>
    <div class="speedlines" data-h="lines"></div>
    <div class="hud-tl">
      <div class="hud-place" data-h="placebox"><b data-h="place">1<sup>st</sup></b><span data-h="of">/3</span></div>
      <div class="hud-chip hud-lap" data-h="lapbox">LAP <b data-h="lap">1</b><span>/3</span></div>
      <div class="hud-chip hud-gate">GATE <b data-h="gate">1</b><span>/16</span></div>
      <div class="pips" data-h="pips">${Array.from({length:16},(e,t)=>`<i data-pip="${t}"></i>`).join(``)}</div>
    </div>
    <div class="hud-top">
      <div class="hud-time" data-h="time">0:00.00</div>
      <div class="hud-split" data-h="split"></div>
      <div class="hud-sub"><span data-h="best">BEST LAP —</span><span class="pen" data-h="pen"></span></div>
      <div class="hud-limit" data-h="limit"></div>
    </div>
    <div class="hud-bl">
      <div class="warn seeker" data-h="wseek">SEEKER INCOMING</div>
      <div class="warn locked" data-h="wlock">LOCKED — CHANGE LANES OR SHIELD!</div>
      <div class="warn mine" data-h="wmine">MINE AHEAD</div>
      <div class="item-card" data-h="itemslot">
        <div class="item-icon" data-h="itemicon"></div>
        <div class="item-text"><b data-h="itemname">NO ITEM</b><small data-h="itemhint">Drive through a pink crystal</small></div>
        <kbd data-h="itemkey">E</kbd>
      </div>
    </div>
    <div class="hud-br">
      <div class="draft" data-h="draft">SLIPSTREAM</div>
      <div class="assist-chip" data-h="assist"><i></i>ASSIST <span data-h="assistmode">STRONG</span></div>
      <div class="hull" data-h="hull"><span data-h="hulllabel">HULL</span><div class="hull-bar"><i data-h="hullfill"></i></div><b data-h="hullpct">100%</b></div>
      <div class="wallride" data-h="wall"><span data-h="walllabel">WALL RIDE</span><div class="wall-bar"><i data-h="wallfill"></i><em></em></div><b data-h="wallg">1.0 G</b></div>
      <div class="dial" data-h="dial">
        <canvas data-h="dialc" width="260" height="260"></canvas>
        <div class="dial-read"><b data-h="speed">0</b><span>KM/H</span></div>
        <div class="dial-boost" data-h="segs"><span>NITRO <kbd data-h="boostkey">SHIFT</kbd> <em class="nitro-st" data-h="nitrost">READY</em></span><div class="segs"><i></i><i></i><i></i><i></i></div></div>
        <div class="dial-drift" data-h="dpips"><i></i><i></i><i></i><span data-h="driftlabel">DRIFT</span></div>
      </div>
    </div>
    <div class="style-chain" data-h="style">
      <div class="sc-main"><b data-h="sclabel">DRIFT</b><strong data-h="scpts">+0</strong></div>
      <div class="sc-mult"><b data-h="scmult">×1</b><span>CHAIN</span></div>
      <div class="sc-timer"><i data-h="sctimer"></i></div>
    </div>
    <div class="hud-center">
      <div class="countdown" data-h="count"></div>
      <div class="banner-final" data-h="final"><i></i>FINAL LAP<i></i></div>
      <div class="banner wrong" data-h="wrong">WRONG WAY</div>
      <div class="hold" data-h="hold"><small data-h="holdlabel">RESPAWNING</small><b data-h="holdn">3</b><div class="hold-bar"><i data-h="holdp"></i></div><em data-h="holdhint">Hold tight — engine restarting</em></div>
      <div class="banner done" data-h="done"></div>
      <div class="popups" data-h="popups"></div>
    </div>
    <div class="hud-tag" data-h="tag"></div>
  </div>`}var Vh=class{fx;root;cache=new zh;views=[];minimap;mapTrack=null;mapPath=null;mapXf={s:1,ox:0,oz:0};hintTimer=0;splits=[];lastMeterSeg=[0,0];dialNeedle=[0,0];clock=0;reduced=!1;constructor(e,t){this.fx=t,this.root=document.createElement(`div`),this.root.className=`hud`,this.root.innerHTML=`${Bh(0)}${Bh(1)}<div class="minimap-wrap"><canvas class="minimap" width="440" height="440"></canvas><b class="mm-n">N</b></div><div class="hud-hint" data-hint></div><div class="online-strip" data-online></div>`,e.appendChild(this.root),this.views=[...this.root.querySelectorAll(`.hud-view`)],this.minimap=this.root.querySelector(`canvas.minimap`)}q(e,t){return this.views[e]?.querySelector(`[data-h="${t}"]`)??null}retrigger(e,t){e&&(e.classList.remove(t),e.offsetWidth,e.classList.add(t))}setup(e,t,n,r){let i=e.humans.length>1;this.cache.reset(),this.fx.clear(),this.root.classList.toggle(`split`,i),this.views[1].style.display=i?``:`none`;for(let e=0;e<2;e+=1){let r=this.q(e,`popups`);r&&(r.innerHTML=``),this.cache.text(this.q(e,`tag`),`tag${e}`,i?t[e]??``:``),this.cache.text(this.q(e,`itemkey`),`ik${e}`,n[e]?.item??`E`),this.cache.text(this.q(e,`boostkey`),`bk${e}`,n[e]?.boost??`SHIFT`),this.q(e,`final`)?.classList.remove(`show`),this.q(e,`style`)?.classList.remove(`show`,`bank`),this.q(e,`split`)?.classList.remove(`show`),this.splits[e]={gates:0,lapStart:0,cur:[],best:null,bestLap:1/0,splitUntil:0},this.lastMeterSeg[e]=0,this.dialNeedle[e]=0}this.buildMap(e.track);let a=this.root.querySelector(`[data-hint]`);clearTimeout(this.hintTimer),r?(a.innerHTML=i?`<b>P1</b> WASD · Space drift · L-Shift nitro · E item · R reset &nbsp; | &nbsp; <b>P2</b> Arrows · R-Shift or / drift · . nitro · , item · L reset`:`<b>W / ↑</b> throttle · <b>S / ↓</b> brake · <b>Space</b> drift & air tricks · <b>Shift</b> nitro (8 s cooldown) · <b>E</b> item · <b>R</b> reset (3 s hold) · <b>Esc</b> pause`,a.classList.add(`show`),this.hintTimer=window.setTimeout(()=>a.classList.remove(`show`),9e3)):a.classList.remove(`show`)}buildMap(e){if(this.mapTrack===e)return;this.mapTrack=e;let t=e.bounds,n=300/Math.max(t.maxX-t.minX,t.maxZ-t.minZ),r=(t.minX+t.maxX)/2,i=(t.minZ+t.maxZ)/2;this.mapXf={s:n,ox:220-r*n,oz:220-i*n};let a=new Path2D;for(let t=0;t<=e.n;t+=4){let n=t%e.n,[r,i]=this.mapPoint(e.x[n],e.z[n]);t===0?a.moveTo(r,i):a.lineTo(r,i)}a.closePath(),this.mapPath=a}mapPoint(e,t){return[-e*this.mapXf.s+440-this.mapXf.ox,t*this.mapXf.s+this.mapXf.oz]}popup(e,t,n){let r=this.q(e,`popups`);if(!r)return;let i=document.createElement(`div`);i.className=`popup ${n}`;let a=document.createElement(`span`);for(a.textContent=t,i.appendChild(a),r.prepend(i);r.children.length>3;)r.lastElementChild?.remove();window.setTimeout(()=>i.remove(),1600);let o=n===`great`?`#7ef9ff`:n===`good`?`#ffb020`:n===`bad`||n===`warn`?`#ff4d5e`:`#ffd23f`;requestAnimationFrame(()=>this.fx.at(i,o,n===`great`?26:14,420,{size:2.2,glints:n===`great`?3:1}))}juice(e,t,n){let r=this.q(e,`flash`),i=this.fx;switch(t){case`gate`:{let t=(this.splits[e]?.gates??0)%16,n=this.q(e,`pips`)?.children[Math.max(0,t)]??null;i.at(n,`#7ef9ff`,12,260,{size:1.8,glints:1}),this.retrigger(this.q(e,`pips`),`bump`);break}case`lap`:this.retrigger(this.q(e,`lapbox`),`bump`),i.at(this.q(e,`lapbox`),`#ffd23f`,30,480,{size:2.6,glints:3}),this.retrigger(r,`gold`);break;case`final`:{let t=this.q(e,`final`);this.retrigger(t,`show`),window.setTimeout(()=>t?.classList.remove(`show`),2600),requestAnimationFrame(()=>i.at(t,`#ffb020`,60,640,{size:3,glints:5})),this.retrigger(this.q(e,`lapbox`),`bump`),this.retrigger(r,`gold`);break}case`boost`:case`pad`:this.retrigger(this.q(e,`dial`),`kick`),i.at(this.q(e,`segs`),t===`pad`?`#7ef9ff`:Lh[n??1]??`#7ef9ff`,18+(n??1)*6,380,{size:2.2}),this.retrigger(r,`boost`);break;case`nitro`:{let t=this.q(e,`segs`);this.retrigger(this.q(e,`dial`),`kick`),this.retrigger(t,`fire`),i.at(t,`#8fb4ff`,36,520,{size:2.6,glints:3}),this.retrigger(r,`nitro`),this.reduced||this.retrigger(this.views[e],`shake-s`);break}case`nitroReady`:{let t=this.q(e,`segs`);this.retrigger(t,`ready-pop`),i.at(t,`#bfe0ff`,22,380,{size:2,glints:3});break}case`nitroDenied`:this.retrigger(this.q(e,`segs`),`deny`);break;case`cork`:if(this.retrigger(r,n===2?`gold`:`boost`),n===2){let t=this.root.classList.contains(`split`);i.burst(window.innerWidth/2,window.innerHeight*(t?e?.72:.22:.3),`#ffd23f`,46,620,{size:2.6,glints:4})}break;case`tier`:{let t=this.q(e,`dpips`)?.children[Math.max(0,(n??1)-1)]??null;this.retrigger(t,`pop`),i.at(t,Lh[n??1],16,300,{size:2});break}case`hit`:this.retrigger(r,`hit`),this.retrigger(this.views[e],`shake`);break;case`wall`:(n??0)>10&&this.retrigger(this.views[e],`shake-s`);break;case`block`:this.retrigger(r,`boost`),i.at(this.q(e,`itemslot`),`#7ef9ff`,28,420);break;case`place`:{let t=this.q(e,`placebox`);this.retrigger(t,`bump`),i.at(t,`#ffd23f`,26,460,{size:2.6,glints:2});break}case`bank`:{let t=this.q(e,`style`);this.retrigger(t,`bank`),window.setTimeout(()=>t?.classList.remove(`bank`),900),i.at(t,`#ffd23f`,40,560,{size:2.8,glints:4});break}case`finish`:{this.retrigger(r,`gold`);let t=this.root.classList.contains(`split`);i.burst(window.innerWidth/2,window.innerHeight*(t?e?.7:.25:.35),`#ffd23f`,90,820,{size:3.2,glints:8});break}case`land`:(n??0)>.5&&this.retrigger(this.views[e],`shake-s`);break;case`item`:{let t=this.q(e,`itemslot`);this.retrigger(t,`flip`),i.at(t,`#ff7ad9`,26,420,{size:2.4,glints:2});break}case`go`:{let t=this.q(e,`count`);requestAnimationFrame(()=>i.at(t,`#7ef9ff`,70,760,{size:3.2,glints:6}));break}case`count`:this.retrigger(this.q(e,`count`),`pop`),requestAnimationFrame(()=>i.at(this.q(e,`count`),`#ffd23f`,24,420,{size:2.4}));break;case`warn`:this.retrigger(r,`warn`);break;case`damage`:{let t=this.q(e,`hull`);this.retrigger(r,`hit`),this.retrigger(this.views[e],(n??0)>.35?`shake`:`shake-s`),this.retrigger(t,`bump`),i.at(t,(n??0)>=.7?`#ff3b2a`:`#ffb020`,22,380,{size:2.2});break}case`wreck`:{this.retrigger(r,`hit`),this.retrigger(this.views[e],`shake`);let t=this.root.classList.contains(`split`);i.burst(window.innerWidth/2,window.innerHeight*(t?e?.75:.25:.45),`#ff7a2a`,110,900,{size:3.4,glints:6});break}case`hold`:{let t=this.q(e,`holdn`);this.retrigger(t,`pop`),requestAnimationFrame(()=>i.at(t,`#7ef9ff`,20,380,{size:2.2}));break}}}update(e,t){this.reduced=t,this.fx.enabled=!t,this.clock+=1/60;for(let t=0;t<e.humans.length;t+=1)this.updateView(e,t);this.drawMap(e)}trackSplits(e,t,n,r){let i=this.splits[e];if(i){for(;i.gates<n;){i.gates+=1;let n=(i.gates-1)%16,a=t-i.lapStart;if(i.cur[n]=a,i.best&&i.best[n]!==void 0){let r=a-i.best[n],o=this.q(e,`split`);o&&(o.textContent=`${r<=0?`−`:`+`}${Math.abs(r).toFixed(2)}`,o.className=`hud-split ${r<=0?`ahead`:`behind`}`,this.retrigger(o,`show`)),i.splitUntil=t+2.6}if(n===15){let e=r[r.length-1]??a;e<i.bestLap&&(i.bestLap=e,i.best=[...i.cur]),i.cur=[],i.lapStart=t}}t>i.splitUntil&&this.q(e,`split`)?.classList.remove(`show`)}}updateView(e,t){let n=e.hud(t),r=n.car,i=this.cache,a=e=>`${t}:${e}`,o=ip(n.place);i.html(this.q(t,`place`),a(`place`),`${n.place}<sup>${o.replace(/^\d+/,``)}</sup>`),i.text(this.q(t,`of`),a(`of`),`/${n.total}`),i.text(this.q(t,`lap`),a(`lap`),String(n.lap)),i.text(this.q(t,`gate`),a(`gate`),r.progress.finished?`—`:String(n.gate));let s=r.progress.finished?16:r.progress.gates%16,c=this.q(t,`pips`);c&&c.dataset.n!==String(s)&&(c.dataset.n=String(s),c.querySelectorAll(`i`).forEach((e,t)=>{e.classList.toggle(`done`,t<s),e.classList.toggle(`next`,t===s&&!r.progress.finished)})),this.trackSplits(t,n.clock,r.progress.gates,r.progress.lapTimes),i.text(this.q(t,`time`),a(`time`),rp(n.clock)),i.text(this.q(t,`best`),a(`best`),n.bestLap>0?`BEST LAP ${rp(n.bestLap)}`:`BEST LAP —`),i.text(this.q(t,`pen`),a(`pen`),r.progress.penalty>0?`+${r.progress.penalty.toFixed(1)}s`:``);let l=300-n.clock;i.text(this.q(t,`limit`),a(`limit`),l<30&&!r.progress.finished&&n.countdown<=0?`TIME LIMIT ${Math.max(0,l).toFixed(0)}s`:``);let u=Math.round(Math.abs(r.vF)*3.6),d=r.boostTime>0||r.meterBoosting;i.text(this.q(t,`speed`),a(`speed`),String(u)),this.drawDial(t,u,r.meter,d);let f=Math.floor(r.meter*4+1e-6),p=this.q(t,`segs`);if(p){p.querySelectorAll(`.segs i`).forEach((e,t)=>{let n=Math.max(0,Math.min(1,r.meter*4-t)).toFixed(2);i.style(e,a(`seg${t}`),`--f`,n),i.cls(e,a(`segon${t}`),`on`,t<f)}),i.cls(p,a(`segactive`),`active`,r.meterBoosting),i.cls(p,a(`segready`),`ready`,r.meter>=1&&!r.meterBoosting);let e=r.meterBoosting?`FIRING`:r.meter>=1?`READY`:`${Math.ceil((1-r.meter)*Gf.car.nitroCooldown)}s`;i.text(this.q(t,`nitrost`),a(`nitrost`),e),f>this.lastMeterSeg[t]&&this.fx.at(p.querySelectorAll(`.segs i`)[f-1]??null,`#7ef9ff`,10,220,{size:1.6,ring:!1,glints:1}),r.meterBoosting&&Math.random()<.5&&this.fx.edge(p.querySelector(`.segs`),`#9ff6ff`,r.meter,2)}this.lastMeterSeg[t]=f;let m=r.drift?r.driftTier:0,h=this.q(t,`dpips`);if(h){h.querySelectorAll(`i`).forEach((e,t)=>{i.cls(e,a(`dp${t}`),`lit`,t<m),i.style(e,a(`dpc${t}`),`--c`,Lh[t+1])});let e=r.drift?Math.min(1,r.driftCharge/cp[2]):0;i.style(h,a(`dch`),`--p`,e.toFixed(2)),i.cls(h,a(`drifting`),`drifting`,r.drift)}i.text(this.q(t,`driftlabel`),a(`dl`),r.drift?[`DRIFT`,`MINI-TURBO`,`SUPER`,`ULTRA`][m]:`DRIFT`),i.cls(this.q(t,`draft`),a(`draft`),`show`,r.drafting||r.draftCharge>.05);let g=this.q(t,`assist`),_=e.assistModes[t]??`off`;i.cls(g,a(`assistOn`),`on`,_!==`off`),i.text(this.q(t,`assistmode`),a(`assistMode`),_===`light`?`LIGHT`:`STRONG`),i.cls(g,a(`assistAct`),`act`,_!==`off`&&(e.assistLevel[e.humans[t]]??0)>.18),i.style(this.q(t,`draft`),a(`draftp`),`--p`,r.draftCharge.toFixed(2));let v=r.item?Ih[r.item]:null,y=this.q(t,`itemslot`);i.cls(y,a(`has`),`has`,!!v),i.style(y,a(`ic`),`--ic`,v?.color??`#b58cff`),i.html(this.q(t,`itemicon`),a(`icon`),v?v.icon:`<span class="empty">?</span>`),i.text(this.q(t,`itemname`),a(`iname`),v?v.name:e.sim.items?`NO ITEM`:`ITEMS OFF`),i.text(this.q(t,`itemhint`),a(`ihint`),v?v.hint:e.sim.items?`Drive through a pink crystal`:`Pure racing — no items this run`),i.cls(y,a(`shield`),`shielded`,r.shield>0),i.cls(y,a(`off`),`off`,!e.sim.items),i.cls(this.q(t,`wseek`),a(`ws`),`show`,r.warnSeeker>=0&&!r.warnLocked),i.text(this.q(t,`wseek`),a(`wst`),r.warnSeeker>=0?`SEEKER INCOMING ${Math.round(r.warnSeeker)} m`:``),i.cls(this.q(t,`wlock`),a(`wl`),`show`,r.warnLocked),i.cls(this.q(t,`wmine`),a(`wm`),`show`,r.warnMine>=0),i.cls(this.q(t,`flash`),a(`lockedge`),`locked`,r.warnLocked);let b=e.styleOf(t),x=this.q(t,`style`);if(b&&x){let e=b.chain>0;i.cls(x,a(`scshow`),`show`,e),e&&(i.text(this.q(t,`sclabel`),a(`scl`),b.last),i.text(this.q(t,`scpts`),a(`scp`),`+${b.chain.toLocaleString(`en-US`)}`),i.text(this.q(t,`scmult`),a(`scm`),`×${b.mult}`),i.style(this.q(t,`sctimer`),a(`sct`),`--p`,b.window.toFixed(3))),i.cls(x,a(`schot`),`hot`,b.mult>=3)}let S=n.countdown,C=e.online&&e.online.targetTick()<0?`GET READY`:S>0?String(Math.ceil(S)):n.clock<1&&e.sim.phase===`racing`?`GO!`:``,w=this.q(t,`count`);i.text(w,a(`count`),C),i.cls(w,a(`countgo`),`go`,C===`GO!`),i.cls(w,a(`countwait`),`wait`,C===`GET READY`),i.cls(this.q(t,`wrong`),a(`wrong`),`show`,r.wrongWay>1.2&&r.recovering<=0&&!r.progress.finished);let T=r.wreck>0||r.recovering>0||r.hold>0,E=this.q(t,`hold`);if(i.cls(E,a(`hold`),`show`,T&&!r.progress.finished),T){let e=r.wreck>0?`WRECKED`:r.recovering>0?`RESETTING`:`RESPAWN HOLD`;i.text(this.q(t,`holdlabel`),a(`holdl`),e),i.text(this.q(t,`holdn`),a(`holdn`),String(Math.max(1,Math.ceil(r.hold>0?r.hold:mp)))),i.style(this.q(t,`holdp`),a(`holdp`),`--p`,(r.hold>0?1-r.hold/mp:0).toFixed(3)),i.text(this.q(t,`holdhint`),a(`holdh`),r.wreck>0?`Too much damage — rebuilding on the spot`:`Engine restarting — keep your throttle ready`),i.cls(E,a(`holdw`),`wreck`,r.wreck>0)}let D=Math.round((1-(r.wreck>0?1:r.damage))*100),O=this.q(t,`hull`);i.style(this.q(t,`hullfill`),a(`hullf`),`--p`,(D/100).toFixed(3)),i.text(this.q(t,`hullpct`),a(`hullp`),`${D}%`),i.text(this.q(t,`hulllabel`),a(`hulll`),r.damage>=.7||r.wreck>0?`ON FIRE`:r.damage>=.35?`SMOKING`:`HULL`),i.cls(O,a(`hullw`),`warn`,r.damage>=.35&&r.damage<.7),i.cls(O,a(`hullc`),`crit`,r.damage>=.7||r.wreck>0),i.cls(this.views[t],a(`burning`),`burning`,!this.reduced&&(r.damage>=.7||r.wreck>0));let ee=Math.abs(e.track.bank[r.loc.i]??0),k=r.grounded&&r.wreck<=0&&(ee>.7||r.slip>.05),A=this.q(t,`wall`);if(i.cls(A,a(`wallshow`),`show`,k),k){let e=Math.max(0,r.anchor);i.style(this.q(t,`wallfill`),a(`wallf`),`--p`,Q(e/3,0,1).toFixed(3)),i.text(this.q(t,`wallg`),a(`wallg`),`${e.toFixed(1)} G`),i.text(this.q(t,`walllabel`),a(`walll`),r.slip>.25?`TOO SLOW — SLIDING`:r.slip>.05?`LOSING GRIP`:`WALL RIDE ${Math.round(Math.atan(ee)*180/Math.PI)}°`),i.cls(A,a(`walllow`),`low`,r.slip>.05)}let j=r.progress.finished?`FINISHED ${o}`:r.progress.dnf?`TIME LIMIT REACHED`:``;i.text(this.q(t,`done`),a(`done`),j),i.cls(this.q(t,`done`),a(`doneshow`),`show`,!!j);let M=this.q(t,`lines`);i.cls(M,a(`lines`),`show`,!this.reduced&&(d||u>190)),i.cls(M,a(`linesb`),`boost`,d),i.cls(M,a(`linesm`),`meter`,r.meterBoosting)}drawDial(e,t,n,r){let i=this.q(e,`dialc`),a=i?.getContext(`2d`);if(!i||!a)return;let o=Math.PI*.75,s=Math.PI*1.5,c=e=>o+s*Math.max(0,Math.min(1,e/Rh));this.dialNeedle[e]+=(t-this.dialNeedle[e])*.35;let l=this.dialNeedle[e];a.clearRect(0,0,260,260);let u=a.createRadialGradient(130,110,10,130,130,112);u.addColorStop(0,`rgba(46,30,40,0.92)`),u.addColorStop(1,`rgba(14,10,18,0.92)`),a.fillStyle=u,a.beginPath(),a.arc(130,130,110,0,Math.PI*2),a.fill();let d=a.createLinearGradient(0,26,0,234);d.addColorStop(0,`#ffe6a1`),d.addColorStop(.5,`#b8862e`),d.addColorStop(1,`#6d4a17`),a.strokeStyle=d,a.lineWidth=5,a.beginPath(),a.arc(130,130,110,0,Math.PI*2),a.stroke(),a.lineCap=`butt`,a.lineWidth=10,a.strokeStyle=`rgba(255,255,255,0.08)`,a.beginPath(),a.arc(130,130,94,o,o+s),a.stroke();let f=a.createLinearGradient(26,0,234,0);f.addColorStop(0,`#3fb6ff`),f.addColorStop(.6,`#7ef9ff`),f.addColorStop(.8,`#ffb020`),f.addColorStop(1,`#ff4d5e`),a.strokeStyle=f,a.beginPath(),a.arc(130,130,94,o,c(l)),a.stroke(),a.strokeStyle=`rgba(255,77,94,0.85)`,a.lineWidth=4,a.beginPath(),a.arc(130,130,105,c(240),c(300)),a.stroke(),a.font=`700 13px Sora, system-ui, sans-serif`,a.textAlign=`center`,a.textBaseline=`middle`;for(let e=0;e<=Rh;e+=10){let t=c(e),n=e%30==0,r=104-(n?26:21);a.strokeStyle=e>=240?`#ff6b6b`:n?`#fff4dc`:`rgba(245,230,204,0.45)`,a.lineWidth=n?2.5:1.2,a.beginPath(),a.moveTo(130+Math.cos(t)*r,130+Math.sin(t)*r),a.lineTo(130+Math.cos(t)*87,130+Math.sin(t)*87),a.stroke(),e%60==0&&(a.fillStyle=e>=240?`#ff8a8a`:`rgba(245,230,204,0.85)`,a.fillText(String(e),130+Math.cos(t)*64,130+Math.sin(t)*64))}let p=Math.PI*.8,m=Math.PI*.55;a.lineCap=`round`,a.lineWidth=9,a.strokeStyle=`rgba(126,249,255,0.12)`,a.beginPath(),a.arc(130,130,121,p,p+m),a.stroke(),n>.001&&(a.shadowColor=`#7ef9ff`,a.shadowBlur=r?18:8,a.strokeStyle=r?`#c8fdff`:`#4fd8ff`,a.beginPath(),a.arc(130,130,121,p+m*(1-n),p+m),a.stroke(),a.shadowBlur=0);let h=c(l);a.shadowColor=`#ff9a2a`,a.shadowBlur=10,a.strokeStyle=`#ffb020`,a.lineWidth=4,a.beginPath(),a.moveTo(130-Math.cos(h)*12,130-Math.sin(h)*12),a.lineTo(130+Math.cos(h)*88,130+Math.sin(h)*88),a.stroke(),a.shadowBlur=0,a.fillStyle=`#2a1a22`,a.strokeStyle=`#ffd23f`,a.lineWidth=2,a.beginPath(),a.arc(130,130,7,0,Math.PI*2),a.fill(),a.stroke()}drawMap(e){let t=this.minimap.getContext(`2d`);if(!t||!this.mapPath)return;t.clearRect(0,0,440,440),t.save(),t.beginPath(),t.arc(220,220,210,0,Math.PI*2),t.clip();let n=t.createRadialGradient(220,220,20,220,220,220);n.addColorStop(0,`rgba(92,58,40,0.78)`),n.addColorStop(1,`rgba(26,16,20,0.9)`),t.fillStyle=n,t.fillRect(0,0,440,440),t.lineJoin=`round`,t.lineCap=`round`,t.strokeStyle=`rgba(10,6,10,0.8)`,t.lineWidth=22,t.stroke(this.mapPath),t.strokeStyle=`#f7ecd8`,t.lineWidth=9,t.stroke(this.mapPath);let r=e.track,i=e.hud(0),a=r.gates[i.gate-1];if(a&&!i.car.progress.finished){let[e,n]=this.mapPoint(r.x[a.sample],r.z[a.sample]),i=9+Math.sin(this.clock*8)*3;t.fillStyle=`rgba(126,249,255,0.35)`,t.beginPath(),t.arc(e,n,i+6,0,Math.PI*2),t.fill(),t.fillStyle=`#7ef9ff`,t.beginPath(),t.arc(e,n,7,0,Math.PI*2),t.fill()}let[o,s]=this.mapPoint(r.x[0],r.z[0]);for(let e=0;e<4;e+=1)for(let n=0;n<4;n+=1)t.fillStyle=(e+n)%2?`#111`:`#fff`,t.fillRect(o-10+e*5,s-10+n*5,5,5);for(let n of e.markers()){let[e,r]=this.mapPoint(n.x,n.z);t.globalAlpha=n.ghost?.6:1,n.human&&(t.fillStyle=`rgba(255,255,255,0.25)`,t.beginPath(),t.arc(e,r,20,0,Math.PI*2),t.fill()),t.fillStyle=$p[n.livery]?.primary??`#fff`,t.strokeStyle=n.human?`#fff`:`#1b1030`,t.lineWidth=n.human?5:3.5,t.beginPath(),t.arc(e,r,n.human?12:9,0,Math.PI*2),t.fill(),t.stroke()}t.globalAlpha=1,t.restore();let c=t.createLinearGradient(0,0,0,440);c.addColorStop(0,`#ffe6a1`),c.addColorStop(.5,`#b8862e`),c.addColorStop(1,`#6d4a17`),t.strokeStyle=c,t.lineWidth=9,t.beginPath(),t.arc(220,220,210,0,Math.PI*2),t.stroke(),t.strokeStyle=`rgba(255,230,160,0.35)`,t.lineWidth=2;for(let e=0;e<24;e+=1){let n=e/24*Math.PI*2,r=220-(e%6==0?40:32);t.beginPath(),t.moveTo(220+Math.cos(n)*194,220+Math.sin(n)*194),t.lineTo(220+Math.cos(n)*r,220+Math.sin(n)*r),t.stroke()}}setOnline(e){let t=this.root.querySelector(`[data-online]`);t.textContent!==e&&(t.textContent=e),t.classList.toggle(`show`,!!e)}},Hh=700,Uh=class{canvas;g;ps=[];free=[];dpr=1;w=0;h=0;enabled=!0;scale=1;constructor(e){this.canvas=document.createElement(`canvas`),this.canvas.className=`uifx`,e.appendChild(this.canvas),this.g=this.canvas.getContext(`2d`),this.resize(),window.addEventListener(`resize`,()=>this.resize())}resize(){this.dpr=Math.min(2,window.devicePixelRatio||1),this.w=window.innerWidth,this.h=window.innerHeight,this.canvas.width=Math.round(this.w*this.dpr),this.canvas.height=Math.round(this.h*this.dpr)}spawn(){if(this.ps.length>=Hh*this.scale)return null;let e=this.free.pop()??{};return this.ps.push(e),e}burst(e,t,n,r=18,i=380,a={}){if(!this.enabled)return;let o=Math.round(r*this.scale),s=a.spread??Math.PI*2,c=a.up===void 0?0:-Math.PI/2;for(let r=0;r<o;r+=1){let r=this.spawn();if(!r)break;let o=c+(a.up===void 0?Math.random()*s:(Math.random()-.5)*s),l=i*(.35+Math.random()*.75);r.x=e,r.y=t,r.vx=Math.cos(o)*l,r.vy=Math.sin(o)*l-(a.up??0),r.max=r.life=.35+Math.random()*.45,r.size=(a.size??2.4)*(.6+Math.random()*.8),r.color=n,r.kind=Math.random()<.7?0:1,r.drag=2.6,r.grav=520}a.ring!==!1&&this.ring(e,t,n,70*(a.size??2.4)/2.4);for(let n=0;n<(a.glints??2);n+=1)this.glint(e+(Math.random()-.5)*60,t+(Math.random()-.5)*30,`#ffffff`,16+Math.random()*14)}ring(e,t,n,r=70,i=.45){if(!this.enabled)return;let a=this.spawn();a&&(a.x=e,a.y=t,a.vx=0,a.vy=0,a.max=a.life=i,a.size=r,a.color=n,a.kind=2,a.drag=0,a.grav=0)}glint(e,t,n,r=22){if(!this.enabled)return;let i=this.spawn();i&&(i.x=e,i.y=t,i.vx=0,i.vy=0,i.max=i.life=.35+Math.random()*.2,i.size=r,i.color=n,i.kind=3,i.drag=0,i.grav=0)}at(e,t,n=18,r=380,i={}){if(!e)return;let a=e.getBoundingClientRect();a.width&&this.burst(a.left+a.width/2,a.top+a.height/2,t,n,r,i)}edge(e,t,n,r=6){if(!e||!this.enabled)return;let i=e.getBoundingClientRect();if(!i.width)return;let a=i.left+i.width*Math.max(0,Math.min(1,n));for(let e=0;e<r;e+=1){let e=this.spawn();if(!e)break;e.x=a,e.y=i.top+Math.random()*i.height,e.vx=-40-Math.random()*120,e.vy=-60-Math.random()*160,e.max=e.life=.3+Math.random()*.3,e.size=1.6+Math.random()*1.6,e.color=t,e.kind=0,e.drag=3,e.grav=380}}get count(){return this.ps.length}update(e){let t=this.g;if(t.setTransform(this.dpr,0,0,this.dpr,0,0),t.clearRect(0,0,this.w,this.h),this.ps.length){t.globalCompositeOperation=`lighter`;for(let n=this.ps.length-1;n>=0;--n){let r=this.ps[n];if(r.life-=e,r.life<=0){this.ps[n]=this.ps[this.ps.length-1],this.ps.pop(),this.free.push(r);continue}let i=Math.exp(-r.drag*e);r.vx*=i,r.vy=r.vy*i+r.grav*e,r.x+=r.vx*e,r.y+=r.vy*e;let a=r.life/r.max;switch(t.globalAlpha=Math.min(1,a*1.6),r.kind){case 0:t.strokeStyle=r.color,t.lineWidth=r.size,t.lineCap=`round`,t.beginPath(),t.moveTo(r.x,r.y),t.lineTo(r.x-r.vx*.035,r.y-r.vy*.035),t.stroke();break;case 1:{let e=r.size*2.2,n=t.createRadialGradient(r.x,r.y,0,r.x,r.y,e);n.addColorStop(0,`#ffffff`),n.addColorStop(.35,r.color),n.addColorStop(1,`rgba(0,0,0,0)`),t.fillStyle=n,t.fillRect(r.x-e,r.y-e,e*2,e*2);break}case 2:{let e=1-a;t.strokeStyle=r.color,t.lineWidth=5*a+.5,t.beginPath(),t.arc(r.x,r.y,r.size*(.25+e*.9),0,Math.PI*2),t.stroke();break}case 3:{let e=r.size*Math.sin(a*Math.PI);t.fillStyle=r.color,t.beginPath(),t.moveTo(r.x,r.y-e),t.quadraticCurveTo(r.x,r.y,r.x+e*.22,r.y),t.quadraticCurveTo(r.x,r.y,r.x,r.y+e),t.quadraticCurveTo(r.x,r.y,r.x-e*.22,r.y),t.quadraticCurveTo(r.x,r.y,r.x,r.y-e),t.moveTo(r.x-e,r.y),t.quadraticCurveTo(r.x,r.y,r.x,r.y+e*.22),t.quadraticCurveTo(r.x,r.y,r.x+e,r.y),t.quadraticCurveTo(r.x,r.y,r.x,r.y-e*.22),t.quadraticCurveTo(r.x,r.y,r.x-e,r.y),t.fill();break}}}t.globalAlpha=1,t.globalCompositeOperation=`source-over`}}clear(){for(;this.ps.length;)this.free.push(this.ps.pop())}},Wh={auto:`Any device`,kbLeft:`Keyboard — WASD`,kbRight:`Keyboard — Arrows`,pad0:`Gamepad 1`,pad1:`Gamepad 2`},Gh=[{id:`solo`,title:`Solo Race`,text:`You vs two AI rivals. 3 laps, 48 gates, fair items.`,icon:`1P`},{id:`lab`,title:`Track Lab`,text:`Shape a custom canyon loop and test-drive it.`,icon:`LAB`}];function Kh(e,t,n){let r=$p[e];return`<button type="button" class="swatch${e===t?` sel`:``}" data-${n}="${e}" style="--a:${r.primary};--b:${r.secondary}" aria-label="${r.name} livery" title="${r.name}"></button>`}function qh(e,t,n,r,i){return`<label class="slider">${t}<input type="range" min="${n}" max="${r}" step="${i}" data-lab="${e}" /><output data-lab-out="${e}"></output></label>`}function Jh(e,t){return`<label class="slider">${t}<input type="range" min="0" max="1" step="0.05" data-set="${e}" /><output data-set-out="${e}"></output></label>`}function Yh(e,t,n){return`<label class="slider forge-slider"><span>${t}<small>${n}</small></span><input type="range" min="0" max="100" step="1" data-cf-range="${e}" /><output data-cf-out="${e}"></output></label>`}function Xh(){return`
  <section class="screen" data-screen="boot"><div class="boot"><img class="boot-mark" src="./assets/ui/canyon-rush-mark.png" alt="" width="128" height="128" /><div class="logo small" aria-label="Canyon Rush Circuit"><span>CANYON RUSH</span><b>CIRCUIT</b></div><div class="boot-bar"><i data-boot></i></div><p>Carving the canyon…</p></div></section>

  <section class="screen" data-screen="title">
    <div class="title-wrap">
      <div class="logo" aria-label="Canyon Rush Circuit"><span>CANYON RUSH</span><b>CIRCUIT</b></div>
      <p class="tagline">Arcade racing through a sunlit desert canyon. Equal cars. Pure skill.</p>
      <button type="button" class="btn primary big" data-act="enter">Start Engine</button>
      <p class="press">Press <kbd>Enter</kbd> or <kbd>A</kbd></p>
    </div>
  </section>

  <section class="screen" data-screen="garage">
    <header class="topbar"><div class="logo tiny" aria-label="Canyon Rush Circuit"><span>CANYON RUSH</span><b>CIRCUIT</b></div><div class="grow"></div>
      <button type="button" class="btn ghost" data-act="controls">Controls</button><button type="button" class="btn ghost" data-act="settings">Settings</button></header>
    <div class="garage">
      <div class="panel ride">
        <h2>Your Ride</h2>
        <div class="carousel"><button type="button" class="btn icon" data-act="prevCar" aria-label="Previous chassis">◀</button><div class="car-name"><b data-g="chassis"></b><small data-g="blurb"></small></div><button type="button" class="btn icon" data-act="nextCar" aria-label="Next chassis">▶</button></div>
        <div class="swatches" data-g="swatches"></div>
        <div class="livery-name" data-g="livery"></div>
        <label class="field">Driver name<input type="text" maxlength="14" data-g="name" autocomplete="off" spellcheck="false" /></label>
        <p class="fair">Stock rides are balanced. Use <b>Car Forge</b> to build a custom machine with its own paint, aero and tuning.</p>
        <button type="button" class="btn primary" data-act="forge">Open Car Forge</button>
      </div>
      <div class="modes">${Gh.map(e=>`<button type="button" class="mode-card" data-mode="${e.id}"${e.id===`solo`?` data-autofocus`:``}><span class="mode-icon">${e.icon}</span><span class="mode-title">${e.title}</span><span class="mode-text">${e.text}</span></button>`).join(``)}</div>
      <div class="panel bests" data-g="bests"></div>
      <div class="panel progression" data-g="progression"></div>
    </div>
  </section>

  <section class="screen" data-screen="forge">
    <div class="setup panel wide forge">
      <div class="forge-head"><div><h2>Car Forge</h2><p class="sub">Start from a silhouette, make every surface yours, then take the build to any offline track.</p></div><span class="forge-stamp">BUILD / TEST / RACE</span></div>
      <div class="forge-grid">
        <div class="forge-controls">
          <label class="field">Build name<input type="text" maxlength="18" data-cf-field="name" autocomplete="off" spellcheck="false" /></label>
          <label class="field">Base silhouette<select data-cf-field="chassis">${Qp.map((e,t)=>`<option value="${t}">${e.name} — ${e.blurb}</option>`).join(``)}</select></label>
          <div class="forge-colors"><label class="color-field">Primary paint<input type="color" data-cf-field="primary" /></label><label class="color-field">Secondary paint<input type="color" data-cf-field="secondary" /></label><label class="color-field">Accent paint<input type="color" data-cf-field="accent" /></label></div>
          <h3>Paint studio <small class="muted">Choose a finish and a signature layout</small></h3>
          <div class="row"><span class="label">Finish</span><div class="seg" data-cf-seg="paintFinish"><button type="button" data-v="metallic">Metallic</button><button type="button" data-v="matte">Matte</button><button type="button" data-v="pearl">Pearl</button><button type="button" data-v="chrome">Chrome</button></div></div>
          <div class="row"><span class="label">Pattern</span><div class="seg" data-cf-seg="paintPattern"><button type="button" data-v="solid">Solid</button><button type="button" data-v="split">Split</button><button type="button" data-v="stripe">Stripe</button><button type="button" data-v="sunset">Sunset</button></div></div>
          <h3>Hardware</h3>
          <div class="row"><span class="label">Wheels</span><div class="seg" data-cf-seg="wheels"><button type="button" data-v="street">Street</button><button type="button" data-v="grip">Grip</button><button type="button" data-v="dirt">Dirt</button><button type="button" data-v="slick">Slick</button><button type="button" data-v="beadlock">Beadlock</button><button type="button" data-v="neon">Neon</button></div></div>
          <div class="row"><span class="label">Aero</span><div class="seg" data-cf-seg="aero"><button type="button" data-v="clean">Clean</button><button type="button" data-v="wing">Wing</button><button type="button" data-v="rally">Rally</button></div></div>
          <div class="row"><span class="label">Body kit</span><div class="seg" data-cf-seg="bodyKit"><button type="button" data-v="stock">Stock</button><button type="button" data-v="wide">Widebody</button><button type="button" data-v="street">Street</button><button type="button" data-v="retro">Retro</button></div></div>
          <div class="row"><span class="label">Hood</span><div class="seg" data-cf-seg="hood"><button type="button" data-v="smooth">Smooth</button><button type="button" data-v="vented">Vented</button><button type="button" data-v="carbon">Carbon</button></div></div>
          <div class="row"><span class="label">Spoiler</span><div class="seg" data-cf-seg="spoiler"><button type="button" data-v="none">None</button><button type="button" data-v="ducktail">Ducktail</button><button type="button" data-v="gt">GT wing</button><button type="button" data-v="drift">Drift</button></div></div>
          <h3>Tuning bench <small class="muted">Balanced within a narrow race-safe band</small></h3>
          ${Yh(`power`,`Power`,`launch + top speed`)}${Yh(`grip`,`Grip`,`corner control`)}${Yh(`boost`,`Boost`,`nitro punch`)}
        </div>
          <div class="forge-preview"><div class="forge-preview-card"><span class="forge-preview-label">LIVE PREVIEW</span><div class="forge-car-orb" data-cf-preview></div><b data-cf-preview-name></b><small data-cf-preview-meta></small></div><div class="forge-note"><b>Built locally</b><br />Your blueprint is saved in this browser and carries its palette, parts and tuning into every race mode.</div></div>
      </div>
      <div class="actions"><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn" data-act="resetCustom">Reset build</button><button type="button" class="btn primary" data-act="saveCustom" data-autofocus>Save &amp; use this car</button></div>
    </div>
  </section>

  <section class="screen" data-screen="solo">
    <div class="setup panel">
      <h2>Solo Race</h2><p class="sub">You vs two AI rivals · 3 laps · ${Kf} gates · 300 s limit</p>
      <div class="row"><span class="label">Track</span><div class="choices" data-s="tracks"></div></div>
      <div class="row"><span class="label">Rivals</span><div class="seg" data-s="skill"><button type="button" data-v="relaxed">Relaxed</button><button type="button" data-v="pro">Pro</button></div></div>
      <div class="row"><span class="label">Items</span><div class="seg" data-s="items"><button type="button" data-v="on">On</button><button type="button" data-v="off">Off</button></div></div>
      <div class="actions"><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn primary" data-act="goSolo" data-autofocus>Race!</button></div>
    </div>
  </section>

  <section class="screen" data-screen="split">
    <div class="setup panel wide">
      <h2>Split-Screen</h2><p class="sub">Two local players plus one AI rival. Pick a device for each player.</p>
      <div class="players">
        <div class="pcard"><h3>Player 1</h3><div class="carousel"><button type="button" class="btn icon" data-act="p1Prev" aria-label="Previous chassis">◀</button><div class="car-name"><b data-sp="c1"></b></div><button type="button" class="btn icon" data-act="p1Next" aria-label="Next chassis">▶</button></div><div class="swatches" data-sp="s1"></div><label class="field">Controls<select data-sp="d1"></select></label></div>
        <div class="pcard"><h3>Player 2</h3><div class="carousel"><button type="button" class="btn icon" data-act="p2Prev" aria-label="Previous chassis">◀</button><div class="car-name"><b data-sp="c2"></b></div><button type="button" class="btn icon" data-act="p2Next" aria-label="Next chassis">▶</button></div><div class="swatches" data-sp="s2"></div><label class="field">Controls<select data-sp="d2"></select></label></div>
      </div>
      <div class="row"><span class="label">Track</span><div class="choices" data-sp="tracks"></div></div>
      <div class="row"><span class="label">Items</span><div class="seg" data-sp="items"><button type="button" data-v="on">On</button><button type="button" data-v="off">Off</button></div></div>
      <p class="note" data-sp="note"></p>
      <div class="actions"><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn primary" data-act="goSplit" data-autofocus>Race!</button></div>
    </div>
  </section>

  <section class="screen" data-screen="lab">
    <div class="setup panel wide lab">
      <h2>Track Lab</h2><p class="sub">Every layout keeps 16 ordered gates per lap. Shape it, check it, then test-drive or race it.</p>
      <div class="lab-grid">
        <div class="lab-controls">
          <label class="field">Track name<input type="text" maxlength="24" data-l="name" autocomplete="off" spellcheck="false" /></label>
          ${qh(`size`,`Size`,.7,1.3,.05)}
          ${qh(`twist`,`Twist`,0,1,.05)}
          ${qh(`hills`,`Hills`,0,1,.05)}
          ${qh(`width`,`Road width`,16,24,1)}
          ${qh(`canyon`,`Canyon walls`,0,1,.05)}
          ${qh(`ramps`,`Ramps`,0,4,1)}
          ${qh(`pads`,`Boost pads`,0,10,1)}
          ${qh(`items`,`Item rows`,0,4,1)}
          <div class="lab-seed"><span>Seed <b data-l="seed"></b></span><button type="button" class="btn small" data-act="labRandom">New layout</button></div>
        </div>
        <div class="lab-preview">
          <canvas width="360" height="360" data-l="map"></canvas>
          <div class="lab-check" data-l="check"></div>
          <div class="lab-code"><span>Share code</span><code data-l="code"></code><button type="button" class="btn small" data-act="labCopy">Copy</button></div>
          <div class="lab-import"><input type="text" placeholder="Paste a share code" data-l="import" autocomplete="off" spellcheck="false" /><button type="button" class="btn small" data-act="labImport">Load</button></div>
        </div>
        <div class="lab-saved"><h3>Saved tracks</h3><div data-l="saved"></div></div>
      </div>
      <div class="actions"><button type="button" class="btn" data-act="back">Back</button><button type="button" class="btn" data-act="labSave">Save</button><button type="button" class="btn" data-act="labRace">Race vs AI</button><button type="button" class="btn primary" data-act="labTest" data-autofocus>Test Drive</button></div>
    </div>
  </section>

  <section class="screen" data-screen="online">
    <div class="setup panel wide online-panel">
      <h2>Multiplayer</h2><p class="sub">Create or join a room for a shared canyon race. Everyone keeps their selected car and races the same track.</p>
      <div data-o="status" class="net-status"></div>
      <div data-o="join" class="online-join"><label class="field">Room code <input data-o="code" maxlength="6" placeholder="e.g. 7KQ2M" autocomplete="off" spellcheck="false" /></label><div class="actions"><button type="button" class="btn" data-act="onJoin">Join room</button><button type="button" class="btn primary" data-act="onCreate">Create room</button></div></div>
      <div data-o="lobby"></div>
      <div class="actions"><button type="button" class="btn" data-act="onBack">Back</button></div>
    </div>
  </section>

  <section class="screen" data-screen="hud"></section>

  <section class="screen" data-screen="pause">
    <div class="modal panel">
      <h2>Paused</h2><p class="sub" data-p="note"></p>
      <div class="stack"><button type="button" class="btn primary" data-act="resume" data-autofocus>Resume</button><button type="button" class="btn" data-act="restart">Restart race</button><button type="button" class="btn" data-act="controls">Controls</button><button type="button" class="btn" data-act="settings">Settings</button><button type="button" class="btn" data-act="quit">Quit to garage</button></div>
    </div>
  </section>

  <section class="screen" data-screen="results">
    <div class="modal panel results"><div data-r="body"></div>
      <div class="actions"><button type="button" class="btn" data-act="toGarage">Garage</button><button type="button" class="btn" data-act="editLab" data-r="edit">Edit track</button><button type="button" class="btn primary" data-act="rematch" data-autofocus data-r="rematch">Rematch</button></div>
    </div>
  </section>

  <div class="overlay" data-modal="settings"><div class="modal panel">
    <h2>Settings</h2>
    ${Jh(`musicVolume`,`Music`)}${Jh(`sfxVolume`,`Sound effects`)}
    <label class="check"><input type="checkbox" data-set="muted" /> Mute all audio</label>
    <div class="row"><span class="label">Graphics</span><div class="seg" data-set="quality"><button type="button" data-v="low">Low</button><button type="button" data-v="medium">Medium</button><button type="button" data-v="high">High</button></div></div>
    <label class="check"><input type="checkbox" data-set="reducedMotion" /> Reduced motion (no speed lines or FOV kick)</label>
    <label class="check"><input type="checkbox" data-set="cameraShake" /> Camera shake</label>
    <div class="row"><span class="label">Corner assist · P1</span><div class="seg" data-set="assistP1"><button type="button" data-v="off">Off</button><button type="button" data-v="light">Light</button><button type="button" data-v="strong">Strong</button></div></div>
    <div class="row"><span class="label">Corner assist · P2</span><div class="seg" data-set="assistP2"><button type="button" data-v="off">Off</button><button type="button" data-v="light">Light</button><button type="button" data-v="strong">Strong</button></div></div>
    <p class="hint small">Steering and entry-speed help in bends. P1 covers solo and online; P2 is the second split-screen driver. Assisted times are tagged <em class="assist-tag">ASSIST</em>.</p>
    <div class="actions"><button type="button" class="btn primary" data-act="closeModal">Done</button></div>
  </div></div>

  <div class="overlay" data-modal="controls"><div class="modal panel controls">
    <h2>Controls</h2>
    <table>
      <tr><th></th><th>Player 1 / Solo</th><th>Player 2</th><th>Gamepad</th></tr>
      <tr><td>Throttle</td><td><kbd>W</kbd> (<kbd>↑</kbd> solo)</td><td><kbd>↑</kbd></td><td>RT or A</td></tr>
      <tr><td>Brake / reverse</td><td><kbd>S</kbd></td><td><kbd>↓</kbd></td><td>LT or X</td></tr>
      <tr><td>Steer</td><td><kbd>A</kbd> <kbd>D</kbd></td><td><kbd>←</kbd> <kbd>→</kbd></td><td>Left stick / D-pad</td></tr>
      <tr><td>Drift (hold) · air trick (tap)</td><td><kbd>Space</kbd></td><td><kbd>R-Shift</kbd> <kbd>/</kbd> <kbd>Num0</kbd></td><td>RB or LB</td></tr>
      <tr><td>Nitro (tap · 8 s cooldown)</td><td><kbd>L-Shift</kbd></td><td><kbd>.</kbd> <kbd>Num1</kbd></td><td>B</td></tr>
      <tr><td>Use item</td><td><kbd>E</kbd></td><td><kbd>,</kbd> <kbd>Num2</kbd></td><td>Y</td></tr>
      <tr><td>Reset to road (3 s hold)</td><td><kbd>R</kbd></td><td><kbd>L</kbd> <kbd>Num3</kbd></td><td>Back / R3</td></tr>
      <tr><td>Field repair · 2 uses per match</td><td><kbd>T</kbd> or phone <kbd>FIX</kbd></td><td>—</td><td>—</td></tr>
      <tr><td>Pause</td><td colspan="2"><kbd>Esc</kbd> or <kbd>P</kbd></td><td>Start</td></tr>
    </table>
    <ul class="tips">
      <li><b>Launch:</b> press throttle in the last half-second of the countdown for a perfect start. Too early spins the wheels.</li>
      <li><b>Drift:</b> hold drift while steering at speed. Sparks change colour as the charge builds — release for a mini, super or ultra turbo.</li>
      <li><b>Pads:</b> hit the glowing centre stripe of a boost pad for a longer perfect boost.</li>
      <li><b>Air:</b> steer in the air, tap drift to flip. Land a completed trick for boost; land mid-trick and you spin.</li>
      <li><b>Slipstream:</b> tuck in behind a rival to charge a draft boost.</li>
      <li><b>Nitro:</b> tap Shift for a short blue-flame burst. It recharges in 8 s; drift boosts, tricks and perfect pads recharge it faster.</li>
      <li><b>Corkscrews:</b> the boost pads on the run-in and inside the roll keep you pinned. Too slow at the top and you fall off — save a nitro for the entry.</li>
      <li><b>Items:</b> every threat is announced. Change lanes when a Seeker locks on, or raise a Shield. Armed mines blink red.</li>
    </ul>
    <div class="actions"><button type="button" class="btn primary" data-act="closeModal">Got it</button></div>
  </div></div>

  <div class="overlay loading" data-loading><div class="spinner"></div><p data-loading-text>Loading…</p></div>
  <div class="toast" data-toast role="status" aria-live="polite"></div>`}var Zh=` <em class="assist-tag" title="Driven with corner assist on">ASSIST</em>`,Qh=class{app;save;audio;input;net;actions;screen=`boot`;root;hud;fx;hoverEl=null;hoverAt=0;lab={...ef};labTimer=0;labEditing=null;soloTrack=Mh;splitTrack=Mh;lastResults=null;modal=null;navCooldown=0;toastTimer=0;touchActionAt=0;pendingRoom=``;customDraft={...uf};constructor(e,t,n,r,i,a){this.app=e,this.save=t,this.audio=n,this.input=r,this.net=i,this.actions=a,this.root=document.getElementById(`ui`),this.root.innerHTML=Xh(),this.fx=new Uh(document.body),this.hud=new Vh(this.el(`[data-screen="hud"]`),this.fx),this.bind(),this.refreshSettings();let o=new URLSearchParams(location.search).get(`room`);o&&(this.pendingRoom=o.toUpperCase().replace(/[^A-Z0-9]/g,``).slice(0,6))}el(e){return this.root.querySelector(e)}bind(){this.root.addEventListener(`pointerover`,e=>{let t=e.target.closest(`button, .mode-card, .swatch`);if(!t||t===this.hoverEl||this.screen===`hud`)return;this.hoverEl=t;let n=performance.now();if(n-this.hoverAt<70)return;this.hoverAt=n;let r=t.getBoundingClientRect();this.fx.glint(r.right-10,r.top+8,`#fff4dc`,14),this.fx.edge(t,`#ffd23f`,Math.random(),3),this.audio.play(`ui`,.45)}),this.root.addEventListener(`pointerdown`,e=>{let t=e.target.closest(`button, .mode-card, .swatch`);if(!t||this.screen===`hud`)return;let n=t.classList.contains(`primary`)||t.classList.contains(`big`),r=n?`#ff9a4a`:t.classList.contains(`mode-card`)?`#7ef9ff`:`#ffd23f`;this.fx.burst(e.clientX,e.clientY,r,n?34:18,n?520:360,{size:n?2.8:2,glints:n?3:1})}),this.root.addEventListener(`click`,e=>{if(performance.now()-this.touchActionAt<500)return;let t=e.target.closest(`button`);if(!t||!this.root.contains(t)||t.closest(`.seg`))return;this.audio.unlock();let n=t.dataset.act;if(n){this.audio.play(n===`back`||n===`onBack`||n===`closeModal`?`back`:`confirm`),this.act(n);return}if(t.dataset.mode){this.audio.play(`confirm`),this.openMode(t.dataset.mode);return}t.dataset.swatch!==void 0||t.dataset.sw1!==void 0?(this.audio.play(`ui`),this.settings({livery:Number(t.dataset.swatch??t.dataset.sw1)})):t.dataset.sw2!==void 0&&(this.audio.play(`ui`),this.settings({p2Livery:Number(t.dataset.sw2)}))});let e=this.el(`[data-g="name"]`);e.addEventListener(`change`,()=>this.settings({playerName:zf(e.value)})),this.root.addEventListener(`pointerup`,e=>{if(e.pointerType!==`touch`)return;let t=e.target.closest(`button[data-act]`);t&&this.root.contains(t)&&[`pause`,`results`].includes(this.screen)&&(this.touchActionAt=performance.now(),e.preventDefault(),e.stopPropagation(),this.audio.unlock(),this.act(t.dataset.act))}),this.root.querySelectorAll(`[data-cf-field]`).forEach(e=>{e.addEventListener(`input`,()=>this.customFieldChanged(e)),e.addEventListener(`change`,()=>this.customFieldChanged(e))}),this.root.querySelectorAll(`input[data-cf-range]`).forEach(e=>e.addEventListener(`input`,()=>{let t=e.dataset.cfRange;this.customDraft={...this.customDraft,[t]:Number(e.value)},this.refreshCustomForm()})),this.root.querySelectorAll(`.seg`).forEach(e=>{e.addEventListener(`click`,t=>{let n=t.target.closest(`button[data-v]`);if(!n)return;this.audio.unlock(),this.audio.play(`ui`);let r=n.dataset.v;if(e.dataset.cfSeg){this.customDraft={...this.customDraft,[e.dataset.cfSeg]:r},this.refreshCustomForm();return}e.dataset.s===`skill`&&this.settings({aiSkill:r}),(e.dataset.s===`items`||e.dataset.sp===`items`)&&this.settings({items:r===`on`}),e.dataset.set===`quality`&&this.settings({quality:r}),e.dataset.set===`assistP1`&&this.settings({assistP1:r}),e.dataset.set===`assistP2`&&this.settings({assistP2:r}),this.refreshSettings()})}),this.root.querySelectorAll(`input[data-set]`).forEach(e=>{e.addEventListener(`input`,()=>{let t=e.dataset.set;e.type===`checkbox`?this.settings({[t]:e.checked}):this.settings({[t]:Number(e.value)}),this.refreshSettings()})});for(let e of[`d1`,`d2`]){let t=this.el(`[data-sp="${e}"]`);t.innerHTML=[`kbLeft`,`kbRight`,`pad0`,`pad1`].map(e=>`<option value="${e}">${Wh[e]}</option>`).join(``),t.addEventListener(`change`,()=>this.settings(e===`d1`?{p1Device:t.value}:{p2Device:t.value}))}this.root.querySelectorAll(`input[data-lab]`).forEach(e=>{e.addEventListener(`input`,()=>{let t=e.dataset.lab;this.lab=tf({...this.lab,[t]:Number(e.value)}),this.labChanged()})});let t=this.el(`[data-l="name"]`);t.addEventListener(`input`,()=>{this.lab=tf({...this.lab,name:t.value}),this.refreshLabCode()}),this.root.querySelector(`[data-o="code"]`)?.addEventListener(`keydown`,e=>{e.key===`Enter`&&this.act(`onJoin`)}),window.addEventListener(`keydown`,e=>{if(e.repeat)return;let t=e.target instanceof HTMLInputElement&&e.target.type===`text`,n={ArrowUp:[0,1],ArrowDown:[0,-1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.key];if(n&&!t&&this.screen!==`hud`&&this.screen!==`boot`){let t=e.target;if(!(t instanceof HTMLInputElement&&t.type===`range`&&n[0]!==0||t instanceof HTMLSelectElement)){e.preventDefault(),this.moveFocus(n[0],n[1]);return}}e.key===`Enter`&&this.screen===`title`?(e.preventDefault(),this.act(`enter`)):e.key===`Escape`&&this.modal?this.act(`closeModal`):e.key===`Escape`&&[`forge`,`solo`,`split`,`lab`].includes(this.screen)?this.act(`back`):e.key===`Escape`&&this.screen===`online`?this.act(`onBack`):this.screen===`results`&&!this.modal&&!t&&(e.key===`r`||e.key===`R`)&&(e.preventDefault(),this.act(`rematch`))})}settings(e){this.actions.settings(e),this.refreshGarage(),this.refreshSetups()}act(e){let t=this.save.data;switch(e){case`enter`:this.show(`garage`),this.pendingRoom&&(this.el(`[data-o="code"]`).value=this.pendingRoom,this.pendingRoom=``,this.openMode(`online`));break;case`controls`:this.openModal(`controls`);break;case`settings`:this.openModal(`settings`);break;case`closeModal`:this.closeModal();break;case`forge`:this.openForge();break;case`resetCustom`:this.customDraft={...uf},this.refreshCustomForm();break;case`saveCustom`:this.actions.settings({customCar:{...this.customDraft}}),this.show(`garage`),this.toast(`Built “${this.customDraft.name}” is ready to race.`);break;case`prevCar`:case`p1Prev`:this.settings({chassis:(t.chassis+7-1)%7});break;case`nextCar`:case`p1Next`:this.settings({chassis:(t.chassis+1)%7});break;case`p2Prev`:this.settings({p2Chassis:(t.p2Chassis+7-1)%7});break;case`p2Next`:this.settings({p2Chassis:(t.p2Chassis+1)%7});break;case`back`:this.show(`garage`);break;case`goSolo`:this.actions.startRace({mode:`solo`,track:this.soloTrack,items:t.items,aiSkill:t.aiSkill});break;case`goSplit`:if(t.p1Device===t.p2Device)return this.toast(`Players need different control devices.`);this.actions.startRace({mode:`split`,track:this.splitTrack,items:t.items,aiSkill:t.aiSkill});break;case`labRandom`:this.lab=tf({...this.lab,seed:Math.floor(Math.random()*999999)}),this.labEditing=null,this.refreshLab();break;case`labCopy`:this.copy(rf(this.lab),`Share code copied`);break;case`labImport`:{let e=this.el(`[data-l="import"]`),t=af(e.value.trim());if(!t)return this.toast(`That share code is not valid.`);this.lab=t,this.labEditing=null,e.value=``,this.refreshLab(),this.toast(`Loaded “${t.name}”`);break}case`labSave`:this.saveLab();break;case`labTest`:this.startLab(`test`);break;case`labRace`:this.startLab(`solo`);break;case`onCreate`:this.actions.online(``);break;case`onJoin`:{let e=this.el(`[data-o="code"]`).value.trim().toUpperCase();if(!e)return this.toast(`Enter a room code first.`);this.actions.online(e);break}case`onBack`:this.actions.leaveOnline(),this.show(`garage`);break;case`onReady`:this.net.setReady(!this.net.lobby?.players.find(e=>e.seat===this.net.seat)?.ready);break;case`onStart`:this.net.start();break;case`onInvite`:this.copy(`${location.origin}${location.pathname}?room=${this.net.room}`,`Invite link copied`);break;case`resume`:this.actions.resume();break;case`restart`:this.actions.restart();break;case`quit`:case`toGarage`:this.actions.garage();break;case`rematch`:this.actions.rematch();break;case`upgradePower`:case`upgradeGrip`:case`upgradeBoost`:{let n=e.slice(7).toLowerCase(),r=t.upgrades[n],i=100*(r+1);if(r>=10)return this.toast(`${n[0].toUpperCase()+n.slice(1)} is fully upgraded.`);if(t.points<i)return this.toast(`Need ${i-t.points} more points.`);this.settings({points:t.points-i,upgrades:{...t.upgrades,[n]:r+1}}),this.refreshGarage(),this.toast(`${n[0].toUpperCase()+n.slice(1)} upgraded to level ${r+1}.`);break}case`editLab`:{let e=this.lastResults?.cfg.track.lab;this.actions.garage(),e&&(this.lab={...e},this.labEditing=nf(e),this.openMode(`lab`));break}default:if(e.startsWith(`labLoad:`)){let t=this.save.data.customTracks.find(t=>nf(t)===e.slice(8));t&&(this.lab={...t},this.labEditing=nf(t),this.refreshLab())}else if(e.startsWith(`labDel:`)){let t=e.slice(7);this.actions.settings({customTracks:this.save.data.customTracks.filter(e=>nf(e)!==t)}),this.labEditing===t&&(this.labEditing=null),this.refreshLab(),this.refreshSetups()}else if(e.startsWith(`track:`)){let[,t,n]=e.split(`:`),r=this.app.trackRefs().find(e=>e.id===n)??Mh;t===`solo`?this.soloTrack=r:t===`split`?this.splitTrack=r:t===`online`&&this.net.setTrack(this.app.onlineCode(r)),this.refreshSetups()}}}openMode(e){e===`solo`||e===`split`?(this.refreshSetups(),this.show(e)):e===`lab`?(this.refreshLab(),this.show(`lab`)):e===`online`&&(this.refreshOnline(),this.show(`online`))}openForge(){this.customDraft={...this.save.data.customCar??uf},this.refreshCustomForm(),this.show(`forge`)}customFieldChanged(e){let t=e.dataset.cfField,n=t===`chassis`?Number(e.value):e.value;this.customDraft={...this.customDraft,[t]:n},this.refreshCustomForm()}refreshCustomForm(e=!0){let t=this.customDraft,n=this.el(`[data-cf-field="name"]`);document.activeElement!==n&&(n.value=t.name),this.el(`[data-cf-field="chassis"]`).value=String(t.chassis);for(let e of[`primary`,`secondary`,`accent`])this.el(`[data-cf-field="${e}"]`).value=t[e];for(let e of[`power`,`grip`,`boost`])this.el(`[data-cf-range="${e}"]`).value=String(t[e]),this.el(`[data-cf-out="${e}"]`).textContent=`${t[e]}%`;for(let e of[`wheels`,`aero`])this.root.querySelectorAll(`[data-cf-seg="${e}"] button`).forEach(n=>n.classList.toggle(`sel`,n.dataset.v===t[e]));let r=this.el(`[data-cf-preview]`),i=t.paintPattern===`solid`?t.primary:t.paintPattern===`split`?`linear-gradient(135deg, ${t.primary} 0 50%, ${t.secondary} 50% 100%)`:t.paintPattern===`sunset`?`linear-gradient(135deg, ${t.primary}, ${t.secondary} 55%, ${t.accent})`:`linear-gradient(90deg, ${t.primary} 0 42%, ${t.secondary} 42% 58%, ${t.primary} 58% 100%)`;r.style.background=i,r.style.filter=t.paintFinish===`chrome`?`saturate(1.45) brightness(1.12)`:t.paintFinish===`matte`?`saturate(.78)`:t.paintFinish===`pearl`?`saturate(1.2) brightness(1.06)`:``,this.el(`[data-cf-preview-name]`).textContent=t.name,this.el(`[data-cf-preview-meta]`).textContent=`${Qp[t.chassis].name} · ${t.paintFinish} ${t.paintPattern} · ${t.bodyKit} kit · ${t.spoiler} spoiler`,e&&this.app.previewCar(t.chassis,0,t)}startLab(e){if(!cf(this.lab).check.ok)return this.toast(`This layout overlaps itself — try a new layout or less twist.`);let t={id:nf(this.lab),name:this.lab.name,lab:{...this.lab}};this.actions.startRace({mode:e,track:t,items:e===`solo`&&this.save.data.items,aiSkill:this.save.data.aiSkill})}saveLab(){if(!cf(this.lab).check.ok)return this.toast(`Fix the overlap before saving.`);let e=nf(this.lab),t=this.save.data.customTracks.filter(t=>nf(t)!==e&&nf(t)!==this.labEditing);if(t.length>=12)return this.toast(`You can keep 12 tracks. Delete one first.`);t.unshift({...this.lab}),this.actions.settings({customTracks:t}),this.labEditing=e,this.refreshLab(),this.refreshSetups(),this.toast(`Saved “${this.lab.name}”`)}copy(e,t){if(!navigator.clipboard)return this.toast(e);navigator.clipboard.writeText(e).then(()=>this.toast(t),()=>this.toast(e))}toast(e){let t=this.el(`[data-toast]`);t.textContent=e,t.classList.add(`show`),clearTimeout(this.toastTimer),this.toastTimer=window.setTimeout(()=>t.classList.remove(`show`),2600)}show(e){this.screen=e,this.root.querySelectorAll(`.screen`).forEach(t=>t.classList.toggle(`is-active`,t.dataset.screen===e)),this.root.classList.toggle(`in-race`,e===`hud`||e===`pause`),document.body.dataset.screen=e,e===`garage`&&this.refreshGarage(),e===`hud`||this.input.method===`touch`?document.activeElement?.blur?.():this.focusDefault()}focusDefault(){(this.root.querySelector(`[data-screen="${this.screen}"]`)?.querySelector(`[data-autofocus]`)??this.focusables()[0])?.focus({preventScroll:!0})}openModal(e){this.modal=e,this.refreshSettings(),this.root.querySelectorAll(`[data-modal]`).forEach(t=>t.classList.toggle(`show`,t.dataset.modal===e)),this.focusables()[0]?.focus({preventScroll:!0})}closeModal(){this.modal=null,this.root.querySelectorAll(`[data-modal]`).forEach(e=>e.classList.remove(`show`)),this.input.method!==`touch`&&this.focusDefault()}get modalOpen(){return this.modal!==null}setBootProgress(e){this.el(`[data-boot]`).style.width=`${Math.round(e*100)}%`}loading(e){this.el(`[data-loading]`).classList.toggle(`show`,!!e),e&&(this.el(`[data-loading-text]`).textContent=e)}pauseNote(e){this.el(`[data-p="note"]`).textContent=e?`Online races keep running — your car coasts while this menu is open.`:`The race clock is stopped.`,this.el(`[data-act="restart"]`).style.display=e?`none`:``}refreshGarage(){let e=this.save.data,t=e.customCar,n=Qp[t?.chassis??e.chassis];this.el(`[data-g="chassis"]`).textContent=t?t.name:n.name,this.el(`[data-g="blurb"]`).textContent=t?`${n.name} base · ${t.aero} aero · ${t.wheels} tyres`:n.blurb,this.el(`[data-g="swatches"]`).innerHTML=Array.from({length:8},(t,n)=>Kh(n,e.livery,`swatch`)).join(``),this.el(`[data-g="livery"]`).textContent=t?`Custom palette · ${t.primary} / ${t.secondary}`:`Livery: ${$p[e.livery].name}`;let r=this.el(`[data-g="name"]`);document.activeElement!==r&&(r.value=e.playerName);let i=this.app.trackRefs().slice(0,5).map(t=>{let n=e.bests[t.id];return`<div class="best"><span>${Ph(t.name)}</span><b>${n?rp(n.total):`—`}${n?.totalAssist?Zh:``}</b><small>${n&&n.lap?`best lap ${rp(n.lap)}${n.lapAssist?Zh:``}`:`no finish yet`}</small></div>`}).join(``);this.el(`[data-g="bests"]`).innerHTML=`<h3>Personal bests</h3>${i}`;let a=e.upgrades,o=(t,n,r)=>{let i=a[t],o=100*(i+1);return`<div class="upgrade"><div><b>${n}</b><small>${r} · Level ${i}/10</small></div><button type="button" class="btn small" data-act="upgrade${t[0].toUpperCase()}${t.slice(1)}"${i>=10||e.points<o?` disabled`:``}>${i>=10?`MAX`:`+1 · ${o} pts`}</button></div>`};this.el(`[data-g="progression"]`).innerHTML=`<h3>Career upgrades</h3><p class="points"><b>${e.points}</b> points <small>· ${e.racesPlayed} races completed</small></p><div class="upgrade-list">${o(`power`,`Power`,`stronger acceleration`)}${o(`grip`,`Grip`,`cleaner cornering`)}${o(`boost`,`Boost`,`longer boost pull`)}</div><small class="muted">Earn points after every race. Rivals get only slightly faster as your career grows.</small>`,this.app.previewCar(t?.chassis??e.chassis,e.livery,t)}trackChoices(e,t){return this.app.trackRefs().map(n=>`<button type="button" class="chip${n.id===t.id?` sel`:``}" data-act="track:${e}:${n.id}">${Ph(n.name)}</button>`).join(``)}refreshSetups(){let e=this.save.data,t=this.app.trackRefs();t.some(e=>e.id===this.soloTrack.id)||(this.soloTrack=Mh),t.some(e=>e.id===this.splitTrack.id)||(this.splitTrack=Mh),this.el(`[data-s="tracks"]`).innerHTML=this.trackChoices(`solo`,this.soloTrack),this.el(`[data-sp="tracks"]`).innerHTML=this.trackChoices(`split`,this.splitTrack);let n=(e,t)=>this.root.querySelectorAll(`${e} button`).forEach(e=>e.classList.toggle(`sel`,e.dataset.v===t));n(`[data-s="skill"]`,e.aiSkill),n(`[data-s="items"]`,e.items?`on`:`off`),n(`[data-sp="items"]`,e.items?`on`:`off`),this.el(`[data-sp="c1"]`).textContent=e.customCar?.name??Qp[e.chassis].name,this.el(`[data-sp="c2"]`).textContent=Qp[e.p2Chassis].name,this.el(`[data-sp="s1"]`).innerHTML=Array.from({length:8},(t,n)=>Kh(n,e.livery,`sw1`)).join(``),this.el(`[data-sp="s2"]`).innerHTML=Array.from({length:8},(t,n)=>Kh(n,e.p2Livery,`sw2`)).join(``),this.el(`[data-sp="d1"]`).value=e.p1Device,this.el(`[data-sp="d2"]`).value=e.p2Device;let r=this.input.gamepadCount,i=[e.p1Device,e.p2Device].filter(e=>e===`pad0`||e===`pad1`).length;this.el(`[data-sp="note"]`).textContent=e.p1Device===e.p2Device?`Both players are on the same device — pick different controls.`:i>r?`Connect ${i} gamepad${i>1?`s`:``} (press any button to wake it). ${r} detected.`:`Sharing a keyboard works: P1 uses WASD + Space / L-Shift / E / R, P2 uses Arrows + R-Shift / . / , / L.`}refreshSettings(){let e=this.save.data;for(let t of[`musicVolume`,`sfxVolume`])this.el(`input[data-set="${t}"]`).value=String(e[t]),this.el(`[data-set-out="${t}"]`).textContent=`${Math.round(e[t]*100)}%`;for(let t of[`muted`,`reducedMotion`,`cameraShake`])this.el(`input[data-set="${t}"]`).checked=e[t];this.root.querySelectorAll(`[data-set="quality"] button`).forEach(t=>t.classList.toggle(`sel`,t.dataset.v===e.quality));for(let t of[`assistP1`,`assistP2`])this.root.querySelectorAll(`[data-set="${t}"] button`).forEach(n=>n.classList.toggle(`sel`,n.dataset.v===e[t]))}labChanged(){for(let e of this.root.querySelectorAll(`input[data-lab]`)){let t=e.dataset.lab,n=this.lab[t];this.el(`[data-lab-out="${t}"]`).textContent=t===`width`?`${n} m`:[`ramps`,`pads`,`items`].includes(t)?String(n):`${Math.round(n*100)}%`}this.el(`[data-l="seed"]`).textContent=String(this.lab.seed),this.refreshLabCode(),clearTimeout(this.labTimer),this.labTimer=window.setTimeout(()=>this.drawLab(),120)}refreshLabCode(){this.el(`[data-l="code"]`).textContent=rf(this.lab)}refreshLab(){for(let e of this.root.querySelectorAll(`input[data-lab]`))e.value=String(this.lab[e.dataset.lab]);this.el(`[data-l="name"]`).value=this.lab.name,this.labChanged();let e=this.save.data.customTracks;this.el(`[data-l="saved"]`).innerHTML=e.length?e.map(e=>{let t=nf(e),n=this.save.data.bests[t];return`<div class="saved${t===this.labEditing?` sel`:``}"><button type="button" class="link" data-act="labLoad:${t}">${Ph(e.name)}</button><small>${n?rp(n.total):`untimed`}${n?.totalAssist?Zh:``}</small><button type="button" class="btn icon small" data-act="labDel:${t}" aria-label="Delete ${Ph(e.name)}">✕</button></div>`}).join(``):`<p class="muted">No saved tracks yet. Saved tracks appear in the Solo, Split-Screen and Online track lists.</p>`}drawLab(){let e=cf(this.lab),t=this.el(`[data-l="map"]`).getContext(`2d`);if(!t)return;let n=e.track,r=n.bounds,i=320/Math.max(r.maxX-r.minX,r.maxZ-r.minZ),a=(r.minX+r.maxX)/2,o=(r.minZ+r.maxZ)/2,s=e=>[180-(n.x[e]-a)*i,180+(n.z[e]-o)*i];t.clearRect(0,0,360,360),t.lineCap=`round`,t.lineJoin=`round`;for(let e=0;e<n.n;e+=2){let r=(e+2)%n.n,[i,a]=s(e),[o,c]=s(r);t.strokeStyle=`#1b1030`,t.lineWidth=10,t.beginPath(),t.moveTo(i,a),t.lineTo(o,c),t.stroke(),t.strokeStyle=n.bridge[e]>.5?`#7ef9ff`:n.canyon[e]>.5?`#e07a45`:n.ridge[e]>.5?`#ffd23f`:`#f5e6cc`,t.lineWidth=5,t.beginPath(),t.moveTo(i,a),t.lineTo(o,c),t.stroke()}t.font=`700 11px Figtree, sans-serif`,t.textAlign=`center`;for(let e of n.gates){let[r,i]=s(e.sample);t.fillStyle=`#1b1030`,t.beginPath(),t.arc(r,i,8,0,Math.PI*2),t.fill(),t.fillStyle=e.index===n.gates.length-1?`#ffd23f`:`#ffffff`,t.fillText(String(e.index+1),r,i+4)}for(let e of n.ramps){let[r,i]=s(n.sampleIndex(e.s0));t.fillStyle=`#ff6b35`,t.fillRect(r-5,i-5,10,10)}let c=e.check;this.el(`[data-l="check"]`).innerHTML=c.ok?`<b class="ok">Layout OK</b> · ${(c.length/1e3).toFixed(2)} km lap · tightest turn ${Math.round(c.minRadius)} m · ${n.pads.length} pads · ${n.ramps.length} ramps`:`<b class="bad">Overlap detected</b> · sections come within ${Math.round(c.minGap)} m. Try a new layout, less twist or a bigger size.`}refreshOnline(){let e=this.net,t=this.el(`[data-o="status"]`);t.textContent=e.message,t.className=`net-status ${e.status}`;let n=e.status===`connected`&&!!e.lobby;this.el(`[data-o="join"]`).style.display=n?`none`:``;let r=this.el(`[data-o="lobby"]`);if(!n||!e.lobby){r.innerHTML=``;return}let i=e.lobby,a=i.players.find(t=>t.seat===e.seat),o=[0,1,2].map(t=>{let n=i.players.find(e=>e.seat===t);if(!n)return`<div class="seat empty"><span>Seat ${t+1}</span><small>Open — share the room code</small></div>`;let r=n.custom??$p[n.livery]??$p[0],a=`${n.seat===i.host?` <em>HOST</em>`:``}${n.seat===e.seat?` <em>YOU</em>`:``}`,o=n.connected?n.ready?`<b class="ok">Ready</b>`:`Not ready`:`Reconnecting…`;return`<div class="seat${n.seat===e.seat?` me`:``}"><i style="--a:${r.primary};--b:${r.secondary}"></i><span>${Ph(n.name)}${a}</span><small>${Ph(n.custom?.name??Qp[n.chassis]?.name??``)} · ${o}</small></div>`}).join(``),s=this.app.refFromOnline(i.track),c=e.isHost&&i.phase===`lobby`?`<div class="row"><span class="label">Track</span><div class="choices">${this.app.trackRefs().map(e=>`<button type="button" class="chip${e.id===s.id?` sel`:``}" data-act="track:online:${e.id}">${Ph(e.name)}</button>`).join(``)}</div></div>`:`<div class="row"><span class="label">Track</span><b>${Ph(s.name)}</b></div>`,l=i.phase===`racing`?`<p class="note">A race is in progress. You will join the next one.</p>`:``,u=e.results?this.onlineTable(e.results):``,d=a?`<button type="button" class="btn${a.ready?``:` primary`}" data-act="onReady">${a.ready?`Not ready`:`Ready`}</button>`:`<span class="muted">Spectating — all three seats are taken.</span>`,f=e.isHost?`<button type="button" class="btn primary" data-act="onStart"${i.phase===`lobby`?``:` disabled`}>Start race</button>`:`<span class="muted">The host starts the race.</span>`,p=document.activeElement?.dataset?.act;r.innerHTML=`
      <div class="room"><span>Room</span><b>${Ph(i.room)}</b><button type="button" class="btn small" data-act="onInvite">Copy invite link</button><small>Ping ${e.latency} ms</small></div>
      <div class="seats">${o}</div>
      ${c}${l}${u}
      <div class="row">${d}${f}</div>`,p&&this.screen===`online`&&r.querySelector(`[data-act="${p}"]`)?.focus({preventScroll:!0})}onlineTable(e){return`<div class="mini-results"><h3>Last race</h3><table class="standings"><tr><th></th><th>Racer</th><th>Total</th><th>Penalty</th><th>Best lap</th></tr>${e.map(e=>`<tr class="${e.seat===this.net.seat?`me`:``}"><td>${e.finished?ip(e.place):`DNF`}</td><td>${Ph(e.name)}</td><td>${e.finished?rp(e.total):`${e.gates}/${Kf} gates`}</td><td>${e.penalty?`+${e.penalty.toFixed(1)}s`:``}</td><td>${e.bestLap?rp(e.bestLap):`—`}</td></tr>`).join(``)}</table></div>`}showResults(e,t,n){this.lastResults={rows:e,cfg:t};let r=e.filter(e=>e.human).sort((e,t)=>e.humanIndex-t.humanIndex),i=r[0],a=e[0],o=t.mode===`test`?i.finished?`Test drive complete`:`Out of time`:t.mode===`split`?`${Ph(a.name)} wins!`:i.finished?i.place===1?`Victory!`:`You finished ${ip(i.place)}`:`Did not finish`,s=e.map(e=>{let t=$p[e.livery];return`<tr class="${e.human?`me`:``}"><td class="pl">${e.finished?ip(e.place):`DNF`}</td><td><i class="dot" style="--a:${t.primary}"></i>${Ph(e.name)}${e.human&&e.assisted?Zh:``} <small>${Ph(e.customName??Qp[e.chassis].name)}</small></td><td>${e.finished?rp(e.total):`${e.gates}/${Kf}`}</td><td>${e.penalty?`+${e.penalty.toFixed(1)}s`:`—`}</td><td>${e.bestLap?rp(e.bestLap):`—`}</td></tr>`}).join(``),c=r.map(e=>{let t=e.stats,r=n[e.humanIndex]??{total:!1,lap:!1,totalAssist:!1,lapAssist:!1},i=e.lapTimes.map((t,n)=>`<span>Lap ${n+1} · ${rp(t)}${e.lapAssist[n]?Zh:``}</span>`).join(``),a=r.total?` <em class="new">NEW BEST</em>${r.totalAssist?Zh:``}`:r.lap?` <em class="new">BEST LAP</em>${r.lapAssist?Zh:``}`:e.assisted?Zh:``;return`<div class="recap"><h3>${Ph(e.name)}${a}</h3>
          <div class="laps">${i||`<span>No laps completed</span>`}</div>
          <div class="stats">
            <div><b>${t.launch===`perfect`?`Perfect`:t.launch===`early`?`Early`:`Clean`}</b><small>Launch</small></div>
            <div><b>${t.driftBoosts}</b><small>Drift boosts</small></div>
            <div><b>${t.perfectPads}/${t.pads}</b><small>Perfect pads</small></div>
            <div><b>${t.tricks}</b><small>Tricks landed</small></div>
            <div><b>${t.draftTime.toFixed(1)}s</b><small>Slipstream</small></div>
            <div><b>${Math.round(t.topSpeed*3.6)}</b><small>Top km/h</small></div>
            <div><b>${t.hits}</b><small>Hits taken</small></div>
            <div><b>${t.dodges+t.blocks}</b><small>Dodges & blocks</small></div>
            <div><b>${e.recoveries}${e.penalty?` (+${e.penalty.toFixed(0)}s)`:``}</b><small>Resets &amp; respawns</small></div>
          </div></div>`}).join(``),l=t.mode===`solo`?`<p class="points">Career bank: <b>${this.save.data.points}</b> points · upgrade your ride in the garage</p>`:``;this.el(`[data-r="body"]`).innerHTML=`<h2>${o}</h2><p class="sub">${Ph(t.track.name)} · 3 laps · ${Kf} gates</p>${l}
      <table class="standings"><tr><th></th><th>Racer</th><th>Total</th><th>Penalty</th><th>Best lap</th></tr>${s}</table>
      <div class="recaps">${c}</div><p class="hint">Press <kbd>R</kbd> or <kbd>A</kbd> for an instant rematch.</p>`,this.el(`[data-r="edit"]`).style.display=t.track.lab?``:`none`,this.el(`[data-r="rematch"]`).textContent=t.mode===`test`?`Drive again`:`Rematch`,this.show(`results`)}showOnlineResults(e,t,n){let r=e.find(e=>e.seat===this.net.seat),i=n?`Finished — waiting for the other racers…`:r?r.finished?r.place===1?`Ghost race won!`:`You finished ${ip(r.place)}`:`Did not finish`:`Race over`,a=n?`Your run is being confirmed by the ghost service.`:`Results confirmed by the ghost service.`;this.el(`[data-r="body"]`).innerHTML=`<h2>${i}</h2><p class="sub">${Ph(this.app.refFromOnline(t).name)} · ${a}</p>${e.length?this.onlineTable(e):``}`,this.el(`[data-r="edit"]`).style.display=`none`,this.el(`[data-r="rematch"]`).textContent=`Back to lobby`,this.show(`results`)}focusables(){let e=this.modal?this.root.querySelector(`[data-modal="${this.modal}"]`):this.root.querySelector(`[data-screen="${this.screen}"]`);return e?[...e.querySelectorAll(`button:not([disabled]), input, select`)].filter(e=>e.offsetParent!==null):[]}frame(e){if(this.navCooldown-=e,this.fx.update(Math.min(.05,e)),this.screen===`hud`||this.screen===`boot`)return;let t=this.input.move;if(Math.max(Math.abs(t.x),Math.abs(t.y))<.5)this.navCooldown=Math.min(this.navCooldown,0);else if(this.navCooldown<=0){this.navCooldown=.2;let e=document.activeElement;if(e instanceof HTMLInputElement&&e.type===`range`&&Math.abs(t.x)>Math.abs(t.y)){let n=Number(e.step)||.05;e.value=String(Number(e.value)+Math.sign(t.x)*n),e.dispatchEvent(new Event(`input`,{bubbles:!0}))}else this.moveFocus(t.x,t.y)}this.input.consume(`confirm`)&&(this.audio.unlock(),this.screen===`title`?this.act(`enter`):document.activeElement?.click()),this.input.consume(`back`)&&(this.modal?this.act(`closeModal`):[`solo`,`split`,`lab`].includes(this.screen)?this.act(`back`):this.screen===`online`?this.act(`onBack`):this.screen===`results`?this.act(`toGarage`):this.screen===`pause`&&this.act(`resume`))}moveFocus(e,t){let n=this.focusables();if(!n.length)return;let r=document.activeElement;if(!r||!n.includes(r)){n[0].focus();return}let i=r.getBoundingClientRect(),a=i.left+i.width/2,o=i.top+i.height/2,s=Math.abs(e)>Math.abs(t),c=Math.sign(e),l=-Math.sign(t),u=null,d=1/0;for(let e of n){if(e===r)continue;let t=e.getBoundingClientRect(),n=t.left+t.width/2-a,i=t.top+t.height/2-o,f=s?n*c:i*l;if(f<=4)continue;let p=f+Math.abs(s?i:n)*2.2;p<d&&(d=p,u=e)}if(u){u.focus(),this.audio.play(`ui`,.6);let e=u.getBoundingClientRect();this.fx.glint(e.right-10,e.top+8,`#fff4dc`,16),this.fx.ring(e.left+e.width/2,e.top+e.height/2,`#ffd23f`,Math.max(40,e.width*.45),.35)}}};function $h(e,t){return e===`kbLeft`?{item:`E`,boost:`L-SHIFT`}:e===`kbRight`?{item:`,`,boost:`.`}:e===`pad0`||e===`pad1`||t.method===`gamepad`?{item:`Y`,boost:`B`}:t.method===`touch`?{item:`ITEM`,boost:`BOOST`}:{item:`E`,boost:`SHIFT`}}function eg(e){try{return localStorage.getItem(e)}catch{return null}}async function tg(e){let t=document.querySelector(`#game`),n=eg(lf)===null,r=new Of,i=navigator.maxTouchPoints>0||matchMedia(`(pointer: coarse)`).matches||matchMedia(`(hover: none)`).matches,a=i?`low`:r.data.quality;n&&r.update({quality:Ed()});let o=new ld,s=new id,c=new Hf,l=new Dd(t,a);Z.maxAnisotropy=Math.min(i?2:8,l.gl.capabilities.getMaxAnisotropy());let u=Z.onProgress((t,n,r)=>{t===`boot`&&e(.1+n/r*.25)});await Promise.race([Z.load(`boot`),new Promise(e=>setTimeout(e,6e3))]),u(),Z.prefetch(`race`),Z.onProgress((e,t,n)=>{e===`race`&&t>=n&&(s.warm(),i||Z.prefetch(`extra`))}),e(.35);let d,f,p=new Nh(l,o,s,r,c,{popup:(e,t,n)=>d.hud.popup(e,t,n),juice:(e,t,n)=>d.hud.juice(e,t,n),loading:e=>d.loading(e),localFinished:()=>{},finished:(e,t,n)=>{if(t.mode===`online`){c.results?d.showOnlineResults(c.results,c.race?.track??`main`,!1):d.showOnlineResults([],c.race?.track??`main`,!0);return}d.showResults(e,t,n)}}),m=e=>{if(s.setVolumes(e.musicVolume,e.sfxVolume,e.muted),p.reducedMotion=e.reducedMotion,p.assistModes=[e.assistP1,e.assistP2],p.session){p.session.reducedMotion=e.reducedMotion,p.session.assistModes[0]=e.assistP1,p.session.assistModes[1]=e.assistP2;for(let t of p.session.cams)t.shakeEnabled=e.cameraShake}},h=()=>{let e=p.session;if(!e)return;let t=r.data;for(let n of e.cams)n.shakeEnabled=t.cameraShake;e.fx.setBudget(i?.32:t.quality===`low`?.45:t.quality===`medium`?.75:1);let n=e.humans.map(t=>e.racers[t].name),a=e.humans.map(t=>$h(e.racers[t].device??`auto`,o));d.hud.setup(e,n,a,!t.controlsSeen),t.controlsSeen||r.update({controlsSeen:!0}),d.show(`hud`),f.resetAccumulator()},g=async e=>{s.unlock(),await p.startRace(e),h()},_=()=>{p.mode===`race`&&d.screen===`hud`&&(p.pause(),d.pauseNote(!!p.session?.online),d.show(`pause`))},v=()=>{p.mode===`paused`&&(p.resume(),d.show(`hud`),f.resetAccumulator())},y=(e=!1)=>{p.toGarage(),e&&c.status===`connected`?(d.refreshOnline(),d.show(`online`)):(c.status!==`idle`&&c.disconnect(),d.show(`garage`))};d=new Qh(p,r,s,o,c,{settings:e=>{let t=e.quality!==void 0&&e.quality!==r.data.quality;e.playerName!==void 0&&(e.playerName=zf(e.playerName)),r.update(e),m(r.data),t&&(l.applyQuality(i?`low`:r.data.quality),p.setQuality()),c.status===`connected`&&(e.chassis!==void 0||e.livery!==void 0||e.playerName!==void 0||e.customCar!==void 0)&&c.updateProfile({name:r.data.playerName,chassis:r.data.customCar?.chassis??r.data.chassis,livery:r.data.livery,custom:r.data.customCar??void 0})},startRace:e=>void g(e),rematch:()=>{if(p.config?.mode===`online`)return y(!0);p.config&&g(p.config)},garage:()=>y(!1),resume:v,restart:()=>{p.config&&p.config.mode!==`online`&&g(p.config)},online:e=>{s.unlock(),c.connect(e,{name:r.data.playerName,chassis:r.data.customCar?.chassis??r.data.chassis,livery:r.data.livery,custom:r.data.customCar??void 0})},leaveOnline:()=>c.disconnect()}),d.show(`boot`),m(r.data),c.onChange=()=>d.refreshOnline(),c.onRaceStart=e=>{let t=p.refFromOnline(e.track);p.startRace({mode:`online`,track:t,items:!1,aiSkill:`relaxed`},e).then(h)},c.onResults=e=>{p.config?.mode===`online`&&(p.mode===`results`||d.screen===`results`)&&d.showOnlineResults(e,c.race?.track??`main`,!1)},e(.5),await p.worldFor(Mh),e(.9),await p.enterGarage(),e(1);let b=0;f=new ud({step:()=>p.step(),render:(e,t)=>{o.update(),o.consume(`pause`)&&(p.mode===`race`&&d.screen===`hud`?_():p.mode===`paused`&&d.screen===`pause`&&!d.modalOpen&&v()),d.frame(t),f.paused=p.mode===`paused`&&!p.session?.online,p.render(e,t);let n=p.session;if(b=b*.9+(p.mode===`race`&&n?Math.min(2,n.fx.activeCount/260+(t>1/45?.6:0)):0)*.1,Z.setBusy(b>.55),n&&(d.screen===`hud`||d.screen===`pause`)){if(d.hud.update(n,r.data.reducedMotion),n.online){let e=[...c.ghostFrames().keys()].filter(e=>e!==c.seat).length;d.hud.setOnline(c.status===`connected`?`ROOM ${c.room} · ${c.latency} ms · ${e} ghost${e===1?``:`s`}`:c.message)}else d.hud.setOnline(``)}}}),f.start();let x=()=>{s.unlock(),s.setMusic(p.mode===`race`||p.mode===`paused`?`race`:p.mode===`results`?`results`:`menu`),window.removeEventListener(`pointerdown`,x),window.removeEventListener(`keydown`,x)};window.addEventListener(`pointerdown`,x),window.addEventListener(`keydown`,x),document.addEventListener(`visibilitychange`,()=>{document.hidden&&_()}),window.addEventListener(`game:pause`,_),window.addEventListener(`game:repair`,()=>{p.mode===`race`&&d.screen===`hud`&&p.repair()}),window.addEventListener(`keydown`,e=>{e.code===`KeyT`&&p.mode===`race`&&d.screen===`hud`&&(e.preventDefault(),p.repair())}),new Uf(document.getElementById(`ui`),o,()=>p.mode===`race`&&d.screen===`hud`&&(p.session?.humans.length??0)===1,()=>p.session?.repairsLeft??0,()=>p.mode===`race`&&(d.screen===`hud`||d.screen===`pause`)&&(p.session?.humans.length??0)===1,_,e=>p.setStableMode(e)),window.setTimeout(()=>d.show(`title`),200),window.__game={app:p,ui:d,input:o,save:r,net:c}}export{tg as startGame};