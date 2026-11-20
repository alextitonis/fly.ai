var cf=Object.defineProperty;var lf=(s,t,e)=>t in s?cf(s,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):s[t]=e;var U=(s,t,e)=>lf(s,typeof t!="symbol"?t+"":t,e);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function e(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(i){if(i.ep)return;i.ep=!0;const r=e(i);fetch(i.href,r)}})();/**
 * @license
 * Copyright 2010-2024 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const Yc="169",ls={ROTATE:0,DOLLY:1,PAN:2},rs={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},hf=0,Ll=1,uf=2,ku=1,Ou=2,Vn=3,Yn=0,Ke=1,Ye=2,fi=0,hs=1,Il=2,Dl=3,Nl=4,df=5,Ci=100,ff=101,pf=102,mf=103,gf=104,_f=200,vf=201,yf=202,xf=203,$a=204,Ya=205,Mf=206,bf=207,Sf=208,wf=209,Ef=210,Tf=211,Af=212,Rf=213,Cf=214,qa=0,Ka=1,Za=2,ys=3,Ja=4,Qa=5,tc=6,ec=7,Fu=0,Pf=1,Lf=2,pi=0,If=1,Df=2,Nf=3,Uf=4,kf=5,Of=6,Ff=7,Ul="attached",zf="detached",zu=300,xs=301,Ms=302,nc=303,ic=304,ko=306,Ui=1e3,hi=1001,Eo=1002,qe=1003,Bu=1004,Js=1005,cn=1006,ho=1007,jn=1008,qn=1009,Hu=1010,Gu=1011,ur=1012,qc=1013,ki=1014,bn=1015,xr=1016,Kc=1017,Zc=1018,bs=1020,Vu=35902,Wu=1021,Xu=1022,pn=1023,ju=1024,$u=1025,us=1026,Ss=1027,Jc=1028,Qc=1029,Yu=1030,tl=1031,el=1033,uo=33776,fo=33777,po=33778,mo=33779,sc=35840,rc=35841,oc=35842,ac=35843,cc=36196,lc=37492,hc=37496,uc=37808,dc=37809,fc=37810,pc=37811,mc=37812,gc=37813,_c=37814,vc=37815,yc=37816,xc=37817,Mc=37818,bc=37819,Sc=37820,wc=37821,go=36492,Ec=36494,Tc=36495,qu=36283,Ac=36284,Rc=36285,Cc=36286,dr=2300,fr=2301,qo=2302,kl=2400,Ol=2401,Fl=2402,Bf=2500,Hf=0,Ku=1,Pc=2,Gf=3200,Vf=3201,Zu=0,Wf=1,li="",ke="srgb",Fe="srgb-linear",nl="display-p3",Oo="display-p3-linear",To="linear",me="srgb",Ao="rec709",Ro="p3",Gi=7680,zl=519,Xf=512,jf=513,$f=514,Ju=515,Yf=516,qf=517,Kf=518,Zf=519,Lc=35044,Bl="300 es",$n=2e3,Co=2001;class zi{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){if(this._listeners===void 0)return!1;const n=this._listeners;return n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){if(this._listeners===void 0)return;const i=this._listeners[t];if(i!==void 0){const r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){if(this._listeners===void 0)return;const n=this._listeners[t.type];if(n!==void 0){t.target=this;const i=n.slice(0);for(let r=0,o=i.length;r<o;r++)i[r].call(this,t);t.target=null}}}const ze=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let Hl=1234567;const ir=Math.PI/180,ws=180/Math.PI;function mn(){const s=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(ze[s&255]+ze[s>>8&255]+ze[s>>16&255]+ze[s>>24&255]+"-"+ze[t&255]+ze[t>>8&255]+"-"+ze[t>>16&15|64]+ze[t>>24&255]+"-"+ze[e&63|128]+ze[e>>8&255]+"-"+ze[e>>16&255]+ze[e>>24&255]+ze[n&255]+ze[n>>8&255]+ze[n>>16&255]+ze[n>>24&255]).toLowerCase()}function Re(s,t,e){return Math.max(t,Math.min(e,s))}function il(s,t){return(s%t+t)%t}function Jf(s,t,e,n,i){return n+(s-t)*(i-n)/(e-t)}function Qf(s,t,e){return s!==t?(e-s)/(t-s):0}function sr(s,t,e){return(1-e)*s+e*t}function tp(s,t,e,n){return sr(s,t,1-Math.exp(-e*n))}function ep(s,t=1){return t-Math.abs(il(s,t*2)-t)}function np(s,t,e){return s<=t?0:s>=e?1:(s=(s-t)/(e-t),s*s*(3-2*s))}function ip(s,t,e){return s<=t?0:s>=e?1:(s=(s-t)/(e-t),s*s*s*(s*(s*6-15)+10))}function sp(s,t){return s+Math.floor(Math.random()*(t-s+1))}function rp(s,t){return s+Math.random()*(t-s)}function op(s){return s*(.5-Math.random())}function ap(s){s!==void 0&&(Hl=s);let t=Hl+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function cp(s){return s*ir}function lp(s){return s*ws}function hp(s){return(s&s-1)===0&&s!==0}function up(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))}function dp(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function fp(s,t,e,n,i){const r=Math.cos,o=Math.sin,a=r(e/2),c=o(e/2),l=r((t+n)/2),h=o((t+n)/2),d=r((t-n)/2),u=o((t-n)/2),f=r((n-t)/2),p=o((n-t)/2);switch(i){case"XYX":s.set(a*h,c*d,c*u,a*l);break;case"YZY":s.set(c*u,a*h,c*d,a*l);break;case"ZXZ":s.set(c*d,c*u,a*h,a*l);break;case"XZX":s.set(a*h,c*p,c*f,a*l);break;case"YXY":s.set(c*f,a*h,c*p,a*l);break;case"ZYZ":s.set(c*p,c*f,a*h,a*l);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}function xn(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function se(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}const Qu={DEG2RAD:ir,RAD2DEG:ws,generateUUID:mn,clamp:Re,euclideanModulo:il,mapLinear:Jf,inverseLerp:Qf,lerp:sr,damp:tp,pingpong:ep,smoothstep:np,smootherstep:ip,randInt:sp,randFloat:rp,randFloatSpread:op,seededRandom:ap,degToRad:cp,radToDeg:lp,isPowerOfTwo:hp,ceilPowerOfTwo:up,floorPowerOfTwo:dp,setQuaternionFromProperEuler:fp,normalize:se,denormalize:xn};class it{constructor(t=0,e=0){it.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){const e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Re(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){const n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*i+t.x,this.y=r*i+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class zt{constructor(t,e,n,i,r,o,a,c,l){zt.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,c,l)}set(t,e,n,i,r,o,a,c,l){const h=this.elements;return h[0]=t,h[1]=i,h[2]=a,h[3]=e,h[4]=r,h[5]=c,h[6]=n,h[7]=o,h[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){const e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[3],c=n[6],l=n[1],h=n[4],d=n[7],u=n[2],f=n[5],p=n[8],_=i[0],m=i[3],g=i[6],x=i[1],v=i[4],M=i[7],C=i[2],R=i[5],T=i[8];return r[0]=o*_+a*x+c*C,r[3]=o*m+a*v+c*R,r[6]=o*g+a*M+c*T,r[1]=l*_+h*x+d*C,r[4]=l*m+h*v+d*R,r[7]=l*g+h*M+d*T,r[2]=u*_+f*x+p*C,r[5]=u*m+f*v+p*R,r[8]=u*g+f*M+p*T,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],h=t[8];return e*o*h-e*a*l-n*r*h+n*a*c+i*r*l-i*o*c}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],h=t[8],d=h*o-a*l,u=a*c-h*r,f=l*r-o*c,p=e*d+n*u+i*f;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);const _=1/p;return t[0]=d*_,t[1]=(i*l-h*n)*_,t[2]=(a*n-i*o)*_,t[3]=u*_,t[4]=(h*e-i*c)*_,t[5]=(i*r-a*e)*_,t[6]=f*_,t[7]=(n*c-l*e)*_,t[8]=(o*e-n*r)*_,this}transpose(){let t;const e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){const e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,o,a){const c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*o+l*a)+o+t,-i*l,i*c,-i*(-l*o+c*a)+a+e,0,0,1),this}scale(t,e){return this.premultiply(Ko.makeScale(t,e)),this}rotate(t){return this.premultiply(Ko.makeRotation(-t)),this}translate(t,e){return this.premultiply(Ko.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}}const Ko=new zt;function td(s){for(let t=s.length-1;t>=0;--t)if(s[t]>=65535)return!0;return!1}function pr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function pp(){const s=pr("canvas");return s.style.display="block",s}const Gl={};function _o(s){s in Gl||(Gl[s]=!0,console.warn(s))}function mp(s,t,e){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(t,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}function gp(s){const t=s.elements;t[2]=.5*t[2]+.5*t[3],t[6]=.5*t[6]+.5*t[7],t[10]=.5*t[10]+.5*t[11],t[14]=.5*t[14]+.5*t[15]}function _p(s){const t=s.elements;t[11]===-1?(t[10]=-t[10]-1,t[14]=-t[14]):(t[10]=-t[10],t[14]=-t[14]+1)}const Vl=new zt().set(.8224621,.177538,0,.0331941,.9668058,0,.0170827,.0723974,.9105199),Wl=new zt().set(1.2249401,-.2249404,0,-.0420569,1.0420571,0,-.0196376,-.0786361,1.0982735),Fs={[Fe]:{transfer:To,primaries:Ao,luminanceCoefficients:[.2126,.7152,.0722],toReference:s=>s,fromReference:s=>s},[ke]:{transfer:me,primaries:Ao,luminanceCoefficients:[.2126,.7152,.0722],toReference:s=>s.convertSRGBToLinear(),fromReference:s=>s.convertLinearToSRGB()},[Oo]:{transfer:To,primaries:Ro,luminanceCoefficients:[.2289,.6917,.0793],toReference:s=>s.applyMatrix3(Wl),fromReference:s=>s.applyMatrix3(Vl)},[nl]:{transfer:me,primaries:Ro,luminanceCoefficients:[.2289,.6917,.0793],toReference:s=>s.convertSRGBToLinear().applyMatrix3(Wl),fromReference:s=>s.applyMatrix3(Vl).convertLinearToSRGB()}},vp=new Set([Fe,Oo]),Zt={enabled:!0,_workingColorSpace:Fe,get workingColorSpace(){return this._workingColorSpace},set workingColorSpace(s){if(!vp.has(s))throw new Error(`Unsupported working color space, "${s}".`);this._workingColorSpace=s},convert:function(s,t,e){if(this.enabled===!1||t===e||!t||!e)return s;const n=Fs[t].toReference,i=Fs[e].fromReference;return i(n(s))},fromWorkingColorSpace:function(s,t){return this.convert(s,this._workingColorSpace,t)},toWorkingColorSpace:function(s,t){return this.convert(s,t,this._workingColorSpace)},getPrimaries:function(s){return Fs[s].primaries},getTransfer:function(s){return s===li?To:Fs[s].transfer},getLuminanceCoefficients:function(s,t=this._workingColorSpace){return s.fromArray(Fs[t].luminanceCoefficients)}};function ds(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function Zo(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}let Vi;class yp{static getDataURL(t){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let e;if(t instanceof HTMLCanvasElement)e=t;else{Vi===void 0&&(Vi=pr("canvas")),Vi.width=t.width,Vi.height=t.height;const n=Vi.getContext("2d");t instanceof ImageData?n.putImageData(t,0,0):n.drawImage(t,0,0,t.width,t.height),e=Vi}return e.width>2048||e.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",t),e.toDataURL("image/jpeg",.6)):e.toDataURL("image/png")}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){const e=pr("canvas");e.width=t.width,e.height=t.height;const n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);const i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let o=0;o<r.length;o++)r[o]=ds(r[o]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){const e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(ds(e[n]/255)*255):e[n]=ds(e[n]);return{data:e,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}}let xp=0;class ed{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:xp++}),this.uuid=mn(),this.data=t,this.dataReady=!0,this.version=0}set needsUpdate(t){t===!0&&this.version++}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];const n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let o=0,a=i.length;o<a;o++)i[o].isDataTexture?r.push(Jo(i[o].image)):r.push(Jo(i[o]))}else r=Jo(i);n.url=r}return e||(t.images[this.uuid]=n),n}}function Jo(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?yp.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}let Mp=0;class De extends zi{constructor(t=De.DEFAULT_IMAGE,e=De.DEFAULT_MAPPING,n=hi,i=hi,r=cn,o=jn,a=pn,c=qn,l=De.DEFAULT_ANISOTROPY,h=li){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Mp++}),this.uuid=mn(),this.name="",this.source=new ed(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=o,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new it(0,0),this.repeat=new it(1,1),this.center=new it(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new zt,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];const n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==zu)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case Ui:t.x=t.x-Math.floor(t.x);break;case hi:t.x=t.x<0?0:1;break;case Eo:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case Ui:t.y=t.y-Math.floor(t.y);break;case hi:t.y=t.y<0?0:1;break;case Eo:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}}De.DEFAULT_IMAGE=null;De.DEFAULT_MAPPING=zu;De.DEFAULT_ANISOTROPY=1;class te{constructor(t=0,e=0,n=0,i=1){te.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*i+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*i+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*i+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*i+o[15]*r,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);const e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r;const c=t.elements,l=c[0],h=c[4],d=c[8],u=c[1],f=c[5],p=c[9],_=c[2],m=c[6],g=c[10];if(Math.abs(h-u)<.01&&Math.abs(d-_)<.01&&Math.abs(p-m)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+_)<.1&&Math.abs(p+m)<.1&&Math.abs(l+f+g-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;const v=(l+1)/2,M=(f+1)/2,C=(g+1)/2,R=(h+u)/4,T=(d+_)/4,L=(p+m)/4;return v>M&&v>C?v<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(v),i=R/n,r=T/n):M>C?M<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(M),n=R/i,r=L/i):C<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(C),n=T/r,i=L/r),this.set(n,i,r,e),this}let x=Math.sqrt((m-p)*(m-p)+(d-_)*(d-_)+(u-h)*(u-h));return Math.abs(x)<.001&&(x=1),this.x=(m-p)/x,this.y=(d-_)/x,this.z=(u-h)/x,this.w=Math.acos((l+f+g-1)/2),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this.w=Math.max(t.w,Math.min(e.w,this.w)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this.w=Math.max(t,Math.min(e,this.w)),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class bp extends zi{constructor(t=1,e=1,n={}){super(),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=1,this.scissor=new te(0,0,t,e),this.scissorTest=!1,this.viewport=new te(0,0,t,e);const i={width:t,height:e,depth:1};n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:cn,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},n);const r=new De(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace);r.flipY=!1,r.generateMipmaps=n.generateMipmaps,r.internalFormat=n.internalFormat,this.textures=[];const o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0;this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=t,this.textures[i].image.height=e,this.textures[i].image.depth=n;this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let n=0,i=t.textures.length;n<i;n++)this.textures[n]=t.textures[n].clone(),this.textures[n].isRenderTargetTexture=!0;const e=Object.assign({},t.texture.image);return this.texture.source=new ed(e),this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class Oi extends bp{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}}class nd extends De{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=qe,this.minFilter=qe,this.wrapR=hi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class Sp extends De{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=qe,this.minFilter=qe,this.wrapR=hi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Te{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,o,a){let c=n[i+0],l=n[i+1],h=n[i+2],d=n[i+3];const u=r[o+0],f=r[o+1],p=r[o+2],_=r[o+3];if(a===0){t[e+0]=c,t[e+1]=l,t[e+2]=h,t[e+3]=d;return}if(a===1){t[e+0]=u,t[e+1]=f,t[e+2]=p,t[e+3]=_;return}if(d!==_||c!==u||l!==f||h!==p){let m=1-a;const g=c*u+l*f+h*p+d*_,x=g>=0?1:-1,v=1-g*g;if(v>Number.EPSILON){const C=Math.sqrt(v),R=Math.atan2(C,g*x);m=Math.sin(m*R)/C,a=Math.sin(a*R)/C}const M=a*x;if(c=c*m+u*M,l=l*m+f*M,h=h*m+p*M,d=d*m+_*M,m===1-a){const C=1/Math.sqrt(c*c+l*l+h*h+d*d);c*=C,l*=C,h*=C,d*=C}}t[e]=c,t[e+1]=l,t[e+2]=h,t[e+3]=d}static multiplyQuaternionsFlat(t,e,n,i,r,o){const a=n[i],c=n[i+1],l=n[i+2],h=n[i+3],d=r[o],u=r[o+1],f=r[o+2],p=r[o+3];return t[e]=a*p+h*d+c*f-l*u,t[e+1]=c*p+h*u+l*d-a*f,t[e+2]=l*p+h*f+a*u-c*d,t[e+3]=h*p-a*d-c*u-l*f,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){const n=t._x,i=t._y,r=t._z,o=t._order,a=Math.cos,c=Math.sin,l=a(n/2),h=a(i/2),d=a(r/2),u=c(n/2),f=c(i/2),p=c(r/2);switch(o){case"XYZ":this._x=u*h*d+l*f*p,this._y=l*f*d-u*h*p,this._z=l*h*p+u*f*d,this._w=l*h*d-u*f*p;break;case"YXZ":this._x=u*h*d+l*f*p,this._y=l*f*d-u*h*p,this._z=l*h*p-u*f*d,this._w=l*h*d+u*f*p;break;case"ZXY":this._x=u*h*d-l*f*p,this._y=l*f*d+u*h*p,this._z=l*h*p+u*f*d,this._w=l*h*d-u*f*p;break;case"ZYX":this._x=u*h*d-l*f*p,this._y=l*f*d+u*h*p,this._z=l*h*p-u*f*d,this._w=l*h*d+u*f*p;break;case"YZX":this._x=u*h*d+l*f*p,this._y=l*f*d+u*h*p,this._z=l*h*p-u*f*d,this._w=l*h*d-u*f*p;break;case"XZY":this._x=u*h*d-l*f*p,this._y=l*f*d-u*h*p,this._z=l*h*p+u*f*d,this._w=l*h*d+u*f*p;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){const n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){const e=t.elements,n=e[0],i=e[4],r=e[8],o=e[1],a=e[5],c=e[9],l=e[2],h=e[6],d=e[10],u=n+a+d;if(u>0){const f=.5/Math.sqrt(u+1);this._w=.25/f,this._x=(h-c)*f,this._y=(r-l)*f,this._z=(o-i)*f}else if(n>a&&n>d){const f=2*Math.sqrt(1+n-a-d);this._w=(h-c)/f,this._x=.25*f,this._y=(i+o)/f,this._z=(r+l)/f}else if(a>d){const f=2*Math.sqrt(1+a-n-d);this._w=(r-l)/f,this._x=(i+o)/f,this._y=.25*f,this._z=(c+h)/f}else{const f=2*Math.sqrt(1+d-n-a);this._w=(o-i)/f,this._x=(r+l)/f,this._y=(c+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<Number.EPSILON?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(Re(this.dot(t),-1,1)))}rotateTowards(t,e){const n=this.angleTo(t);if(n===0)return this;const i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){const n=t._x,i=t._y,r=t._z,o=t._w,a=e._x,c=e._y,l=e._z,h=e._w;return this._x=n*h+o*a+i*l-r*c,this._y=i*h+o*c+r*a-n*l,this._z=r*h+o*l+n*c-i*a,this._w=o*h-n*a-i*c-r*l,this._onChangeCallback(),this}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);const n=this._x,i=this._y,r=this._z,o=this._w;let a=o*t._w+n*t._x+i*t._y+r*t._z;if(a<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,a=-a):this.copy(t),a>=1)return this._w=o,this._x=n,this._y=i,this._z=r,this;const c=1-a*a;if(c<=Number.EPSILON){const f=1-e;return this._w=f*o+e*this._w,this._x=f*n+e*this._x,this._y=f*i+e*this._y,this._z=f*r+e*this._z,this.normalize(),this}const l=Math.sqrt(c),h=Math.atan2(l,a),d=Math.sin((1-e)*h)/l,u=Math.sin(e*h)/l;return this._w=o*d+this._w*u,this._x=n*d+this._x*u,this._y=i*d+this._y*u,this._z=r*d+this._z*u,this._onChangeCallback(),this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){const t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class E{constructor(t=0,e=0,n=0){E.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(Xl.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(Xl.setFromAxisAngle(t,e))}applyMatrix3(t){const e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*o,this}applyQuaternion(t){const e=this.x,n=this.y,i=this.z,r=t.x,o=t.y,a=t.z,c=t.w,l=2*(o*i-a*n),h=2*(a*e-r*i),d=2*(r*n-o*e);return this.x=e+c*l+o*d-a*h,this.y=n+c*h+a*l-r*d,this.z=i+c*d+r*h-o*l,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){const e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){const n=t.x,i=t.y,r=t.z,o=e.x,a=e.y,c=e.z;return this.x=i*c-r*a,this.y=r*o-n*c,this.z=n*a-i*o,this}projectOnVector(t){const e=t.lengthSq();if(e===0)return this.set(0,0,0);const n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return Qo.copy(this).projectOnVector(t),this.sub(Qo)}reflect(t){return this.sub(Qo.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(Re(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){const i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){const e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const Qo=new E,Xl=new Te;class Ln{constructor(t=new E(1/0,1/0,1/0),e=new E(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(_n.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(_n.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=_n.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);const n=t.geometry;if(n!==void 0){const r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,_n):_n.fromBufferAttribute(r,o),_n.applyMatrix4(t.matrixWorld),this.expandByPoint(_n);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Er.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Er.copy(n.boundingBox)),Er.applyMatrix4(t.matrixWorld),this.union(Er)}const i=t.children;for(let r=0,o=i.length;r<o;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,_n),_n.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(zs),Tr.subVectors(this.max,zs),Wi.subVectors(t.a,zs),Xi.subVectors(t.b,zs),ji.subVectors(t.c,zs),Jn.subVectors(Xi,Wi),Qn.subVectors(ji,Xi),vi.subVectors(Wi,ji);let e=[0,-Jn.z,Jn.y,0,-Qn.z,Qn.y,0,-vi.z,vi.y,Jn.z,0,-Jn.x,Qn.z,0,-Qn.x,vi.z,0,-vi.x,-Jn.y,Jn.x,0,-Qn.y,Qn.x,0,-vi.y,vi.x,0];return!ta(e,Wi,Xi,ji,Tr)||(e=[1,0,0,0,1,0,0,0,1],!ta(e,Wi,Xi,ji,Tr))?!1:(Ar.crossVectors(Jn,Qn),e=[Ar.x,Ar.y,Ar.z],ta(e,Wi,Xi,ji,Tr))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,_n).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(_n).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(On[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),On[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),On[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),On[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),On[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),On[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),On[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),On[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(On),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}}const On=[new E,new E,new E,new E,new E,new E,new E,new E],_n=new E,Er=new Ln,Wi=new E,Xi=new E,ji=new E,Jn=new E,Qn=new E,vi=new E,zs=new E,Tr=new E,Ar=new E,yi=new E;function ta(s,t,e,n,i){for(let r=0,o=s.length-3;r<=o;r+=3){yi.fromArray(s,r);const a=i.x*Math.abs(yi.x)+i.y*Math.abs(yi.y)+i.z*Math.abs(yi.z),c=t.dot(yi),l=e.dot(yi),h=n.dot(yi);if(Math.max(-Math.max(c,l,h),Math.min(c,l,h))>a)return!1}return!0}const wp=new Ln,Bs=new E,ea=new E;class In{constructor(t=new E,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){const n=this.center;e!==void 0?n.copy(e):wp.setFromPoints(t).getCenter(n);let i=0;for(let r=0,o=t.length;r<o;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){const e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){const n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Bs.subVectors(t,this.center);const e=Bs.lengthSq();if(e>this.radius*this.radius){const n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(Bs,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(ea.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Bs.copy(t.center).add(ea)),this.expandByPoint(Bs.copy(t.center).sub(ea))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}}const Fn=new E,na=new E,Rr=new E,ti=new E,ia=new E,Cr=new E,sa=new E;class Is{constructor(t=new E,e=new E(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Fn)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);const n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){const e=Fn.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Fn.copy(this.origin).addScaledVector(this.direction,e),Fn.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){na.copy(t).add(e).multiplyScalar(.5),Rr.copy(e).sub(t).normalize(),ti.copy(this.origin).sub(na);const r=t.distanceTo(e)*.5,o=-this.direction.dot(Rr),a=ti.dot(this.direction),c=-ti.dot(Rr),l=ti.lengthSq(),h=Math.abs(1-o*o);let d,u,f,p;if(h>0)if(d=o*c-a,u=o*a-c,p=r*h,d>=0)if(u>=-p)if(u<=p){const _=1/h;d*=_,u*=_,f=d*(d+o*u+2*a)+u*(o*d+u+2*c)+l}else u=r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*c)+l;else u=-r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*c)+l;else u<=-p?(d=Math.max(0,-(-o*r+a)),u=d>0?-r:Math.min(Math.max(-r,-c),r),f=-d*d+u*(u+2*c)+l):u<=p?(d=0,u=Math.min(Math.max(-r,-c),r),f=u*(u+2*c)+l):(d=Math.max(0,-(o*r+a)),u=d>0?r:Math.min(Math.max(-r,-c),r),f=-d*d+u*(u+2*c)+l);else u=o>0?-r:r,d=Math.max(0,-(o*u+a)),f=-d*d+u*(u+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,d),i&&i.copy(na).addScaledVector(Rr,u),f}intersectSphere(t,e){Fn.subVectors(t.center,this.origin);const n=Fn.dot(this.direction),i=Fn.dot(Fn)-n*n,r=t.radius*t.radius;if(i>r)return null;const o=Math.sqrt(r-i),a=n-o,c=n+o;return c<0?null:a<0?this.at(c,e):this.at(a,e)}intersectsSphere(t){return this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){const e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){const n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){const e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,o,a,c;const l=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return l>=0?(n=(t.min.x-u.x)*l,i=(t.max.x-u.x)*l):(n=(t.max.x-u.x)*l,i=(t.min.x-u.x)*l),h>=0?(r=(t.min.y-u.y)*h,o=(t.max.y-u.y)*h):(r=(t.max.y-u.y)*h,o=(t.min.y-u.y)*h),n>o||r>i||((r>n||isNaN(n))&&(n=r),(o<i||isNaN(i))&&(i=o),d>=0?(a=(t.min.z-u.z)*d,c=(t.max.z-u.z)*d):(a=(t.max.z-u.z)*d,c=(t.min.z-u.z)*d),n>c||a>i)||((a>n||n!==n)&&(n=a),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,Fn)!==null}intersectTriangle(t,e,n,i,r){ia.subVectors(e,t),Cr.subVectors(n,t),sa.crossVectors(ia,Cr);let o=this.direction.dot(sa),a;if(o>0){if(i)return null;a=1}else if(o<0)a=-1,o=-o;else return null;ti.subVectors(this.origin,t);const c=a*this.direction.dot(Cr.crossVectors(ti,Cr));if(c<0)return null;const l=a*this.direction.dot(ia.cross(ti));if(l<0||c+l>o)return null;const h=-a*ti.dot(sa);return h<0?null:this.at(h/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Dt{constructor(t,e,n,i,r,o,a,c,l,h,d,u,f,p,_,m){Dt.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,c,l,h,d,u,f,p,_,m)}set(t,e,n,i,r,o,a,c,l,h,d,u,f,p,_,m){const g=this.elements;return g[0]=t,g[4]=e,g[8]=n,g[12]=i,g[1]=r,g[5]=o,g[9]=a,g[13]=c,g[2]=l,g[6]=h,g[10]=d,g[14]=u,g[3]=f,g[7]=p,g[11]=_,g[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Dt().fromArray(this.elements)}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){const e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){const e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){const e=this.elements,n=t.elements,i=1/$i.setFromMatrixColumn(t,0).length(),r=1/$i.setFromMatrixColumn(t,1).length(),o=1/$i.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){const e=this.elements,n=t.x,i=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),c=Math.cos(i),l=Math.sin(i),h=Math.cos(r),d=Math.sin(r);if(t.order==="XYZ"){const u=o*h,f=o*d,p=a*h,_=a*d;e[0]=c*h,e[4]=-c*d,e[8]=l,e[1]=f+p*l,e[5]=u-_*l,e[9]=-a*c,e[2]=_-u*l,e[6]=p+f*l,e[10]=o*c}else if(t.order==="YXZ"){const u=c*h,f=c*d,p=l*h,_=l*d;e[0]=u+_*a,e[4]=p*a-f,e[8]=o*l,e[1]=o*d,e[5]=o*h,e[9]=-a,e[2]=f*a-p,e[6]=_+u*a,e[10]=o*c}else if(t.order==="ZXY"){const u=c*h,f=c*d,p=l*h,_=l*d;e[0]=u-_*a,e[4]=-o*d,e[8]=p+f*a,e[1]=f+p*a,e[5]=o*h,e[9]=_-u*a,e[2]=-o*l,e[6]=a,e[10]=o*c}else if(t.order==="ZYX"){const u=o*h,f=o*d,p=a*h,_=a*d;e[0]=c*h,e[4]=p*l-f,e[8]=u*l+_,e[1]=c*d,e[5]=_*l+u,e[9]=f*l-p,e[2]=-l,e[6]=a*c,e[10]=o*c}else if(t.order==="YZX"){const u=o*c,f=o*l,p=a*c,_=a*l;e[0]=c*h,e[4]=_-u*d,e[8]=p*d+f,e[1]=d,e[5]=o*h,e[9]=-a*h,e[2]=-l*h,e[6]=f*d+p,e[10]=u-_*d}else if(t.order==="XZY"){const u=o*c,f=o*l,p=a*c,_=a*l;e[0]=c*h,e[4]=-d,e[8]=l*h,e[1]=u*d+_,e[5]=o*h,e[9]=f*d-p,e[2]=p*d-f,e[6]=a*h,e[10]=_*d+u}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Ep,t,Tp)}lookAt(t,e,n){const i=this.elements;return rn.subVectors(t,e),rn.lengthSq()===0&&(rn.z=1),rn.normalize(),ei.crossVectors(n,rn),ei.lengthSq()===0&&(Math.abs(n.z)===1?rn.x+=1e-4:rn.z+=1e-4,rn.normalize(),ei.crossVectors(n,rn)),ei.normalize(),Pr.crossVectors(rn,ei),i[0]=ei.x,i[4]=Pr.x,i[8]=rn.x,i[1]=ei.y,i[5]=Pr.y,i[9]=rn.y,i[2]=ei.z,i[6]=Pr.z,i[10]=rn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[4],c=n[8],l=n[12],h=n[1],d=n[5],u=n[9],f=n[13],p=n[2],_=n[6],m=n[10],g=n[14],x=n[3],v=n[7],M=n[11],C=n[15],R=i[0],T=i[4],L=i[8],V=i[12],y=i[1],w=i[5],F=i[9],B=i[13],W=i[2],j=i[6],H=i[10],K=i[14],G=i[3],st=i[7],at=i[11],mt=i[15];return r[0]=o*R+a*y+c*W+l*G,r[4]=o*T+a*w+c*j+l*st,r[8]=o*L+a*F+c*H+l*at,r[12]=o*V+a*B+c*K+l*mt,r[1]=h*R+d*y+u*W+f*G,r[5]=h*T+d*w+u*j+f*st,r[9]=h*L+d*F+u*H+f*at,r[13]=h*V+d*B+u*K+f*mt,r[2]=p*R+_*y+m*W+g*G,r[6]=p*T+_*w+m*j+g*st,r[10]=p*L+_*F+m*H+g*at,r[14]=p*V+_*B+m*K+g*mt,r[3]=x*R+v*y+M*W+C*G,r[7]=x*T+v*w+M*j+C*st,r[11]=x*L+v*F+M*H+C*at,r[15]=x*V+v*B+M*K+C*mt,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],o=t[1],a=t[5],c=t[9],l=t[13],h=t[2],d=t[6],u=t[10],f=t[14],p=t[3],_=t[7],m=t[11],g=t[15];return p*(+r*c*d-i*l*d-r*a*u+n*l*u+i*a*f-n*c*f)+_*(+e*c*f-e*l*u+r*o*u-i*o*f+i*l*h-r*c*h)+m*(+e*l*d-e*a*f-r*o*d+n*o*f+r*a*h-n*l*h)+g*(-i*a*h-e*c*d+e*a*u+i*o*d-n*o*u+n*c*h)}transpose(){const t=this.elements;let e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){const i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],h=t[8],d=t[9],u=t[10],f=t[11],p=t[12],_=t[13],m=t[14],g=t[15],x=d*m*l-_*u*l+_*c*f-a*m*f-d*c*g+a*u*g,v=p*u*l-h*m*l-p*c*f+o*m*f+h*c*g-o*u*g,M=h*_*l-p*d*l+p*a*f-o*_*f-h*a*g+o*d*g,C=p*d*c-h*_*c-p*a*u+o*_*u+h*a*m-o*d*m,R=e*x+n*v+i*M+r*C;if(R===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const T=1/R;return t[0]=x*T,t[1]=(_*u*r-d*m*r-_*i*f+n*m*f+d*i*g-n*u*g)*T,t[2]=(a*m*r-_*c*r+_*i*l-n*m*l-a*i*g+n*c*g)*T,t[3]=(d*c*r-a*u*r-d*i*l+n*u*l+a*i*f-n*c*f)*T,t[4]=v*T,t[5]=(h*m*r-p*u*r+p*i*f-e*m*f-h*i*g+e*u*g)*T,t[6]=(p*c*r-o*m*r-p*i*l+e*m*l+o*i*g-e*c*g)*T,t[7]=(o*u*r-h*c*r+h*i*l-e*u*l-o*i*f+e*c*f)*T,t[8]=M*T,t[9]=(p*d*r-h*_*r-p*n*f+e*_*f+h*n*g-e*d*g)*T,t[10]=(o*_*r-p*a*r+p*n*l-e*_*l-o*n*g+e*a*g)*T,t[11]=(h*a*r-o*d*r-h*n*l+e*d*l+o*n*f-e*a*f)*T,t[12]=C*T,t[13]=(h*_*i-p*d*i+p*n*u-e*_*u-h*n*m+e*d*m)*T,t[14]=(p*a*i-o*_*i-p*n*c+e*_*c+o*n*m-e*a*m)*T,t[15]=(o*d*i-h*a*i+h*n*c-e*d*c-o*n*u+e*a*u)*T,this}scale(t){const e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){const t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){const e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){const n=Math.cos(e),i=Math.sin(e),r=1-n,o=t.x,a=t.y,c=t.z,l=r*o,h=r*a;return this.set(l*o+n,l*a-i*c,l*c+i*a,0,l*a+i*c,h*a+n,h*c-i*o,0,l*c-i*a,h*c+i*o,r*c*c+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,o){return this.set(1,n,r,0,t,1,o,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){const i=this.elements,r=e._x,o=e._y,a=e._z,c=e._w,l=r+r,h=o+o,d=a+a,u=r*l,f=r*h,p=r*d,_=o*h,m=o*d,g=a*d,x=c*l,v=c*h,M=c*d,C=n.x,R=n.y,T=n.z;return i[0]=(1-(_+g))*C,i[1]=(f+M)*C,i[2]=(p-v)*C,i[3]=0,i[4]=(f-M)*R,i[5]=(1-(u+g))*R,i[6]=(m+x)*R,i[7]=0,i[8]=(p+v)*T,i[9]=(m-x)*T,i[10]=(1-(u+_))*T,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){const i=this.elements;let r=$i.set(i[0],i[1],i[2]).length();const o=$i.set(i[4],i[5],i[6]).length(),a=$i.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),t.x=i[12],t.y=i[13],t.z=i[14],vn.copy(this);const l=1/r,h=1/o,d=1/a;return vn.elements[0]*=l,vn.elements[1]*=l,vn.elements[2]*=l,vn.elements[4]*=h,vn.elements[5]*=h,vn.elements[6]*=h,vn.elements[8]*=d,vn.elements[9]*=d,vn.elements[10]*=d,e.setFromRotationMatrix(vn),n.x=r,n.y=o,n.z=a,this}makePerspective(t,e,n,i,r,o,a=$n){const c=this.elements,l=2*r/(e-t),h=2*r/(n-i),d=(e+t)/(e-t),u=(n+i)/(n-i);let f,p;if(a===$n)f=-(o+r)/(o-r),p=-2*o*r/(o-r);else if(a===Co)f=-o/(o-r),p=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=l,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=h,c[9]=u,c[13]=0,c[2]=0,c[6]=0,c[10]=f,c[14]=p,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,i,r,o,a=$n){const c=this.elements,l=1/(e-t),h=1/(n-i),d=1/(o-r),u=(e+t)*l,f=(n+i)*h;let p,_;if(a===$n)p=(o+r)*d,_=-2*d;else if(a===Co)p=r*d,_=-1*d;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=2*l,c[4]=0,c[8]=0,c[12]=-u,c[1]=0,c[5]=2*h,c[9]=0,c[13]=-f,c[2]=0,c[6]=0,c[10]=_,c[14]=-p,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}}const $i=new E,vn=new Dt,Ep=new E(0,0,0),Tp=new E(1,1,1),ei=new E,Pr=new E,rn=new E,jl=new Dt,$l=new Te;class En{constructor(t=0,e=0,n=0,i=En.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){const i=t.elements,r=i[0],o=i[4],a=i[8],c=i[1],l=i[5],h=i[9],d=i[2],u=i[6],f=i[10];switch(e){case"XYZ":this._y=Math.asin(Re(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(u,l),this._z=0);break;case"YXZ":this._x=Math.asin(-Re(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,f),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-d,r),this._z=0);break;case"ZXY":this._x=Math.asin(Re(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-o,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-Re(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,f),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-o,l));break;case"YZX":this._z=Math.asin(Re(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-h,l),this._y=Math.atan2(-d,r)):(this._x=0,this._y=Math.atan2(a,f));break;case"XZY":this._z=Math.asin(-Re(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(u,l),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,f),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return jl.makeRotationFromQuaternion(t),this.setFromRotationMatrix(jl,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return $l.setFromEuler(this),this.setFromQuaternion($l,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}En.DEFAULT_ORDER="XYZ";class sl{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}}let Ap=0;const Yl=new E,Yi=new Te,zn=new Dt,Lr=new E,Hs=new E,Rp=new E,Cp=new Te,ql=new E(1,0,0),Kl=new E(0,1,0),Zl=new E(0,0,1),Jl={type:"added"},Pp={type:"removed"},qi={type:"childadded",child:null},ra={type:"childremoved",child:null};class le extends zi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Ap++}),this.uuid=mn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=le.DEFAULT_UP.clone();const t=new E,e=new En,n=new Te,i=new E(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Dt},normalMatrix:{value:new zt}}),this.matrix=new Dt,this.matrixWorld=new Dt,this.matrixAutoUpdate=le.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=le.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new sl,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Yi.setFromAxisAngle(t,e),this.quaternion.multiply(Yi),this}rotateOnWorldAxis(t,e){return Yi.setFromAxisAngle(t,e),this.quaternion.premultiply(Yi),this}rotateX(t){return this.rotateOnAxis(ql,t)}rotateY(t){return this.rotateOnAxis(Kl,t)}rotateZ(t){return this.rotateOnAxis(Zl,t)}translateOnAxis(t,e){return Yl.copy(t).applyQuaternion(this.quaternion),this.position.add(Yl.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(ql,t)}translateY(t){return this.translateOnAxis(Kl,t)}translateZ(t){return this.translateOnAxis(Zl,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(zn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?Lr.copy(t):Lr.set(t,e,n);const i=this.parent;this.updateWorldMatrix(!0,!1),Hs.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?zn.lookAt(Hs,Lr,this.up):zn.lookAt(Lr,Hs,this.up),this.quaternion.setFromRotationMatrix(zn),i&&(zn.extractRotation(i.matrixWorld),Yi.setFromRotationMatrix(zn),this.quaternion.premultiply(Yi.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Jl),qi.child=t,this.dispatchEvent(qi),qi.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Pp),ra.child=t,this.dispatchEvent(ra),ra.child=null),this}removeFromParent(){const t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),zn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),zn.multiply(t.parent.matrixWorld)),t.applyMatrix4(zn),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Jl),qi.child=t,this.dispatchEvent(qi),qi.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){const o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);const i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Hs,t,Rp),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Hs,Cp,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);const e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){const e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e){const n=this.parent;if(t===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),e===!0){const i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].updateWorldMatrix(!1,!0)}}toJSON(t){const e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});const i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(a=>({boxInitialized:a.boxInitialized,boxMin:a.box.min.toArray(),boxMax:a.box.max.toArray(),sphereInitialized:a.sphereInitialized,sphereRadius:a.sphere.radius,sphereCenter:a.sphere.center.toArray()})),i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()}));function r(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(t)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);const a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){const c=a.shapes;if(Array.isArray(c))for(let l=0,h=c.length;l<h;l++){const d=c[l];r(t.shapes,d)}else r(t.shapes,c)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(r(t.materials,this.material[c]));i.material=a}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let a=0;a<this.children.length;a++)i.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let a=0;a<this.animations.length;a++){const c=this.animations[a];i.animations.push(r(t.animations,c))}}if(e){const a=o(t.geometries),c=o(t.materials),l=o(t.textures),h=o(t.images),d=o(t.shapes),u=o(t.skeletons),f=o(t.animations),p=o(t.nodes);a.length>0&&(n.geometries=a),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),h.length>0&&(n.images=h),d.length>0&&(n.shapes=d),u.length>0&&(n.skeletons=u),f.length>0&&(n.animations=f),p.length>0&&(n.nodes=p)}return n.object=i,n;function o(a){const c=[];for(const l in a){const h=a[l];delete h.metadata,c.push(h)}return c}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){const i=t.children[n];this.add(i.clone())}return this}}le.DEFAULT_UP=new E(0,1,0);le.DEFAULT_MATRIX_AUTO_UPDATE=!0;le.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const yn=new E,Bn=new E,oa=new E,Hn=new E,Ki=new E,Zi=new E,Ql=new E,aa=new E,ca=new E,la=new E,ha=new te,ua=new te,da=new te;class Mn{constructor(t=new E,e=new E,n=new E){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),yn.subVectors(t,e),i.cross(yn);const r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){yn.subVectors(i,e),Bn.subVectors(n,e),oa.subVectors(t,e);const o=yn.dot(yn),a=yn.dot(Bn),c=yn.dot(oa),l=Bn.dot(Bn),h=Bn.dot(oa),d=o*l-a*a;if(d===0)return r.set(0,0,0),null;const u=1/d,f=(l*c-a*h)*u,p=(o*h-a*c)*u;return r.set(1-f-p,p,f)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,Hn)===null?!1:Hn.x>=0&&Hn.y>=0&&Hn.x+Hn.y<=1}static getInterpolation(t,e,n,i,r,o,a,c){return this.getBarycoord(t,e,n,i,Hn)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,Hn.x),c.addScaledVector(o,Hn.y),c.addScaledVector(a,Hn.z),c)}static getInterpolatedAttribute(t,e,n,i,r,o){return ha.setScalar(0),ua.setScalar(0),da.setScalar(0),ha.fromBufferAttribute(t,e),ua.fromBufferAttribute(t,n),da.fromBufferAttribute(t,i),o.setScalar(0),o.addScaledVector(ha,r.x),o.addScaledVector(ua,r.y),o.addScaledVector(da,r.z),o}static isFrontFacing(t,e,n,i){return yn.subVectors(n,e),Bn.subVectors(t,e),yn.cross(Bn).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return yn.subVectors(this.c,this.b),Bn.subVectors(this.a,this.b),yn.cross(Bn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return Mn.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return Mn.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,r){return Mn.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return Mn.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return Mn.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){const n=this.a,i=this.b,r=this.c;let o,a;Ki.subVectors(i,n),Zi.subVectors(r,n),aa.subVectors(t,n);const c=Ki.dot(aa),l=Zi.dot(aa);if(c<=0&&l<=0)return e.copy(n);ca.subVectors(t,i);const h=Ki.dot(ca),d=Zi.dot(ca);if(h>=0&&d<=h)return e.copy(i);const u=c*d-h*l;if(u<=0&&c>=0&&h<=0)return o=c/(c-h),e.copy(n).addScaledVector(Ki,o);la.subVectors(t,r);const f=Ki.dot(la),p=Zi.dot(la);if(p>=0&&f<=p)return e.copy(r);const _=f*l-c*p;if(_<=0&&l>=0&&p<=0)return a=l/(l-p),e.copy(n).addScaledVector(Zi,a);const m=h*p-f*d;if(m<=0&&d-h>=0&&f-p>=0)return Ql.subVectors(r,i),a=(d-h)/(d-h+(f-p)),e.copy(i).addScaledVector(Ql,a);const g=1/(m+_+u);return o=_*g,a=u*g,e.copy(n).addScaledVector(Ki,o).addScaledVector(Zi,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}}const id={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},ni={h:0,s:0,l:0},Ir={h:0,s:0,l:0};function fa(s,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?s+(t-s)*6*e:e<1/2?t:e<2/3?s+(t-s)*6*(2/3-e):s}class Tt{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){const i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=ke){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Zt.toWorkingColorSpace(this,e),this}setRGB(t,e,n,i=Zt.workingColorSpace){return this.r=t,this.g=e,this.b=n,Zt.toWorkingColorSpace(this,i),this}setHSL(t,e,n,i=Zt.workingColorSpace){if(t=il(t,1),e=Re(e,0,1),n=Re(n,0,1),e===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=fa(o,r,t+1/3),this.g=fa(o,r,t),this.b=fa(o,r,t-1/3)}return Zt.toWorkingColorSpace(this,i),this}setStyle(t,e=ke){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r;const o=i[1],a=i[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){const r=i[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=ke){const n=id[t.toLowerCase()];return n!==void 0?this.setHex(n,e):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=ds(t.r),this.g=ds(t.g),this.b=ds(t.b),this}copyLinearToSRGB(t){return this.r=Zo(t.r),this.g=Zo(t.g),this.b=Zo(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=ke){return Zt.fromWorkingColorSpace(Be.copy(this),t),Math.round(Re(Be.r*255,0,255))*65536+Math.round(Re(Be.g*255,0,255))*256+Math.round(Re(Be.b*255,0,255))}getHexString(t=ke){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Zt.workingColorSpace){Zt.fromWorkingColorSpace(Be.copy(this),e);const n=Be.r,i=Be.g,r=Be.b,o=Math.max(n,i,r),a=Math.min(n,i,r);let c,l;const h=(a+o)/2;if(a===o)c=0,l=0;else{const d=o-a;switch(l=h<=.5?d/(o+a):d/(2-o-a),o){case n:c=(i-r)/d+(i<r?6:0);break;case i:c=(r-n)/d+2;break;case r:c=(n-i)/d+4;break}c/=6}return t.h=c,t.s=l,t.l=h,t}getRGB(t,e=Zt.workingColorSpace){return Zt.fromWorkingColorSpace(Be.copy(this),e),t.r=Be.r,t.g=Be.g,t.b=Be.b,t}getStyle(t=ke){Zt.fromWorkingColorSpace(Be.copy(this),t);const e=Be.r,n=Be.g,i=Be.b;return t!==ke?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(ni),this.setHSL(ni.h+t,ni.s+e,ni.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(ni),t.getHSL(Ir);const n=sr(ni.h,Ir.h,e),i=sr(ni.s,Ir.s,e),r=sr(ni.l,Ir.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){const e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Be=new Tt;Tt.NAMES=id;let Lp=0;class Pn extends zi{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Lp++}),this.uuid=mn(),this.name="",this.type="Material",this.blending=hs,this.side=Yn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=$a,this.blendDst=Ya,this.blendEquation=Ci,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Tt(0,0,0),this.blendAlpha=0,this.depthFunc=ys,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=zl,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Gi,this.stencilZFail=Gi,this.stencilZPass=Gi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(const e in t){const n=t[e];if(n===void 0){console.warn(`THREE.Material: parameter '${e}' has value of undefined.`);continue}const i=this[e];if(i===void 0){console.warn(`THREE.Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});const n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==hs&&(n.blending=this.blending),this.side!==Yn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==$a&&(n.blendSrc=this.blendSrc),this.blendDst!==Ya&&(n.blendDst=this.blendDst),this.blendEquation!==Ci&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ys&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==zl&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Gi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Gi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Gi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){const o=[];for(const a in r){const c=r[a];delete c.metadata,o.push(c)}return o}if(e){const r=i(t.textures),o=i(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;const e=t.clippingPlanes;let n=null;if(e!==null){const i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}}class Ve extends Pn{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Tt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new En,this.combine=Fu,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}const Se=new E,Dr=new it;class Ze{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Lc,this.updateRanges=[],this.gpuType=bn,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)Dr.fromBufferAttribute(this,e),Dr.applyMatrix3(t),this.setXY(e,Dr.x,Dr.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)Se.fromBufferAttribute(this,e),Se.applyMatrix3(t),this.setXYZ(e,Se.x,Se.y,Se.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)Se.fromBufferAttribute(this,e),Se.applyMatrix4(t),this.setXYZ(e,Se.x,Se.y,Se.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)Se.fromBufferAttribute(this,e),Se.applyNormalMatrix(t),this.setXYZ(e,Se.x,Se.y,Se.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)Se.fromBufferAttribute(this,e),Se.transformDirection(t),this.setXYZ(e,Se.x,Se.y,Se.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=xn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=se(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=xn(e,this.array)),e}setX(t,e){return this.normalized&&(e=se(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=xn(e,this.array)),e}setY(t,e){return this.normalized&&(e=se(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=xn(e,this.array)),e}setZ(t,e){return this.normalized&&(e=se(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=xn(e,this.array)),e}setW(t,e){return this.normalized&&(e=se(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=se(e,this.array),n=se(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=se(e,this.array),n=se(n,this.array),i=se(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=se(e,this.array),n=se(n,this.array),i=se(i,this.array),r=se(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==Lc&&(t.usage=this.usage),t}}class sd extends Ze{constructor(t,e,n){super(new Uint16Array(t),e,n)}}class rd extends Ze{constructor(t,e,n){super(new Uint32Array(t),e,n)}}class Yt extends Ze{constructor(t,e,n){super(new Float32Array(t),e,n)}}let Ip=0;const un=new Dt,pa=new le,Ji=new E,on=new Ln,Gs=new Ln,Le=new E;class Me extends zi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Ip++}),this.uuid=mn(),this.name="",this.type="BufferGeometry",this.index=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(td(t)?rd:sd)(t,1):this.index=t,this}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){const e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new zt().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}const i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return un.makeRotationFromQuaternion(t),this.applyMatrix4(un),this}rotateX(t){return un.makeRotationX(t),this.applyMatrix4(un),this}rotateY(t){return un.makeRotationY(t),this.applyMatrix4(un),this}rotateZ(t){return un.makeRotationZ(t),this.applyMatrix4(un),this}translate(t,e,n){return un.makeTranslation(t,e,n),this.applyMatrix4(un),this}scale(t,e,n){return un.makeScale(t,e,n),this.applyMatrix4(un),this}lookAt(t){return pa.lookAt(t),pa.updateMatrix(),this.applyMatrix4(pa.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Ji).negate(),this.translate(Ji.x,Ji.y,Ji.z),this}setFromPoints(t){const e=[];for(let n=0,i=t.length;n<i;n++){const r=t[n];e.push(r.x,r.y,r.z||0)}return this.setAttribute("position",new Yt(e,3)),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Ln);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new E(-1/0,-1/0,-1/0),new E(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){const r=e[n];on.setFromBufferAttribute(r),this.morphTargetsRelative?(Le.addVectors(this.boundingBox.min,on.min),this.boundingBox.expandByPoint(Le),Le.addVectors(this.boundingBox.max,on.max),this.boundingBox.expandByPoint(Le)):(this.boundingBox.expandByPoint(on.min),this.boundingBox.expandByPoint(on.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new In);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new E,1/0);return}if(t){const n=this.boundingSphere.center;if(on.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){const a=e[r];Gs.setFromBufferAttribute(a),this.morphTargetsRelative?(Le.addVectors(on.min,Gs.min),on.expandByPoint(Le),Le.addVectors(on.max,Gs.max),on.expandByPoint(Le)):(on.expandByPoint(Gs.min),on.expandByPoint(Gs.max))}on.getCenter(n);let i=0;for(let r=0,o=t.count;r<o;r++)Le.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared(Le));if(e)for(let r=0,o=e.length;r<o;r++){const a=e[r],c=this.morphTargetsRelative;for(let l=0,h=a.count;l<h;l++)Le.fromBufferAttribute(a,l),c&&(Ji.fromBufferAttribute(t,l),Le.add(Ji)),i=Math.max(i,n.distanceToSquared(Le))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=e.position,i=e.normal,r=e.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Ze(new Float32Array(4*n.count),4));const o=this.getAttribute("tangent"),a=[],c=[];for(let L=0;L<n.count;L++)a[L]=new E,c[L]=new E;const l=new E,h=new E,d=new E,u=new it,f=new it,p=new it,_=new E,m=new E;function g(L,V,y){l.fromBufferAttribute(n,L),h.fromBufferAttribute(n,V),d.fromBufferAttribute(n,y),u.fromBufferAttribute(r,L),f.fromBufferAttribute(r,V),p.fromBufferAttribute(r,y),h.sub(l),d.sub(l),f.sub(u),p.sub(u);const w=1/(f.x*p.y-p.x*f.y);isFinite(w)&&(_.copy(h).multiplyScalar(p.y).addScaledVector(d,-f.y).multiplyScalar(w),m.copy(d).multiplyScalar(f.x).addScaledVector(h,-p.x).multiplyScalar(w),a[L].add(_),a[V].add(_),a[y].add(_),c[L].add(m),c[V].add(m),c[y].add(m))}let x=this.groups;x.length===0&&(x=[{start:0,count:t.count}]);for(let L=0,V=x.length;L<V;++L){const y=x[L],w=y.start,F=y.count;for(let B=w,W=w+F;B<W;B+=3)g(t.getX(B+0),t.getX(B+1),t.getX(B+2))}const v=new E,M=new E,C=new E,R=new E;function T(L){C.fromBufferAttribute(i,L),R.copy(C);const V=a[L];v.copy(V),v.sub(C.multiplyScalar(C.dot(V))).normalize(),M.crossVectors(R,V);const w=M.dot(c[L])<0?-1:1;o.setXYZW(L,v.x,v.y,v.z,w)}for(let L=0,V=x.length;L<V;++L){const y=x[L],w=y.start,F=y.count;for(let B=w,W=w+F;B<W;B+=3)T(t.getX(B+0)),T(t.getX(B+1)),T(t.getX(B+2))}}computeVertexNormals(){const t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Ze(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let u=0,f=n.count;u<f;u++)n.setXYZ(u,0,0,0);const i=new E,r=new E,o=new E,a=new E,c=new E,l=new E,h=new E,d=new E;if(t)for(let u=0,f=t.count;u<f;u+=3){const p=t.getX(u+0),_=t.getX(u+1),m=t.getX(u+2);i.fromBufferAttribute(e,p),r.fromBufferAttribute(e,_),o.fromBufferAttribute(e,m),h.subVectors(o,r),d.subVectors(i,r),h.cross(d),a.fromBufferAttribute(n,p),c.fromBufferAttribute(n,_),l.fromBufferAttribute(n,m),a.add(h),c.add(h),l.add(h),n.setXYZ(p,a.x,a.y,a.z),n.setXYZ(_,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let u=0,f=e.count;u<f;u+=3)i.fromBufferAttribute(e,u+0),r.fromBufferAttribute(e,u+1),o.fromBufferAttribute(e,u+2),h.subVectors(o,r),d.subVectors(i,r),h.cross(d),n.setXYZ(u+0,h.x,h.y,h.z),n.setXYZ(u+1,h.x,h.y,h.z),n.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Le.fromBufferAttribute(t,e),Le.normalize(),t.setXYZ(e,Le.x,Le.y,Le.z)}toNonIndexed(){function t(a,c){const l=a.array,h=a.itemSize,d=a.normalized,u=new l.constructor(c.length*h);let f=0,p=0;for(let _=0,m=c.length;_<m;_++){a.isInterleavedBufferAttribute?f=c[_]*a.data.stride+a.offset:f=c[_]*h;for(let g=0;g<h;g++)u[p++]=l[f++]}return new Ze(u,h,d)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const e=new Me,n=this.index.array,i=this.attributes;for(const a in i){const c=i[a],l=t(c,n);e.setAttribute(a,l)}const r=this.morphAttributes;for(const a in r){const c=[],l=r[a];for(let h=0,d=l.length;h<d;h++){const u=l[h],f=t(u,n);c.push(f)}e.morphAttributes[a]=c}e.morphTargetsRelative=this.morphTargetsRelative;const o=this.groups;for(let a=0,c=o.length;a<c;a++){const l=o[a];e.addGroup(l.start,l.count,l.materialIndex)}return e}toJSON(){const t={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){const c=this.parameters;for(const l in c)c[l]!==void 0&&(t[l]=c[l]);return t}t.data={attributes:{}};const e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});const n=this.attributes;for(const c in n){const l=n[c];t.data.attributes[c]=l.toJSON(t.data)}const i={};let r=!1;for(const c in this.morphAttributes){const l=this.morphAttributes[c],h=[];for(let d=0,u=l.length;d<u;d++){const f=l[d];h.push(f.toJSON(t.data))}h.length>0&&(i[c]=h,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);const o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));const a=this.boundingSphere;return a!==null&&(t.data.boundingSphere={center:a.center.toArray(),radius:a.radius}),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const e={};this.name=t.name;const n=t.index;n!==null&&this.setIndex(n.clone(e));const i=t.attributes;for(const l in i){const h=i[l];this.setAttribute(l,h.clone(e))}const r=t.morphAttributes;for(const l in r){const h=[],d=r[l];for(let u=0,f=d.length;u<f;u++)h.push(d[u].clone(e));this.morphAttributes[l]=h}this.morphTargetsRelative=t.morphTargetsRelative;const o=t.groups;for(let l=0,h=o.length;l<h;l++){const d=o[l];this.addGroup(d.start,d.count,d.materialIndex)}const a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());const c=t.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const th=new Dt,xi=new Is,Nr=new In,eh=new E,Ur=new E,kr=new E,Or=new E,ma=new E,Fr=new E,nh=new E,zr=new E;class nt extends le{constructor(t=new Me,e=new Ve){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){const a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){const n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(i,t);const a=this.morphTargetInfluences;if(r&&a){Fr.set(0,0,0);for(let c=0,l=r.length;c<l;c++){const h=a[c],d=r[c];h!==0&&(ma.fromBufferAttribute(d,t),o?Fr.addScaledVector(ma,h):Fr.addScaledVector(ma.sub(e),h))}e.add(Fr)}return e}raycast(t,e){const n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Nr.copy(n.boundingSphere),Nr.applyMatrix4(r),xi.copy(t.ray).recast(t.near),!(Nr.containsPoint(xi.origin)===!1&&(xi.intersectSphere(Nr,eh)===null||xi.origin.distanceToSquared(eh)>(t.far-t.near)**2))&&(th.copy(r).invert(),xi.copy(t.ray).applyMatrix4(th),!(n.boundingBox!==null&&xi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,xi)))}_computeIntersections(t,e,n){let i;const r=this.geometry,o=this.material,a=r.index,c=r.attributes.position,l=r.attributes.uv,h=r.attributes.uv1,d=r.attributes.normal,u=r.groups,f=r.drawRange;if(a!==null)if(Array.isArray(o))for(let p=0,_=u.length;p<_;p++){const m=u[p],g=o[m.materialIndex],x=Math.max(m.start,f.start),v=Math.min(a.count,Math.min(m.start+m.count,f.start+f.count));for(let M=x,C=v;M<C;M+=3){const R=a.getX(M),T=a.getX(M+1),L=a.getX(M+2);i=Br(this,g,t,n,l,h,d,R,T,L),i&&(i.faceIndex=Math.floor(M/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{const p=Math.max(0,f.start),_=Math.min(a.count,f.start+f.count);for(let m=p,g=_;m<g;m+=3){const x=a.getX(m),v=a.getX(m+1),M=a.getX(m+2);i=Br(this,o,t,n,l,h,d,x,v,M),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}else if(c!==void 0)if(Array.isArray(o))for(let p=0,_=u.length;p<_;p++){const m=u[p],g=o[m.materialIndex],x=Math.max(m.start,f.start),v=Math.min(c.count,Math.min(m.start+m.count,f.start+f.count));for(let M=x,C=v;M<C;M+=3){const R=M,T=M+1,L=M+2;i=Br(this,g,t,n,l,h,d,R,T,L),i&&(i.faceIndex=Math.floor(M/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{const p=Math.max(0,f.start),_=Math.min(c.count,f.start+f.count);for(let m=p,g=_;m<g;m+=3){const x=m,v=m+1,M=m+2;i=Br(this,o,t,n,l,h,d,x,v,M),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}}}function Dp(s,t,e,n,i,r,o,a){let c;if(t.side===Ke?c=n.intersectTriangle(o,r,i,!0,a):c=n.intersectTriangle(i,r,o,t.side===Yn,a),c===null)return null;zr.copy(a),zr.applyMatrix4(s.matrixWorld);const l=e.ray.origin.distanceTo(zr);return l<e.near||l>e.far?null:{distance:l,point:zr.clone(),object:s}}function Br(s,t,e,n,i,r,o,a,c,l){s.getVertexPosition(a,Ur),s.getVertexPosition(c,kr),s.getVertexPosition(l,Or);const h=Dp(s,t,e,n,Ur,kr,Or,nh);if(h){const d=new E;Mn.getBarycoord(nh,Ur,kr,Or,d),i&&(h.uv=Mn.getInterpolatedAttribute(i,a,c,l,d,new it)),r&&(h.uv1=Mn.getInterpolatedAttribute(r,a,c,l,d,new it)),o&&(h.normal=Mn.getInterpolatedAttribute(o,a,c,l,d,new E),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));const u={a,b:c,c:l,normal:new E,materialIndex:0};Mn.getNormal(Ur,kr,Or,u.normal),h.face=u,h.barycoord=d}return h}class Ft extends Me{constructor(t=1,e=1,n=1,i=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:r,depthSegments:o};const a=this;i=Math.floor(i),r=Math.floor(r),o=Math.floor(o);const c=[],l=[],h=[],d=[];let u=0,f=0;p("z","y","x",-1,-1,n,e,t,o,r,0),p("z","y","x",1,-1,n,e,-t,o,r,1),p("x","z","y",1,1,t,n,e,i,o,2),p("x","z","y",1,-1,t,n,-e,i,o,3),p("x","y","z",1,-1,t,e,n,i,r,4),p("x","y","z",-1,-1,t,e,-n,i,r,5),this.setIndex(c),this.setAttribute("position",new Yt(l,3)),this.setAttribute("normal",new Yt(h,3)),this.setAttribute("uv",new Yt(d,2));function p(_,m,g,x,v,M,C,R,T,L,V){const y=M/T,w=C/L,F=M/2,B=C/2,W=R/2,j=T+1,H=L+1;let K=0,G=0;const st=new E;for(let at=0;at<H;at++){const mt=at*w-B;for(let Ht=0;Ht<j;Ht++){const Jt=Ht*y-F;st[_]=Jt*x,st[m]=mt*v,st[g]=W,l.push(st.x,st.y,st.z),st[_]=0,st[m]=0,st[g]=R>0?1:-1,h.push(st.x,st.y,st.z),d.push(Ht/T),d.push(1-at/L),K+=1}}for(let at=0;at<L;at++)for(let mt=0;mt<T;mt++){const Ht=u+mt+j*at,Jt=u+mt+j*(at+1),$=u+(mt+1)+j*(at+1),Q=u+(mt+1)+j*at;c.push(Ht,Jt,Q),c.push(Jt,$,Q),G+=6}a.addGroup(f,G,V),f+=G,u+=K}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ft(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}}function Es(s){const t={};for(const e in s){t[e]={};for(const n in s[e]){const i=s[e][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone():Array.isArray(i)?t[e][n]=i.slice():t[e][n]=i}}return t}function Xe(s){const t={};for(let e=0;e<s.length;e++){const n=Es(s[e]);for(const i in n)t[i]=n[i]}return t}function Np(s){const t=[];for(let e=0;e<s.length;e++)t.push(s[e].clone());return t}function od(s){const t=s.getRenderTarget();return t===null?s.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Zt.workingColorSpace}const Up={clone:Es,merge:Xe};var kp=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Op=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class Kn extends Pn{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=kp,this.fragmentShader=Op,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=Es(t.uniforms),this.uniformsGroups=Np(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){const e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(const i in this.uniforms){const o=this.uniforms[i].value;o&&o.isTexture?e.uniforms[i]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[i]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[i]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[i]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[i]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[i]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[i]={type:"m4",value:o.toArray()}:e.uniforms[i]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;const n={};for(const i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}}class ad extends le{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Dt,this.projectionMatrix=new Dt,this.projectionMatrixInverse=new Dt,this.coordinateSystem=$n}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}}const ii=new E,ih=new it,sh=new it;class Oe extends ad{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){const e=.5*this.getFilmHeight()/t;this.fov=ws*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){const t=Math.tan(ir*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return ws*2*Math.atan(Math.tan(ir*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){ii.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(ii.x,ii.y).multiplyScalar(-t/ii.z),ii.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(ii.x,ii.y).multiplyScalar(-t/ii.z)}getViewSize(t,e){return this.getViewBounds(t,ih,sh),e.subVectors(sh,ih)}setViewOffset(t,e,n,i,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=this.near;let e=t*Math.tan(ir*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,r=-.5*i;const o=this.view;if(this.view!==null&&this.view.enabled){const c=o.fullWidth,l=o.fullHeight;r+=o.offsetX*i/c,e-=o.offsetY*n/l,i*=o.width/c,n*=o.height/l}const a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,e,e-n,t,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}}const Qi=-90,ts=1;class Fp extends le{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const i=new Oe(Qi,ts,t,e);i.layers=this.layers,this.add(i);const r=new Oe(Qi,ts,t,e);r.layers=this.layers,this.add(r);const o=new Oe(Qi,ts,t,e);o.layers=this.layers,this.add(o);const a=new Oe(Qi,ts,t,e);a.layers=this.layers,this.add(a);const c=new Oe(Qi,ts,t,e);c.layers=this.layers,this.add(c);const l=new Oe(Qi,ts,t,e);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){const t=this.coordinateSystem,e=this.children.concat(),[n,i,r,o,a,c]=e;for(const l of e)this.remove(l);if(t===$n)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(t===Co)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(const l of e)this.add(l),l.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());const[r,o,a,c,l,h]=this.children,d=t.getRenderTarget(),u=t.getActiveCubeFace(),f=t.getActiveMipmapLevel(),p=t.xr.enabled;t.xr.enabled=!1;const _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,t.setRenderTarget(n,0,i),t.render(e,r),t.setRenderTarget(n,1,i),t.render(e,o),t.setRenderTarget(n,2,i),t.render(e,a),t.setRenderTarget(n,3,i),t.render(e,c),t.setRenderTarget(n,4,i),t.render(e,l),n.texture.generateMipmaps=_,t.setRenderTarget(n,5,i),t.render(e,h),t.setRenderTarget(d,u,f),t.xr.enabled=p,n.texture.needsPMREMUpdate=!0}}class cd extends De{constructor(t,e,n,i,r,o,a,c,l,h){t=t!==void 0?t:[],e=e!==void 0?e:xs,super(t,e,n,i,r,o,a,c,l,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}}class zp extends Oi{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;const n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];this.texture=new cd(i,e.mapping,e.wrapS,e.wrapT,e.magFilter,e.minFilter,e.format,e.type,e.anisotropy,e.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=e.generateMipmaps!==void 0?e.generateMipmaps:!1,this.texture.minFilter=e.minFilter!==void 0?e.minFilter:cn}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

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
			`},i=new Ft(5,5,5),r=new Kn({name:"CubemapFromEquirect",uniforms:Es(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Ke,blending:fi});r.uniforms.tEquirect.value=e;const o=new nt(i,r),a=e.minFilter;return e.minFilter===jn&&(e.minFilter=cn),new Fp(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e,n,i){const r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,i);t.setRenderTarget(r)}}const ga=new E,Bp=new E,Hp=new zt;class ai{constructor(t=new E(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){const i=ga.subVectors(n,e).cross(Bp.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){const t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){const n=t.delta(ga),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;const r=-(t.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){const e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){const n=e||Hp.getNormalMatrix(t),i=this.coplanarPoint(ga).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}}const Mi=new In,Hr=new E;class rl{constructor(t=new ai,e=new ai,n=new ai,i=new ai,r=new ai,o=new ai){this.planes=[t,e,n,i,r,o]}set(t,e,n,i,r,o){const a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(i),a[4].copy(r),a[5].copy(o),this}copy(t){const e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=$n){const n=this.planes,i=t.elements,r=i[0],o=i[1],a=i[2],c=i[3],l=i[4],h=i[5],d=i[6],u=i[7],f=i[8],p=i[9],_=i[10],m=i[11],g=i[12],x=i[13],v=i[14],M=i[15];if(n[0].setComponents(c-r,u-l,m-f,M-g).normalize(),n[1].setComponents(c+r,u+l,m+f,M+g).normalize(),n[2].setComponents(c+o,u+h,m+p,M+x).normalize(),n[3].setComponents(c-o,u-h,m-p,M-x).normalize(),n[4].setComponents(c-a,u-d,m-_,M-v).normalize(),e===$n)n[5].setComponents(c+a,u+d,m+_,M+v).normalize();else if(e===Co)n[5].setComponents(a,d,_,v).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),Mi.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{const e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),Mi.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(Mi)}intersectsSprite(t){return Mi.center.set(0,0,0),Mi.radius=.7071067811865476,Mi.applyMatrix4(t.matrixWorld),this.intersectsSphere(Mi)}intersectsSphere(t){const e=this.planes,n=t.center,i=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){const e=this.planes;for(let n=0;n<6;n++){const i=e[n];if(Hr.x=i.normal.x>0?t.max.x:t.min.x,Hr.y=i.normal.y>0?t.max.y:t.min.y,Hr.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(Hr)<0)return!1}return!0}containsPoint(t){const e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}function ld(){let s=null,t=!1,e=null,n=null;function i(r,o){e(r,o),n=s.requestAnimationFrame(i)}return{start:function(){t!==!0&&e!==null&&(n=s.requestAnimationFrame(i),t=!0)},stop:function(){s.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){s=r}}}function Gp(s){const t=new WeakMap;function e(a,c){const l=a.array,h=a.usage,d=l.byteLength,u=s.createBuffer();s.bindBuffer(c,u),s.bufferData(c,l,h),a.onUploadCallback();let f;if(l instanceof Float32Array)f=s.FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?f=s.HALF_FLOAT:f=s.UNSIGNED_SHORT;else if(l instanceof Int16Array)f=s.SHORT;else if(l instanceof Uint32Array)f=s.UNSIGNED_INT;else if(l instanceof Int32Array)f=s.INT;else if(l instanceof Int8Array)f=s.BYTE;else if(l instanceof Uint8Array)f=s.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)f=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:u,type:f,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:d}}function n(a,c,l){const h=c.array,d=c.updateRanges;if(s.bindBuffer(l,a),d.length===0)s.bufferSubData(l,0,h);else{d.sort((f,p)=>f.start-p.start);let u=0;for(let f=1;f<d.length;f++){const p=d[u],_=d[f];_.start<=p.start+p.count+1?p.count=Math.max(p.count,_.start+_.count-p.start):(++u,d[u]=_)}d.length=u+1;for(let f=0,p=d.length;f<p;f++){const _=d[f];s.bufferSubData(l,_.start*h.BYTES_PER_ELEMENT,h,_.start,_.count)}c.clearUpdateRanges()}c.onUploadCallback()}function i(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);const c=t.get(a);c&&(s.deleteBuffer(c.buffer),t.delete(a))}function o(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){const h=t.get(a);(!h||h.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}const l=t.get(a);if(l===void 0)t.set(a,e(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,a,c),l.version=a.version}}return{get:i,remove:r,update:o}}class Ds extends Me{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};const r=t/2,o=e/2,a=Math.floor(n),c=Math.floor(i),l=a+1,h=c+1,d=t/a,u=e/c,f=[],p=[],_=[],m=[];for(let g=0;g<h;g++){const x=g*u-o;for(let v=0;v<l;v++){const M=v*d-r;p.push(M,-x,0),_.push(0,0,1),m.push(v/a),m.push(1-g/c)}}for(let g=0;g<c;g++)for(let x=0;x<a;x++){const v=x+l*g,M=x+l*(g+1),C=x+1+l*(g+1),R=x+1+l*g;f.push(v,M,R),f.push(M,C,R)}this.setIndex(f),this.setAttribute("position",new Yt(p,3)),this.setAttribute("normal",new Yt(_,3)),this.setAttribute("uv",new Yt(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ds(t.width,t.height,t.widthSegments,t.heightSegments)}}var Vp=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Wp=`#ifdef USE_ALPHAHASH
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
#endif`,Xp=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,jp=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,$p=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Yp=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,qp=`#ifdef USE_AOMAP
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
#endif`,Kp=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Zp=`#ifdef USE_BATCHING
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
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,Jp=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Qp=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,tm=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,em=`float G_BlinnPhong_Implicit( ) {
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
} // validated`,nm=`#ifdef USE_IRIDESCENCE
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
#endif`,im=`#ifdef USE_BUMPMAP
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
#endif`,sm=`#if NUM_CLIPPING_PLANES > 0
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
#endif`,rm=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,om=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,am=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,cm=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,lm=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,hm=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,um=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,dm=`#define PI 3.141592653589793
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
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
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
} // validated`,fm=`#ifdef ENVMAP_TYPE_CUBE_UV
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
#endif`,pm=`vec3 transformedNormal = objectNormal;
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
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,mm=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,gm=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,_m=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,vm=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,ym="gl_FragColor = linearToOutputTexel( gl_FragColor );",xm=`
const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(
	vec3( 0.8224621, 0.177538, 0.0 ),
	vec3( 0.0331941, 0.9668058, 0.0 ),
	vec3( 0.0170827, 0.0723974, 0.9105199 )
);
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(
	vec3( 1.2249401, - 0.2249404, 0.0 ),
	vec3( - 0.0420569, 1.0420571, 0.0 ),
	vec3( - 0.0196376, - 0.0786361, 1.0982735 )
);
vec4 LinearSRGBToLinearDisplayP3( in vec4 value ) {
	return vec4( value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a );
}
vec4 LinearDisplayP3ToLinearSRGB( in vec4 value ) {
	return vec4( value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a );
}
vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Mm=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,bm=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Sm=`#ifdef USE_ENVMAP
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
#endif`,wm=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Em=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Tm=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Am=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Rm=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Cm=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Pm=`#ifdef USE_GRADIENTMAP
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
}`,Lm=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Im=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Dm=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Nm=`uniform bool receiveShadow;
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
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
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
#endif`,Um=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
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
	#endif
#endif`,km=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Om=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Fm=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,zm=`varying vec3 vViewPosition;
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
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Bm=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
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
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
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
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
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
#endif`,Hm=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
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
		vec3 iridescenceF0;
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
		float v = 0.5 / ( gv + gl );
		return saturate(v);
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
	vec3 f0 = material.specularColor;
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
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
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
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
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
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
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
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Gm=`
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
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
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
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
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
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Vm=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Wm=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Xm=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,jm=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,$m=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Ym=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,qm=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
	
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Km=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Zm=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
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
#endif`,Jm=`#if defined( USE_POINTS_UV )
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
#endif`,Qm=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,tg=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,eg=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,ng=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,ig=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,sg=`#ifdef USE_MORPHTARGETS
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
#endif`,rg=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,og=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
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
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
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
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,ag=`#ifdef USE_NORMALMAP_OBJECTSPACE
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
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,cg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,lg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,hg=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,ug=`#ifdef USE_NORMALMAP
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
#endif`,dg=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,fg=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,pg=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,mg=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,gg=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,_g=`vec3 packNormalToRGB( const in vec3 normal ) {
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
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,vg=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,yg=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,xg=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Mg=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,bg=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Sg=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,wg=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
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
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
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
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
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
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,Eg=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
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
#endif`,Tg=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
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
#endif`,Ag=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
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
	#if NUM_POINT_LIGHT_SHADOWS > 0
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
}`,Rg=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Cg=`#ifdef USE_SKINNING
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
#endif`,Pg=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Lg=`#ifdef USE_SKINNING
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
#endif`,Ig=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Dg=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Ng=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Ug=`#ifndef saturate
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
vec3 CustomToneMapping( vec3 color ) { return color; }`,kg=`#ifdef USE_TRANSMISSION
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
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,Og=`#ifdef USE_TRANSMISSION
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
#endif`,Fg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,zg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Bg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
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
#endif`,Hg=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const Gg=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Vg=`uniform sampler2D t2D;
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
}`,Wg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Xg=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,jg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,$g=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Yg=`#include <common>
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
}`,qg=`#if DEPTH_PACKING == 3200
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
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,Kg=`#define DISTANCE
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
}`,Zg=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,Jg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,Qg=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,t0=`uniform float scale;
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
}`,e0=`uniform vec3 diffuse;
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
}`,n0=`#include <common>
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
}`,i0=`uniform vec3 diffuse;
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
}`,s0=`#define LAMBERT
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
}`,r0=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
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
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
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
}`,o0=`#define MATCAP
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
}`,a0=`#define MATCAP
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
}`,c0=`#define NORMAL
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
}`,l0=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
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
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,h0=`#define PHONG
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
}`,u0=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
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
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
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
}`,d0=`#define STANDARD
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
}`,f0=`#define STANDARD
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
#include <packing>
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
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
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
}`,p0=`#define TOON
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
}`,m0=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
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
}`,g0=`uniform float size;
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
}`,_0=`uniform vec3 diffuse;
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
}`,v0=`#include <common>
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
}`,y0=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
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
}`,x0=`uniform float rotation;
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
}`,M0=`uniform vec3 diffuse;
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
}`,Ot={alphahash_fragment:Vp,alphahash_pars_fragment:Wp,alphamap_fragment:Xp,alphamap_pars_fragment:jp,alphatest_fragment:$p,alphatest_pars_fragment:Yp,aomap_fragment:qp,aomap_pars_fragment:Kp,batching_pars_vertex:Zp,batching_vertex:Jp,begin_vertex:Qp,beginnormal_vertex:tm,bsdfs:em,iridescence_fragment:nm,bumpmap_pars_fragment:im,clipping_planes_fragment:sm,clipping_planes_pars_fragment:rm,clipping_planes_pars_vertex:om,clipping_planes_vertex:am,color_fragment:cm,color_pars_fragment:lm,color_pars_vertex:hm,color_vertex:um,common:dm,cube_uv_reflection_fragment:fm,defaultnormal_vertex:pm,displacementmap_pars_vertex:mm,displacementmap_vertex:gm,emissivemap_fragment:_m,emissivemap_pars_fragment:vm,colorspace_fragment:ym,colorspace_pars_fragment:xm,envmap_fragment:Mm,envmap_common_pars_fragment:bm,envmap_pars_fragment:Sm,envmap_pars_vertex:wm,envmap_physical_pars_fragment:Um,envmap_vertex:Em,fog_vertex:Tm,fog_pars_vertex:Am,fog_fragment:Rm,fog_pars_fragment:Cm,gradientmap_pars_fragment:Pm,lightmap_pars_fragment:Lm,lights_lambert_fragment:Im,lights_lambert_pars_fragment:Dm,lights_pars_begin:Nm,lights_toon_fragment:km,lights_toon_pars_fragment:Om,lights_phong_fragment:Fm,lights_phong_pars_fragment:zm,lights_physical_fragment:Bm,lights_physical_pars_fragment:Hm,lights_fragment_begin:Gm,lights_fragment_maps:Vm,lights_fragment_end:Wm,logdepthbuf_fragment:Xm,logdepthbuf_pars_fragment:jm,logdepthbuf_pars_vertex:$m,logdepthbuf_vertex:Ym,map_fragment:qm,map_pars_fragment:Km,map_particle_fragment:Zm,map_particle_pars_fragment:Jm,metalnessmap_fragment:Qm,metalnessmap_pars_fragment:tg,morphinstance_vertex:eg,morphcolor_vertex:ng,morphnormal_vertex:ig,morphtarget_pars_vertex:sg,morphtarget_vertex:rg,normal_fragment_begin:og,normal_fragment_maps:ag,normal_pars_fragment:cg,normal_pars_vertex:lg,normal_vertex:hg,normalmap_pars_fragment:ug,clearcoat_normal_fragment_begin:dg,clearcoat_normal_fragment_maps:fg,clearcoat_pars_fragment:pg,iridescence_pars_fragment:mg,opaque_fragment:gg,packing:_g,premultiplied_alpha_fragment:vg,project_vertex:yg,dithering_fragment:xg,dithering_pars_fragment:Mg,roughnessmap_fragment:bg,roughnessmap_pars_fragment:Sg,shadowmap_pars_fragment:wg,shadowmap_pars_vertex:Eg,shadowmap_vertex:Tg,shadowmask_pars_fragment:Ag,skinbase_vertex:Rg,skinning_pars_vertex:Cg,skinning_vertex:Pg,skinnormal_vertex:Lg,specularmap_fragment:Ig,specularmap_pars_fragment:Dg,tonemapping_fragment:Ng,tonemapping_pars_fragment:Ug,transmission_fragment:kg,transmission_pars_fragment:Og,uv_pars_fragment:Fg,uv_pars_vertex:zg,uv_vertex:Bg,worldpos_vertex:Hg,background_vert:Gg,background_frag:Vg,backgroundCube_vert:Wg,backgroundCube_frag:Xg,cube_vert:jg,cube_frag:$g,depth_vert:Yg,depth_frag:qg,distanceRGBA_vert:Kg,distanceRGBA_frag:Zg,equirect_vert:Jg,equirect_frag:Qg,linedashed_vert:t0,linedashed_frag:e0,meshbasic_vert:n0,meshbasic_frag:i0,meshlambert_vert:s0,meshlambert_frag:r0,meshmatcap_vert:o0,meshmatcap_frag:a0,meshnormal_vert:c0,meshnormal_frag:l0,meshphong_vert:h0,meshphong_frag:u0,meshphysical_vert:d0,meshphysical_frag:f0,meshtoon_vert:p0,meshtoon_frag:m0,points_vert:g0,points_frag:_0,shadow_vert:v0,shadow_frag:y0,sprite_vert:x0,sprite_frag:M0},rt={common:{diffuse:{value:new Tt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new zt},alphaMap:{value:null},alphaMapTransform:{value:new zt},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new zt}},envmap:{envMap:{value:null},envMapRotation:{value:new zt},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new zt}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new zt}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new zt},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new zt},normalScale:{value:new it(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new zt},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new zt}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new zt}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new zt}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Tt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Tt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new zt},alphaTest:{value:0},uvTransform:{value:new zt}},sprite:{diffuse:{value:new Tt(16777215)},opacity:{value:1},center:{value:new it(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new zt},alphaMap:{value:null},alphaMapTransform:{value:new zt},alphaTest:{value:0}}},Rn={basic:{uniforms:Xe([rt.common,rt.specularmap,rt.envmap,rt.aomap,rt.lightmap,rt.fog]),vertexShader:Ot.meshbasic_vert,fragmentShader:Ot.meshbasic_frag},lambert:{uniforms:Xe([rt.common,rt.specularmap,rt.envmap,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.fog,rt.lights,{emissive:{value:new Tt(0)}}]),vertexShader:Ot.meshlambert_vert,fragmentShader:Ot.meshlambert_frag},phong:{uniforms:Xe([rt.common,rt.specularmap,rt.envmap,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.fog,rt.lights,{emissive:{value:new Tt(0)},specular:{value:new Tt(1118481)},shininess:{value:30}}]),vertexShader:Ot.meshphong_vert,fragmentShader:Ot.meshphong_frag},standard:{uniforms:Xe([rt.common,rt.envmap,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.roughnessmap,rt.metalnessmap,rt.fog,rt.lights,{emissive:{value:new Tt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ot.meshphysical_vert,fragmentShader:Ot.meshphysical_frag},toon:{uniforms:Xe([rt.common,rt.aomap,rt.lightmap,rt.emissivemap,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.gradientmap,rt.fog,rt.lights,{emissive:{value:new Tt(0)}}]),vertexShader:Ot.meshtoon_vert,fragmentShader:Ot.meshtoon_frag},matcap:{uniforms:Xe([rt.common,rt.bumpmap,rt.normalmap,rt.displacementmap,rt.fog,{matcap:{value:null}}]),vertexShader:Ot.meshmatcap_vert,fragmentShader:Ot.meshmatcap_frag},points:{uniforms:Xe([rt.points,rt.fog]),vertexShader:Ot.points_vert,fragmentShader:Ot.points_frag},dashed:{uniforms:Xe([rt.common,rt.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ot.linedashed_vert,fragmentShader:Ot.linedashed_frag},depth:{uniforms:Xe([rt.common,rt.displacementmap]),vertexShader:Ot.depth_vert,fragmentShader:Ot.depth_frag},normal:{uniforms:Xe([rt.common,rt.bumpmap,rt.normalmap,rt.displacementmap,{opacity:{value:1}}]),vertexShader:Ot.meshnormal_vert,fragmentShader:Ot.meshnormal_frag},sprite:{uniforms:Xe([rt.sprite,rt.fog]),vertexShader:Ot.sprite_vert,fragmentShader:Ot.sprite_frag},background:{uniforms:{uvTransform:{value:new zt},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ot.background_vert,fragmentShader:Ot.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new zt}},vertexShader:Ot.backgroundCube_vert,fragmentShader:Ot.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ot.cube_vert,fragmentShader:Ot.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ot.equirect_vert,fragmentShader:Ot.equirect_frag},distanceRGBA:{uniforms:Xe([rt.common,rt.displacementmap,{referencePosition:{value:new E},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ot.distanceRGBA_vert,fragmentShader:Ot.distanceRGBA_frag},shadow:{uniforms:Xe([rt.lights,rt.fog,{color:{value:new Tt(0)},opacity:{value:1}}]),vertexShader:Ot.shadow_vert,fragmentShader:Ot.shadow_frag}};Rn.physical={uniforms:Xe([Rn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new zt},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new zt},clearcoatNormalScale:{value:new it(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new zt},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new zt},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new zt},sheen:{value:0},sheenColor:{value:new Tt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new zt},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new zt},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new zt},transmissionSamplerSize:{value:new it},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new zt},attenuationDistance:{value:0},attenuationColor:{value:new Tt(0)},specularColor:{value:new Tt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new zt},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new zt},anisotropyVector:{value:new it},anisotropyMap:{value:null},anisotropyMapTransform:{value:new zt}}]),vertexShader:Ot.meshphysical_vert,fragmentShader:Ot.meshphysical_frag};const Gr={r:0,b:0,g:0},bi=new En,b0=new Dt;function S0(s,t,e,n,i,r,o){const a=new Tt(0);let c=r===!0?0:1,l,h,d=null,u=0,f=null;function p(x){let v=x.isScene===!0?x.background:null;return v&&v.isTexture&&(v=(x.backgroundBlurriness>0?e:t).get(v)),v}function _(x){let v=!1;const M=p(x);M===null?g(a,c):M&&M.isColor&&(g(M,1),v=!0);const C=s.xr.getEnvironmentBlendMode();C==="additive"?n.buffers.color.setClear(0,0,0,1,o):C==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(s.autoClear||v)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function m(x,v){const M=p(v);M&&(M.isCubeTexture||M.mapping===ko)?(h===void 0&&(h=new nt(new Ft(1,1,1),new Kn({name:"BackgroundCubeMaterial",uniforms:Es(Rn.backgroundCube.uniforms),vertexShader:Rn.backgroundCube.vertexShader,fragmentShader:Rn.backgroundCube.fragmentShader,side:Ke,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(C,R,T){this.matrixWorld.copyPosition(T.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(h)),bi.copy(v.backgroundRotation),bi.x*=-1,bi.y*=-1,bi.z*=-1,M.isCubeTexture&&M.isRenderTargetTexture===!1&&(bi.y*=-1,bi.z*=-1),h.material.uniforms.envMap.value=M,h.material.uniforms.flipEnvMap.value=M.isCubeTexture&&M.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=v.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,h.material.uniforms.backgroundRotation.value.setFromMatrix4(b0.makeRotationFromEuler(bi)),h.material.toneMapped=Zt.getTransfer(M.colorSpace)!==me,(d!==M||u!==M.version||f!==s.toneMapping)&&(h.material.needsUpdate=!0,d=M,u=M.version,f=s.toneMapping),h.layers.enableAll(),x.unshift(h,h.geometry,h.material,0,0,null)):M&&M.isTexture&&(l===void 0&&(l=new nt(new Ds(2,2),new Kn({name:"BackgroundMaterial",uniforms:Es(Rn.background.uniforms),vertexShader:Rn.background.vertexShader,fragmentShader:Rn.background.fragmentShader,side:Yn,depthTest:!1,depthWrite:!1,fog:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=M,l.material.uniforms.backgroundIntensity.value=v.backgroundIntensity,l.material.toneMapped=Zt.getTransfer(M.colorSpace)!==me,M.matrixAutoUpdate===!0&&M.updateMatrix(),l.material.uniforms.uvTransform.value.copy(M.matrix),(d!==M||u!==M.version||f!==s.toneMapping)&&(l.material.needsUpdate=!0,d=M,u=M.version,f=s.toneMapping),l.layers.enableAll(),x.unshift(l,l.geometry,l.material,0,0,null))}function g(x,v){x.getRGB(Gr,od(s)),n.buffers.color.setClear(Gr.r,Gr.g,Gr.b,v,o)}return{getClearColor:function(){return a},setClearColor:function(x,v=1){a.set(x),c=v,g(a,c)},getClearAlpha:function(){return c},setClearAlpha:function(x){c=x,g(a,c)},render:_,addToRenderList:m}}function w0(s,t){const e=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=u(null);let r=i,o=!1;function a(y,w,F,B,W){let j=!1;const H=d(B,F,w);r!==H&&(r=H,l(r.object)),j=f(y,B,F,W),j&&p(y,B,F,W),W!==null&&t.update(W,s.ELEMENT_ARRAY_BUFFER),(j||o)&&(o=!1,M(y,w,F,B),W!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,t.get(W).buffer))}function c(){return s.createVertexArray()}function l(y){return s.bindVertexArray(y)}function h(y){return s.deleteVertexArray(y)}function d(y,w,F){const B=F.wireframe===!0;let W=n[y.id];W===void 0&&(W={},n[y.id]=W);let j=W[w.id];j===void 0&&(j={},W[w.id]=j);let H=j[B];return H===void 0&&(H=u(c()),j[B]=H),H}function u(y){const w=[],F=[],B=[];for(let W=0;W<e;W++)w[W]=0,F[W]=0,B[W]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:w,enabledAttributes:F,attributeDivisors:B,object:y,attributes:{},index:null}}function f(y,w,F,B){const W=r.attributes,j=w.attributes;let H=0;const K=F.getAttributes();for(const G in K)if(K[G].location>=0){const at=W[G];let mt=j[G];if(mt===void 0&&(G==="instanceMatrix"&&y.instanceMatrix&&(mt=y.instanceMatrix),G==="instanceColor"&&y.instanceColor&&(mt=y.instanceColor)),at===void 0||at.attribute!==mt||mt&&at.data!==mt.data)return!0;H++}return r.attributesNum!==H||r.index!==B}function p(y,w,F,B){const W={},j=w.attributes;let H=0;const K=F.getAttributes();for(const G in K)if(K[G].location>=0){let at=j[G];at===void 0&&(G==="instanceMatrix"&&y.instanceMatrix&&(at=y.instanceMatrix),G==="instanceColor"&&y.instanceColor&&(at=y.instanceColor));const mt={};mt.attribute=at,at&&at.data&&(mt.data=at.data),W[G]=mt,H++}r.attributes=W,r.attributesNum=H,r.index=B}function _(){const y=r.newAttributes;for(let w=0,F=y.length;w<F;w++)y[w]=0}function m(y){g(y,0)}function g(y,w){const F=r.newAttributes,B=r.enabledAttributes,W=r.attributeDivisors;F[y]=1,B[y]===0&&(s.enableVertexAttribArray(y),B[y]=1),W[y]!==w&&(s.vertexAttribDivisor(y,w),W[y]=w)}function x(){const y=r.newAttributes,w=r.enabledAttributes;for(let F=0,B=w.length;F<B;F++)w[F]!==y[F]&&(s.disableVertexAttribArray(F),w[F]=0)}function v(y,w,F,B,W,j,H){H===!0?s.vertexAttribIPointer(y,w,F,W,j):s.vertexAttribPointer(y,w,F,B,W,j)}function M(y,w,F,B){_();const W=B.attributes,j=F.getAttributes(),H=w.defaultAttributeValues;for(const K in j){const G=j[K];if(G.location>=0){let st=W[K];if(st===void 0&&(K==="instanceMatrix"&&y.instanceMatrix&&(st=y.instanceMatrix),K==="instanceColor"&&y.instanceColor&&(st=y.instanceColor)),st!==void 0){const at=st.normalized,mt=st.itemSize,Ht=t.get(st);if(Ht===void 0)continue;const Jt=Ht.buffer,$=Ht.type,Q=Ht.bytesPerElement,xt=$===s.INT||$===s.UNSIGNED_INT||st.gpuType===qc;if(st.isInterleavedBufferAttribute){const ft=st.data,Ut=ft.stride,Rt=st.offset;if(ft.isInstancedInterleavedBuffer){for(let Wt=0;Wt<G.locationSize;Wt++)g(G.location+Wt,ft.meshPerAttribute);y.isInstancedMesh!==!0&&B._maxInstanceCount===void 0&&(B._maxInstanceCount=ft.meshPerAttribute*ft.count)}else for(let Wt=0;Wt<G.locationSize;Wt++)m(G.location+Wt);s.bindBuffer(s.ARRAY_BUFFER,Jt);for(let Wt=0;Wt<G.locationSize;Wt++)v(G.location+Wt,mt/G.locationSize,$,at,Ut*Q,(Rt+mt/G.locationSize*Wt)*Q,xt)}else{if(st.isInstancedBufferAttribute){for(let ft=0;ft<G.locationSize;ft++)g(G.location+ft,st.meshPerAttribute);y.isInstancedMesh!==!0&&B._maxInstanceCount===void 0&&(B._maxInstanceCount=st.meshPerAttribute*st.count)}else for(let ft=0;ft<G.locationSize;ft++)m(G.location+ft);s.bindBuffer(s.ARRAY_BUFFER,Jt);for(let ft=0;ft<G.locationSize;ft++)v(G.location+ft,mt/G.locationSize,$,at,mt*Q,mt/G.locationSize*ft*Q,xt)}}else if(H!==void 0){const at=H[K];if(at!==void 0)switch(at.length){case 2:s.vertexAttrib2fv(G.location,at);break;case 3:s.vertexAttrib3fv(G.location,at);break;case 4:s.vertexAttrib4fv(G.location,at);break;default:s.vertexAttrib1fv(G.location,at)}}}}x()}function C(){L();for(const y in n){const w=n[y];for(const F in w){const B=w[F];for(const W in B)h(B[W].object),delete B[W];delete w[F]}delete n[y]}}function R(y){if(n[y.id]===void 0)return;const w=n[y.id];for(const F in w){const B=w[F];for(const W in B)h(B[W].object),delete B[W];delete w[F]}delete n[y.id]}function T(y){for(const w in n){const F=n[w];if(F[y.id]===void 0)continue;const B=F[y.id];for(const W in B)h(B[W].object),delete B[W];delete F[y.id]}}function L(){V(),o=!0,r!==i&&(r=i,l(r.object))}function V(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:a,reset:L,resetDefaultState:V,dispose:C,releaseStatesOfGeometry:R,releaseStatesOfProgram:T,initAttributes:_,enableAttribute:m,disableUnusedAttributes:x}}function E0(s,t,e){let n;function i(l){n=l}function r(l,h){s.drawArrays(n,l,h),e.update(h,n,1)}function o(l,h,d){d!==0&&(s.drawArraysInstanced(n,l,h,d),e.update(h,n,d))}function a(l,h,d){if(d===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,h,0,d);let f=0;for(let p=0;p<d;p++)f+=h[p];e.update(f,n,1)}function c(l,h,d,u){if(d===0)return;const f=t.get("WEBGL_multi_draw");if(f===null)for(let p=0;p<l.length;p++)o(l[p],h[p],u[p]);else{f.multiDrawArraysInstancedWEBGL(n,l,0,h,0,u,0,d);let p=0;for(let _=0;_<d;_++)p+=h[_];for(let _=0;_<u.length;_++)e.update(p,n,u[_])}}this.setMode=i,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=c}function T0(s,t,e,n){let i;function r(){if(i!==void 0)return i;if(t.has("EXT_texture_filter_anisotropic")===!0){const T=t.get("EXT_texture_filter_anisotropic");i=s.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(T){return!(T!==pn&&n.convert(T)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(T){const L=T===xr&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(T!==qn&&n.convert(T)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&T!==bn&&!L)}function c(T){if(T==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=e.precision!==void 0?e.precision:"highp";const h=c(l);h!==l&&(console.warn("THREE.WebGLRenderer:",l,"not supported, using",h,"instead."),l=h);const d=e.logarithmicDepthBuffer===!0,u=e.reverseDepthBuffer===!0&&t.has("EXT_clip_control");if(u===!0){const T=t.get("EXT_clip_control");T.clipControlEXT(T.LOWER_LEFT_EXT,T.ZERO_TO_ONE_EXT)}const f=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),p=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=s.getParameter(s.MAX_TEXTURE_SIZE),m=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),g=s.getParameter(s.MAX_VERTEX_ATTRIBS),x=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),v=s.getParameter(s.MAX_VARYING_VECTORS),M=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),C=p>0,R=s.getParameter(s.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:d,reverseDepthBuffer:u,maxTextures:f,maxVertexTextures:p,maxTextureSize:_,maxCubemapSize:m,maxAttributes:g,maxVertexUniforms:x,maxVaryings:v,maxFragmentUniforms:M,vertexTextures:C,maxSamples:R}}function A0(s){const t=this;let e=null,n=0,i=!1,r=!1;const o=new ai,a=new zt,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){const f=d.length!==0||u||n!==0||i;return i=u,n=d.length,f},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(d,u){e=h(d,u,0)},this.setState=function(d,u,f){const p=d.clippingPlanes,_=d.clipIntersection,m=d.clipShadows,g=s.get(d);if(!i||p===null||p.length===0||r&&!m)r?h(null):l();else{const x=r?0:n,v=x*4;let M=g.clippingState||null;c.value=M,M=h(p,u,v,f);for(let C=0;C!==v;++C)M[C]=e[C];g.clippingState=M,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=x}};function l(){c.value!==e&&(c.value=e,c.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function h(d,u,f,p){const _=d!==null?d.length:0;let m=null;if(_!==0){if(m=c.value,p!==!0||m===null){const g=f+_*4,x=u.matrixWorldInverse;a.getNormalMatrix(x),(m===null||m.length<g)&&(m=new Float32Array(g));for(let v=0,M=f;v!==_;++v,M+=4)o.copy(d[v]).applyMatrix4(x,a),o.normal.toArray(m,M),m[M+3]=o.constant}c.value=m,c.needsUpdate=!0}return t.numPlanes=_,t.numIntersection=0,m}}function R0(s){let t=new WeakMap;function e(o,a){return a===nc?o.mapping=xs:a===ic&&(o.mapping=Ms),o}function n(o){if(o&&o.isTexture){const a=o.mapping;if(a===nc||a===ic)if(t.has(o)){const c=t.get(o).texture;return e(c,o.mapping)}else{const c=o.image;if(c&&c.height>0){const l=new zp(c.height);return l.fromEquirectangularTexture(s,o),t.set(o,l),o.addEventListener("dispose",i),e(l.texture,o.mapping)}else return null}}return o}function i(o){const a=o.target;a.removeEventListener("dispose",i);const c=t.get(a);c!==void 0&&(t.delete(a),c.dispose())}function r(){t=new WeakMap}return{get:n,dispose:r}}class ol extends ad{constructor(t=-1,e=1,n=1,i=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2;let r=n-t,o=n+t,a=i+e,c=i-e;if(this.view!==null&&this.view.enabled){const l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,o=r+l*this.view.width,a-=h*this.view.offsetY,c=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,c,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}}const os=4,rh=[.125,.215,.35,.446,.526,.582],Pi=20,_a=new ol,oh=new Tt;let va=null,ya=0,xa=0,Ma=!1;const Ai=(1+Math.sqrt(5))/2,es=1/Ai,ah=[new E(-Ai,es,0),new E(Ai,es,0),new E(-es,0,Ai),new E(es,0,Ai),new E(0,Ai,-es),new E(0,Ai,es),new E(-1,1,-1),new E(1,1,-1),new E(-1,1,1),new E(1,1,1)];class ch{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,e=0,n=.1,i=100){va=this._renderer.getRenderTarget(),ya=this._renderer.getActiveCubeFace(),xa=this._renderer.getActiveMipmapLevel(),Ma=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);const r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(t,n,i,r),e>0&&this._blur(r,0,0,e),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=uh(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=hh(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(va,ya,xa),this._renderer.xr.enabled=Ma,t.scissorTest=!1,Vr(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===xs||t.mapping===Ms?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),va=this._renderer.getRenderTarget(),ya=this._renderer.getActiveCubeFace(),xa=this._renderer.getActiveMipmapLevel(),Ma=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:cn,minFilter:cn,generateMipmaps:!1,type:xr,format:pn,colorSpace:Fe,depthBuffer:!1},i=lh(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=lh(t,e,n);const{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=C0(r)),this._blurMaterial=P0(r,t,e)}return i}_compileMaterial(t){const e=new nt(this._lodPlanes[0],t);this._renderer.compile(e,_a)}_sceneToCubeUV(t,e,n,i){const a=new Oe(90,1,e,n),c=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],h=this._renderer,d=h.autoClear,u=h.toneMapping;h.getClearColor(oh),h.toneMapping=pi,h.autoClear=!1;const f=new Ve({name:"PMREM.Background",side:Ke,depthWrite:!1,depthTest:!1}),p=new nt(new Ft,f);let _=!1;const m=t.background;m?m.isColor&&(f.color.copy(m),t.background=null,_=!0):(f.color.copy(oh),_=!0);for(let g=0;g<6;g++){const x=g%3;x===0?(a.up.set(0,c[g],0),a.lookAt(l[g],0,0)):x===1?(a.up.set(0,0,c[g]),a.lookAt(0,l[g],0)):(a.up.set(0,c[g],0),a.lookAt(0,0,l[g]));const v=this._cubeSize;Vr(i,x*v,g>2?v:0,v,v),h.setRenderTarget(i),_&&h.render(p,a),h.render(t,a)}p.geometry.dispose(),p.material.dispose(),h.toneMapping=u,h.autoClear=d,t.background=m}_textureToCubeUV(t,e){const n=this._renderer,i=t.mapping===xs||t.mapping===Ms;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=uh()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=hh());const r=i?this._cubemapMaterial:this._equirectMaterial,o=new nt(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=t;const c=this._cubeSize;Vr(e,0,0,3*c,2*c),n.setRenderTarget(e),n.render(o,_a)}_applyPMREM(t){const e=this._renderer,n=e.autoClear;e.autoClear=!1;const i=this._lodPlanes.length;for(let r=1;r<i;r++){const o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=ah[(i-r-1)%ah.length];this._blur(t,r-1,r,o,a)}e.autoClear=n}_blur(t,e,n,i,r){const o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,i,"latitudinal",r),this._halfBlur(o,t,n,n,i,"longitudinal",r)}_halfBlur(t,e,n,i,r,o,a){const c=this._renderer,l=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const h=3,d=new nt(this._lodPlanes[i],l),u=l.uniforms,f=this._sizeLods[n]-1,p=isFinite(r)?Math.PI/(2*f):2*Math.PI/(2*Pi-1),_=r/p,m=isFinite(r)?1+Math.floor(h*_):Pi;m>Pi&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Pi}`);const g=[];let x=0;for(let T=0;T<Pi;++T){const L=T/_,V=Math.exp(-L*L/2);g.push(V),T===0?x+=V:T<m&&(x+=2*V)}for(let T=0;T<g.length;T++)g[T]=g[T]/x;u.envMap.value=t.texture,u.samples.value=m,u.weights.value=g,u.latitudinal.value=o==="latitudinal",a&&(u.poleAxis.value=a);const{_lodMax:v}=this;u.dTheta.value=p,u.mipInt.value=v-n;const M=this._sizeLods[i],C=3*M*(i>v-os?i-v+os:0),R=4*(this._cubeSize-M);Vr(e,C,R,3*M,2*M),c.setRenderTarget(e),c.render(d,_a)}}function C0(s){const t=[],e=[],n=[];let i=s;const r=s-os+1+rh.length;for(let o=0;o<r;o++){const a=Math.pow(2,i);e.push(a);let c=1/a;o>s-os?c=rh[o-s+os-1]:o===0&&(c=0),n.push(c);const l=1/(a-2),h=-l,d=1+l,u=[h,h,d,h,d,d,h,h,d,d,h,d],f=6,p=6,_=3,m=2,g=1,x=new Float32Array(_*p*f),v=new Float32Array(m*p*f),M=new Float32Array(g*p*f);for(let R=0;R<f;R++){const T=R%3*2/3-1,L=R>2?0:-1,V=[T,L,0,T+2/3,L,0,T+2/3,L+1,0,T,L,0,T+2/3,L+1,0,T,L+1,0];x.set(V,_*p*R),v.set(u,m*p*R);const y=[R,R,R,R,R,R];M.set(y,g*p*R)}const C=new Me;C.setAttribute("position",new Ze(x,_)),C.setAttribute("uv",new Ze(v,m)),C.setAttribute("faceIndex",new Ze(M,g)),t.push(C),i>os&&i--}return{lodPlanes:t,sizeLods:e,sigmas:n}}function lh(s,t,e){const n=new Oi(s,t,e);return n.texture.mapping=ko,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Vr(s,t,e,n,i){s.viewport.set(t,e,n,i),s.scissor.set(t,e,n,i)}function P0(s,t,e){const n=new Float32Array(Pi),i=new E(0,1,0);return new Kn({name:"SphericalGaussianBlur",defines:{n:Pi,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:al(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:fi,depthTest:!1,depthWrite:!1})}function hh(){return new Kn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:al(),fragmentShader:`

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
		`,blending:fi,depthTest:!1,depthWrite:!1})}function uh(){return new Kn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:al(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:fi,depthTest:!1,depthWrite:!1})}function al(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function L0(s){let t=new WeakMap,e=null;function n(a){if(a&&a.isTexture){const c=a.mapping,l=c===nc||c===ic,h=c===xs||c===Ms;if(l||h){let d=t.get(a);const u=d!==void 0?d.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==u)return e===null&&(e=new ch(s)),d=l?e.fromEquirectangular(a,d):e.fromCubemap(a,d),d.texture.pmremVersion=a.pmremVersion,t.set(a,d),d.texture;if(d!==void 0)return d.texture;{const f=a.image;return l&&f&&f.height>0||h&&f&&i(f)?(e===null&&(e=new ch(s)),d=l?e.fromEquirectangular(a):e.fromCubemap(a),d.texture.pmremVersion=a.pmremVersion,t.set(a,d),a.addEventListener("dispose",r),d.texture):null}}}return a}function i(a){let c=0;const l=6;for(let h=0;h<l;h++)a[h]!==void 0&&c++;return c===l}function r(a){const c=a.target;c.removeEventListener("dispose",r);const l=t.get(c);l!==void 0&&(t.delete(c),l.dispose())}function o(){t=new WeakMap,e!==null&&(e.dispose(),e=null)}return{get:n,dispose:o}}function I0(s){const t={};function e(n){if(t[n]!==void 0)return t[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){const i=e(n);return i===null&&_o("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function D0(s,t,e,n){const i={},r=new WeakMap;function o(d){const u=d.target;u.index!==null&&t.remove(u.index);for(const p in u.attributes)t.remove(u.attributes[p]);for(const p in u.morphAttributes){const _=u.morphAttributes[p];for(let m=0,g=_.length;m<g;m++)t.remove(_[m])}u.removeEventListener("dispose",o),delete i[u.id];const f=r.get(u);f&&(t.remove(f),r.delete(u)),n.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,e.memory.geometries--}function a(d,u){return i[u.id]===!0||(u.addEventListener("dispose",o),i[u.id]=!0,e.memory.geometries++),u}function c(d){const u=d.attributes;for(const p in u)t.update(u[p],s.ARRAY_BUFFER);const f=d.morphAttributes;for(const p in f){const _=f[p];for(let m=0,g=_.length;m<g;m++)t.update(_[m],s.ARRAY_BUFFER)}}function l(d){const u=[],f=d.index,p=d.attributes.position;let _=0;if(f!==null){const x=f.array;_=f.version;for(let v=0,M=x.length;v<M;v+=3){const C=x[v+0],R=x[v+1],T=x[v+2];u.push(C,R,R,T,T,C)}}else if(p!==void 0){const x=p.array;_=p.version;for(let v=0,M=x.length/3-1;v<M;v+=3){const C=v+0,R=v+1,T=v+2;u.push(C,R,R,T,T,C)}}else return;const m=new(td(u)?rd:sd)(u,1);m.version=_;const g=r.get(d);g&&t.remove(g),r.set(d,m)}function h(d){const u=r.get(d);if(u){const f=d.index;f!==null&&u.version<f.version&&l(d)}else l(d);return r.get(d)}return{get:a,update:c,getWireframeAttribute:h}}function N0(s,t,e){let n;function i(u){n=u}let r,o;function a(u){r=u.type,o=u.bytesPerElement}function c(u,f){s.drawElements(n,f,r,u*o),e.update(f,n,1)}function l(u,f,p){p!==0&&(s.drawElementsInstanced(n,f,r,u*o,p),e.update(f,n,p))}function h(u,f,p){if(p===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,f,0,r,u,0,p);let m=0;for(let g=0;g<p;g++)m+=f[g];e.update(m,n,1)}function d(u,f,p,_){if(p===0)return;const m=t.get("WEBGL_multi_draw");if(m===null)for(let g=0;g<u.length;g++)l(u[g]/o,f[g],_[g]);else{m.multiDrawElementsInstancedWEBGL(n,f,0,r,u,0,_,0,p);let g=0;for(let x=0;x<p;x++)g+=f[x];for(let x=0;x<_.length;x++)e.update(g,n,_[x])}}this.setMode=i,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=h,this.renderMultiDrawInstances=d}function U0(s){const t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case s.TRIANGLES:e.triangles+=a*(r/3);break;case s.LINES:e.lines+=a*(r/2);break;case s.LINE_STRIP:e.lines+=a*(r-1);break;case s.LINE_LOOP:e.lines+=a*r;break;case s.POINTS:e.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function k0(s,t,e){const n=new WeakMap,i=new te;function r(o,a,c){const l=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,d=h!==void 0?h.length:0;let u=n.get(a);if(u===void 0||u.count!==d){let y=function(){L.dispose(),n.delete(a),a.removeEventListener("dispose",y)};var f=y;u!==void 0&&u.texture.dispose();const p=a.morphAttributes.position!==void 0,_=a.morphAttributes.normal!==void 0,m=a.morphAttributes.color!==void 0,g=a.morphAttributes.position||[],x=a.morphAttributes.normal||[],v=a.morphAttributes.color||[];let M=0;p===!0&&(M=1),_===!0&&(M=2),m===!0&&(M=3);let C=a.attributes.position.count*M,R=1;C>t.maxTextureSize&&(R=Math.ceil(C/t.maxTextureSize),C=t.maxTextureSize);const T=new Float32Array(C*R*4*d),L=new nd(T,C,R,d);L.type=bn,L.needsUpdate=!0;const V=M*4;for(let w=0;w<d;w++){const F=g[w],B=x[w],W=v[w],j=C*R*4*w;for(let H=0;H<F.count;H++){const K=H*V;p===!0&&(i.fromBufferAttribute(F,H),T[j+K+0]=i.x,T[j+K+1]=i.y,T[j+K+2]=i.z,T[j+K+3]=0),_===!0&&(i.fromBufferAttribute(B,H),T[j+K+4]=i.x,T[j+K+5]=i.y,T[j+K+6]=i.z,T[j+K+7]=0),m===!0&&(i.fromBufferAttribute(W,H),T[j+K+8]=i.x,T[j+K+9]=i.y,T[j+K+10]=i.z,T[j+K+11]=W.itemSize===4?i.w:1)}}u={count:d,texture:L,size:new it(C,R)},n.set(a,u),a.addEventListener("dispose",y)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(s,"morphTexture",o.morphTexture,e);else{let p=0;for(let m=0;m<l.length;m++)p+=l[m];const _=a.morphTargetsRelative?1:1-p;c.getUniforms().setValue(s,"morphTargetBaseInfluence",_),c.getUniforms().setValue(s,"morphTargetInfluences",l)}c.getUniforms().setValue(s,"morphTargetsTexture",u.texture,e),c.getUniforms().setValue(s,"morphTargetsTextureSize",u.size)}return{update:r}}function O0(s,t,e,n){let i=new WeakMap;function r(c){const l=n.render.frame,h=c.geometry,d=t.get(c,h);if(i.get(d)!==l&&(t.update(d),i.set(d,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",a)===!1&&c.addEventListener("dispose",a),i.get(c)!==l&&(e.update(c.instanceMatrix,s.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,s.ARRAY_BUFFER),i.set(c,l))),c.isSkinnedMesh){const u=c.skeleton;i.get(u)!==l&&(u.update(),i.set(u,l))}return d}function o(){i=new WeakMap}function a(c){const l=c.target;l.removeEventListener("dispose",a),e.remove(l.instanceMatrix),l.instanceColor!==null&&e.remove(l.instanceColor)}return{update:r,dispose:o}}class hd extends De{constructor(t,e,n,i,r,o,a,c,l,h=us){if(h!==us&&h!==Ss)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===us&&(n=ki),n===void 0&&h===Ss&&(n=bs),super(null,i,r,o,a,c,h,n,l),this.isDepthTexture=!0,this.image={width:t,height:e},this.magFilter=a!==void 0?a:qe,this.minFilter=c!==void 0?c:qe,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.compareFunction=t.compareFunction,this}toJSON(t){const e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}}const ud=new De,dh=new hd(1,1),dd=new nd,fd=new Sp,pd=new cd,fh=[],ph=[],mh=new Float32Array(16),gh=new Float32Array(9),_h=new Float32Array(4);function Ns(s,t,e){const n=s[0];if(n<=0||n>0)return s;const i=t*e;let r=fh[i];if(r===void 0&&(r=new Float32Array(i),fh[i]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,s[o].toArray(r,a)}return r}function Ce(s,t){if(s.length!==t.length)return!1;for(let e=0,n=s.length;e<n;e++)if(s[e]!==t[e])return!1;return!0}function Pe(s,t){for(let e=0,n=t.length;e<n;e++)s[e]=t[e]}function Fo(s,t){let e=ph[t];e===void 0&&(e=new Int32Array(t),ph[t]=e);for(let n=0;n!==t;++n)e[n]=s.allocateTextureUnit();return e}function F0(s,t){const e=this.cache;e[0]!==t&&(s.uniform1f(this.addr,t),e[0]=t)}function z0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ce(e,t))return;s.uniform2fv(this.addr,t),Pe(e,t)}}function B0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(s.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Ce(e,t))return;s.uniform3fv(this.addr,t),Pe(e,t)}}function H0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ce(e,t))return;s.uniform4fv(this.addr,t),Pe(e,t)}}function G0(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ce(e,t))return;s.uniformMatrix2fv(this.addr,!1,t),Pe(e,t)}else{if(Ce(e,n))return;_h.set(n),s.uniformMatrix2fv(this.addr,!1,_h),Pe(e,n)}}function V0(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ce(e,t))return;s.uniformMatrix3fv(this.addr,!1,t),Pe(e,t)}else{if(Ce(e,n))return;gh.set(n),s.uniformMatrix3fv(this.addr,!1,gh),Pe(e,n)}}function W0(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(Ce(e,t))return;s.uniformMatrix4fv(this.addr,!1,t),Pe(e,t)}else{if(Ce(e,n))return;mh.set(n),s.uniformMatrix4fv(this.addr,!1,mh),Pe(e,n)}}function X0(s,t){const e=this.cache;e[0]!==t&&(s.uniform1i(this.addr,t),e[0]=t)}function j0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ce(e,t))return;s.uniform2iv(this.addr,t),Pe(e,t)}}function $0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Ce(e,t))return;s.uniform3iv(this.addr,t),Pe(e,t)}}function Y0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ce(e,t))return;s.uniform4iv(this.addr,t),Pe(e,t)}}function q0(s,t){const e=this.cache;e[0]!==t&&(s.uniform1ui(this.addr,t),e[0]=t)}function K0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Ce(e,t))return;s.uniform2uiv(this.addr,t),Pe(e,t)}}function Z0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Ce(e,t))return;s.uniform3uiv(this.addr,t),Pe(e,t)}}function J0(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Ce(e,t))return;s.uniform4uiv(this.addr,t),Pe(e,t)}}function Q0(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(dh.compareFunction=Ju,r=dh):r=ud,e.setTexture2D(t||r,i)}function t_(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||fd,i)}function e_(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||pd,i)}function n_(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||dd,i)}function i_(s){switch(s){case 5126:return F0;case 35664:return z0;case 35665:return B0;case 35666:return H0;case 35674:return G0;case 35675:return V0;case 35676:return W0;case 5124:case 35670:return X0;case 35667:case 35671:return j0;case 35668:case 35672:return $0;case 35669:case 35673:return Y0;case 5125:return q0;case 36294:return K0;case 36295:return Z0;case 36296:return J0;case 35678:case 36198:case 36298:case 36306:case 35682:return Q0;case 35679:case 36299:case 36307:return t_;case 35680:case 36300:case 36308:case 36293:return e_;case 36289:case 36303:case 36311:case 36292:return n_}}function s_(s,t){s.uniform1fv(this.addr,t)}function r_(s,t){const e=Ns(t,this.size,2);s.uniform2fv(this.addr,e)}function o_(s,t){const e=Ns(t,this.size,3);s.uniform3fv(this.addr,e)}function a_(s,t){const e=Ns(t,this.size,4);s.uniform4fv(this.addr,e)}function c_(s,t){const e=Ns(t,this.size,4);s.uniformMatrix2fv(this.addr,!1,e)}function l_(s,t){const e=Ns(t,this.size,9);s.uniformMatrix3fv(this.addr,!1,e)}function h_(s,t){const e=Ns(t,this.size,16);s.uniformMatrix4fv(this.addr,!1,e)}function u_(s,t){s.uniform1iv(this.addr,t)}function d_(s,t){s.uniform2iv(this.addr,t)}function f_(s,t){s.uniform3iv(this.addr,t)}function p_(s,t){s.uniform4iv(this.addr,t)}function m_(s,t){s.uniform1uiv(this.addr,t)}function g_(s,t){s.uniform2uiv(this.addr,t)}function __(s,t){s.uniform3uiv(this.addr,t)}function v_(s,t){s.uniform4uiv(this.addr,t)}function y_(s,t,e){const n=this.cache,i=t.length,r=Fo(e,i);Ce(n,r)||(s.uniform1iv(this.addr,r),Pe(n,r));for(let o=0;o!==i;++o)e.setTexture2D(t[o]||ud,r[o])}function x_(s,t,e){const n=this.cache,i=t.length,r=Fo(e,i);Ce(n,r)||(s.uniform1iv(this.addr,r),Pe(n,r));for(let o=0;o!==i;++o)e.setTexture3D(t[o]||fd,r[o])}function M_(s,t,e){const n=this.cache,i=t.length,r=Fo(e,i);Ce(n,r)||(s.uniform1iv(this.addr,r),Pe(n,r));for(let o=0;o!==i;++o)e.setTextureCube(t[o]||pd,r[o])}function b_(s,t,e){const n=this.cache,i=t.length,r=Fo(e,i);Ce(n,r)||(s.uniform1iv(this.addr,r),Pe(n,r));for(let o=0;o!==i;++o)e.setTexture2DArray(t[o]||dd,r[o])}function S_(s){switch(s){case 5126:return s_;case 35664:return r_;case 35665:return o_;case 35666:return a_;case 35674:return c_;case 35675:return l_;case 35676:return h_;case 5124:case 35670:return u_;case 35667:case 35671:return d_;case 35668:case 35672:return f_;case 35669:case 35673:return p_;case 5125:return m_;case 36294:return g_;case 36295:return __;case 36296:return v_;case 35678:case 36198:case 36298:case 36306:case 35682:return y_;case 35679:case 36299:case 36307:return x_;case 35680:case 36300:case 36308:case 36293:return M_;case 36289:case 36303:case 36311:case 36292:return b_}}class w_{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=i_(e.type)}}class E_{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=S_(e.type)}}class T_{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){const i=this.seq;for(let r=0,o=i.length;r!==o;++r){const a=i[r];a.setValue(t,e[a.id],n)}}}const ba=/(\w+)(\])?(\[|\.)?/g;function vh(s,t){s.seq.push(t),s.map[t.id]=t}function A_(s,t,e){const n=s.name,i=n.length;for(ba.lastIndex=0;;){const r=ba.exec(n),o=ba.lastIndex;let a=r[1];const c=r[2]==="]",l=r[3];if(c&&(a=a|0),l===void 0||l==="["&&o+2===i){vh(e,l===void 0?new w_(a,s,t):new E_(a,s,t));break}else{let d=e.map[a];d===void 0&&(d=new T_(a),vh(e,d)),e=d}}}class vo{constructor(t,e){this.seq=[],this.map={};const n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){const r=t.getActiveUniform(e,i),o=t.getUniformLocation(e,r.name);A_(r,o,this)}}setValue(t,e,n,i){const r=this.map[e];r!==void 0&&r.setValue(t,n,i)}setOptional(t,e,n){const i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let r=0,o=e.length;r!==o;++r){const a=e[r],c=n[a.id];c.needsUpdate!==!1&&a.setValue(t,c.value,i)}}static seqWithValue(t,e){const n=[];for(let i=0,r=t.length;i!==r;++i){const o=t[i];o.id in e&&n.push(o)}return n}}function yh(s,t,e){const n=s.createShader(t);return s.shaderSource(n,e),s.compileShader(n),n}const R_=37297;let C_=0;function P_(s,t){const e=s.split(`
`),n=[],i=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=i;o<r;o++){const a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}function L_(s){const t=Zt.getPrimaries(Zt.workingColorSpace),e=Zt.getPrimaries(s);let n;switch(t===e?n="":t===Ro&&e===Ao?n="LinearDisplayP3ToLinearSRGB":t===Ao&&e===Ro&&(n="LinearSRGBToLinearDisplayP3"),s){case Fe:case Oo:return[n,"LinearTransferOETF"];case ke:case nl:return[n,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space:",s),[n,"LinearTransferOETF"]}}function xh(s,t,e){const n=s.getShaderParameter(t,s.COMPILE_STATUS),i=s.getShaderInfoLog(t).trim();if(n&&i==="")return"";const r=/ERROR: 0:(\d+)/.exec(i);if(r){const o=parseInt(r[1]);return e.toUpperCase()+`

`+i+`

`+P_(s.getShaderSource(t),o)}else return i}function I_(s,t){const e=L_(t);return`vec4 ${s}( vec4 value ) { return ${e[0]}( ${e[1]}( value ) ); }`}function D_(s,t){let e;switch(t){case If:e="Linear";break;case Df:e="Reinhard";break;case Nf:e="Cineon";break;case Uf:e="ACESFilmic";break;case Of:e="AgX";break;case Ff:e="Neutral";break;case kf:e="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),e="Linear"}return"vec3 "+s+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}const Wr=new E;function N_(){Zt.getLuminanceCoefficients(Wr);const s=Wr.x.toFixed(4),t=Wr.y.toFixed(4),e=Wr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function U_(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Qs).join(`
`)}function k_(s){const t=[];for(const e in s){const n=s[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function O_(s,t){const e={},n=s.getProgramParameter(t,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){const r=s.getActiveAttrib(t,i),o=r.name;let a=1;r.type===s.FLOAT_MAT2&&(a=2),r.type===s.FLOAT_MAT3&&(a=3),r.type===s.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:s.getAttribLocation(t,o),locationSize:a}}return e}function Qs(s){return s!==""}function Mh(s,t){const e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function bh(s,t){return s.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}const F_=/^[ \t]*#include +<([\w\d./]+)>/gm;function Ic(s){return s.replace(F_,B_)}const z_=new Map;function B_(s,t){let e=Ot[t];if(e===void 0){const n=z_.get(t);if(n!==void 0)e=Ot[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return Ic(e)}const H_=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Sh(s){return s.replace(H_,G_)}function G_(s,t,e,n){let i="";for(let r=parseInt(t);r<parseInt(e);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function wh(s){let t=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?t+=`
#define HIGH_PRECISION`:s.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function V_(s){let t="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===ku?t="SHADOWMAP_TYPE_PCF":s.shadowMapType===Ou?t="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===Vn&&(t="SHADOWMAP_TYPE_VSM"),t}function W_(s){let t="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case xs:case Ms:t="ENVMAP_TYPE_CUBE";break;case ko:t="ENVMAP_TYPE_CUBE_UV";break}return t}function X_(s){let t="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case Ms:t="ENVMAP_MODE_REFRACTION";break}return t}function j_(s){let t="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case Fu:t="ENVMAP_BLENDING_MULTIPLY";break;case Pf:t="ENVMAP_BLENDING_MIX";break;case Lf:t="ENVMAP_BLENDING_ADD";break}return t}function $_(s){const t=s.envMapCubeUVHeight;if(t===null)return null;const e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),7*16)),texelHeight:n,maxMip:e}}function Y_(s,t,e,n){const i=s.getContext(),r=e.defines;let o=e.vertexShader,a=e.fragmentShader;const c=V_(e),l=W_(e),h=X_(e),d=j_(e),u=$_(e),f=U_(e),p=k_(r),_=i.createProgram();let m,g,x=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p].filter(Qs).join(`
`),m.length>0&&(m+=`
`),g=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p].filter(Qs).join(`
`),g.length>0&&(g+=`
`)):(m=[wh(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+h:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Qs).join(`
`),g=[wh(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,p,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+l:"",e.envMap?"#define "+h:"",e.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor||e.batchingColor?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==pi?"#define TONE_MAPPING":"",e.toneMapping!==pi?Ot.tonemapping_pars_fragment:"",e.toneMapping!==pi?D_("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",Ot.colorspace_pars_fragment,I_("linearToOutputTexel",e.outputColorSpace),N_(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Qs).join(`
`)),o=Ic(o),o=Mh(o,e),o=bh(o,e),a=Ic(a),a=Mh(a,e),a=bh(a,e),o=Sh(o),a=Sh(a),e.isRawShaderMaterial!==!0&&(x=`#version 300 es
`,m=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,g=["#define varying in",e.glslVersion===Bl?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===Bl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+g);const v=x+m+o,M=x+g+a,C=yh(i,i.VERTEX_SHADER,v),R=yh(i,i.FRAGMENT_SHADER,M);i.attachShader(_,C),i.attachShader(_,R),e.index0AttributeName!==void 0?i.bindAttribLocation(_,0,e.index0AttributeName):e.morphTargets===!0&&i.bindAttribLocation(_,0,"position"),i.linkProgram(_);function T(w){if(s.debug.checkShaderErrors){const F=i.getProgramInfoLog(_).trim(),B=i.getShaderInfoLog(C).trim(),W=i.getShaderInfoLog(R).trim();let j=!0,H=!0;if(i.getProgramParameter(_,i.LINK_STATUS)===!1)if(j=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,_,C,R);else{const K=xh(i,C,"vertex"),G=xh(i,R,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(_,i.VALIDATE_STATUS)+`

Material Name: `+w.name+`
Material Type: `+w.type+`

Program Info Log: `+F+`
`+K+`
`+G)}else F!==""?console.warn("THREE.WebGLProgram: Program Info Log:",F):(B===""||W==="")&&(H=!1);H&&(w.diagnostics={runnable:j,programLog:F,vertexShader:{log:B,prefix:m},fragmentShader:{log:W,prefix:g}})}i.deleteShader(C),i.deleteShader(R),L=new vo(i,_),V=O_(i,_)}let L;this.getUniforms=function(){return L===void 0&&T(this),L};let V;this.getAttributes=function(){return V===void 0&&T(this),V};let y=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return y===!1&&(y=i.getProgramParameter(_,R_)),y},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(_),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=C_++,this.cacheKey=t,this.usedTimes=1,this.program=_,this.vertexShader=C,this.fragmentShader=R,this}let q_=0;class K_{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){const e=t.vertexShader,n=t.fragmentShader,i=this._getShaderStage(e),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(t);return o.has(i)===!1&&(o.add(i),i.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(t){const e=this.materialCache.get(t);for(const n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){const e=this.materialCache;let n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){const e=this.shaderCache;let n=e.get(t);return n===void 0&&(n=new Z_(t),e.set(t,n)),n}}class Z_{constructor(t){this.id=q_++,this.code=t,this.usedTimes=0}}function J_(s,t,e,n,i,r,o){const a=new sl,c=new K_,l=new Set,h=[],d=i.logarithmicDepthBuffer,u=i.reverseDepthBuffer,f=i.vertexTextures;let p=i.precision;const _={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(y){return l.add(y),y===0?"uv":`uv${y}`}function g(y,w,F,B,W){const j=B.fog,H=W.geometry,K=y.isMeshStandardMaterial?B.environment:null,G=(y.isMeshStandardMaterial?e:t).get(y.envMap||K),st=G&&G.mapping===ko?G.image.height:null,at=_[y.type];y.precision!==null&&(p=i.getMaxPrecision(y.precision),p!==y.precision&&console.warn("THREE.WebGLProgram.getParameters:",y.precision,"not supported, using",p,"instead."));const mt=H.morphAttributes.position||H.morphAttributes.normal||H.morphAttributes.color,Ht=mt!==void 0?mt.length:0;let Jt=0;H.morphAttributes.position!==void 0&&(Jt=1),H.morphAttributes.normal!==void 0&&(Jt=2),H.morphAttributes.color!==void 0&&(Jt=3);let $,Q,xt,ft;if(at){const Qe=Rn[at];$=Qe.vertexShader,Q=Qe.fragmentShader}else $=y.vertexShader,Q=y.fragmentShader,c.update(y),xt=c.getVertexShaderID(y),ft=c.getFragmentShaderID(y);const Ut=s.getRenderTarget(),Rt=W.isInstancedMesh===!0,Wt=W.isBatchedMesh===!0,oe=!!y.map,Xt=!!y.matcap,P=!!G,en=!!y.aoMap,Gt=!!y.lightMap,qt=!!y.bumpMap,Pt=!!y.normalMap,de=!!y.displacementMap,Nt=!!y.emissiveMap,A=!!y.metalnessMap,b=!!y.roughnessMap,k=y.anisotropy>0,q=y.clearcoat>0,J=y.dispersion>0,Y=y.iridescence>0,bt=y.sheen>0,ot=y.transmission>0,pt=k&&!!y.anisotropyMap,Kt=q&&!!y.clearcoatMap,tt=q&&!!y.clearcoatNormalMap,gt=q&&!!y.clearcoatRoughnessMap,Lt=Y&&!!y.iridescenceMap,It=Y&&!!y.iridescenceThicknessMap,_t=bt&&!!y.sheenColorMap,Vt=bt&&!!y.sheenRoughnessMap,kt=!!y.specularMap,he=!!y.specularColorMap,I=!!y.specularIntensityMap,ht=ot&&!!y.transmissionMap,X=ot&&!!y.thicknessMap,Z=!!y.gradientMap,ct=!!y.alphaMap,ut=y.alphaTest>0,jt=!!y.alphaHash,be=!!y.extensions;let Je=pi;y.toneMapped&&(Ut===null||Ut.isXRRenderTarget===!0)&&(Je=s.toneMapping);const Qt={shaderID:at,shaderType:y.type,shaderName:y.name,vertexShader:$,fragmentShader:Q,defines:y.defines,customVertexShaderID:xt,customFragmentShaderID:ft,isRawShaderMaterial:y.isRawShaderMaterial===!0,glslVersion:y.glslVersion,precision:p,batching:Wt,batchingColor:Wt&&W._colorsTexture!==null,instancing:Rt,instancingColor:Rt&&W.instanceColor!==null,instancingMorph:Rt&&W.morphTexture!==null,supportsVertexTextures:f,outputColorSpace:Ut===null?s.outputColorSpace:Ut.isXRRenderTarget===!0?Ut.texture.colorSpace:Fe,alphaToCoverage:!!y.alphaToCoverage,map:oe,matcap:Xt,envMap:P,envMapMode:P&&G.mapping,envMapCubeUVHeight:st,aoMap:en,lightMap:Gt,bumpMap:qt,normalMap:Pt,displacementMap:f&&de,emissiveMap:Nt,normalMapObjectSpace:Pt&&y.normalMapType===Wf,normalMapTangentSpace:Pt&&y.normalMapType===Zu,metalnessMap:A,roughnessMap:b,anisotropy:k,anisotropyMap:pt,clearcoat:q,clearcoatMap:Kt,clearcoatNormalMap:tt,clearcoatRoughnessMap:gt,dispersion:J,iridescence:Y,iridescenceMap:Lt,iridescenceThicknessMap:It,sheen:bt,sheenColorMap:_t,sheenRoughnessMap:Vt,specularMap:kt,specularColorMap:he,specularIntensityMap:I,transmission:ot,transmissionMap:ht,thicknessMap:X,gradientMap:Z,opaque:y.transparent===!1&&y.blending===hs&&y.alphaToCoverage===!1,alphaMap:ct,alphaTest:ut,alphaHash:jt,combine:y.combine,mapUv:oe&&m(y.map.channel),aoMapUv:en&&m(y.aoMap.channel),lightMapUv:Gt&&m(y.lightMap.channel),bumpMapUv:qt&&m(y.bumpMap.channel),normalMapUv:Pt&&m(y.normalMap.channel),displacementMapUv:de&&m(y.displacementMap.channel),emissiveMapUv:Nt&&m(y.emissiveMap.channel),metalnessMapUv:A&&m(y.metalnessMap.channel),roughnessMapUv:b&&m(y.roughnessMap.channel),anisotropyMapUv:pt&&m(y.anisotropyMap.channel),clearcoatMapUv:Kt&&m(y.clearcoatMap.channel),clearcoatNormalMapUv:tt&&m(y.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:gt&&m(y.clearcoatRoughnessMap.channel),iridescenceMapUv:Lt&&m(y.iridescenceMap.channel),iridescenceThicknessMapUv:It&&m(y.iridescenceThicknessMap.channel),sheenColorMapUv:_t&&m(y.sheenColorMap.channel),sheenRoughnessMapUv:Vt&&m(y.sheenRoughnessMap.channel),specularMapUv:kt&&m(y.specularMap.channel),specularColorMapUv:he&&m(y.specularColorMap.channel),specularIntensityMapUv:I&&m(y.specularIntensityMap.channel),transmissionMapUv:ht&&m(y.transmissionMap.channel),thicknessMapUv:X&&m(y.thicknessMap.channel),alphaMapUv:ct&&m(y.alphaMap.channel),vertexTangents:!!H.attributes.tangent&&(Pt||k),vertexColors:y.vertexColors,vertexAlphas:y.vertexColors===!0&&!!H.attributes.color&&H.attributes.color.itemSize===4,pointsUvs:W.isPoints===!0&&!!H.attributes.uv&&(oe||ct),fog:!!j,useFog:y.fog===!0,fogExp2:!!j&&j.isFogExp2,flatShading:y.flatShading===!0,sizeAttenuation:y.sizeAttenuation===!0,logarithmicDepthBuffer:d,reverseDepthBuffer:u,skinning:W.isSkinnedMesh===!0,morphTargets:H.morphAttributes.position!==void 0,morphNormals:H.morphAttributes.normal!==void 0,morphColors:H.morphAttributes.color!==void 0,morphTargetsCount:Ht,morphTextureStride:Jt,numDirLights:w.directional.length,numPointLights:w.point.length,numSpotLights:w.spot.length,numSpotLightMaps:w.spotLightMap.length,numRectAreaLights:w.rectArea.length,numHemiLights:w.hemi.length,numDirLightShadows:w.directionalShadowMap.length,numPointLightShadows:w.pointShadowMap.length,numSpotLightShadows:w.spotShadowMap.length,numSpotLightShadowsWithMaps:w.numSpotLightShadowsWithMaps,numLightProbes:w.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:y.dithering,shadowMapEnabled:s.shadowMap.enabled&&F.length>0,shadowMapType:s.shadowMap.type,toneMapping:Je,decodeVideoTexture:oe&&y.map.isVideoTexture===!0&&Zt.getTransfer(y.map.colorSpace)===me,premultipliedAlpha:y.premultipliedAlpha,doubleSided:y.side===Ye,flipSided:y.side===Ke,useDepthPacking:y.depthPacking>=0,depthPacking:y.depthPacking||0,index0AttributeName:y.index0AttributeName,extensionClipCullDistance:be&&y.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(be&&y.extensions.multiDraw===!0||Wt)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:y.customProgramCacheKey()};return Qt.vertexUv1s=l.has(1),Qt.vertexUv2s=l.has(2),Qt.vertexUv3s=l.has(3),l.clear(),Qt}function x(y){const w=[];if(y.shaderID?w.push(y.shaderID):(w.push(y.customVertexShaderID),w.push(y.customFragmentShaderID)),y.defines!==void 0)for(const F in y.defines)w.push(F),w.push(y.defines[F]);return y.isRawShaderMaterial===!1&&(v(w,y),M(w,y),w.push(s.outputColorSpace)),w.push(y.customProgramCacheKey),w.join()}function v(y,w){y.push(w.precision),y.push(w.outputColorSpace),y.push(w.envMapMode),y.push(w.envMapCubeUVHeight),y.push(w.mapUv),y.push(w.alphaMapUv),y.push(w.lightMapUv),y.push(w.aoMapUv),y.push(w.bumpMapUv),y.push(w.normalMapUv),y.push(w.displacementMapUv),y.push(w.emissiveMapUv),y.push(w.metalnessMapUv),y.push(w.roughnessMapUv),y.push(w.anisotropyMapUv),y.push(w.clearcoatMapUv),y.push(w.clearcoatNormalMapUv),y.push(w.clearcoatRoughnessMapUv),y.push(w.iridescenceMapUv),y.push(w.iridescenceThicknessMapUv),y.push(w.sheenColorMapUv),y.push(w.sheenRoughnessMapUv),y.push(w.specularMapUv),y.push(w.specularColorMapUv),y.push(w.specularIntensityMapUv),y.push(w.transmissionMapUv),y.push(w.thicknessMapUv),y.push(w.combine),y.push(w.fogExp2),y.push(w.sizeAttenuation),y.push(w.morphTargetsCount),y.push(w.morphAttributeCount),y.push(w.numDirLights),y.push(w.numPointLights),y.push(w.numSpotLights),y.push(w.numSpotLightMaps),y.push(w.numHemiLights),y.push(w.numRectAreaLights),y.push(w.numDirLightShadows),y.push(w.numPointLightShadows),y.push(w.numSpotLightShadows),y.push(w.numSpotLightShadowsWithMaps),y.push(w.numLightProbes),y.push(w.shadowMapType),y.push(w.toneMapping),y.push(w.numClippingPlanes),y.push(w.numClipIntersection),y.push(w.depthPacking)}function M(y,w){a.disableAll(),w.supportsVertexTextures&&a.enable(0),w.instancing&&a.enable(1),w.instancingColor&&a.enable(2),w.instancingMorph&&a.enable(3),w.matcap&&a.enable(4),w.envMap&&a.enable(5),w.normalMapObjectSpace&&a.enable(6),w.normalMapTangentSpace&&a.enable(7),w.clearcoat&&a.enable(8),w.iridescence&&a.enable(9),w.alphaTest&&a.enable(10),w.vertexColors&&a.enable(11),w.vertexAlphas&&a.enable(12),w.vertexUv1s&&a.enable(13),w.vertexUv2s&&a.enable(14),w.vertexUv3s&&a.enable(15),w.vertexTangents&&a.enable(16),w.anisotropy&&a.enable(17),w.alphaHash&&a.enable(18),w.batching&&a.enable(19),w.dispersion&&a.enable(20),w.batchingColor&&a.enable(21),y.push(a.mask),a.disableAll(),w.fog&&a.enable(0),w.useFog&&a.enable(1),w.flatShading&&a.enable(2),w.logarithmicDepthBuffer&&a.enable(3),w.reverseDepthBuffer&&a.enable(4),w.skinning&&a.enable(5),w.morphTargets&&a.enable(6),w.morphNormals&&a.enable(7),w.morphColors&&a.enable(8),w.premultipliedAlpha&&a.enable(9),w.shadowMapEnabled&&a.enable(10),w.doubleSided&&a.enable(11),w.flipSided&&a.enable(12),w.useDepthPacking&&a.enable(13),w.dithering&&a.enable(14),w.transmission&&a.enable(15),w.sheen&&a.enable(16),w.opaque&&a.enable(17),w.pointsUvs&&a.enable(18),w.decodeVideoTexture&&a.enable(19),w.alphaToCoverage&&a.enable(20),y.push(a.mask)}function C(y){const w=_[y.type];let F;if(w){const B=Rn[w];F=Up.clone(B.uniforms)}else F=y.uniforms;return F}function R(y,w){let F;for(let B=0,W=h.length;B<W;B++){const j=h[B];if(j.cacheKey===w){F=j,++F.usedTimes;break}}return F===void 0&&(F=new Y_(s,w,y,r),h.push(F)),F}function T(y){if(--y.usedTimes===0){const w=h.indexOf(y);h[w]=h[h.length-1],h.pop(),y.destroy()}}function L(y){c.remove(y)}function V(){c.dispose()}return{getParameters:g,getProgramCacheKey:x,getUniforms:C,acquireProgram:R,releaseProgram:T,releaseShaderCache:L,programs:h,dispose:V}}function Q_(){let s=new WeakMap;function t(o){return s.has(o)}function e(o){let a=s.get(o);return a===void 0&&(a={},s.set(o,a)),a}function n(o){s.delete(o)}function i(o,a,c){s.get(o)[a]=c}function r(){s=new WeakMap}return{has:t,get:e,remove:n,update:i,dispose:r}}function tv(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.material.id!==t.material.id?s.material.id-t.material.id:s.z!==t.z?s.z-t.z:s.id-t.id}function Eh(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.z!==t.z?t.z-s.z:s.id-t.id}function Th(){const s=[];let t=0;const e=[],n=[],i=[];function r(){t=0,e.length=0,n.length=0,i.length=0}function o(d,u,f,p,_,m){let g=s[t];return g===void 0?(g={id:d.id,object:d,geometry:u,material:f,groupOrder:p,renderOrder:d.renderOrder,z:_,group:m},s[t]=g):(g.id=d.id,g.object=d,g.geometry=u,g.material=f,g.groupOrder=p,g.renderOrder=d.renderOrder,g.z=_,g.group=m),t++,g}function a(d,u,f,p,_,m){const g=o(d,u,f,p,_,m);f.transmission>0?n.push(g):f.transparent===!0?i.push(g):e.push(g)}function c(d,u,f,p,_,m){const g=o(d,u,f,p,_,m);f.transmission>0?n.unshift(g):f.transparent===!0?i.unshift(g):e.unshift(g)}function l(d,u){e.length>1&&e.sort(d||tv),n.length>1&&n.sort(u||Eh),i.length>1&&i.sort(u||Eh)}function h(){for(let d=t,u=s.length;d<u;d++){const f=s[d];if(f.id===null)break;f.id=null,f.object=null,f.geometry=null,f.material=null,f.group=null}}return{opaque:e,transmissive:n,transparent:i,init:r,push:a,unshift:c,finish:h,sort:l}}function ev(){let s=new WeakMap;function t(n,i){const r=s.get(n);let o;return r===void 0?(o=new Th,s.set(n,[o])):i>=r.length?(o=new Th,r.push(o)):o=r[i],o}function e(){s=new WeakMap}return{get:t,dispose:e}}function nv(){const s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new E,color:new Tt};break;case"SpotLight":e={position:new E,direction:new E,color:new Tt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new E,color:new Tt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new E,skyColor:new Tt,groundColor:new Tt};break;case"RectAreaLight":e={color:new Tt,position:new E,halfWidth:new E,halfHeight:new E};break}return s[t.id]=e,e}}}function iv(){const s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new it};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new it};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new it,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[t.id]=e,e}}}let sv=0;function rv(s,t){return(t.castShadow?2:0)-(s.castShadow?2:0)+(t.map?1:0)-(s.map?1:0)}function ov(s){const t=new nv,e=iv(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new E);const i=new E,r=new Dt,o=new Dt;function a(l){let h=0,d=0,u=0;for(let V=0;V<9;V++)n.probe[V].set(0,0,0);let f=0,p=0,_=0,m=0,g=0,x=0,v=0,M=0,C=0,R=0,T=0;l.sort(rv);for(let V=0,y=l.length;V<y;V++){const w=l[V],F=w.color,B=w.intensity,W=w.distance,j=w.shadow&&w.shadow.map?w.shadow.map.texture:null;if(w.isAmbientLight)h+=F.r*B,d+=F.g*B,u+=F.b*B;else if(w.isLightProbe){for(let H=0;H<9;H++)n.probe[H].addScaledVector(w.sh.coefficients[H],B);T++}else if(w.isDirectionalLight){const H=t.get(w);if(H.color.copy(w.color).multiplyScalar(w.intensity),w.castShadow){const K=w.shadow,G=e.get(w);G.shadowIntensity=K.intensity,G.shadowBias=K.bias,G.shadowNormalBias=K.normalBias,G.shadowRadius=K.radius,G.shadowMapSize=K.mapSize,n.directionalShadow[f]=G,n.directionalShadowMap[f]=j,n.directionalShadowMatrix[f]=w.shadow.matrix,x++}n.directional[f]=H,f++}else if(w.isSpotLight){const H=t.get(w);H.position.setFromMatrixPosition(w.matrixWorld),H.color.copy(F).multiplyScalar(B),H.distance=W,H.coneCos=Math.cos(w.angle),H.penumbraCos=Math.cos(w.angle*(1-w.penumbra)),H.decay=w.decay,n.spot[_]=H;const K=w.shadow;if(w.map&&(n.spotLightMap[C]=w.map,C++,K.updateMatrices(w),w.castShadow&&R++),n.spotLightMatrix[_]=K.matrix,w.castShadow){const G=e.get(w);G.shadowIntensity=K.intensity,G.shadowBias=K.bias,G.shadowNormalBias=K.normalBias,G.shadowRadius=K.radius,G.shadowMapSize=K.mapSize,n.spotShadow[_]=G,n.spotShadowMap[_]=j,M++}_++}else if(w.isRectAreaLight){const H=t.get(w);H.color.copy(F).multiplyScalar(B),H.halfWidth.set(w.width*.5,0,0),H.halfHeight.set(0,w.height*.5,0),n.rectArea[m]=H,m++}else if(w.isPointLight){const H=t.get(w);if(H.color.copy(w.color).multiplyScalar(w.intensity),H.distance=w.distance,H.decay=w.decay,w.castShadow){const K=w.shadow,G=e.get(w);G.shadowIntensity=K.intensity,G.shadowBias=K.bias,G.shadowNormalBias=K.normalBias,G.shadowRadius=K.radius,G.shadowMapSize=K.mapSize,G.shadowCameraNear=K.camera.near,G.shadowCameraFar=K.camera.far,n.pointShadow[p]=G,n.pointShadowMap[p]=j,n.pointShadowMatrix[p]=w.shadow.matrix,v++}n.point[p]=H,p++}else if(w.isHemisphereLight){const H=t.get(w);H.skyColor.copy(w.color).multiplyScalar(B),H.groundColor.copy(w.groundColor).multiplyScalar(B),n.hemi[g]=H,g++}}m>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=rt.LTC_FLOAT_1,n.rectAreaLTC2=rt.LTC_FLOAT_2):(n.rectAreaLTC1=rt.LTC_HALF_1,n.rectAreaLTC2=rt.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=d,n.ambient[2]=u;const L=n.hash;(L.directionalLength!==f||L.pointLength!==p||L.spotLength!==_||L.rectAreaLength!==m||L.hemiLength!==g||L.numDirectionalShadows!==x||L.numPointShadows!==v||L.numSpotShadows!==M||L.numSpotMaps!==C||L.numLightProbes!==T)&&(n.directional.length=f,n.spot.length=_,n.rectArea.length=m,n.point.length=p,n.hemi.length=g,n.directionalShadow.length=x,n.directionalShadowMap.length=x,n.pointShadow.length=v,n.pointShadowMap.length=v,n.spotShadow.length=M,n.spotShadowMap.length=M,n.directionalShadowMatrix.length=x,n.pointShadowMatrix.length=v,n.spotLightMatrix.length=M+C-R,n.spotLightMap.length=C,n.numSpotLightShadowsWithMaps=R,n.numLightProbes=T,L.directionalLength=f,L.pointLength=p,L.spotLength=_,L.rectAreaLength=m,L.hemiLength=g,L.numDirectionalShadows=x,L.numPointShadows=v,L.numSpotShadows=M,L.numSpotMaps=C,L.numLightProbes=T,n.version=sv++)}function c(l,h){let d=0,u=0,f=0,p=0,_=0;const m=h.matrixWorldInverse;for(let g=0,x=l.length;g<x;g++){const v=l[g];if(v.isDirectionalLight){const M=n.directional[d];M.direction.setFromMatrixPosition(v.matrixWorld),i.setFromMatrixPosition(v.target.matrixWorld),M.direction.sub(i),M.direction.transformDirection(m),d++}else if(v.isSpotLight){const M=n.spot[f];M.position.setFromMatrixPosition(v.matrixWorld),M.position.applyMatrix4(m),M.direction.setFromMatrixPosition(v.matrixWorld),i.setFromMatrixPosition(v.target.matrixWorld),M.direction.sub(i),M.direction.transformDirection(m),f++}else if(v.isRectAreaLight){const M=n.rectArea[p];M.position.setFromMatrixPosition(v.matrixWorld),M.position.applyMatrix4(m),o.identity(),r.copy(v.matrixWorld),r.premultiply(m),o.extractRotation(r),M.halfWidth.set(v.width*.5,0,0),M.halfHeight.set(0,v.height*.5,0),M.halfWidth.applyMatrix4(o),M.halfHeight.applyMatrix4(o),p++}else if(v.isPointLight){const M=n.point[u];M.position.setFromMatrixPosition(v.matrixWorld),M.position.applyMatrix4(m),u++}else if(v.isHemisphereLight){const M=n.hemi[_];M.direction.setFromMatrixPosition(v.matrixWorld),M.direction.transformDirection(m),_++}}}return{setup:a,setupView:c,state:n}}function Ah(s){const t=new ov(s),e=[],n=[];function i(h){l.camera=h,e.length=0,n.length=0}function r(h){e.push(h)}function o(h){n.push(h)}function a(){t.setup(e)}function c(h){t.setupView(e,h)}const l={lightsArray:e,shadowsArray:n,camera:null,lights:t,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:a,setupLightsView:c,pushLight:r,pushShadow:o}}function av(s){let t=new WeakMap;function e(i,r=0){const o=t.get(i);let a;return o===void 0?(a=new Ah(s),t.set(i,[a])):r>=o.length?(a=new Ah(s),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}class cv extends Pn{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Gf,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}}class lv extends Pn{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}}const hv=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,uv=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function dv(s,t,e){let n=new rl;const i=new it,r=new it,o=new te,a=new cv({depthPacking:Vf}),c=new lv,l={},h=e.maxTextureSize,d={[Yn]:Ke,[Ke]:Yn,[Ye]:Ye},u=new Kn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new it},radius:{value:4}},vertexShader:hv,fragmentShader:uv}),f=u.clone();f.defines.HORIZONTAL_PASS=1;const p=new Me;p.setAttribute("position",new Ze(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const _=new nt(p,u),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=ku;let g=this.type;this.render=function(R,T,L){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||R.length===0)return;const V=s.getRenderTarget(),y=s.getActiveCubeFace(),w=s.getActiveMipmapLevel(),F=s.state;F.setBlending(fi),F.buffers.color.setClear(1,1,1,1),F.buffers.depth.setTest(!0),F.setScissorTest(!1);const B=g!==Vn&&this.type===Vn,W=g===Vn&&this.type!==Vn;for(let j=0,H=R.length;j<H;j++){const K=R[j],G=K.shadow;if(G===void 0){console.warn("THREE.WebGLShadowMap:",K,"has no shadow.");continue}if(G.autoUpdate===!1&&G.needsUpdate===!1)continue;i.copy(G.mapSize);const st=G.getFrameExtents();if(i.multiply(st),r.copy(G.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/st.x),i.x=r.x*st.x,G.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/st.y),i.y=r.y*st.y,G.mapSize.y=r.y)),G.map===null||B===!0||W===!0){const mt=this.type!==Vn?{minFilter:qe,magFilter:qe}:{};G.map!==null&&G.map.dispose(),G.map=new Oi(i.x,i.y,mt),G.map.texture.name=K.name+".shadowMap",G.camera.updateProjectionMatrix()}s.setRenderTarget(G.map),s.clear();const at=G.getViewportCount();for(let mt=0;mt<at;mt++){const Ht=G.getViewport(mt);o.set(r.x*Ht.x,r.y*Ht.y,r.x*Ht.z,r.y*Ht.w),F.viewport(o),G.updateMatrices(K,mt),n=G.getFrustum(),M(T,L,G.camera,K,this.type)}G.isPointLightShadow!==!0&&this.type===Vn&&x(G,L),G.needsUpdate=!1}g=this.type,m.needsUpdate=!1,s.setRenderTarget(V,y,w)};function x(R,T){const L=t.update(_);u.defines.VSM_SAMPLES!==R.blurSamples&&(u.defines.VSM_SAMPLES=R.blurSamples,f.defines.VSM_SAMPLES=R.blurSamples,u.needsUpdate=!0,f.needsUpdate=!0),R.mapPass===null&&(R.mapPass=new Oi(i.x,i.y)),u.uniforms.shadow_pass.value=R.map.texture,u.uniforms.resolution.value=R.mapSize,u.uniforms.radius.value=R.radius,s.setRenderTarget(R.mapPass),s.clear(),s.renderBufferDirect(T,null,L,u,_,null),f.uniforms.shadow_pass.value=R.mapPass.texture,f.uniforms.resolution.value=R.mapSize,f.uniforms.radius.value=R.radius,s.setRenderTarget(R.map),s.clear(),s.renderBufferDirect(T,null,L,f,_,null)}function v(R,T,L,V){let y=null;const w=L.isPointLight===!0?R.customDistanceMaterial:R.customDepthMaterial;if(w!==void 0)y=w;else if(y=L.isPointLight===!0?c:a,s.localClippingEnabled&&T.clipShadows===!0&&Array.isArray(T.clippingPlanes)&&T.clippingPlanes.length!==0||T.displacementMap&&T.displacementScale!==0||T.alphaMap&&T.alphaTest>0||T.map&&T.alphaTest>0){const F=y.uuid,B=T.uuid;let W=l[F];W===void 0&&(W={},l[F]=W);let j=W[B];j===void 0&&(j=y.clone(),W[B]=j,T.addEventListener("dispose",C)),y=j}if(y.visible=T.visible,y.wireframe=T.wireframe,V===Vn?y.side=T.shadowSide!==null?T.shadowSide:T.side:y.side=T.shadowSide!==null?T.shadowSide:d[T.side],y.alphaMap=T.alphaMap,y.alphaTest=T.alphaTest,y.map=T.map,y.clipShadows=T.clipShadows,y.clippingPlanes=T.clippingPlanes,y.clipIntersection=T.clipIntersection,y.displacementMap=T.displacementMap,y.displacementScale=T.displacementScale,y.displacementBias=T.displacementBias,y.wireframeLinewidth=T.wireframeLinewidth,y.linewidth=T.linewidth,L.isPointLight===!0&&y.isMeshDistanceMaterial===!0){const F=s.properties.get(y);F.light=L}return y}function M(R,T,L,V,y){if(R.visible===!1)return;if(R.layers.test(T.layers)&&(R.isMesh||R.isLine||R.isPoints)&&(R.castShadow||R.receiveShadow&&y===Vn)&&(!R.frustumCulled||n.intersectsObject(R))){R.modelViewMatrix.multiplyMatrices(L.matrixWorldInverse,R.matrixWorld);const B=t.update(R),W=R.material;if(Array.isArray(W)){const j=B.groups;for(let H=0,K=j.length;H<K;H++){const G=j[H],st=W[G.materialIndex];if(st&&st.visible){const at=v(R,st,V,y);R.onBeforeShadow(s,R,T,L,B,at,G),s.renderBufferDirect(L,null,B,at,R,G),R.onAfterShadow(s,R,T,L,B,at,G)}}}else if(W.visible){const j=v(R,W,V,y);R.onBeforeShadow(s,R,T,L,B,j,null),s.renderBufferDirect(L,null,B,j,R,null),R.onAfterShadow(s,R,T,L,B,j,null)}}const F=R.children;for(let B=0,W=F.length;B<W;B++)M(F[B],T,L,V,y)}function C(R){R.target.removeEventListener("dispose",C);for(const L in l){const V=l[L],y=R.target.uuid;y in V&&(V[y].dispose(),delete V[y])}}}const fv={[qa]:Ka,[Za]:tc,[Ja]:ec,[ys]:Qa,[Ka]:qa,[tc]:Za,[ec]:Ja,[Qa]:ys};function pv(s){function t(){let I=!1;const ht=new te;let X=null;const Z=new te(0,0,0,0);return{setMask:function(ct){X!==ct&&!I&&(s.colorMask(ct,ct,ct,ct),X=ct)},setLocked:function(ct){I=ct},setClear:function(ct,ut,jt,be,Je){Je===!0&&(ct*=be,ut*=be,jt*=be),ht.set(ct,ut,jt,be),Z.equals(ht)===!1&&(s.clearColor(ct,ut,jt,be),Z.copy(ht))},reset:function(){I=!1,X=null,Z.set(-1,0,0,0)}}}function e(){let I=!1,ht=!1,X=null,Z=null,ct=null;return{setReversed:function(ut){ht=ut},setTest:function(ut){ut?xt(s.DEPTH_TEST):ft(s.DEPTH_TEST)},setMask:function(ut){X!==ut&&!I&&(s.depthMask(ut),X=ut)},setFunc:function(ut){if(ht&&(ut=fv[ut]),Z!==ut){switch(ut){case qa:s.depthFunc(s.NEVER);break;case Ka:s.depthFunc(s.ALWAYS);break;case Za:s.depthFunc(s.LESS);break;case ys:s.depthFunc(s.LEQUAL);break;case Ja:s.depthFunc(s.EQUAL);break;case Qa:s.depthFunc(s.GEQUAL);break;case tc:s.depthFunc(s.GREATER);break;case ec:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}Z=ut}},setLocked:function(ut){I=ut},setClear:function(ut){ct!==ut&&(s.clearDepth(ut),ct=ut)},reset:function(){I=!1,X=null,Z=null,ct=null}}}function n(){let I=!1,ht=null,X=null,Z=null,ct=null,ut=null,jt=null,be=null,Je=null;return{setTest:function(Qt){I||(Qt?xt(s.STENCIL_TEST):ft(s.STENCIL_TEST))},setMask:function(Qt){ht!==Qt&&!I&&(s.stencilMask(Qt),ht=Qt)},setFunc:function(Qt,Qe,kn){(X!==Qt||Z!==Qe||ct!==kn)&&(s.stencilFunc(Qt,Qe,kn),X=Qt,Z=Qe,ct=kn)},setOp:function(Qt,Qe,kn){(ut!==Qt||jt!==Qe||be!==kn)&&(s.stencilOp(Qt,Qe,kn),ut=Qt,jt=Qe,be=kn)},setLocked:function(Qt){I=Qt},setClear:function(Qt){Je!==Qt&&(s.clearStencil(Qt),Je=Qt)},reset:function(){I=!1,ht=null,X=null,Z=null,ct=null,ut=null,jt=null,be=null,Je=null}}}const i=new t,r=new e,o=new n,a=new WeakMap,c=new WeakMap;let l={},h={},d=new WeakMap,u=[],f=null,p=!1,_=null,m=null,g=null,x=null,v=null,M=null,C=null,R=new Tt(0,0,0),T=0,L=!1,V=null,y=null,w=null,F=null,B=null;const W=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let j=!1,H=0;const K=s.getParameter(s.VERSION);K.indexOf("WebGL")!==-1?(H=parseFloat(/^WebGL (\d)/.exec(K)[1]),j=H>=1):K.indexOf("OpenGL ES")!==-1&&(H=parseFloat(/^OpenGL ES (\d)/.exec(K)[1]),j=H>=2);let G=null,st={};const at=s.getParameter(s.SCISSOR_BOX),mt=s.getParameter(s.VIEWPORT),Ht=new te().fromArray(at),Jt=new te().fromArray(mt);function $(I,ht,X,Z){const ct=new Uint8Array(4),ut=s.createTexture();s.bindTexture(I,ut),s.texParameteri(I,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(I,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let jt=0;jt<X;jt++)I===s.TEXTURE_3D||I===s.TEXTURE_2D_ARRAY?s.texImage3D(ht,0,s.RGBA,1,1,Z,0,s.RGBA,s.UNSIGNED_BYTE,ct):s.texImage2D(ht+jt,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,ct);return ut}const Q={};Q[s.TEXTURE_2D]=$(s.TEXTURE_2D,s.TEXTURE_2D,1),Q[s.TEXTURE_CUBE_MAP]=$(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),Q[s.TEXTURE_2D_ARRAY]=$(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),Q[s.TEXTURE_3D]=$(s.TEXTURE_3D,s.TEXTURE_3D,1,1),i.setClear(0,0,0,1),r.setClear(1),o.setClear(0),xt(s.DEPTH_TEST),r.setFunc(ys),Gt(!1),qt(Ll),xt(s.CULL_FACE),P(fi);function xt(I){l[I]!==!0&&(s.enable(I),l[I]=!0)}function ft(I){l[I]!==!1&&(s.disable(I),l[I]=!1)}function Ut(I,ht){return h[I]!==ht?(s.bindFramebuffer(I,ht),h[I]=ht,I===s.DRAW_FRAMEBUFFER&&(h[s.FRAMEBUFFER]=ht),I===s.FRAMEBUFFER&&(h[s.DRAW_FRAMEBUFFER]=ht),!0):!1}function Rt(I,ht){let X=u,Z=!1;if(I){X=d.get(ht),X===void 0&&(X=[],d.set(ht,X));const ct=I.textures;if(X.length!==ct.length||X[0]!==s.COLOR_ATTACHMENT0){for(let ut=0,jt=ct.length;ut<jt;ut++)X[ut]=s.COLOR_ATTACHMENT0+ut;X.length=ct.length,Z=!0}}else X[0]!==s.BACK&&(X[0]=s.BACK,Z=!0);Z&&s.drawBuffers(X)}function Wt(I){return f!==I?(s.useProgram(I),f=I,!0):!1}const oe={[Ci]:s.FUNC_ADD,[ff]:s.FUNC_SUBTRACT,[pf]:s.FUNC_REVERSE_SUBTRACT};oe[mf]=s.MIN,oe[gf]=s.MAX;const Xt={[_f]:s.ZERO,[vf]:s.ONE,[yf]:s.SRC_COLOR,[$a]:s.SRC_ALPHA,[Ef]:s.SRC_ALPHA_SATURATE,[Sf]:s.DST_COLOR,[Mf]:s.DST_ALPHA,[xf]:s.ONE_MINUS_SRC_COLOR,[Ya]:s.ONE_MINUS_SRC_ALPHA,[wf]:s.ONE_MINUS_DST_COLOR,[bf]:s.ONE_MINUS_DST_ALPHA,[Tf]:s.CONSTANT_COLOR,[Af]:s.ONE_MINUS_CONSTANT_COLOR,[Rf]:s.CONSTANT_ALPHA,[Cf]:s.ONE_MINUS_CONSTANT_ALPHA};function P(I,ht,X,Z,ct,ut,jt,be,Je,Qt){if(I===fi){p===!0&&(ft(s.BLEND),p=!1);return}if(p===!1&&(xt(s.BLEND),p=!0),I!==df){if(I!==_||Qt!==L){if((m!==Ci||v!==Ci)&&(s.blendEquation(s.FUNC_ADD),m=Ci,v=Ci),Qt)switch(I){case hs:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Il:s.blendFunc(s.ONE,s.ONE);break;case Dl:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Nl:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",I);break}else switch(I){case hs:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Il:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case Dl:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Nl:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",I);break}g=null,x=null,M=null,C=null,R.set(0,0,0),T=0,_=I,L=Qt}return}ct=ct||ht,ut=ut||X,jt=jt||Z,(ht!==m||ct!==v)&&(s.blendEquationSeparate(oe[ht],oe[ct]),m=ht,v=ct),(X!==g||Z!==x||ut!==M||jt!==C)&&(s.blendFuncSeparate(Xt[X],Xt[Z],Xt[ut],Xt[jt]),g=X,x=Z,M=ut,C=jt),(be.equals(R)===!1||Je!==T)&&(s.blendColor(be.r,be.g,be.b,Je),R.copy(be),T=Je),_=I,L=!1}function en(I,ht){I.side===Ye?ft(s.CULL_FACE):xt(s.CULL_FACE);let X=I.side===Ke;ht&&(X=!X),Gt(X),I.blending===hs&&I.transparent===!1?P(fi):P(I.blending,I.blendEquation,I.blendSrc,I.blendDst,I.blendEquationAlpha,I.blendSrcAlpha,I.blendDstAlpha,I.blendColor,I.blendAlpha,I.premultipliedAlpha),r.setFunc(I.depthFunc),r.setTest(I.depthTest),r.setMask(I.depthWrite),i.setMask(I.colorWrite);const Z=I.stencilWrite;o.setTest(Z),Z&&(o.setMask(I.stencilWriteMask),o.setFunc(I.stencilFunc,I.stencilRef,I.stencilFuncMask),o.setOp(I.stencilFail,I.stencilZFail,I.stencilZPass)),de(I.polygonOffset,I.polygonOffsetFactor,I.polygonOffsetUnits),I.alphaToCoverage===!0?xt(s.SAMPLE_ALPHA_TO_COVERAGE):ft(s.SAMPLE_ALPHA_TO_COVERAGE)}function Gt(I){V!==I&&(I?s.frontFace(s.CW):s.frontFace(s.CCW),V=I)}function qt(I){I!==hf?(xt(s.CULL_FACE),I!==y&&(I===Ll?s.cullFace(s.BACK):I===uf?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):ft(s.CULL_FACE),y=I}function Pt(I){I!==w&&(j&&s.lineWidth(I),w=I)}function de(I,ht,X){I?(xt(s.POLYGON_OFFSET_FILL),(F!==ht||B!==X)&&(s.polygonOffset(ht,X),F=ht,B=X)):ft(s.POLYGON_OFFSET_FILL)}function Nt(I){I?xt(s.SCISSOR_TEST):ft(s.SCISSOR_TEST)}function A(I){I===void 0&&(I=s.TEXTURE0+W-1),G!==I&&(s.activeTexture(I),G=I)}function b(I,ht,X){X===void 0&&(G===null?X=s.TEXTURE0+W-1:X=G);let Z=st[X];Z===void 0&&(Z={type:void 0,texture:void 0},st[X]=Z),(Z.type!==I||Z.texture!==ht)&&(G!==X&&(s.activeTexture(X),G=X),s.bindTexture(I,ht||Q[I]),Z.type=I,Z.texture=ht)}function k(){const I=st[G];I!==void 0&&I.type!==void 0&&(s.bindTexture(I.type,null),I.type=void 0,I.texture=void 0)}function q(){try{s.compressedTexImage2D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function J(){try{s.compressedTexImage3D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function Y(){try{s.texSubImage2D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function bt(){try{s.texSubImage3D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function ot(){try{s.compressedTexSubImage2D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function pt(){try{s.compressedTexSubImage3D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function Kt(){try{s.texStorage2D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function tt(){try{s.texStorage3D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function gt(){try{s.texImage2D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function Lt(){try{s.texImage3D.apply(s,arguments)}catch(I){console.error("THREE.WebGLState:",I)}}function It(I){Ht.equals(I)===!1&&(s.scissor(I.x,I.y,I.z,I.w),Ht.copy(I))}function _t(I){Jt.equals(I)===!1&&(s.viewport(I.x,I.y,I.z,I.w),Jt.copy(I))}function Vt(I,ht){let X=c.get(ht);X===void 0&&(X=new WeakMap,c.set(ht,X));let Z=X.get(I);Z===void 0&&(Z=s.getUniformBlockIndex(ht,I.name),X.set(I,Z))}function kt(I,ht){const Z=c.get(ht).get(I);a.get(ht)!==Z&&(s.uniformBlockBinding(ht,Z,I.__bindingPointIndex),a.set(ht,Z))}function he(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),l={},G=null,st={},h={},d=new WeakMap,u=[],f=null,p=!1,_=null,m=null,g=null,x=null,v=null,M=null,C=null,R=new Tt(0,0,0),T=0,L=!1,V=null,y=null,w=null,F=null,B=null,Ht.set(0,0,s.canvas.width,s.canvas.height),Jt.set(0,0,s.canvas.width,s.canvas.height),i.reset(),r.reset(),o.reset()}return{buffers:{color:i,depth:r,stencil:o},enable:xt,disable:ft,bindFramebuffer:Ut,drawBuffers:Rt,useProgram:Wt,setBlending:P,setMaterial:en,setFlipSided:Gt,setCullFace:qt,setLineWidth:Pt,setPolygonOffset:de,setScissorTest:Nt,activeTexture:A,bindTexture:b,unbindTexture:k,compressedTexImage2D:q,compressedTexImage3D:J,texImage2D:gt,texImage3D:Lt,updateUBOMapping:Vt,uniformBlockBinding:kt,texStorage2D:Kt,texStorage3D:tt,texSubImage2D:Y,texSubImage3D:bt,compressedTexSubImage2D:ot,compressedTexSubImage3D:pt,scissor:It,viewport:_t,reset:he}}function Rh(s,t,e,n){const i=mv(n);switch(e){case Wu:return s*t;case ju:return s*t;case $u:return s*t*2;case Jc:return s*t/i.components*i.byteLength;case Qc:return s*t/i.components*i.byteLength;case Yu:return s*t*2/i.components*i.byteLength;case tl:return s*t*2/i.components*i.byteLength;case Xu:return s*t*3/i.components*i.byteLength;case pn:return s*t*4/i.components*i.byteLength;case el:return s*t*4/i.components*i.byteLength;case uo:case fo:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case po:case mo:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case rc:case ac:return Math.max(s,16)*Math.max(t,8)/4;case sc:case oc:return Math.max(s,8)*Math.max(t,8)/2;case cc:case lc:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case hc:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case uc:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case dc:return Math.floor((s+4)/5)*Math.floor((t+3)/4)*16;case fc:return Math.floor((s+4)/5)*Math.floor((t+4)/5)*16;case pc:return Math.floor((s+5)/6)*Math.floor((t+4)/5)*16;case mc:return Math.floor((s+5)/6)*Math.floor((t+5)/6)*16;case gc:return Math.floor((s+7)/8)*Math.floor((t+4)/5)*16;case _c:return Math.floor((s+7)/8)*Math.floor((t+5)/6)*16;case vc:return Math.floor((s+7)/8)*Math.floor((t+7)/8)*16;case yc:return Math.floor((s+9)/10)*Math.floor((t+4)/5)*16;case xc:return Math.floor((s+9)/10)*Math.floor((t+5)/6)*16;case Mc:return Math.floor((s+9)/10)*Math.floor((t+7)/8)*16;case bc:return Math.floor((s+9)/10)*Math.floor((t+9)/10)*16;case Sc:return Math.floor((s+11)/12)*Math.floor((t+9)/10)*16;case wc:return Math.floor((s+11)/12)*Math.floor((t+11)/12)*16;case go:case Ec:case Tc:return Math.ceil(s/4)*Math.ceil(t/4)*16;case qu:case Ac:return Math.ceil(s/4)*Math.ceil(t/4)*8;case Rc:case Cc:return Math.ceil(s/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function mv(s){switch(s){case qn:case Hu:return{byteLength:1,components:1};case ur:case Gu:case xr:return{byteLength:2,components:1};case Kc:case Zc:return{byteLength:2,components:4};case ki:case qc:case bn:return{byteLength:4,components:1};case Vu:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${s}.`)}function gv(s,t,e,n,i,r,o){const a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new it,h=new WeakMap;let d;const u=new WeakMap;let f=!1;try{f=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function p(A,b){return f?new OffscreenCanvas(A,b):pr("canvas")}function _(A,b,k){let q=1;const J=Nt(A);if((J.width>k||J.height>k)&&(q=k/Math.max(J.width,J.height)),q<1)if(typeof HTMLImageElement<"u"&&A instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&A instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&A instanceof ImageBitmap||typeof VideoFrame<"u"&&A instanceof VideoFrame){const Y=Math.floor(q*J.width),bt=Math.floor(q*J.height);d===void 0&&(d=p(Y,bt));const ot=b?p(Y,bt):d;return ot.width=Y,ot.height=bt,ot.getContext("2d").drawImage(A,0,0,Y,bt),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+J.width+"x"+J.height+") to ("+Y+"x"+bt+")."),ot}else return"data"in A&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+J.width+"x"+J.height+")."),A;return A}function m(A){return A.generateMipmaps&&A.minFilter!==qe&&A.minFilter!==cn}function g(A){s.generateMipmap(A)}function x(A,b,k,q,J=!1){if(A!==null){if(s[A]!==void 0)return s[A];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+A+"'")}let Y=b;if(b===s.RED&&(k===s.FLOAT&&(Y=s.R32F),k===s.HALF_FLOAT&&(Y=s.R16F),k===s.UNSIGNED_BYTE&&(Y=s.R8)),b===s.RED_INTEGER&&(k===s.UNSIGNED_BYTE&&(Y=s.R8UI),k===s.UNSIGNED_SHORT&&(Y=s.R16UI),k===s.UNSIGNED_INT&&(Y=s.R32UI),k===s.BYTE&&(Y=s.R8I),k===s.SHORT&&(Y=s.R16I),k===s.INT&&(Y=s.R32I)),b===s.RG&&(k===s.FLOAT&&(Y=s.RG32F),k===s.HALF_FLOAT&&(Y=s.RG16F),k===s.UNSIGNED_BYTE&&(Y=s.RG8)),b===s.RG_INTEGER&&(k===s.UNSIGNED_BYTE&&(Y=s.RG8UI),k===s.UNSIGNED_SHORT&&(Y=s.RG16UI),k===s.UNSIGNED_INT&&(Y=s.RG32UI),k===s.BYTE&&(Y=s.RG8I),k===s.SHORT&&(Y=s.RG16I),k===s.INT&&(Y=s.RG32I)),b===s.RGB_INTEGER&&(k===s.UNSIGNED_BYTE&&(Y=s.RGB8UI),k===s.UNSIGNED_SHORT&&(Y=s.RGB16UI),k===s.UNSIGNED_INT&&(Y=s.RGB32UI),k===s.BYTE&&(Y=s.RGB8I),k===s.SHORT&&(Y=s.RGB16I),k===s.INT&&(Y=s.RGB32I)),b===s.RGBA_INTEGER&&(k===s.UNSIGNED_BYTE&&(Y=s.RGBA8UI),k===s.UNSIGNED_SHORT&&(Y=s.RGBA16UI),k===s.UNSIGNED_INT&&(Y=s.RGBA32UI),k===s.BYTE&&(Y=s.RGBA8I),k===s.SHORT&&(Y=s.RGBA16I),k===s.INT&&(Y=s.RGBA32I)),b===s.RGB&&k===s.UNSIGNED_INT_5_9_9_9_REV&&(Y=s.RGB9_E5),b===s.RGBA){const bt=J?To:Zt.getTransfer(q);k===s.FLOAT&&(Y=s.RGBA32F),k===s.HALF_FLOAT&&(Y=s.RGBA16F),k===s.UNSIGNED_BYTE&&(Y=bt===me?s.SRGB8_ALPHA8:s.RGBA8),k===s.UNSIGNED_SHORT_4_4_4_4&&(Y=s.RGBA4),k===s.UNSIGNED_SHORT_5_5_5_1&&(Y=s.RGB5_A1)}return(Y===s.R16F||Y===s.R32F||Y===s.RG16F||Y===s.RG32F||Y===s.RGBA16F||Y===s.RGBA32F)&&t.get("EXT_color_buffer_float"),Y}function v(A,b){let k;return A?b===null||b===ki||b===bs?k=s.DEPTH24_STENCIL8:b===bn?k=s.DEPTH32F_STENCIL8:b===ur&&(k=s.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===ki||b===bs?k=s.DEPTH_COMPONENT24:b===bn?k=s.DEPTH_COMPONENT32F:b===ur&&(k=s.DEPTH_COMPONENT16),k}function M(A,b){return m(A)===!0||A.isFramebufferTexture&&A.minFilter!==qe&&A.minFilter!==cn?Math.log2(Math.max(b.width,b.height))+1:A.mipmaps!==void 0&&A.mipmaps.length>0?A.mipmaps.length:A.isCompressedTexture&&Array.isArray(A.image)?b.mipmaps.length:1}function C(A){const b=A.target;b.removeEventListener("dispose",C),T(b),b.isVideoTexture&&h.delete(b)}function R(A){const b=A.target;b.removeEventListener("dispose",R),V(b)}function T(A){const b=n.get(A);if(b.__webglInit===void 0)return;const k=A.source,q=u.get(k);if(q){const J=q[b.__cacheKey];J.usedTimes--,J.usedTimes===0&&L(A),Object.keys(q).length===0&&u.delete(k)}n.remove(A)}function L(A){const b=n.get(A);s.deleteTexture(b.__webglTexture);const k=A.source,q=u.get(k);delete q[b.__cacheKey],o.memory.textures--}function V(A){const b=n.get(A);if(A.depthTexture&&A.depthTexture.dispose(),A.isWebGLCubeRenderTarget)for(let q=0;q<6;q++){if(Array.isArray(b.__webglFramebuffer[q]))for(let J=0;J<b.__webglFramebuffer[q].length;J++)s.deleteFramebuffer(b.__webglFramebuffer[q][J]);else s.deleteFramebuffer(b.__webglFramebuffer[q]);b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer[q])}else{if(Array.isArray(b.__webglFramebuffer))for(let q=0;q<b.__webglFramebuffer.length;q++)s.deleteFramebuffer(b.__webglFramebuffer[q]);else s.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&s.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let q=0;q<b.__webglColorRenderbuffer.length;q++)b.__webglColorRenderbuffer[q]&&s.deleteRenderbuffer(b.__webglColorRenderbuffer[q]);b.__webglDepthRenderbuffer&&s.deleteRenderbuffer(b.__webglDepthRenderbuffer)}const k=A.textures;for(let q=0,J=k.length;q<J;q++){const Y=n.get(k[q]);Y.__webglTexture&&(s.deleteTexture(Y.__webglTexture),o.memory.textures--),n.remove(k[q])}n.remove(A)}let y=0;function w(){y=0}function F(){const A=y;return A>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+A+" texture units while this GPU supports only "+i.maxTextures),y+=1,A}function B(A){const b=[];return b.push(A.wrapS),b.push(A.wrapT),b.push(A.wrapR||0),b.push(A.magFilter),b.push(A.minFilter),b.push(A.anisotropy),b.push(A.internalFormat),b.push(A.format),b.push(A.type),b.push(A.generateMipmaps),b.push(A.premultiplyAlpha),b.push(A.flipY),b.push(A.unpackAlignment),b.push(A.colorSpace),b.join()}function W(A,b){const k=n.get(A);if(A.isVideoTexture&&Pt(A),A.isRenderTargetTexture===!1&&A.version>0&&k.__version!==A.version){const q=A.image;if(q===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(q.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{Jt(k,A,b);return}}e.bindTexture(s.TEXTURE_2D,k.__webglTexture,s.TEXTURE0+b)}function j(A,b){const k=n.get(A);if(A.version>0&&k.__version!==A.version){Jt(k,A,b);return}e.bindTexture(s.TEXTURE_2D_ARRAY,k.__webglTexture,s.TEXTURE0+b)}function H(A,b){const k=n.get(A);if(A.version>0&&k.__version!==A.version){Jt(k,A,b);return}e.bindTexture(s.TEXTURE_3D,k.__webglTexture,s.TEXTURE0+b)}function K(A,b){const k=n.get(A);if(A.version>0&&k.__version!==A.version){$(k,A,b);return}e.bindTexture(s.TEXTURE_CUBE_MAP,k.__webglTexture,s.TEXTURE0+b)}const G={[Ui]:s.REPEAT,[hi]:s.CLAMP_TO_EDGE,[Eo]:s.MIRRORED_REPEAT},st={[qe]:s.NEAREST,[Bu]:s.NEAREST_MIPMAP_NEAREST,[Js]:s.NEAREST_MIPMAP_LINEAR,[cn]:s.LINEAR,[ho]:s.LINEAR_MIPMAP_NEAREST,[jn]:s.LINEAR_MIPMAP_LINEAR},at={[Xf]:s.NEVER,[Zf]:s.ALWAYS,[jf]:s.LESS,[Ju]:s.LEQUAL,[$f]:s.EQUAL,[Kf]:s.GEQUAL,[Yf]:s.GREATER,[qf]:s.NOTEQUAL};function mt(A,b){if(b.type===bn&&t.has("OES_texture_float_linear")===!1&&(b.magFilter===cn||b.magFilter===ho||b.magFilter===Js||b.magFilter===jn||b.minFilter===cn||b.minFilter===ho||b.minFilter===Js||b.minFilter===jn)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(A,s.TEXTURE_WRAP_S,G[b.wrapS]),s.texParameteri(A,s.TEXTURE_WRAP_T,G[b.wrapT]),(A===s.TEXTURE_3D||A===s.TEXTURE_2D_ARRAY)&&s.texParameteri(A,s.TEXTURE_WRAP_R,G[b.wrapR]),s.texParameteri(A,s.TEXTURE_MAG_FILTER,st[b.magFilter]),s.texParameteri(A,s.TEXTURE_MIN_FILTER,st[b.minFilter]),b.compareFunction&&(s.texParameteri(A,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(A,s.TEXTURE_COMPARE_FUNC,at[b.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===qe||b.minFilter!==Js&&b.minFilter!==jn||b.type===bn&&t.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){const k=t.get("EXT_texture_filter_anisotropic");s.texParameterf(A,k.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,i.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function Ht(A,b){let k=!1;A.__webglInit===void 0&&(A.__webglInit=!0,b.addEventListener("dispose",C));const q=b.source;let J=u.get(q);J===void 0&&(J={},u.set(q,J));const Y=B(b);if(Y!==A.__cacheKey){J[Y]===void 0&&(J[Y]={texture:s.createTexture(),usedTimes:0},o.memory.textures++,k=!0),J[Y].usedTimes++;const bt=J[A.__cacheKey];bt!==void 0&&(J[A.__cacheKey].usedTimes--,bt.usedTimes===0&&L(b)),A.__cacheKey=Y,A.__webglTexture=J[Y].texture}return k}function Jt(A,b,k){let q=s.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(q=s.TEXTURE_2D_ARRAY),b.isData3DTexture&&(q=s.TEXTURE_3D);const J=Ht(A,b),Y=b.source;e.bindTexture(q,A.__webglTexture,s.TEXTURE0+k);const bt=n.get(Y);if(Y.version!==bt.__version||J===!0){e.activeTexture(s.TEXTURE0+k);const ot=Zt.getPrimaries(Zt.workingColorSpace),pt=b.colorSpace===li?null:Zt.getPrimaries(b.colorSpace),Kt=b.colorSpace===li||ot===pt?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,Kt);let tt=_(b.image,!1,i.maxTextureSize);tt=de(b,tt);const gt=r.convert(b.format,b.colorSpace),Lt=r.convert(b.type);let It=x(b.internalFormat,gt,Lt,b.colorSpace,b.isVideoTexture);mt(q,b);let _t;const Vt=b.mipmaps,kt=b.isVideoTexture!==!0,he=bt.__version===void 0||J===!0,I=Y.dataReady,ht=M(b,tt);if(b.isDepthTexture)It=v(b.format===Ss,b.type),he&&(kt?e.texStorage2D(s.TEXTURE_2D,1,It,tt.width,tt.height):e.texImage2D(s.TEXTURE_2D,0,It,tt.width,tt.height,0,gt,Lt,null));else if(b.isDataTexture)if(Vt.length>0){kt&&he&&e.texStorage2D(s.TEXTURE_2D,ht,It,Vt[0].width,Vt[0].height);for(let X=0,Z=Vt.length;X<Z;X++)_t=Vt[X],kt?I&&e.texSubImage2D(s.TEXTURE_2D,X,0,0,_t.width,_t.height,gt,Lt,_t.data):e.texImage2D(s.TEXTURE_2D,X,It,_t.width,_t.height,0,gt,Lt,_t.data);b.generateMipmaps=!1}else kt?(he&&e.texStorage2D(s.TEXTURE_2D,ht,It,tt.width,tt.height),I&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,tt.width,tt.height,gt,Lt,tt.data)):e.texImage2D(s.TEXTURE_2D,0,It,tt.width,tt.height,0,gt,Lt,tt.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){kt&&he&&e.texStorage3D(s.TEXTURE_2D_ARRAY,ht,It,Vt[0].width,Vt[0].height,tt.depth);for(let X=0,Z=Vt.length;X<Z;X++)if(_t=Vt[X],b.format!==pn)if(gt!==null)if(kt){if(I)if(b.layerUpdates.size>0){const ct=Rh(_t.width,_t.height,b.format,b.type);for(const ut of b.layerUpdates){const jt=_t.data.subarray(ut*ct/_t.data.BYTES_PER_ELEMENT,(ut+1)*ct/_t.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,X,0,0,ut,_t.width,_t.height,1,gt,jt,0,0)}b.clearLayerUpdates()}else e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,X,0,0,0,_t.width,_t.height,tt.depth,gt,_t.data,0,0)}else e.compressedTexImage3D(s.TEXTURE_2D_ARRAY,X,It,_t.width,_t.height,tt.depth,0,_t.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else kt?I&&e.texSubImage3D(s.TEXTURE_2D_ARRAY,X,0,0,0,_t.width,_t.height,tt.depth,gt,Lt,_t.data):e.texImage3D(s.TEXTURE_2D_ARRAY,X,It,_t.width,_t.height,tt.depth,0,gt,Lt,_t.data)}else{kt&&he&&e.texStorage2D(s.TEXTURE_2D,ht,It,Vt[0].width,Vt[0].height);for(let X=0,Z=Vt.length;X<Z;X++)_t=Vt[X],b.format!==pn?gt!==null?kt?I&&e.compressedTexSubImage2D(s.TEXTURE_2D,X,0,0,_t.width,_t.height,gt,_t.data):e.compressedTexImage2D(s.TEXTURE_2D,X,It,_t.width,_t.height,0,_t.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):kt?I&&e.texSubImage2D(s.TEXTURE_2D,X,0,0,_t.width,_t.height,gt,Lt,_t.data):e.texImage2D(s.TEXTURE_2D,X,It,_t.width,_t.height,0,gt,Lt,_t.data)}else if(b.isDataArrayTexture)if(kt){if(he&&e.texStorage3D(s.TEXTURE_2D_ARRAY,ht,It,tt.width,tt.height,tt.depth),I)if(b.layerUpdates.size>0){const X=Rh(tt.width,tt.height,b.format,b.type);for(const Z of b.layerUpdates){const ct=tt.data.subarray(Z*X/tt.data.BYTES_PER_ELEMENT,(Z+1)*X/tt.data.BYTES_PER_ELEMENT);e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,Z,tt.width,tt.height,1,gt,Lt,ct)}b.clearLayerUpdates()}else e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,tt.width,tt.height,tt.depth,gt,Lt,tt.data)}else e.texImage3D(s.TEXTURE_2D_ARRAY,0,It,tt.width,tt.height,tt.depth,0,gt,Lt,tt.data);else if(b.isData3DTexture)kt?(he&&e.texStorage3D(s.TEXTURE_3D,ht,It,tt.width,tt.height,tt.depth),I&&e.texSubImage3D(s.TEXTURE_3D,0,0,0,0,tt.width,tt.height,tt.depth,gt,Lt,tt.data)):e.texImage3D(s.TEXTURE_3D,0,It,tt.width,tt.height,tt.depth,0,gt,Lt,tt.data);else if(b.isFramebufferTexture){if(he)if(kt)e.texStorage2D(s.TEXTURE_2D,ht,It,tt.width,tt.height);else{let X=tt.width,Z=tt.height;for(let ct=0;ct<ht;ct++)e.texImage2D(s.TEXTURE_2D,ct,It,X,Z,0,gt,Lt,null),X>>=1,Z>>=1}}else if(Vt.length>0){if(kt&&he){const X=Nt(Vt[0]);e.texStorage2D(s.TEXTURE_2D,ht,It,X.width,X.height)}for(let X=0,Z=Vt.length;X<Z;X++)_t=Vt[X],kt?I&&e.texSubImage2D(s.TEXTURE_2D,X,0,0,gt,Lt,_t):e.texImage2D(s.TEXTURE_2D,X,It,gt,Lt,_t);b.generateMipmaps=!1}else if(kt){if(he){const X=Nt(tt);e.texStorage2D(s.TEXTURE_2D,ht,It,X.width,X.height)}I&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,gt,Lt,tt)}else e.texImage2D(s.TEXTURE_2D,0,It,gt,Lt,tt);m(b)&&g(q),bt.__version=Y.version,b.onUpdate&&b.onUpdate(b)}A.__version=b.version}function $(A,b,k){if(b.image.length!==6)return;const q=Ht(A,b),J=b.source;e.bindTexture(s.TEXTURE_CUBE_MAP,A.__webglTexture,s.TEXTURE0+k);const Y=n.get(J);if(J.version!==Y.__version||q===!0){e.activeTexture(s.TEXTURE0+k);const bt=Zt.getPrimaries(Zt.workingColorSpace),ot=b.colorSpace===li?null:Zt.getPrimaries(b.colorSpace),pt=b.colorSpace===li||bt===ot?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,pt);const Kt=b.isCompressedTexture||b.image[0].isCompressedTexture,tt=b.image[0]&&b.image[0].isDataTexture,gt=[];for(let Z=0;Z<6;Z++)!Kt&&!tt?gt[Z]=_(b.image[Z],!0,i.maxCubemapSize):gt[Z]=tt?b.image[Z].image:b.image[Z],gt[Z]=de(b,gt[Z]);const Lt=gt[0],It=r.convert(b.format,b.colorSpace),_t=r.convert(b.type),Vt=x(b.internalFormat,It,_t,b.colorSpace),kt=b.isVideoTexture!==!0,he=Y.__version===void 0||q===!0,I=J.dataReady;let ht=M(b,Lt);mt(s.TEXTURE_CUBE_MAP,b);let X;if(Kt){kt&&he&&e.texStorage2D(s.TEXTURE_CUBE_MAP,ht,Vt,Lt.width,Lt.height);for(let Z=0;Z<6;Z++){X=gt[Z].mipmaps;for(let ct=0;ct<X.length;ct++){const ut=X[ct];b.format!==pn?It!==null?kt?I&&e.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct,0,0,ut.width,ut.height,It,ut.data):e.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct,Vt,ut.width,ut.height,0,ut.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):kt?I&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct,0,0,ut.width,ut.height,It,_t,ut.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct,Vt,ut.width,ut.height,0,It,_t,ut.data)}}}else{if(X=b.mipmaps,kt&&he){X.length>0&&ht++;const Z=Nt(gt[0]);e.texStorage2D(s.TEXTURE_CUBE_MAP,ht,Vt,Z.width,Z.height)}for(let Z=0;Z<6;Z++)if(tt){kt?I&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,0,0,gt[Z].width,gt[Z].height,It,_t,gt[Z].data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,Vt,gt[Z].width,gt[Z].height,0,It,_t,gt[Z].data);for(let ct=0;ct<X.length;ct++){const jt=X[ct].image[Z].image;kt?I&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct+1,0,0,jt.width,jt.height,It,_t,jt.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct+1,Vt,jt.width,jt.height,0,It,_t,jt.data)}}else{kt?I&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,0,0,It,_t,gt[Z]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,Vt,It,_t,gt[Z]);for(let ct=0;ct<X.length;ct++){const ut=X[ct];kt?I&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct+1,0,0,It,_t,ut.image[Z]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,ct+1,Vt,It,_t,ut.image[Z])}}}m(b)&&g(s.TEXTURE_CUBE_MAP),Y.__version=J.version,b.onUpdate&&b.onUpdate(b)}A.__version=b.version}function Q(A,b,k,q,J,Y){const bt=r.convert(k.format,k.colorSpace),ot=r.convert(k.type),pt=x(k.internalFormat,bt,ot,k.colorSpace);if(!n.get(b).__hasExternalTextures){const tt=Math.max(1,b.width>>Y),gt=Math.max(1,b.height>>Y);J===s.TEXTURE_3D||J===s.TEXTURE_2D_ARRAY?e.texImage3D(J,Y,pt,tt,gt,b.depth,0,bt,ot,null):e.texImage2D(J,Y,pt,tt,gt,0,bt,ot,null)}e.bindFramebuffer(s.FRAMEBUFFER,A),qt(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,q,J,n.get(k).__webglTexture,0,Gt(b)):(J===s.TEXTURE_2D||J>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&J<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,q,J,n.get(k).__webglTexture,Y),e.bindFramebuffer(s.FRAMEBUFFER,null)}function xt(A,b,k){if(s.bindRenderbuffer(s.RENDERBUFFER,A),b.depthBuffer){const q=b.depthTexture,J=q&&q.isDepthTexture?q.type:null,Y=v(b.stencilBuffer,J),bt=b.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,ot=Gt(b);qt(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,ot,Y,b.width,b.height):k?s.renderbufferStorageMultisample(s.RENDERBUFFER,ot,Y,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,Y,b.width,b.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,bt,s.RENDERBUFFER,A)}else{const q=b.textures;for(let J=0;J<q.length;J++){const Y=q[J],bt=r.convert(Y.format,Y.colorSpace),ot=r.convert(Y.type),pt=x(Y.internalFormat,bt,ot,Y.colorSpace),Kt=Gt(b);k&&qt(b)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,Kt,pt,b.width,b.height):qt(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Kt,pt,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,pt,b.width,b.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function ft(A,b){if(b&&b.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(s.FRAMEBUFFER,A),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");(!n.get(b.depthTexture).__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),W(b.depthTexture,0);const q=n.get(b.depthTexture).__webglTexture,J=Gt(b);if(b.depthTexture.format===us)qt(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,q,0,J):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,q,0);else if(b.depthTexture.format===Ss)qt(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,q,0,J):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,q,0);else throw new Error("Unknown depthTexture format")}function Ut(A){const b=n.get(A),k=A.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==A.depthTexture){const q=A.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),q){const J=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,q.removeEventListener("dispose",J)};q.addEventListener("dispose",J),b.__depthDisposeCallback=J}b.__boundDepthTexture=q}if(A.depthTexture&&!b.__autoAllocateDepthBuffer){if(k)throw new Error("target.depthTexture not supported in Cube render targets");ft(b.__webglFramebuffer,A)}else if(k){b.__webglDepthbuffer=[];for(let q=0;q<6;q++)if(e.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer[q]),b.__webglDepthbuffer[q]===void 0)b.__webglDepthbuffer[q]=s.createRenderbuffer(),xt(b.__webglDepthbuffer[q],A,!1);else{const J=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,Y=b.__webglDepthbuffer[q];s.bindRenderbuffer(s.RENDERBUFFER,Y),s.framebufferRenderbuffer(s.FRAMEBUFFER,J,s.RENDERBUFFER,Y)}}else if(e.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=s.createRenderbuffer(),xt(b.__webglDepthbuffer,A,!1);else{const q=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,J=b.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,J),s.framebufferRenderbuffer(s.FRAMEBUFFER,q,s.RENDERBUFFER,J)}e.bindFramebuffer(s.FRAMEBUFFER,null)}function Rt(A,b,k){const q=n.get(A);b!==void 0&&Q(q.__webglFramebuffer,A,A.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),k!==void 0&&Ut(A)}function Wt(A){const b=A.texture,k=n.get(A),q=n.get(b);A.addEventListener("dispose",R);const J=A.textures,Y=A.isWebGLCubeRenderTarget===!0,bt=J.length>1;if(bt||(q.__webglTexture===void 0&&(q.__webglTexture=s.createTexture()),q.__version=b.version,o.memory.textures++),Y){k.__webglFramebuffer=[];for(let ot=0;ot<6;ot++)if(b.mipmaps&&b.mipmaps.length>0){k.__webglFramebuffer[ot]=[];for(let pt=0;pt<b.mipmaps.length;pt++)k.__webglFramebuffer[ot][pt]=s.createFramebuffer()}else k.__webglFramebuffer[ot]=s.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){k.__webglFramebuffer=[];for(let ot=0;ot<b.mipmaps.length;ot++)k.__webglFramebuffer[ot]=s.createFramebuffer()}else k.__webglFramebuffer=s.createFramebuffer();if(bt)for(let ot=0,pt=J.length;ot<pt;ot++){const Kt=n.get(J[ot]);Kt.__webglTexture===void 0&&(Kt.__webglTexture=s.createTexture(),o.memory.textures++)}if(A.samples>0&&qt(A)===!1){k.__webglMultisampledFramebuffer=s.createFramebuffer(),k.__webglColorRenderbuffer=[],e.bindFramebuffer(s.FRAMEBUFFER,k.__webglMultisampledFramebuffer);for(let ot=0;ot<J.length;ot++){const pt=J[ot];k.__webglColorRenderbuffer[ot]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,k.__webglColorRenderbuffer[ot]);const Kt=r.convert(pt.format,pt.colorSpace),tt=r.convert(pt.type),gt=x(pt.internalFormat,Kt,tt,pt.colorSpace,A.isXRRenderTarget===!0),Lt=Gt(A);s.renderbufferStorageMultisample(s.RENDERBUFFER,Lt,gt,A.width,A.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ot,s.RENDERBUFFER,k.__webglColorRenderbuffer[ot])}s.bindRenderbuffer(s.RENDERBUFFER,null),A.depthBuffer&&(k.__webglDepthRenderbuffer=s.createRenderbuffer(),xt(k.__webglDepthRenderbuffer,A,!0)),e.bindFramebuffer(s.FRAMEBUFFER,null)}}if(Y){e.bindTexture(s.TEXTURE_CUBE_MAP,q.__webglTexture),mt(s.TEXTURE_CUBE_MAP,b);for(let ot=0;ot<6;ot++)if(b.mipmaps&&b.mipmaps.length>0)for(let pt=0;pt<b.mipmaps.length;pt++)Q(k.__webglFramebuffer[ot][pt],A,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+ot,pt);else Q(k.__webglFramebuffer[ot],A,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+ot,0);m(b)&&g(s.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(bt){for(let ot=0,pt=J.length;ot<pt;ot++){const Kt=J[ot],tt=n.get(Kt);e.bindTexture(s.TEXTURE_2D,tt.__webglTexture),mt(s.TEXTURE_2D,Kt),Q(k.__webglFramebuffer,A,Kt,s.COLOR_ATTACHMENT0+ot,s.TEXTURE_2D,0),m(Kt)&&g(s.TEXTURE_2D)}e.unbindTexture()}else{let ot=s.TEXTURE_2D;if((A.isWebGL3DRenderTarget||A.isWebGLArrayRenderTarget)&&(ot=A.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(ot,q.__webglTexture),mt(ot,b),b.mipmaps&&b.mipmaps.length>0)for(let pt=0;pt<b.mipmaps.length;pt++)Q(k.__webglFramebuffer[pt],A,b,s.COLOR_ATTACHMENT0,ot,pt);else Q(k.__webglFramebuffer,A,b,s.COLOR_ATTACHMENT0,ot,0);m(b)&&g(ot),e.unbindTexture()}A.depthBuffer&&Ut(A)}function oe(A){const b=A.textures;for(let k=0,q=b.length;k<q;k++){const J=b[k];if(m(J)){const Y=A.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:s.TEXTURE_2D,bt=n.get(J).__webglTexture;e.bindTexture(Y,bt),g(Y),e.unbindTexture()}}}const Xt=[],P=[];function en(A){if(A.samples>0){if(qt(A)===!1){const b=A.textures,k=A.width,q=A.height;let J=s.COLOR_BUFFER_BIT;const Y=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,bt=n.get(A),ot=b.length>1;if(ot)for(let pt=0;pt<b.length;pt++)e.bindFramebuffer(s.FRAMEBUFFER,bt.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+pt,s.RENDERBUFFER,null),e.bindFramebuffer(s.FRAMEBUFFER,bt.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+pt,s.TEXTURE_2D,null,0);e.bindFramebuffer(s.READ_FRAMEBUFFER,bt.__webglMultisampledFramebuffer),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,bt.__webglFramebuffer);for(let pt=0;pt<b.length;pt++){if(A.resolveDepthBuffer&&(A.depthBuffer&&(J|=s.DEPTH_BUFFER_BIT),A.stencilBuffer&&A.resolveStencilBuffer&&(J|=s.STENCIL_BUFFER_BIT)),ot){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,bt.__webglColorRenderbuffer[pt]);const Kt=n.get(b[pt]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,Kt,0)}s.blitFramebuffer(0,0,k,q,0,0,k,q,J,s.NEAREST),c===!0&&(Xt.length=0,P.length=0,Xt.push(s.COLOR_ATTACHMENT0+pt),A.depthBuffer&&A.resolveDepthBuffer===!1&&(Xt.push(Y),P.push(Y),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,P)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,Xt))}if(e.bindFramebuffer(s.READ_FRAMEBUFFER,null),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),ot)for(let pt=0;pt<b.length;pt++){e.bindFramebuffer(s.FRAMEBUFFER,bt.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+pt,s.RENDERBUFFER,bt.__webglColorRenderbuffer[pt]);const Kt=n.get(b[pt]).__webglTexture;e.bindFramebuffer(s.FRAMEBUFFER,bt.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+pt,s.TEXTURE_2D,Kt,0)}e.bindFramebuffer(s.DRAW_FRAMEBUFFER,bt.__webglMultisampledFramebuffer)}else if(A.depthBuffer&&A.resolveDepthBuffer===!1&&c){const b=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[b])}}}function Gt(A){return Math.min(i.maxSamples,A.samples)}function qt(A){const b=n.get(A);return A.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function Pt(A){const b=o.render.frame;h.get(A)!==b&&(h.set(A,b),A.update())}function de(A,b){const k=A.colorSpace,q=A.format,J=A.type;return A.isCompressedTexture===!0||A.isVideoTexture===!0||k!==Fe&&k!==li&&(Zt.getTransfer(k)===me?(q!==pn||J!==qn)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",k)),b}function Nt(A){return typeof HTMLImageElement<"u"&&A instanceof HTMLImageElement?(l.width=A.naturalWidth||A.width,l.height=A.naturalHeight||A.height):typeof VideoFrame<"u"&&A instanceof VideoFrame?(l.width=A.displayWidth,l.height=A.displayHeight):(l.width=A.width,l.height=A.height),l}this.allocateTextureUnit=F,this.resetTextureUnits=w,this.setTexture2D=W,this.setTexture2DArray=j,this.setTexture3D=H,this.setTextureCube=K,this.rebindTextures=Rt,this.setupRenderTarget=Wt,this.updateRenderTargetMipmap=oe,this.updateMultisampleRenderTarget=en,this.setupDepthRenderbuffer=Ut,this.setupFrameBufferTexture=Q,this.useMultisampledRTT=qt}function _v(s,t){function e(n,i=li){let r;const o=Zt.getTransfer(i);if(n===qn)return s.UNSIGNED_BYTE;if(n===Kc)return s.UNSIGNED_SHORT_4_4_4_4;if(n===Zc)return s.UNSIGNED_SHORT_5_5_5_1;if(n===Vu)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===Hu)return s.BYTE;if(n===Gu)return s.SHORT;if(n===ur)return s.UNSIGNED_SHORT;if(n===qc)return s.INT;if(n===ki)return s.UNSIGNED_INT;if(n===bn)return s.FLOAT;if(n===xr)return s.HALF_FLOAT;if(n===Wu)return s.ALPHA;if(n===Xu)return s.RGB;if(n===pn)return s.RGBA;if(n===ju)return s.LUMINANCE;if(n===$u)return s.LUMINANCE_ALPHA;if(n===us)return s.DEPTH_COMPONENT;if(n===Ss)return s.DEPTH_STENCIL;if(n===Jc)return s.RED;if(n===Qc)return s.RED_INTEGER;if(n===Yu)return s.RG;if(n===tl)return s.RG_INTEGER;if(n===el)return s.RGBA_INTEGER;if(n===uo||n===fo||n===po||n===mo)if(o===me)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===uo)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===fo)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===po)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===mo)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===uo)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===fo)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===po)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===mo)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===sc||n===rc||n===oc||n===ac)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===sc)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===rc)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===oc)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===ac)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===cc||n===lc||n===hc)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===cc||n===lc)return o===me?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===hc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===uc||n===dc||n===fc||n===pc||n===mc||n===gc||n===_c||n===vc||n===yc||n===xc||n===Mc||n===bc||n===Sc||n===wc)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===uc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===dc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===fc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===pc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===mc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===gc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===_c)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===vc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===yc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===xc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Mc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===bc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Sc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===wc)return o===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===go||n===Ec||n===Tc)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===go)return o===me?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Ec)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Tc)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===qu||n===Ac||n===Rc||n===Cc)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===go)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Ac)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===Rc)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===Cc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===bs?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:e}}class vv extends Oe{constructor(t=[]){super(),this.isArrayCamera=!0,this.cameras=t}}class ue extends le{constructor(){super(),this.isGroup=!0,this.type="Group"}}const yv={type:"move"};class Sa{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new ue,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new ue,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new E,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new E),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new ue,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new E,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new E),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){const e=this._hand;if(e)for(const n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,r=null,o=null;const a=this._targetRay,c=this._grip,l=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(l&&t.hand){o=!0;for(const _ of t.hand.values()){const m=e.getJointPose(_,n),g=this._getHandJoint(l,_);m!==null&&(g.matrix.fromArray(m.transform.matrix),g.matrix.decompose(g.position,g.rotation,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=m.radius),g.visible=m!==null}const h=l.joints["index-finger-tip"],d=l.joints["thumb-tip"],u=h.position.distanceTo(d.position),f=.02,p=.005;l.inputState.pinching&&u>f+p?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!l.inputState.pinching&&u<=f-p&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else c!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));a!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(a.matrix.fromArray(i.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,i.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(i.linearVelocity)):a.hasLinearVelocity=!1,i.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(i.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(yv)))}return a!==null&&(a.visible=i!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){const n=new ue;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}}const xv=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Mv=`
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

}`;class bv{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e,n){if(this.texture===null){const i=new De,r=t.properties.get(i);r.__webglTexture=e.texture,(e.depthNear!=n.depthNear||e.depthFar!=n.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(t){if(this.texture!==null&&this.mesh===null){const e=t.cameras[0].viewport,n=new Kn({vertexShader:xv,fragmentShader:Mv,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new nt(new Ds(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class Sv extends zi{constructor(t,e){super();const n=this;let i=null,r=1,o=null,a="local-floor",c=1,l=null,h=null,d=null,u=null,f=null,p=null;const _=new bv,m=e.getContextAttributes();let g=null,x=null;const v=[],M=[],C=new it;let R=null;const T=new Oe;T.layers.enable(1),T.viewport=new te;const L=new Oe;L.layers.enable(2),L.viewport=new te;const V=[T,L],y=new vv;y.layers.enable(1),y.layers.enable(2);let w=null,F=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function($){let Q=v[$];return Q===void 0&&(Q=new Sa,v[$]=Q),Q.getTargetRaySpace()},this.getControllerGrip=function($){let Q=v[$];return Q===void 0&&(Q=new Sa,v[$]=Q),Q.getGripSpace()},this.getHand=function($){let Q=v[$];return Q===void 0&&(Q=new Sa,v[$]=Q),Q.getHandSpace()};function B($){const Q=M.indexOf($.inputSource);if(Q===-1)return;const xt=v[Q];xt!==void 0&&(xt.update($.inputSource,$.frame,l||o),xt.dispatchEvent({type:$.type,data:$.inputSource}))}function W(){i.removeEventListener("select",B),i.removeEventListener("selectstart",B),i.removeEventListener("selectend",B),i.removeEventListener("squeeze",B),i.removeEventListener("squeezestart",B),i.removeEventListener("squeezeend",B),i.removeEventListener("end",W),i.removeEventListener("inputsourceschange",j);for(let $=0;$<v.length;$++){const Q=M[$];Q!==null&&(M[$]=null,v[$].disconnect(Q))}w=null,F=null,_.reset(),t.setRenderTarget(g),f=null,u=null,d=null,i=null,x=null,Jt.stop(),n.isPresenting=!1,t.setPixelRatio(R),t.setSize(C.width,C.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function($){r=$,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function($){a=$,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||o},this.setReferenceSpace=function($){l=$},this.getBaseLayer=function(){return u!==null?u:f},this.getBinding=function(){return d},this.getFrame=function(){return p},this.getSession=function(){return i},this.setSession=async function($){if(i=$,i!==null){if(g=t.getRenderTarget(),i.addEventListener("select",B),i.addEventListener("selectstart",B),i.addEventListener("selectend",B),i.addEventListener("squeeze",B),i.addEventListener("squeezestart",B),i.addEventListener("squeezeend",B),i.addEventListener("end",W),i.addEventListener("inputsourceschange",j),m.xrCompatible!==!0&&await e.makeXRCompatible(),R=t.getPixelRatio(),t.getSize(C),i.renderState.layers===void 0){const Q={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};f=new XRWebGLLayer(i,e,Q),i.updateRenderState({baseLayer:f}),t.setPixelRatio(1),t.setSize(f.framebufferWidth,f.framebufferHeight,!1),x=new Oi(f.framebufferWidth,f.framebufferHeight,{format:pn,type:qn,colorSpace:t.outputColorSpace,stencilBuffer:m.stencil})}else{let Q=null,xt=null,ft=null;m.depth&&(ft=m.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,Q=m.stencil?Ss:us,xt=m.stencil?bs:ki);const Ut={colorFormat:e.RGBA8,depthFormat:ft,scaleFactor:r};d=new XRWebGLBinding(i,e),u=d.createProjectionLayer(Ut),i.updateRenderState({layers:[u]}),t.setPixelRatio(1),t.setSize(u.textureWidth,u.textureHeight,!1),x=new Oi(u.textureWidth,u.textureHeight,{format:pn,type:qn,depthTexture:new hd(u.textureWidth,u.textureHeight,xt,void 0,void 0,void 0,void 0,void 0,void 0,Q),stencilBuffer:m.stencil,colorSpace:t.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1})}x.isXRRenderTarget=!0,this.setFoveation(c),l=null,o=await i.requestReferenceSpace(a),Jt.setContext(i),Jt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function j($){for(let Q=0;Q<$.removed.length;Q++){const xt=$.removed[Q],ft=M.indexOf(xt);ft>=0&&(M[ft]=null,v[ft].disconnect(xt))}for(let Q=0;Q<$.added.length;Q++){const xt=$.added[Q];let ft=M.indexOf(xt);if(ft===-1){for(let Rt=0;Rt<v.length;Rt++)if(Rt>=M.length){M.push(xt),ft=Rt;break}else if(M[Rt]===null){M[Rt]=xt,ft=Rt;break}if(ft===-1)break}const Ut=v[ft];Ut&&Ut.connect(xt)}}const H=new E,K=new E;function G($,Q,xt){H.setFromMatrixPosition(Q.matrixWorld),K.setFromMatrixPosition(xt.matrixWorld);const ft=H.distanceTo(K),Ut=Q.projectionMatrix.elements,Rt=xt.projectionMatrix.elements,Wt=Ut[14]/(Ut[10]-1),oe=Ut[14]/(Ut[10]+1),Xt=(Ut[9]+1)/Ut[5],P=(Ut[9]-1)/Ut[5],en=(Ut[8]-1)/Ut[0],Gt=(Rt[8]+1)/Rt[0],qt=Wt*en,Pt=Wt*Gt,de=ft/(-en+Gt),Nt=de*-en;if(Q.matrixWorld.decompose($.position,$.quaternion,$.scale),$.translateX(Nt),$.translateZ(de),$.matrixWorld.compose($.position,$.quaternion,$.scale),$.matrixWorldInverse.copy($.matrixWorld).invert(),Ut[10]===-1)$.projectionMatrix.copy(Q.projectionMatrix),$.projectionMatrixInverse.copy(Q.projectionMatrixInverse);else{const A=Wt+de,b=oe+de,k=qt-Nt,q=Pt+(ft-Nt),J=Xt*oe/b*A,Y=P*oe/b*A;$.projectionMatrix.makePerspective(k,q,J,Y,A,b),$.projectionMatrixInverse.copy($.projectionMatrix).invert()}}function st($,Q){Q===null?$.matrixWorld.copy($.matrix):$.matrixWorld.multiplyMatrices(Q.matrixWorld,$.matrix),$.matrixWorldInverse.copy($.matrixWorld).invert()}this.updateCamera=function($){if(i===null)return;let Q=$.near,xt=$.far;_.texture!==null&&(_.depthNear>0&&(Q=_.depthNear),_.depthFar>0&&(xt=_.depthFar)),y.near=L.near=T.near=Q,y.far=L.far=T.far=xt,(w!==y.near||F!==y.far)&&(i.updateRenderState({depthNear:y.near,depthFar:y.far}),w=y.near,F=y.far);const ft=$.parent,Ut=y.cameras;st(y,ft);for(let Rt=0;Rt<Ut.length;Rt++)st(Ut[Rt],ft);Ut.length===2?G(y,T,L):y.projectionMatrix.copy(T.projectionMatrix),at($,y,ft)};function at($,Q,xt){xt===null?$.matrix.copy(Q.matrixWorld):($.matrix.copy(xt.matrixWorld),$.matrix.invert(),$.matrix.multiply(Q.matrixWorld)),$.matrix.decompose($.position,$.quaternion,$.scale),$.updateMatrixWorld(!0),$.projectionMatrix.copy(Q.projectionMatrix),$.projectionMatrixInverse.copy(Q.projectionMatrixInverse),$.isPerspectiveCamera&&($.fov=ws*2*Math.atan(1/$.projectionMatrix.elements[5]),$.zoom=1)}this.getCamera=function(){return y},this.getFoveation=function(){if(!(u===null&&f===null))return c},this.setFoveation=function($){c=$,u!==null&&(u.fixedFoveation=$),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=$)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(y)};let mt=null;function Ht($,Q){if(h=Q.getViewerPose(l||o),p=Q,h!==null){const xt=h.views;f!==null&&(t.setRenderTargetFramebuffer(x,f.framebuffer),t.setRenderTarget(x));let ft=!1;xt.length!==y.cameras.length&&(y.cameras.length=0,ft=!0);for(let Rt=0;Rt<xt.length;Rt++){const Wt=xt[Rt];let oe=null;if(f!==null)oe=f.getViewport(Wt);else{const P=d.getViewSubImage(u,Wt);oe=P.viewport,Rt===0&&(t.setRenderTargetTextures(x,P.colorTexture,u.ignoreDepthValues?void 0:P.depthStencilTexture),t.setRenderTarget(x))}let Xt=V[Rt];Xt===void 0&&(Xt=new Oe,Xt.layers.enable(Rt),Xt.viewport=new te,V[Rt]=Xt),Xt.matrix.fromArray(Wt.transform.matrix),Xt.matrix.decompose(Xt.position,Xt.quaternion,Xt.scale),Xt.projectionMatrix.fromArray(Wt.projectionMatrix),Xt.projectionMatrixInverse.copy(Xt.projectionMatrix).invert(),Xt.viewport.set(oe.x,oe.y,oe.width,oe.height),Rt===0&&(y.matrix.copy(Xt.matrix),y.matrix.decompose(y.position,y.quaternion,y.scale)),ft===!0&&y.cameras.push(Xt)}const Ut=i.enabledFeatures;if(Ut&&Ut.includes("depth-sensing")){const Rt=d.getDepthInformation(xt[0]);Rt&&Rt.isValid&&Rt.texture&&_.init(t,Rt,i.renderState)}}for(let xt=0;xt<v.length;xt++){const ft=M[xt],Ut=v[xt];ft!==null&&Ut!==void 0&&Ut.update(ft,Q,l||o)}mt&&mt($,Q),Q.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:Q}),p=null}const Jt=new ld;Jt.setAnimationLoop(Ht),this.setAnimationLoop=function($){mt=$},this.dispose=function(){}}}const Si=new En,wv=new Dt;function Ev(s,t){function e(m,g){m.matrixAutoUpdate===!0&&m.updateMatrix(),g.value.copy(m.matrix)}function n(m,g){g.color.getRGB(m.fogColor.value,od(s)),g.isFog?(m.fogNear.value=g.near,m.fogFar.value=g.far):g.isFogExp2&&(m.fogDensity.value=g.density)}function i(m,g,x,v,M){g.isMeshBasicMaterial||g.isMeshLambertMaterial?r(m,g):g.isMeshToonMaterial?(r(m,g),d(m,g)):g.isMeshPhongMaterial?(r(m,g),h(m,g)):g.isMeshStandardMaterial?(r(m,g),u(m,g),g.isMeshPhysicalMaterial&&f(m,g,M)):g.isMeshMatcapMaterial?(r(m,g),p(m,g)):g.isMeshDepthMaterial?r(m,g):g.isMeshDistanceMaterial?(r(m,g),_(m,g)):g.isMeshNormalMaterial?r(m,g):g.isLineBasicMaterial?(o(m,g),g.isLineDashedMaterial&&a(m,g)):g.isPointsMaterial?c(m,g,x,v):g.isSpriteMaterial?l(m,g):g.isShadowMaterial?(m.color.value.copy(g.color),m.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function r(m,g){m.opacity.value=g.opacity,g.color&&m.diffuse.value.copy(g.color),g.emissive&&m.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(m.map.value=g.map,e(g.map,m.mapTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,e(g.alphaMap,m.alphaMapTransform)),g.bumpMap&&(m.bumpMap.value=g.bumpMap,e(g.bumpMap,m.bumpMapTransform),m.bumpScale.value=g.bumpScale,g.side===Ke&&(m.bumpScale.value*=-1)),g.normalMap&&(m.normalMap.value=g.normalMap,e(g.normalMap,m.normalMapTransform),m.normalScale.value.copy(g.normalScale),g.side===Ke&&m.normalScale.value.negate()),g.displacementMap&&(m.displacementMap.value=g.displacementMap,e(g.displacementMap,m.displacementMapTransform),m.displacementScale.value=g.displacementScale,m.displacementBias.value=g.displacementBias),g.emissiveMap&&(m.emissiveMap.value=g.emissiveMap,e(g.emissiveMap,m.emissiveMapTransform)),g.specularMap&&(m.specularMap.value=g.specularMap,e(g.specularMap,m.specularMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest);const x=t.get(g),v=x.envMap,M=x.envMapRotation;v&&(m.envMap.value=v,Si.copy(M),Si.x*=-1,Si.y*=-1,Si.z*=-1,v.isCubeTexture&&v.isRenderTargetTexture===!1&&(Si.y*=-1,Si.z*=-1),m.envMapRotation.value.setFromMatrix4(wv.makeRotationFromEuler(Si)),m.flipEnvMap.value=v.isCubeTexture&&v.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=g.reflectivity,m.ior.value=g.ior,m.refractionRatio.value=g.refractionRatio),g.lightMap&&(m.lightMap.value=g.lightMap,m.lightMapIntensity.value=g.lightMapIntensity,e(g.lightMap,m.lightMapTransform)),g.aoMap&&(m.aoMap.value=g.aoMap,m.aoMapIntensity.value=g.aoMapIntensity,e(g.aoMap,m.aoMapTransform))}function o(m,g){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,g.map&&(m.map.value=g.map,e(g.map,m.mapTransform))}function a(m,g){m.dashSize.value=g.dashSize,m.totalSize.value=g.dashSize+g.gapSize,m.scale.value=g.scale}function c(m,g,x,v){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,m.size.value=g.size*x,m.scale.value=v*.5,g.map&&(m.map.value=g.map,e(g.map,m.uvTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,e(g.alphaMap,m.alphaMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest)}function l(m,g){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,m.rotation.value=g.rotation,g.map&&(m.map.value=g.map,e(g.map,m.mapTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,e(g.alphaMap,m.alphaMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest)}function h(m,g){m.specular.value.copy(g.specular),m.shininess.value=Math.max(g.shininess,1e-4)}function d(m,g){g.gradientMap&&(m.gradientMap.value=g.gradientMap)}function u(m,g){m.metalness.value=g.metalness,g.metalnessMap&&(m.metalnessMap.value=g.metalnessMap,e(g.metalnessMap,m.metalnessMapTransform)),m.roughness.value=g.roughness,g.roughnessMap&&(m.roughnessMap.value=g.roughnessMap,e(g.roughnessMap,m.roughnessMapTransform)),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)}function f(m,g,x){m.ior.value=g.ior,g.sheen>0&&(m.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),m.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(m.sheenColorMap.value=g.sheenColorMap,e(g.sheenColorMap,m.sheenColorMapTransform)),g.sheenRoughnessMap&&(m.sheenRoughnessMap.value=g.sheenRoughnessMap,e(g.sheenRoughnessMap,m.sheenRoughnessMapTransform))),g.clearcoat>0&&(m.clearcoat.value=g.clearcoat,m.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(m.clearcoatMap.value=g.clearcoatMap,e(g.clearcoatMap,m.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,e(g.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(m.clearcoatNormalMap.value=g.clearcoatNormalMap,e(g.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===Ke&&m.clearcoatNormalScale.value.negate())),g.dispersion>0&&(m.dispersion.value=g.dispersion),g.iridescence>0&&(m.iridescence.value=g.iridescence,m.iridescenceIOR.value=g.iridescenceIOR,m.iridescenceThicknessMinimum.value=g.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=g.iridescenceThicknessRange[1],g.iridescenceMap&&(m.iridescenceMap.value=g.iridescenceMap,e(g.iridescenceMap,m.iridescenceMapTransform)),g.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=g.iridescenceThicknessMap,e(g.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),g.transmission>0&&(m.transmission.value=g.transmission,m.transmissionSamplerMap.value=x.texture,m.transmissionSamplerSize.value.set(x.width,x.height),g.transmissionMap&&(m.transmissionMap.value=g.transmissionMap,e(g.transmissionMap,m.transmissionMapTransform)),m.thickness.value=g.thickness,g.thicknessMap&&(m.thicknessMap.value=g.thicknessMap,e(g.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=g.attenuationDistance,m.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(m.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(m.anisotropyMap.value=g.anisotropyMap,e(g.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=g.specularIntensity,m.specularColor.value.copy(g.specularColor),g.specularColorMap&&(m.specularColorMap.value=g.specularColorMap,e(g.specularColorMap,m.specularColorMapTransform)),g.specularIntensityMap&&(m.specularIntensityMap.value=g.specularIntensityMap,e(g.specularIntensityMap,m.specularIntensityMapTransform))}function p(m,g){g.matcap&&(m.matcap.value=g.matcap)}function _(m,g){const x=t.get(g).light;m.referencePosition.value.setFromMatrixPosition(x.matrixWorld),m.nearDistance.value=x.shadow.camera.near,m.farDistance.value=x.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function Tv(s,t,e,n){let i={},r={},o=[];const a=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function c(x,v){const M=v.program;n.uniformBlockBinding(x,M)}function l(x,v){let M=i[x.id];M===void 0&&(p(x),M=h(x),i[x.id]=M,x.addEventListener("dispose",m));const C=v.program;n.updateUBOMapping(x,C);const R=t.render.frame;r[x.id]!==R&&(u(x),r[x.id]=R)}function h(x){const v=d();x.__bindingPointIndex=v;const M=s.createBuffer(),C=x.__size,R=x.usage;return s.bindBuffer(s.UNIFORM_BUFFER,M),s.bufferData(s.UNIFORM_BUFFER,C,R),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,v,M),M}function d(){for(let x=0;x<a;x++)if(o.indexOf(x)===-1)return o.push(x),x;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(x){const v=i[x.id],M=x.uniforms,C=x.__cache;s.bindBuffer(s.UNIFORM_BUFFER,v);for(let R=0,T=M.length;R<T;R++){const L=Array.isArray(M[R])?M[R]:[M[R]];for(let V=0,y=L.length;V<y;V++){const w=L[V];if(f(w,R,V,C)===!0){const F=w.__offset,B=Array.isArray(w.value)?w.value:[w.value];let W=0;for(let j=0;j<B.length;j++){const H=B[j],K=_(H);typeof H=="number"||typeof H=="boolean"?(w.__data[0]=H,s.bufferSubData(s.UNIFORM_BUFFER,F+W,w.__data)):H.isMatrix3?(w.__data[0]=H.elements[0],w.__data[1]=H.elements[1],w.__data[2]=H.elements[2],w.__data[3]=0,w.__data[4]=H.elements[3],w.__data[5]=H.elements[4],w.__data[6]=H.elements[5],w.__data[7]=0,w.__data[8]=H.elements[6],w.__data[9]=H.elements[7],w.__data[10]=H.elements[8],w.__data[11]=0):(H.toArray(w.__data,W),W+=K.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,F,w.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function f(x,v,M,C){const R=x.value,T=v+"_"+M;if(C[T]===void 0)return typeof R=="number"||typeof R=="boolean"?C[T]=R:C[T]=R.clone(),!0;{const L=C[T];if(typeof R=="number"||typeof R=="boolean"){if(L!==R)return C[T]=R,!0}else if(L.equals(R)===!1)return L.copy(R),!0}return!1}function p(x){const v=x.uniforms;let M=0;const C=16;for(let T=0,L=v.length;T<L;T++){const V=Array.isArray(v[T])?v[T]:[v[T]];for(let y=0,w=V.length;y<w;y++){const F=V[y],B=Array.isArray(F.value)?F.value:[F.value];for(let W=0,j=B.length;W<j;W++){const H=B[W],K=_(H),G=M%C,st=G%K.boundary,at=G+st;M+=st,at!==0&&C-at<K.storage&&(M+=C-at),F.__data=new Float32Array(K.storage/Float32Array.BYTES_PER_ELEMENT),F.__offset=M,M+=K.storage}}}const R=M%C;return R>0&&(M+=C-R),x.__size=M,x.__cache={},this}function _(x){const v={boundary:0,storage:0};return typeof x=="number"||typeof x=="boolean"?(v.boundary=4,v.storage=4):x.isVector2?(v.boundary=8,v.storage=8):x.isVector3||x.isColor?(v.boundary=16,v.storage=12):x.isVector4?(v.boundary=16,v.storage=16):x.isMatrix3?(v.boundary=48,v.storage=48):x.isMatrix4?(v.boundary=64,v.storage=64):x.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",x),v}function m(x){const v=x.target;v.removeEventListener("dispose",m);const M=o.indexOf(v.__bindingPointIndex);o.splice(M,1),s.deleteBuffer(i[v.id]),delete i[v.id],delete r[v.id]}function g(){for(const x in i)s.deleteBuffer(i[x]);o=[],i={},r={}}return{bind:c,update:l,dispose:g}}class Av{constructor(t={}){const{canvas:e=pp(),context:n=null,depth:i=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1}=t;this.isWebGLRenderer=!0;let u;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");u=n.getContextAttributes().alpha}else u=o;const f=new Uint32Array(4),p=new Int32Array(4);let _=null,m=null;const g=[],x=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=ke,this.toneMapping=pi,this.toneMappingExposure=1;const v=this;let M=!1,C=0,R=0,T=null,L=-1,V=null;const y=new te,w=new te;let F=null;const B=new Tt(0);let W=0,j=e.width,H=e.height,K=1,G=null,st=null;const at=new te(0,0,j,H),mt=new te(0,0,j,H);let Ht=!1;const Jt=new rl;let $=!1,Q=!1;const xt=new Dt,ft=new Dt,Ut=new E,Rt=new te,Wt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let oe=!1;function Xt(){return T===null?K:1}let P=n;function en(S,D){return e.getContext(S,D)}try{const S={alpha:!0,depth:i,stencil:r,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${Yc}`),e.addEventListener("webglcontextlost",Z,!1),e.addEventListener("webglcontextrestored",ct,!1),e.addEventListener("webglcontextcreationerror",ut,!1),P===null){const D="webgl2";if(P=en(D,S),P===null)throw en(D)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(S){throw console.error("THREE.WebGLRenderer: "+S.message),S}let Gt,qt,Pt,de,Nt,A,b,k,q,J,Y,bt,ot,pt,Kt,tt,gt,Lt,It,_t,Vt,kt,he,I;function ht(){Gt=new I0(P),Gt.init(),kt=new _v(P,Gt),qt=new T0(P,Gt,t,kt),Pt=new pv(P),qt.reverseDepthBuffer&&Pt.buffers.depth.setReversed(!0),de=new U0(P),Nt=new Q_,A=new gv(P,Gt,Pt,Nt,qt,kt,de),b=new R0(v),k=new L0(v),q=new Gp(P),he=new w0(P,q),J=new D0(P,q,de,he),Y=new O0(P,J,q,de),It=new k0(P,qt,A),tt=new A0(Nt),bt=new J_(v,b,k,Gt,qt,he,tt),ot=new Ev(v,Nt),pt=new ev,Kt=new av(Gt),Lt=new S0(v,b,k,Pt,Y,u,c),gt=new dv(v,Y,qt),I=new Tv(P,de,qt,Pt),_t=new E0(P,Gt,de),Vt=new N0(P,Gt,de),de.programs=bt.programs,v.capabilities=qt,v.extensions=Gt,v.properties=Nt,v.renderLists=pt,v.shadowMap=gt,v.state=Pt,v.info=de}ht();const X=new Sv(v,P);this.xr=X,this.getContext=function(){return P},this.getContextAttributes=function(){return P.getContextAttributes()},this.forceContextLoss=function(){const S=Gt.get("WEBGL_lose_context");S&&S.loseContext()},this.forceContextRestore=function(){const S=Gt.get("WEBGL_lose_context");S&&S.restoreContext()},this.getPixelRatio=function(){return K},this.setPixelRatio=function(S){S!==void 0&&(K=S,this.setSize(j,H,!1))},this.getSize=function(S){return S.set(j,H)},this.setSize=function(S,D,O=!0){if(X.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}j=S,H=D,e.width=Math.floor(S*K),e.height=Math.floor(D*K),O===!0&&(e.style.width=S+"px",e.style.height=D+"px"),this.setViewport(0,0,S,D)},this.getDrawingBufferSize=function(S){return S.set(j*K,H*K).floor()},this.setDrawingBufferSize=function(S,D,O){j=S,H=D,K=O,e.width=Math.floor(S*O),e.height=Math.floor(D*O),this.setViewport(0,0,S,D)},this.getCurrentViewport=function(S){return S.copy(y)},this.getViewport=function(S){return S.copy(at)},this.setViewport=function(S,D,O,z){S.isVector4?at.set(S.x,S.y,S.z,S.w):at.set(S,D,O,z),Pt.viewport(y.copy(at).multiplyScalar(K).round())},this.getScissor=function(S){return S.copy(mt)},this.setScissor=function(S,D,O,z){S.isVector4?mt.set(S.x,S.y,S.z,S.w):mt.set(S,D,O,z),Pt.scissor(w.copy(mt).multiplyScalar(K).round())},this.getScissorTest=function(){return Ht},this.setScissorTest=function(S){Pt.setScissorTest(Ht=S)},this.setOpaqueSort=function(S){G=S},this.setTransparentSort=function(S){st=S},this.getClearColor=function(S){return S.copy(Lt.getClearColor())},this.setClearColor=function(){Lt.setClearColor.apply(Lt,arguments)},this.getClearAlpha=function(){return Lt.getClearAlpha()},this.setClearAlpha=function(){Lt.setClearAlpha.apply(Lt,arguments)},this.clear=function(S=!0,D=!0,O=!0){let z=0;if(S){let N=!1;if(T!==null){const et=T.texture.format;N=et===el||et===tl||et===Qc}if(N){const et=T.texture.type,lt=et===qn||et===ki||et===ur||et===bs||et===Kc||et===Zc,vt=Lt.getClearColor(),Mt=Lt.getClearAlpha(),At=vt.r,Ct=vt.g,St=vt.b;lt?(f[0]=At,f[1]=Ct,f[2]=St,f[3]=Mt,P.clearBufferuiv(P.COLOR,0,f)):(p[0]=At,p[1]=Ct,p[2]=St,p[3]=Mt,P.clearBufferiv(P.COLOR,0,p))}else z|=P.COLOR_BUFFER_BIT}D&&(z|=P.DEPTH_BUFFER_BIT,P.clearDepth(this.capabilities.reverseDepthBuffer?0:1)),O&&(z|=P.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),P.clear(z)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",Z,!1),e.removeEventListener("webglcontextrestored",ct,!1),e.removeEventListener("webglcontextcreationerror",ut,!1),pt.dispose(),Kt.dispose(),Nt.dispose(),b.dispose(),k.dispose(),Y.dispose(),he.dispose(),I.dispose(),bt.dispose(),X.dispose(),X.removeEventListener("sessionstart",Sl),X.removeEventListener("sessionend",wl),_i.stop()};function Z(S){S.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),M=!0}function ct(){console.log("THREE.WebGLRenderer: Context Restored."),M=!1;const S=de.autoReset,D=gt.enabled,O=gt.autoUpdate,z=gt.needsUpdate,N=gt.type;ht(),de.autoReset=S,gt.enabled=D,gt.autoUpdate=O,gt.needsUpdate=z,gt.type=N}function ut(S){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",S.statusMessage)}function jt(S){const D=S.target;D.removeEventListener("dispose",jt),be(D)}function be(S){Je(S),Nt.remove(S)}function Je(S){const D=Nt.get(S).programs;D!==void 0&&(D.forEach(function(O){bt.releaseProgram(O)}),S.isShaderMaterial&&bt.releaseShaderCache(S))}this.renderBufferDirect=function(S,D,O,z,N,et){D===null&&(D=Wt);const lt=N.isMesh&&N.matrixWorld.determinant()<0,vt=sf(S,D,O,z,N);Pt.setMaterial(z,lt);let Mt=O.index,At=1;if(z.wireframe===!0){if(Mt=J.getWireframeAttribute(O),Mt===void 0)return;At=2}const Ct=O.drawRange,St=O.attributes.position;let ie=Ct.start*At,fe=(Ct.start+Ct.count)*At;et!==null&&(ie=Math.max(ie,et.start*At),fe=Math.min(fe,(et.start+et.count)*At)),Mt!==null?(ie=Math.max(ie,0),fe=Math.min(fe,Mt.count)):St!=null&&(ie=Math.max(ie,0),fe=Math.min(fe,St.count));const ye=fe-ie;if(ye<0||ye===1/0)return;he.setup(N,z,vt,O,Mt);let nn,ee=_t;if(Mt!==null&&(nn=q.get(Mt),ee=Vt,ee.setIndex(nn)),N.isMesh)z.wireframe===!0?(Pt.setLineWidth(z.wireframeLinewidth*Xt()),ee.setMode(P.LINES)):ee.setMode(P.TRIANGLES);else if(N.isLine){let wt=z.linewidth;wt===void 0&&(wt=1),Pt.setLineWidth(wt*Xt()),N.isLineSegments?ee.setMode(P.LINES):N.isLineLoop?ee.setMode(P.LINE_LOOP):ee.setMode(P.LINE_STRIP)}else N.isPoints?ee.setMode(P.POINTS):N.isSprite&&ee.setMode(P.TRIANGLES);if(N.isBatchedMesh)if(N._multiDrawInstances!==null)ee.renderMultiDrawInstances(N._multiDrawStarts,N._multiDrawCounts,N._multiDrawCount,N._multiDrawInstances);else if(Gt.get("WEBGL_multi_draw"))ee.renderMultiDraw(N._multiDrawStarts,N._multiDrawCounts,N._multiDrawCount);else{const wt=N._multiDrawStarts,Ne=N._multiDrawCounts,ne=N._multiDrawCount,gn=Mt?q.get(Mt).bytesPerElement:1,Hi=Nt.get(z).currentProgram.getUniforms();for(let sn=0;sn<ne;sn++)Hi.setValue(P,"_gl_DrawID",sn),ee.render(wt[sn]/gn,Ne[sn])}else if(N.isInstancedMesh)ee.renderInstances(ie,ye,N.count);else if(O.isInstancedBufferGeometry){const wt=O._maxInstanceCount!==void 0?O._maxInstanceCount:1/0,Ne=Math.min(O.instanceCount,wt);ee.renderInstances(ie,ye,Ne)}else ee.render(ie,ye)};function Qt(S,D,O){S.transparent===!0&&S.side===Ye&&S.forceSinglePass===!1?(S.side=Ke,S.needsUpdate=!0,wr(S,D,O),S.side=Yn,S.needsUpdate=!0,wr(S,D,O),S.side=Ye):wr(S,D,O)}this.compile=function(S,D,O=null){O===null&&(O=S),m=Kt.get(O),m.init(D),x.push(m),O.traverseVisible(function(N){N.isLight&&N.layers.test(D.layers)&&(m.pushLight(N),N.castShadow&&m.pushShadow(N))}),S!==O&&S.traverseVisible(function(N){N.isLight&&N.layers.test(D.layers)&&(m.pushLight(N),N.castShadow&&m.pushShadow(N))}),m.setupLights();const z=new Set;return S.traverse(function(N){if(!(N.isMesh||N.isPoints||N.isLine||N.isSprite))return;const et=N.material;if(et)if(Array.isArray(et))for(let lt=0;lt<et.length;lt++){const vt=et[lt];Qt(vt,O,N),z.add(vt)}else Qt(et,O,N),z.add(et)}),x.pop(),m=null,z},this.compileAsync=function(S,D,O=null){const z=this.compile(S,D,O);return new Promise(N=>{function et(){if(z.forEach(function(lt){Nt.get(lt).currentProgram.isReady()&&z.delete(lt)}),z.size===0){N(S);return}setTimeout(et,10)}Gt.get("KHR_parallel_shader_compile")!==null?et():setTimeout(et,10)})};let Qe=null;function kn(S){Qe&&Qe(S)}function Sl(){_i.stop()}function wl(){_i.start()}const _i=new ld;_i.setAnimationLoop(kn),typeof self<"u"&&_i.setContext(self),this.setAnimationLoop=function(S){Qe=S,X.setAnimationLoop(S),S===null?_i.stop():_i.start()},X.addEventListener("sessionstart",Sl),X.addEventListener("sessionend",wl),this.render=function(S,D){if(D!==void 0&&D.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(M===!0)return;if(S.matrixWorldAutoUpdate===!0&&S.updateMatrixWorld(),D.parent===null&&D.matrixWorldAutoUpdate===!0&&D.updateMatrixWorld(),X.enabled===!0&&X.isPresenting===!0&&(X.cameraAutoUpdate===!0&&X.updateCamera(D),D=X.getCamera()),S.isScene===!0&&S.onBeforeRender(v,S,D,T),m=Kt.get(S,x.length),m.init(D),x.push(m),ft.multiplyMatrices(D.projectionMatrix,D.matrixWorldInverse),Jt.setFromProjectionMatrix(ft),Q=this.localClippingEnabled,$=tt.init(this.clippingPlanes,Q),_=pt.get(S,g.length),_.init(),g.push(_),X.enabled===!0&&X.isPresenting===!0){const et=v.xr.getDepthSensingMesh();et!==null&&Xo(et,D,-1/0,v.sortObjects)}Xo(S,D,0,v.sortObjects),_.finish(),v.sortObjects===!0&&_.sort(G,st),oe=X.enabled===!1||X.isPresenting===!1||X.hasDepthSensing()===!1,oe&&Lt.addToRenderList(_,S),this.info.render.frame++,$===!0&&tt.beginShadows();const O=m.state.shadowsArray;gt.render(O,S,D),$===!0&&tt.endShadows(),this.info.autoReset===!0&&this.info.reset();const z=_.opaque,N=_.transmissive;if(m.setupLights(),D.isArrayCamera){const et=D.cameras;if(N.length>0)for(let lt=0,vt=et.length;lt<vt;lt++){const Mt=et[lt];Tl(z,N,S,Mt)}oe&&Lt.render(S);for(let lt=0,vt=et.length;lt<vt;lt++){const Mt=et[lt];El(_,S,Mt,Mt.viewport)}}else N.length>0&&Tl(z,N,S,D),oe&&Lt.render(S),El(_,S,D);T!==null&&(A.updateMultisampleRenderTarget(T),A.updateRenderTargetMipmap(T)),S.isScene===!0&&S.onAfterRender(v,S,D),he.resetDefaultState(),L=-1,V=null,x.pop(),x.length>0?(m=x[x.length-1],$===!0&&tt.setGlobalState(v.clippingPlanes,m.state.camera)):m=null,g.pop(),g.length>0?_=g[g.length-1]:_=null};function Xo(S,D,O,z){if(S.visible===!1)return;if(S.layers.test(D.layers)){if(S.isGroup)O=S.renderOrder;else if(S.isLOD)S.autoUpdate===!0&&S.update(D);else if(S.isLight)m.pushLight(S),S.castShadow&&m.pushShadow(S);else if(S.isSprite){if(!S.frustumCulled||Jt.intersectsSprite(S)){z&&Rt.setFromMatrixPosition(S.matrixWorld).applyMatrix4(ft);const lt=Y.update(S),vt=S.material;vt.visible&&_.push(S,lt,vt,O,Rt.z,null)}}else if((S.isMesh||S.isLine||S.isPoints)&&(!S.frustumCulled||Jt.intersectsObject(S))){const lt=Y.update(S),vt=S.material;if(z&&(S.boundingSphere!==void 0?(S.boundingSphere===null&&S.computeBoundingSphere(),Rt.copy(S.boundingSphere.center)):(lt.boundingSphere===null&&lt.computeBoundingSphere(),Rt.copy(lt.boundingSphere.center)),Rt.applyMatrix4(S.matrixWorld).applyMatrix4(ft)),Array.isArray(vt)){const Mt=lt.groups;for(let At=0,Ct=Mt.length;At<Ct;At++){const St=Mt[At],ie=vt[St.materialIndex];ie&&ie.visible&&_.push(S,lt,ie,O,Rt.z,St)}}else vt.visible&&_.push(S,lt,vt,O,Rt.z,null)}}const et=S.children;for(let lt=0,vt=et.length;lt<vt;lt++)Xo(et[lt],D,O,z)}function El(S,D,O,z){const N=S.opaque,et=S.transmissive,lt=S.transparent;m.setupLightsView(O),$===!0&&tt.setGlobalState(v.clippingPlanes,O),z&&Pt.viewport(y.copy(z)),N.length>0&&Sr(N,D,O),et.length>0&&Sr(et,D,O),lt.length>0&&Sr(lt,D,O),Pt.buffers.depth.setTest(!0),Pt.buffers.depth.setMask(!0),Pt.buffers.color.setMask(!0),Pt.setPolygonOffset(!1)}function Tl(S,D,O,z){if((O.isScene===!0?O.overrideMaterial:null)!==null)return;m.state.transmissionRenderTarget[z.id]===void 0&&(m.state.transmissionRenderTarget[z.id]=new Oi(1,1,{generateMipmaps:!0,type:Gt.has("EXT_color_buffer_half_float")||Gt.has("EXT_color_buffer_float")?xr:qn,minFilter:jn,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Zt.workingColorSpace}));const et=m.state.transmissionRenderTarget[z.id],lt=z.viewport||y;et.setSize(lt.z,lt.w);const vt=v.getRenderTarget();v.setRenderTarget(et),v.getClearColor(B),W=v.getClearAlpha(),W<1&&v.setClearColor(16777215,.5),v.clear(),oe&&Lt.render(O);const Mt=v.toneMapping;v.toneMapping=pi;const At=z.viewport;if(z.viewport!==void 0&&(z.viewport=void 0),m.setupLightsView(z),$===!0&&tt.setGlobalState(v.clippingPlanes,z),Sr(S,O,z),A.updateMultisampleRenderTarget(et),A.updateRenderTargetMipmap(et),Gt.has("WEBGL_multisampled_render_to_texture")===!1){let Ct=!1;for(let St=0,ie=D.length;St<ie;St++){const fe=D[St],ye=fe.object,nn=fe.geometry,ee=fe.material,wt=fe.group;if(ee.side===Ye&&ye.layers.test(z.layers)){const Ne=ee.side;ee.side=Ke,ee.needsUpdate=!0,Al(ye,O,z,nn,ee,wt),ee.side=Ne,ee.needsUpdate=!0,Ct=!0}}Ct===!0&&(A.updateMultisampleRenderTarget(et),A.updateRenderTargetMipmap(et))}v.setRenderTarget(vt),v.setClearColor(B,W),At!==void 0&&(z.viewport=At),v.toneMapping=Mt}function Sr(S,D,O){const z=D.isScene===!0?D.overrideMaterial:null;for(let N=0,et=S.length;N<et;N++){const lt=S[N],vt=lt.object,Mt=lt.geometry,At=z===null?lt.material:z,Ct=lt.group;vt.layers.test(O.layers)&&Al(vt,D,O,Mt,At,Ct)}}function Al(S,D,O,z,N,et){S.onBeforeRender(v,D,O,z,N,et),S.modelViewMatrix.multiplyMatrices(O.matrixWorldInverse,S.matrixWorld),S.normalMatrix.getNormalMatrix(S.modelViewMatrix),N.onBeforeRender(v,D,O,z,S,et),N.transparent===!0&&N.side===Ye&&N.forceSinglePass===!1?(N.side=Ke,N.needsUpdate=!0,v.renderBufferDirect(O,D,z,N,S,et),N.side=Yn,N.needsUpdate=!0,v.renderBufferDirect(O,D,z,N,S,et),N.side=Ye):v.renderBufferDirect(O,D,z,N,S,et),S.onAfterRender(v,D,O,z,N,et)}function wr(S,D,O){D.isScene!==!0&&(D=Wt);const z=Nt.get(S),N=m.state.lights,et=m.state.shadowsArray,lt=N.state.version,vt=bt.getParameters(S,N.state,et,D,O),Mt=bt.getProgramCacheKey(vt);let At=z.programs;z.environment=S.isMeshStandardMaterial?D.environment:null,z.fog=D.fog,z.envMap=(S.isMeshStandardMaterial?k:b).get(S.envMap||z.environment),z.envMapRotation=z.environment!==null&&S.envMap===null?D.environmentRotation:S.envMapRotation,At===void 0&&(S.addEventListener("dispose",jt),At=new Map,z.programs=At);let Ct=At.get(Mt);if(Ct!==void 0){if(z.currentProgram===Ct&&z.lightsStateVersion===lt)return Cl(S,vt),Ct}else vt.uniforms=bt.getUniforms(S),S.onBeforeCompile(vt,v),Ct=bt.acquireProgram(vt,Mt),At.set(Mt,Ct),z.uniforms=vt.uniforms;const St=z.uniforms;return(!S.isShaderMaterial&&!S.isRawShaderMaterial||S.clipping===!0)&&(St.clippingPlanes=tt.uniform),Cl(S,vt),z.needsLights=of(S),z.lightsStateVersion=lt,z.needsLights&&(St.ambientLightColor.value=N.state.ambient,St.lightProbe.value=N.state.probe,St.directionalLights.value=N.state.directional,St.directionalLightShadows.value=N.state.directionalShadow,St.spotLights.value=N.state.spot,St.spotLightShadows.value=N.state.spotShadow,St.rectAreaLights.value=N.state.rectArea,St.ltc_1.value=N.state.rectAreaLTC1,St.ltc_2.value=N.state.rectAreaLTC2,St.pointLights.value=N.state.point,St.pointLightShadows.value=N.state.pointShadow,St.hemisphereLights.value=N.state.hemi,St.directionalShadowMap.value=N.state.directionalShadowMap,St.directionalShadowMatrix.value=N.state.directionalShadowMatrix,St.spotShadowMap.value=N.state.spotShadowMap,St.spotLightMatrix.value=N.state.spotLightMatrix,St.spotLightMap.value=N.state.spotLightMap,St.pointShadowMap.value=N.state.pointShadowMap,St.pointShadowMatrix.value=N.state.pointShadowMatrix),z.currentProgram=Ct,z.uniformsList=null,Ct}function Rl(S){if(S.uniformsList===null){const D=S.currentProgram.getUniforms();S.uniformsList=vo.seqWithValue(D.seq,S.uniforms)}return S.uniformsList}function Cl(S,D){const O=Nt.get(S);O.outputColorSpace=D.outputColorSpace,O.batching=D.batching,O.batchingColor=D.batchingColor,O.instancing=D.instancing,O.instancingColor=D.instancingColor,O.instancingMorph=D.instancingMorph,O.skinning=D.skinning,O.morphTargets=D.morphTargets,O.morphNormals=D.morphNormals,O.morphColors=D.morphColors,O.morphTargetsCount=D.morphTargetsCount,O.numClippingPlanes=D.numClippingPlanes,O.numIntersection=D.numClipIntersection,O.vertexAlphas=D.vertexAlphas,O.vertexTangents=D.vertexTangents,O.toneMapping=D.toneMapping}function sf(S,D,O,z,N){D.isScene!==!0&&(D=Wt),A.resetTextureUnits();const et=D.fog,lt=z.isMeshStandardMaterial?D.environment:null,vt=T===null?v.outputColorSpace:T.isXRRenderTarget===!0?T.texture.colorSpace:Fe,Mt=(z.isMeshStandardMaterial?k:b).get(z.envMap||lt),At=z.vertexColors===!0&&!!O.attributes.color&&O.attributes.color.itemSize===4,Ct=!!O.attributes.tangent&&(!!z.normalMap||z.anisotropy>0),St=!!O.morphAttributes.position,ie=!!O.morphAttributes.normal,fe=!!O.morphAttributes.color;let ye=pi;z.toneMapped&&(T===null||T.isXRRenderTarget===!0)&&(ye=v.toneMapping);const nn=O.morphAttributes.position||O.morphAttributes.normal||O.morphAttributes.color,ee=nn!==void 0?nn.length:0,wt=Nt.get(z),Ne=m.state.lights;if($===!0&&(Q===!0||S!==V)){const hn=S===V&&z.id===L;tt.setState(z,S,hn)}let ne=!1;z.version===wt.__version?(wt.needsLights&&wt.lightsStateVersion!==Ne.state.version||wt.outputColorSpace!==vt||N.isBatchedMesh&&wt.batching===!1||!N.isBatchedMesh&&wt.batching===!0||N.isBatchedMesh&&wt.batchingColor===!0&&N.colorTexture===null||N.isBatchedMesh&&wt.batchingColor===!1&&N.colorTexture!==null||N.isInstancedMesh&&wt.instancing===!1||!N.isInstancedMesh&&wt.instancing===!0||N.isSkinnedMesh&&wt.skinning===!1||!N.isSkinnedMesh&&wt.skinning===!0||N.isInstancedMesh&&wt.instancingColor===!0&&N.instanceColor===null||N.isInstancedMesh&&wt.instancingColor===!1&&N.instanceColor!==null||N.isInstancedMesh&&wt.instancingMorph===!0&&N.morphTexture===null||N.isInstancedMesh&&wt.instancingMorph===!1&&N.morphTexture!==null||wt.envMap!==Mt||z.fog===!0&&wt.fog!==et||wt.numClippingPlanes!==void 0&&(wt.numClippingPlanes!==tt.numPlanes||wt.numIntersection!==tt.numIntersection)||wt.vertexAlphas!==At||wt.vertexTangents!==Ct||wt.morphTargets!==St||wt.morphNormals!==ie||wt.morphColors!==fe||wt.toneMapping!==ye||wt.morphTargetsCount!==ee)&&(ne=!0):(ne=!0,wt.__version=z.version);let gn=wt.currentProgram;ne===!0&&(gn=wr(z,D,N));let Hi=!1,sn=!1,jo=!1;const xe=gn.getUniforms(),Zn=wt.uniforms;if(Pt.useProgram(gn.program)&&(Hi=!0,sn=!0,jo=!0),z.id!==L&&(L=z.id,sn=!0),Hi||V!==S){qt.reverseDepthBuffer?(xt.copy(S.projectionMatrix),gp(xt),_p(xt),xe.setValue(P,"projectionMatrix",xt)):xe.setValue(P,"projectionMatrix",S.projectionMatrix),xe.setValue(P,"viewMatrix",S.matrixWorldInverse);const hn=xe.map.cameraPosition;hn!==void 0&&hn.setValue(P,Ut.setFromMatrixPosition(S.matrixWorld)),qt.logarithmicDepthBuffer&&xe.setValue(P,"logDepthBufFC",2/(Math.log(S.far+1)/Math.LN2)),(z.isMeshPhongMaterial||z.isMeshToonMaterial||z.isMeshLambertMaterial||z.isMeshBasicMaterial||z.isMeshStandardMaterial||z.isShaderMaterial)&&xe.setValue(P,"isOrthographic",S.isOrthographicCamera===!0),V!==S&&(V=S,sn=!0,jo=!0)}if(N.isSkinnedMesh){xe.setOptional(P,N,"bindMatrix"),xe.setOptional(P,N,"bindMatrixInverse");const hn=N.skeleton;hn&&(hn.boneTexture===null&&hn.computeBoneTexture(),xe.setValue(P,"boneTexture",hn.boneTexture,A))}N.isBatchedMesh&&(xe.setOptional(P,N,"batchingTexture"),xe.setValue(P,"batchingTexture",N._matricesTexture,A),xe.setOptional(P,N,"batchingIdTexture"),xe.setValue(P,"batchingIdTexture",N._indirectTexture,A),xe.setOptional(P,N,"batchingColorTexture"),N._colorsTexture!==null&&xe.setValue(P,"batchingColorTexture",N._colorsTexture,A));const $o=O.morphAttributes;if(($o.position!==void 0||$o.normal!==void 0||$o.color!==void 0)&&It.update(N,O,gn),(sn||wt.receiveShadow!==N.receiveShadow)&&(wt.receiveShadow=N.receiveShadow,xe.setValue(P,"receiveShadow",N.receiveShadow)),z.isMeshGouraudMaterial&&z.envMap!==null&&(Zn.envMap.value=Mt,Zn.flipEnvMap.value=Mt.isCubeTexture&&Mt.isRenderTargetTexture===!1?-1:1),z.isMeshStandardMaterial&&z.envMap===null&&D.environment!==null&&(Zn.envMapIntensity.value=D.environmentIntensity),sn&&(xe.setValue(P,"toneMappingExposure",v.toneMappingExposure),wt.needsLights&&rf(Zn,jo),et&&z.fog===!0&&ot.refreshFogUniforms(Zn,et),ot.refreshMaterialUniforms(Zn,z,K,H,m.state.transmissionRenderTarget[S.id]),vo.upload(P,Rl(wt),Zn,A)),z.isShaderMaterial&&z.uniformsNeedUpdate===!0&&(vo.upload(P,Rl(wt),Zn,A),z.uniformsNeedUpdate=!1),z.isSpriteMaterial&&xe.setValue(P,"center",N.center),xe.setValue(P,"modelViewMatrix",N.modelViewMatrix),xe.setValue(P,"normalMatrix",N.normalMatrix),xe.setValue(P,"modelMatrix",N.matrixWorld),z.isShaderMaterial||z.isRawShaderMaterial){const hn=z.uniformsGroups;for(let Yo=0,af=hn.length;Yo<af;Yo++){const Pl=hn[Yo];I.update(Pl,gn),I.bind(Pl,gn)}}return gn}function rf(S,D){S.ambientLightColor.needsUpdate=D,S.lightProbe.needsUpdate=D,S.directionalLights.needsUpdate=D,S.directionalLightShadows.needsUpdate=D,S.pointLights.needsUpdate=D,S.pointLightShadows.needsUpdate=D,S.spotLights.needsUpdate=D,S.spotLightShadows.needsUpdate=D,S.rectAreaLights.needsUpdate=D,S.hemisphereLights.needsUpdate=D}function of(S){return S.isMeshLambertMaterial||S.isMeshToonMaterial||S.isMeshPhongMaterial||S.isMeshStandardMaterial||S.isShadowMaterial||S.isShaderMaterial&&S.lights===!0}this.getActiveCubeFace=function(){return C},this.getActiveMipmapLevel=function(){return R},this.getRenderTarget=function(){return T},this.setRenderTargetTextures=function(S,D,O){Nt.get(S.texture).__webglTexture=D,Nt.get(S.depthTexture).__webglTexture=O;const z=Nt.get(S);z.__hasExternalTextures=!0,z.__autoAllocateDepthBuffer=O===void 0,z.__autoAllocateDepthBuffer||Gt.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),z.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(S,D){const O=Nt.get(S);O.__webglFramebuffer=D,O.__useDefaultFramebuffer=D===void 0},this.setRenderTarget=function(S,D=0,O=0){T=S,C=D,R=O;let z=!0,N=null,et=!1,lt=!1;if(S){const Mt=Nt.get(S);if(Mt.__useDefaultFramebuffer!==void 0)Pt.bindFramebuffer(P.FRAMEBUFFER,null),z=!1;else if(Mt.__webglFramebuffer===void 0)A.setupRenderTarget(S);else if(Mt.__hasExternalTextures)A.rebindTextures(S,Nt.get(S.texture).__webglTexture,Nt.get(S.depthTexture).__webglTexture);else if(S.depthBuffer){const St=S.depthTexture;if(Mt.__boundDepthTexture!==St){if(St!==null&&Nt.has(St)&&(S.width!==St.image.width||S.height!==St.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");A.setupDepthRenderbuffer(S)}}const At=S.texture;(At.isData3DTexture||At.isDataArrayTexture||At.isCompressedArrayTexture)&&(lt=!0);const Ct=Nt.get(S).__webglFramebuffer;S.isWebGLCubeRenderTarget?(Array.isArray(Ct[D])?N=Ct[D][O]:N=Ct[D],et=!0):S.samples>0&&A.useMultisampledRTT(S)===!1?N=Nt.get(S).__webglMultisampledFramebuffer:Array.isArray(Ct)?N=Ct[O]:N=Ct,y.copy(S.viewport),w.copy(S.scissor),F=S.scissorTest}else y.copy(at).multiplyScalar(K).floor(),w.copy(mt).multiplyScalar(K).floor(),F=Ht;if(Pt.bindFramebuffer(P.FRAMEBUFFER,N)&&z&&Pt.drawBuffers(S,N),Pt.viewport(y),Pt.scissor(w),Pt.setScissorTest(F),et){const Mt=Nt.get(S.texture);P.framebufferTexture2D(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,P.TEXTURE_CUBE_MAP_POSITIVE_X+D,Mt.__webglTexture,O)}else if(lt){const Mt=Nt.get(S.texture),At=D||0;P.framebufferTextureLayer(P.FRAMEBUFFER,P.COLOR_ATTACHMENT0,Mt.__webglTexture,O||0,At)}L=-1},this.readRenderTargetPixels=function(S,D,O,z,N,et,lt){if(!(S&&S.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let vt=Nt.get(S).__webglFramebuffer;if(S.isWebGLCubeRenderTarget&&lt!==void 0&&(vt=vt[lt]),vt){Pt.bindFramebuffer(P.FRAMEBUFFER,vt);try{const Mt=S.texture,At=Mt.format,Ct=Mt.type;if(!qt.textureFormatReadable(At)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!qt.textureTypeReadable(Ct)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}D>=0&&D<=S.width-z&&O>=0&&O<=S.height-N&&P.readPixels(D,O,z,N,kt.convert(At),kt.convert(Ct),et)}finally{const Mt=T!==null?Nt.get(T).__webglFramebuffer:null;Pt.bindFramebuffer(P.FRAMEBUFFER,Mt)}}},this.readRenderTargetPixelsAsync=async function(S,D,O,z,N,et,lt){if(!(S&&S.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let vt=Nt.get(S).__webglFramebuffer;if(S.isWebGLCubeRenderTarget&&lt!==void 0&&(vt=vt[lt]),vt){const Mt=S.texture,At=Mt.format,Ct=Mt.type;if(!qt.textureFormatReadable(At))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!qt.textureTypeReadable(Ct))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(D>=0&&D<=S.width-z&&O>=0&&O<=S.height-N){Pt.bindFramebuffer(P.FRAMEBUFFER,vt);const St=P.createBuffer();P.bindBuffer(P.PIXEL_PACK_BUFFER,St),P.bufferData(P.PIXEL_PACK_BUFFER,et.byteLength,P.STREAM_READ),P.readPixels(D,O,z,N,kt.convert(At),kt.convert(Ct),0);const ie=T!==null?Nt.get(T).__webglFramebuffer:null;Pt.bindFramebuffer(P.FRAMEBUFFER,ie);const fe=P.fenceSync(P.SYNC_GPU_COMMANDS_COMPLETE,0);return P.flush(),await mp(P,fe,4),P.bindBuffer(P.PIXEL_PACK_BUFFER,St),P.getBufferSubData(P.PIXEL_PACK_BUFFER,0,et),P.deleteBuffer(St),P.deleteSync(fe),et}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(S,D=null,O=0){S.isTexture!==!0&&(_o("WebGLRenderer: copyFramebufferToTexture function signature has changed."),D=arguments[0]||null,S=arguments[1]);const z=Math.pow(2,-O),N=Math.floor(S.image.width*z),et=Math.floor(S.image.height*z),lt=D!==null?D.x:0,vt=D!==null?D.y:0;A.setTexture2D(S,0),P.copyTexSubImage2D(P.TEXTURE_2D,O,0,0,lt,vt,N,et),Pt.unbindTexture()},this.copyTextureToTexture=function(S,D,O=null,z=null,N=0){S.isTexture!==!0&&(_o("WebGLRenderer: copyTextureToTexture function signature has changed."),z=arguments[0]||null,S=arguments[1],D=arguments[2],N=arguments[3]||0,O=null);let et,lt,vt,Mt,At,Ct;O!==null?(et=O.max.x-O.min.x,lt=O.max.y-O.min.y,vt=O.min.x,Mt=O.min.y):(et=S.image.width,lt=S.image.height,vt=0,Mt=0),z!==null?(At=z.x,Ct=z.y):(At=0,Ct=0);const St=kt.convert(D.format),ie=kt.convert(D.type);A.setTexture2D(D,0),P.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,D.flipY),P.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,D.premultiplyAlpha),P.pixelStorei(P.UNPACK_ALIGNMENT,D.unpackAlignment);const fe=P.getParameter(P.UNPACK_ROW_LENGTH),ye=P.getParameter(P.UNPACK_IMAGE_HEIGHT),nn=P.getParameter(P.UNPACK_SKIP_PIXELS),ee=P.getParameter(P.UNPACK_SKIP_ROWS),wt=P.getParameter(P.UNPACK_SKIP_IMAGES),Ne=S.isCompressedTexture?S.mipmaps[N]:S.image;P.pixelStorei(P.UNPACK_ROW_LENGTH,Ne.width),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,Ne.height),P.pixelStorei(P.UNPACK_SKIP_PIXELS,vt),P.pixelStorei(P.UNPACK_SKIP_ROWS,Mt),S.isDataTexture?P.texSubImage2D(P.TEXTURE_2D,N,At,Ct,et,lt,St,ie,Ne.data):S.isCompressedTexture?P.compressedTexSubImage2D(P.TEXTURE_2D,N,At,Ct,Ne.width,Ne.height,St,Ne.data):P.texSubImage2D(P.TEXTURE_2D,N,At,Ct,et,lt,St,ie,Ne),P.pixelStorei(P.UNPACK_ROW_LENGTH,fe),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,ye),P.pixelStorei(P.UNPACK_SKIP_PIXELS,nn),P.pixelStorei(P.UNPACK_SKIP_ROWS,ee),P.pixelStorei(P.UNPACK_SKIP_IMAGES,wt),N===0&&D.generateMipmaps&&P.generateMipmap(P.TEXTURE_2D),Pt.unbindTexture()},this.copyTextureToTexture3D=function(S,D,O=null,z=null,N=0){S.isTexture!==!0&&(_o("WebGLRenderer: copyTextureToTexture3D function signature has changed."),O=arguments[0]||null,z=arguments[1]||null,S=arguments[2],D=arguments[3],N=arguments[4]||0);let et,lt,vt,Mt,At,Ct,St,ie,fe;const ye=S.isCompressedTexture?S.mipmaps[N]:S.image;O!==null?(et=O.max.x-O.min.x,lt=O.max.y-O.min.y,vt=O.max.z-O.min.z,Mt=O.min.x,At=O.min.y,Ct=O.min.z):(et=ye.width,lt=ye.height,vt=ye.depth,Mt=0,At=0,Ct=0),z!==null?(St=z.x,ie=z.y,fe=z.z):(St=0,ie=0,fe=0);const nn=kt.convert(D.format),ee=kt.convert(D.type);let wt;if(D.isData3DTexture)A.setTexture3D(D,0),wt=P.TEXTURE_3D;else if(D.isDataArrayTexture||D.isCompressedArrayTexture)A.setTexture2DArray(D,0),wt=P.TEXTURE_2D_ARRAY;else{console.warn("THREE.WebGLRenderer.copyTextureToTexture3D: only supports THREE.DataTexture3D and THREE.DataTexture2DArray.");return}P.pixelStorei(P.UNPACK_FLIP_Y_WEBGL,D.flipY),P.pixelStorei(P.UNPACK_PREMULTIPLY_ALPHA_WEBGL,D.premultiplyAlpha),P.pixelStorei(P.UNPACK_ALIGNMENT,D.unpackAlignment);const Ne=P.getParameter(P.UNPACK_ROW_LENGTH),ne=P.getParameter(P.UNPACK_IMAGE_HEIGHT),gn=P.getParameter(P.UNPACK_SKIP_PIXELS),Hi=P.getParameter(P.UNPACK_SKIP_ROWS),sn=P.getParameter(P.UNPACK_SKIP_IMAGES);P.pixelStorei(P.UNPACK_ROW_LENGTH,ye.width),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,ye.height),P.pixelStorei(P.UNPACK_SKIP_PIXELS,Mt),P.pixelStorei(P.UNPACK_SKIP_ROWS,At),P.pixelStorei(P.UNPACK_SKIP_IMAGES,Ct),S.isDataTexture||S.isData3DTexture?P.texSubImage3D(wt,N,St,ie,fe,et,lt,vt,nn,ee,ye.data):D.isCompressedArrayTexture?P.compressedTexSubImage3D(wt,N,St,ie,fe,et,lt,vt,nn,ye.data):P.texSubImage3D(wt,N,St,ie,fe,et,lt,vt,nn,ee,ye),P.pixelStorei(P.UNPACK_ROW_LENGTH,Ne),P.pixelStorei(P.UNPACK_IMAGE_HEIGHT,ne),P.pixelStorei(P.UNPACK_SKIP_PIXELS,gn),P.pixelStorei(P.UNPACK_SKIP_ROWS,Hi),P.pixelStorei(P.UNPACK_SKIP_IMAGES,sn),N===0&&D.generateMipmaps&&P.generateMipmap(wt),Pt.unbindTexture()},this.initRenderTarget=function(S){Nt.get(S).__webglFramebuffer===void 0&&A.setupRenderTarget(S)},this.initTexture=function(S){S.isCubeTexture?A.setTextureCube(S,0):S.isData3DTexture?A.setTexture3D(S,0):S.isDataArrayTexture||S.isCompressedArrayTexture?A.setTexture2DArray(S,0):A.setTexture2D(S,0),Pt.unbindTexture()},this.resetState=function(){C=0,R=0,T=null,Pt.reset(),he.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return $n}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;const e=this.getContext();e.drawingBufferColorSpace=t===nl?"display-p3":"srgb",e.unpackColorSpace=Zt.workingColorSpace===Oo?"display-p3":"srgb"}}class cl{constructor(t,e=25e-5){this.isFogExp2=!0,this.name="",this.color=new Tt(t),this.density=e}clone(){return new cl(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}}class Rv extends le{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new En,this.environmentIntensity=1,this.environmentRotation=new En,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){const e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}}class Cv{constructor(t,e){this.isInterleavedBuffer=!0,this.array=t,this.stride=e,this.count=t!==void 0?t.length/e:0,this.usage=Lc,this.updateRanges=[],this.version=0,this.uuid=mn()}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.array=new t.array.constructor(t.array),this.count=t.count,this.stride=t.stride,this.usage=t.usage,this}copyAt(t,e,n){t*=this.stride,n*=e.stride;for(let i=0,r=this.stride;i<r;i++)this.array[t+i]=e.array[n+i];return this}set(t,e=0){return this.array.set(t,e),this}clone(t){t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=mn()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const e=new this.array.constructor(t.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(e,this.stride);return n.setUsage(this.usage),n}onUpload(t){return this.onUploadCallback=t,this}toJSON(t){return t.arrayBuffers===void 0&&(t.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=mn()),t.arrayBuffers[this.array.buffer._uuid]===void 0&&(t.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const We=new E;class ll{constructor(t,e,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=t,this.itemSize=e,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(t){this.data.needsUpdate=t}applyMatrix4(t){for(let e=0,n=this.data.count;e<n;e++)We.fromBufferAttribute(this,e),We.applyMatrix4(t),this.setXYZ(e,We.x,We.y,We.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)We.fromBufferAttribute(this,e),We.applyNormalMatrix(t),this.setXYZ(e,We.x,We.y,We.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)We.fromBufferAttribute(this,e),We.transformDirection(t),this.setXYZ(e,We.x,We.y,We.z);return this}getComponent(t,e){let n=this.array[t*this.data.stride+this.offset+e];return this.normalized&&(n=xn(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=se(n,this.array)),this.data.array[t*this.data.stride+this.offset+e]=n,this}setX(t,e){return this.normalized&&(e=se(e,this.array)),this.data.array[t*this.data.stride+this.offset]=e,this}setY(t,e){return this.normalized&&(e=se(e,this.array)),this.data.array[t*this.data.stride+this.offset+1]=e,this}setZ(t,e){return this.normalized&&(e=se(e,this.array)),this.data.array[t*this.data.stride+this.offset+2]=e,this}setW(t,e){return this.normalized&&(e=se(e,this.array)),this.data.array[t*this.data.stride+this.offset+3]=e,this}getX(t){let e=this.data.array[t*this.data.stride+this.offset];return this.normalized&&(e=xn(e,this.array)),e}getY(t){let e=this.data.array[t*this.data.stride+this.offset+1];return this.normalized&&(e=xn(e,this.array)),e}getZ(t){let e=this.data.array[t*this.data.stride+this.offset+2];return this.normalized&&(e=xn(e,this.array)),e}getW(t){let e=this.data.array[t*this.data.stride+this.offset+3];return this.normalized&&(e=xn(e,this.array)),e}setXY(t,e,n){return t=t*this.data.stride+this.offset,this.normalized&&(e=se(e,this.array),n=se(n,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this}setXYZ(t,e,n,i){return t=t*this.data.stride+this.offset,this.normalized&&(e=se(e,this.array),n=se(n,this.array),i=se(i,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t=t*this.data.stride+this.offset,this.normalized&&(e=se(e,this.array),n=se(n,this.array),i=se(i,this.array),r=se(r,this.array)),this.data.array[t+0]=e,this.data.array[t+1]=n,this.data.array[t+2]=i,this.data.array[t+3]=r,this}clone(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return new Ze(new this.array.constructor(e),this.itemSize,this.normalized)}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.clone(t)),new ll(t.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(t){if(t===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const e=[];for(let n=0;n<this.count;n++){const i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)e.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:e,normalized:this.normalized}}else return t.interleavedBuffers===void 0&&(t.interleavedBuffers={}),t.interleavedBuffers[this.data.uuid]===void 0&&(t.interleavedBuffers[this.data.uuid]=this.data.toJSON(t)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}const Ch=new E,Ph=new te,Lh=new te,Pv=new E,Ih=new Dt,Xr=new E,wa=new In,Dh=new Dt,Ea=new Is;class Lv extends nt{constructor(t,e){super(t,e),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=Ul,this.bindMatrix=new Dt,this.bindMatrixInverse=new Dt,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){const t=this.geometry;this.boundingBox===null&&(this.boundingBox=new Ln),this.boundingBox.makeEmpty();const e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,Xr),this.boundingBox.expandByPoint(Xr)}computeBoundingSphere(){const t=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new In),this.boundingSphere.makeEmpty();const e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,Xr),this.boundingSphere.expandByPoint(Xr)}copy(t,e){return super.copy(t,e),this.bindMode=t.bindMode,this.bindMatrix.copy(t.bindMatrix),this.bindMatrixInverse.copy(t.bindMatrixInverse),this.skeleton=t.skeleton,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}raycast(t,e){const n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),wa.copy(this.boundingSphere),wa.applyMatrix4(i),t.ray.intersectsSphere(wa)!==!1&&(Dh.copy(i).invert(),Ea.copy(t.ray).applyMatrix4(Dh),!(this.boundingBox!==null&&Ea.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(t,e,Ea)))}getVertexPosition(t,e){return super.getVertexPosition(t,e),this.applyBoneTransform(t,e),e}bind(t,e){this.skeleton=t,e===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),e=this.matrixWorld),this.bindMatrix.copy(e),this.bindMatrixInverse.copy(e).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){const t=new te,e=this.geometry.attributes.skinWeight;for(let n=0,i=e.count;n<i;n++){t.fromBufferAttribute(e,n);const r=1/t.manhattanLength();r!==1/0?t.multiplyScalar(r):t.set(1,0,0,0),e.setXYZW(n,t.x,t.y,t.z,t.w)}}updateMatrixWorld(t){super.updateMatrixWorld(t),this.bindMode===Ul?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===zf?this.bindMatrixInverse.copy(this.bindMatrix).invert():console.warn("THREE.SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(t,e){const n=this.skeleton,i=this.geometry;Ph.fromBufferAttribute(i.attributes.skinIndex,t),Lh.fromBufferAttribute(i.attributes.skinWeight,t),Ch.copy(e).applyMatrix4(this.bindMatrix),e.set(0,0,0);for(let r=0;r<4;r++){const o=Lh.getComponent(r);if(o!==0){const a=Ph.getComponent(r);Ih.multiplyMatrices(n.bones[a].matrixWorld,n.boneInverses[a]),e.addScaledVector(Pv.copy(Ch).applyMatrix4(Ih),o)}}return e.applyMatrix4(this.bindMatrixInverse)}}class md extends le{constructor(){super(),this.isBone=!0,this.type="Bone"}}class gd extends De{constructor(t=null,e=1,n=1,i,r,o,a,c,l=qe,h=qe,d,u){super(null,o,a,c,l,h,i,r,d,u),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const Nh=new Dt,Iv=new Dt;class hl{constructor(t=[],e=[]){this.uuid=mn(),this.bones=t.slice(0),this.boneInverses=e,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){const t=this.bones,e=this.boneInverses;if(this.boneMatrices=new Float32Array(t.length*16),e.length===0)this.calculateInverses();else if(t.length!==e.length){console.warn("THREE.Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Dt)}}calculateInverses(){this.boneInverses.length=0;for(let t=0,e=this.bones.length;t<e;t++){const n=new Dt;this.bones[t]&&n.copy(this.bones[t].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let t=0,e=this.bones.length;t<e;t++){const n=this.bones[t];n&&n.matrixWorld.copy(this.boneInverses[t]).invert()}for(let t=0,e=this.bones.length;t<e;t++){const n=this.bones[t];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){const t=this.bones,e=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,o=t.length;r<o;r++){const a=t[r]?t[r].matrixWorld:Iv;Nh.multiplyMatrices(a,e[r]),Nh.toArray(n,r*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new hl(this.bones,this.boneInverses)}computeBoneTexture(){let t=Math.sqrt(this.bones.length*4);t=Math.ceil(t/4)*4,t=Math.max(t,4);const e=new Float32Array(t*t*4);e.set(this.boneMatrices);const n=new gd(e,t,t,pn,bn);return n.needsUpdate=!0,this.boneMatrices=e,this.boneTexture=n,this}getBoneByName(t){for(let e=0,n=this.bones.length;e<n;e++){const i=this.bones[e];if(i.name===t)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(t,e){this.uuid=t.uuid;for(let n=0,i=t.bones.length;n<i;n++){const r=t.bones[n];let o=e[r];o===void 0&&(console.warn("THREE.Skeleton: No bone found with UUID:",r),o=new md),this.bones.push(o),this.boneInverses.push(new Dt().fromArray(t.boneInverses[n]))}return this.init(),this}toJSON(){const t={metadata:{version:4.6,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};t.uuid=this.uuid;const e=this.bones,n=this.boneInverses;for(let i=0,r=e.length;i<r;i++){const o=e[i];t.bones.push(o.uuid);const a=n[i];t.boneInverses.push(a.toArray())}return t}}class Dc extends Ze{constructor(t,e,n,i=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){const t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}}const ns=new Dt,Uh=new Dt,jr=[],kh=new Ln,Dv=new Dt,Vs=new nt,Ws=new In;class Nv extends nt{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new Dc(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,Dv)}computeBoundingBox(){const t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new Ln),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,ns),kh.copy(t.boundingBox).applyMatrix4(ns),this.boundingBox.union(kh)}computeBoundingSphere(){const t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new In),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,ns),Ws.copy(t.boundingSphere).applyMatrix4(ns),this.boundingSphere.union(Ws)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){const n=e.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,o=t*r+1;for(let a=0;a<n.length;a++)n[a]=i[o+a]}raycast(t,e){const n=this.matrixWorld,i=this.count;if(Vs.geometry=this.geometry,Vs.material=this.material,Vs.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Ws.copy(this.boundingSphere),Ws.applyMatrix4(n),t.ray.intersectsSphere(Ws)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,ns),Uh.multiplyMatrices(n,ns),Vs.matrixWorld=Uh,Vs.raycast(t,jr);for(let o=0,a=jr.length;o<a;o++){const c=jr[o];c.instanceId=r,c.object=this,e.push(c)}jr.length=0}}setColorAt(t,e){this.instanceColor===null&&(this.instanceColor=new Dc(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3)}setMatrixAt(t,e){e.toArray(this.instanceMatrix.array,t*16)}setMorphAt(t,e){const n=e.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new gd(new Float32Array(i*this.count),i,this.count,Jc,bn));const r=this.morphTexture.source.data.data;let o=0;for(let l=0;l<n.length;l++)o+=n[l];const a=this.geometry.morphTargetsRelative?1:1-o,c=i*t;r[c]=a,r.set(n,c+1)}updateMorphTargets(){}dispose(){return this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null),this}}class zo extends Pn{constructor(t){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new Tt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}}const Po=new E,Lo=new E,Oh=new Dt,Xs=new Is,$r=new In,Ta=new E,Fh=new E;class fn extends le{constructor(t=new Me,e=new zo){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[0];for(let i=1,r=e.count;i<r;i++)Po.fromBufferAttribute(e,i-1),Lo.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=Po.distanceTo(Lo);t.setAttribute("lineDistance",new Yt(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(t,e){const n=this.geometry,i=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),$r.copy(n.boundingSphere),$r.applyMatrix4(i),$r.radius+=r,t.ray.intersectsSphere($r)===!1)return;Oh.copy(i).invert(),Xs.copy(t.ray).applyMatrix4(Oh);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=this.isLineSegments?2:1,h=n.index,u=n.attributes.position;if(h!==null){const f=Math.max(0,o.start),p=Math.min(h.count,o.start+o.count);for(let _=f,m=p-1;_<m;_+=l){const g=h.getX(_),x=h.getX(_+1),v=Yr(this,t,Xs,c,g,x);v&&e.push(v)}if(this.isLineLoop){const _=h.getX(p-1),m=h.getX(f),g=Yr(this,t,Xs,c,_,m);g&&e.push(g)}}else{const f=Math.max(0,o.start),p=Math.min(u.count,o.start+o.count);for(let _=f,m=p-1;_<m;_+=l){const g=Yr(this,t,Xs,c,_,_+1);g&&e.push(g)}if(this.isLineLoop){const _=Yr(this,t,Xs,c,p-1,f);_&&e.push(_)}}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){const a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function Yr(s,t,e,n,i,r){const o=s.geometry.attributes.position;if(Po.fromBufferAttribute(o,i),Lo.fromBufferAttribute(o,r),e.distanceSqToSegment(Po,Lo,Ta,Fh)>n)return;Ta.applyMatrix4(s.matrixWorld);const c=t.ray.origin.distanceTo(Ta);if(!(c<t.near||c>t.far))return{distance:c,point:Fh.clone().applyMatrix4(s.matrixWorld),index:i,face:null,faceIndex:null,barycoord:null,object:s}}const zh=new E,Bh=new E;class Uv extends fn{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[];for(let i=0,r=e.count;i<r;i+=2)zh.fromBufferAttribute(e,i),Bh.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+zh.distanceTo(Bh);t.setAttribute("lineDistance",new Yt(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class kv extends fn{constructor(t,e){super(t,e),this.isLineLoop=!0,this.type="LineLoop"}}class _d extends Pn{constructor(t){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Tt(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.alphaMap=t.alphaMap,this.size=t.size,this.sizeAttenuation=t.sizeAttenuation,this.fog=t.fog,this}}const Hh=new Dt,Nc=new Is,qr=new In,Kr=new E;class Ov extends le{constructor(t=new Me,e=new _d){super(),this.isPoints=!0,this.type="Points",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}raycast(t,e){const n=this.geometry,i=this.matrixWorld,r=t.params.Points.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),qr.copy(n.boundingSphere),qr.applyMatrix4(i),qr.radius+=r,t.ray.intersectsSphere(qr)===!1)return;Hh.copy(i).invert(),Nc.copy(t.ray).applyMatrix4(Hh);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=n.index,d=n.attributes.position;if(l!==null){const u=Math.max(0,o.start),f=Math.min(l.count,o.start+o.count);for(let p=u,_=f;p<_;p++){const m=l.getX(p);Kr.fromBufferAttribute(d,m),Gh(Kr,m,c,i,t,e,this)}}else{const u=Math.max(0,o.start),f=Math.min(d.count,o.start+o.count);for(let p=u,_=f;p<_;p++)Kr.fromBufferAttribute(d,p),Gh(Kr,p,c,i,t,e,this)}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){const a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function Gh(s,t,e,n,i,r,o){const a=Nc.distanceSqToPoint(s);if(a<e){const c=new E;Nc.closestPointToPoint(s,c),c.applyMatrix4(n);const l=i.ray.origin.distanceTo(c);if(l<i.near||l>i.far)return;r.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:t,face:null,faceIndex:null,barycoord:null,object:o})}}class Dn{constructor(){this.type="Curve",this.arcLengthDivisions=200}getPoint(){return console.warn("THREE.Curve: .getPoint() not implemented."),null}getPointAt(t,e){const n=this.getUtoTmapping(t);return this.getPoint(n,e)}getPoints(t=5){const e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return e}getSpacedPoints(t=5){const e=[];for(let n=0;n<=t;n++)e.push(this.getPointAt(n/t));return e}getLength(){const t=this.getLengths();return t[t.length-1]}getLengths(t=this.arcLengthDivisions){if(this.cacheArcLengths&&this.cacheArcLengths.length===t+1&&!this.needsUpdate)return this.cacheArcLengths;this.needsUpdate=!1;const e=[];let n,i=this.getPoint(0),r=0;e.push(0);for(let o=1;o<=t;o++)n=this.getPoint(o/t),r+=n.distanceTo(i),e.push(r),i=n;return this.cacheArcLengths=e,e}updateArcLengths(){this.needsUpdate=!0,this.getLengths()}getUtoTmapping(t,e){const n=this.getLengths();let i=0;const r=n.length;let o;e?o=e:o=t*n[r-1];let a=0,c=r-1,l;for(;a<=c;)if(i=Math.floor(a+(c-a)/2),l=n[i]-o,l<0)a=i+1;else if(l>0)c=i-1;else{c=i;break}if(i=c,n[i]===o)return i/(r-1);const h=n[i],u=n[i+1]-h,f=(o-h)/u;return(i+f)/(r-1)}getTangent(t,e){let i=t-1e-4,r=t+1e-4;i<0&&(i=0),r>1&&(r=1);const o=this.getPoint(i),a=this.getPoint(r),c=e||(o.isVector2?new it:new E);return c.copy(a).sub(o).normalize(),c}getTangentAt(t,e){const n=this.getUtoTmapping(t);return this.getTangent(n,e)}computeFrenetFrames(t,e){const n=new E,i=[],r=[],o=[],a=new E,c=new Dt;for(let f=0;f<=t;f++){const p=f/t;i[f]=this.getTangentAt(p,new E)}r[0]=new E,o[0]=new E;let l=Number.MAX_VALUE;const h=Math.abs(i[0].x),d=Math.abs(i[0].y),u=Math.abs(i[0].z);h<=l&&(l=h,n.set(1,0,0)),d<=l&&(l=d,n.set(0,1,0)),u<=l&&n.set(0,0,1),a.crossVectors(i[0],n).normalize(),r[0].crossVectors(i[0],a),o[0].crossVectors(i[0],r[0]);for(let f=1;f<=t;f++){if(r[f]=r[f-1].clone(),o[f]=o[f-1].clone(),a.crossVectors(i[f-1],i[f]),a.length()>Number.EPSILON){a.normalize();const p=Math.acos(Re(i[f-1].dot(i[f]),-1,1));r[f].applyMatrix4(c.makeRotationAxis(a,p))}o[f].crossVectors(i[f],r[f])}if(e===!0){let f=Math.acos(Re(r[0].dot(r[t]),-1,1));f/=t,i[0].dot(a.crossVectors(r[0],r[t]))>0&&(f=-f);for(let p=1;p<=t;p++)r[p].applyMatrix4(c.makeRotationAxis(i[p],f*p)),o[p].crossVectors(i[p],r[p])}return{tangents:i,normals:r,binormals:o}}clone(){return new this.constructor().copy(this)}copy(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}toJSON(){const t={metadata:{version:4.6,type:"Curve",generator:"Curve.toJSON"}};return t.arcLengthDivisions=this.arcLengthDivisions,t.type=this.type,t}fromJSON(t){return this.arcLengthDivisions=t.arcLengthDivisions,this}}class ul extends Dn{constructor(t=0,e=0,n=1,i=1,r=0,o=Math.PI*2,a=!1,c=0){super(),this.isEllipseCurve=!0,this.type="EllipseCurve",this.aX=t,this.aY=e,this.xRadius=n,this.yRadius=i,this.aStartAngle=r,this.aEndAngle=o,this.aClockwise=a,this.aRotation=c}getPoint(t,e=new it){const n=e,i=Math.PI*2;let r=this.aEndAngle-this.aStartAngle;const o=Math.abs(r)<Number.EPSILON;for(;r<0;)r+=i;for(;r>i;)r-=i;r<Number.EPSILON&&(o?r=0:r=i),this.aClockwise===!0&&!o&&(r===i?r=-i:r=r-i);const a=this.aStartAngle+t*r;let c=this.aX+this.xRadius*Math.cos(a),l=this.aY+this.yRadius*Math.sin(a);if(this.aRotation!==0){const h=Math.cos(this.aRotation),d=Math.sin(this.aRotation),u=c-this.aX,f=l-this.aY;c=u*h-f*d+this.aX,l=u*d+f*h+this.aY}return n.set(c,l)}copy(t){return super.copy(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}toJSON(){const t=super.toJSON();return t.aX=this.aX,t.aY=this.aY,t.xRadius=this.xRadius,t.yRadius=this.yRadius,t.aStartAngle=this.aStartAngle,t.aEndAngle=this.aEndAngle,t.aClockwise=this.aClockwise,t.aRotation=this.aRotation,t}fromJSON(t){return super.fromJSON(t),this.aX=t.aX,this.aY=t.aY,this.xRadius=t.xRadius,this.yRadius=t.yRadius,this.aStartAngle=t.aStartAngle,this.aEndAngle=t.aEndAngle,this.aClockwise=t.aClockwise,this.aRotation=t.aRotation,this}}class Fv extends ul{constructor(t,e,n,i,r,o){super(t,e,n,n,i,r,o),this.isArcCurve=!0,this.type="ArcCurve"}}function dl(){let s=0,t=0,e=0,n=0;function i(r,o,a,c){s=r,t=a,e=-3*r+3*o-2*a-c,n=2*r-2*o+a+c}return{initCatmullRom:function(r,o,a,c,l){i(o,a,l*(a-r),l*(c-o))},initNonuniformCatmullRom:function(r,o,a,c,l,h,d){let u=(o-r)/l-(a-r)/(l+h)+(a-o)/h,f=(a-o)/h-(c-o)/(h+d)+(c-a)/d;u*=h,f*=h,i(o,a,u,f)},calc:function(r){const o=r*r,a=o*r;return s+t*r+e*o+n*a}}}const Zr=new E,Aa=new dl,Ra=new dl,Ca=new dl;class zv extends Dn{constructor(t=[],e=!1,n="centripetal",i=.5){super(),this.isCatmullRomCurve3=!0,this.type="CatmullRomCurve3",this.points=t,this.closed=e,this.curveType=n,this.tension=i}getPoint(t,e=new E){const n=e,i=this.points,r=i.length,o=(r-(this.closed?0:1))*t;let a=Math.floor(o),c=o-a;this.closed?a+=a>0?0:(Math.floor(Math.abs(a)/r)+1)*r:c===0&&a===r-1&&(a=r-2,c=1);let l,h;this.closed||a>0?l=i[(a-1)%r]:(Zr.subVectors(i[0],i[1]).add(i[0]),l=Zr);const d=i[a%r],u=i[(a+1)%r];if(this.closed||a+2<r?h=i[(a+2)%r]:(Zr.subVectors(i[r-1],i[r-2]).add(i[r-1]),h=Zr),this.curveType==="centripetal"||this.curveType==="chordal"){const f=this.curveType==="chordal"?.5:.25;let p=Math.pow(l.distanceToSquared(d),f),_=Math.pow(d.distanceToSquared(u),f),m=Math.pow(u.distanceToSquared(h),f);_<1e-4&&(_=1),p<1e-4&&(p=_),m<1e-4&&(m=_),Aa.initNonuniformCatmullRom(l.x,d.x,u.x,h.x,p,_,m),Ra.initNonuniformCatmullRom(l.y,d.y,u.y,h.y,p,_,m),Ca.initNonuniformCatmullRom(l.z,d.z,u.z,h.z,p,_,m)}else this.curveType==="catmullrom"&&(Aa.initCatmullRom(l.x,d.x,u.x,h.x,this.tension),Ra.initCatmullRom(l.y,d.y,u.y,h.y,this.tension),Ca.initCatmullRom(l.z,d.z,u.z,h.z,this.tension));return n.set(Aa.calc(c),Ra.calc(c),Ca.calc(c)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(i.clone())}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}toJSON(){const t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){const i=this.points[e];t.points.push(i.toArray())}return t.closed=this.closed,t.curveType=this.curveType,t.tension=this.tension,t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(new E().fromArray(i))}return this.closed=t.closed,this.curveType=t.curveType,this.tension=t.tension,this}}function Vh(s,t,e,n,i){const r=(n-t)*.5,o=(i-e)*.5,a=s*s,c=s*a;return(2*e-2*n+r+o)*c+(-3*e+3*n-2*r-o)*a+r*s+e}function Bv(s,t){const e=1-s;return e*e*t}function Hv(s,t){return 2*(1-s)*s*t}function Gv(s,t){return s*s*t}function rr(s,t,e,n){return Bv(s,t)+Hv(s,e)+Gv(s,n)}function Vv(s,t){const e=1-s;return e*e*e*t}function Wv(s,t){const e=1-s;return 3*e*e*s*t}function Xv(s,t){return 3*(1-s)*s*s*t}function jv(s,t){return s*s*s*t}function or(s,t,e,n,i){return Vv(s,t)+Wv(s,e)+Xv(s,n)+jv(s,i)}class vd extends Dn{constructor(t=new it,e=new it,n=new it,i=new it){super(),this.isCubicBezierCurve=!0,this.type="CubicBezierCurve",this.v0=t,this.v1=e,this.v2=n,this.v3=i}getPoint(t,e=new it){const n=e,i=this.v0,r=this.v1,o=this.v2,a=this.v3;return n.set(or(t,i.x,r.x,o.x,a.x),or(t,i.y,r.y,o.y,a.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}}class $v extends Dn{constructor(t=new E,e=new E,n=new E,i=new E){super(),this.isCubicBezierCurve3=!0,this.type="CubicBezierCurve3",this.v0=t,this.v1=e,this.v2=n,this.v3=i}getPoint(t,e=new E){const n=e,i=this.v0,r=this.v1,o=this.v2,a=this.v3;return n.set(or(t,i.x,r.x,o.x,a.x),or(t,i.y,r.y,o.y,a.y),or(t,i.z,r.z,o.z,a.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this.v3.copy(t.v3),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t.v3=this.v3.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this.v3.fromArray(t.v3),this}}class yd extends Dn{constructor(t=new it,e=new it){super(),this.isLineCurve=!0,this.type="LineCurve",this.v1=t,this.v2=e}getPoint(t,e=new it){const n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new it){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class Yv extends Dn{constructor(t=new E,e=new E){super(),this.isLineCurve3=!0,this.type="LineCurve3",this.v1=t,this.v2=e}getPoint(t,e=new E){const n=e;return t===1?n.copy(this.v2):(n.copy(this.v2).sub(this.v1),n.multiplyScalar(t).add(this.v1)),n}getPointAt(t,e){return this.getPoint(t,e)}getTangent(t,e=new E){return e.subVectors(this.v2,this.v1).normalize()}getTangentAt(t,e){return this.getTangent(t,e)}copy(t){return super.copy(t),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class xd extends Dn{constructor(t=new it,e=new it,n=new it){super(),this.isQuadraticBezierCurve=!0,this.type="QuadraticBezierCurve",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new it){const n=e,i=this.v0,r=this.v1,o=this.v2;return n.set(rr(t,i.x,r.x,o.x),rr(t,i.y,r.y,o.y)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class qv extends Dn{constructor(t=new E,e=new E,n=new E){super(),this.isQuadraticBezierCurve3=!0,this.type="QuadraticBezierCurve3",this.v0=t,this.v1=e,this.v2=n}getPoint(t,e=new E){const n=e,i=this.v0,r=this.v1,o=this.v2;return n.set(rr(t,i.x,r.x,o.x),rr(t,i.y,r.y,o.y),rr(t,i.z,r.z,o.z)),n}copy(t){return super.copy(t),this.v0.copy(t.v0),this.v1.copy(t.v1),this.v2.copy(t.v2),this}toJSON(){const t=super.toJSON();return t.v0=this.v0.toArray(),t.v1=this.v1.toArray(),t.v2=this.v2.toArray(),t}fromJSON(t){return super.fromJSON(t),this.v0.fromArray(t.v0),this.v1.fromArray(t.v1),this.v2.fromArray(t.v2),this}}class Md extends Dn{constructor(t=[]){super(),this.isSplineCurve=!0,this.type="SplineCurve",this.points=t}getPoint(t,e=new it){const n=e,i=this.points,r=(i.length-1)*t,o=Math.floor(r),a=r-o,c=i[o===0?o:o-1],l=i[o],h=i[o>i.length-2?i.length-1:o+1],d=i[o>i.length-3?i.length-1:o+2];return n.set(Vh(a,c.x,l.x,h.x,d.x),Vh(a,c.y,l.y,h.y,d.y)),n}copy(t){super.copy(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(i.clone())}return this}toJSON(){const t=super.toJSON();t.points=[];for(let e=0,n=this.points.length;e<n;e++){const i=this.points[e];t.points.push(i.toArray())}return t}fromJSON(t){super.fromJSON(t),this.points=[];for(let e=0,n=t.points.length;e<n;e++){const i=t.points[e];this.points.push(new it().fromArray(i))}return this}}var Wh=Object.freeze({__proto__:null,ArcCurve:Fv,CatmullRomCurve3:zv,CubicBezierCurve:vd,CubicBezierCurve3:$v,EllipseCurve:ul,LineCurve:yd,LineCurve3:Yv,QuadraticBezierCurve:xd,QuadraticBezierCurve3:qv,SplineCurve:Md});class Kv extends Dn{constructor(){super(),this.type="CurvePath",this.curves=[],this.autoClose=!1}add(t){this.curves.push(t)}closePath(){const t=this.curves[0].getPoint(0),e=this.curves[this.curves.length-1].getPoint(1);if(!t.equals(e)){const n=t.isVector2===!0?"LineCurve":"LineCurve3";this.curves.push(new Wh[n](e,t))}return this}getPoint(t,e){const n=t*this.getLength(),i=this.getCurveLengths();let r=0;for(;r<i.length;){if(i[r]>=n){const o=i[r]-n,a=this.curves[r],c=a.getLength(),l=c===0?0:1-o/c;return a.getPointAt(l,e)}r++}return null}getLength(){const t=this.getCurveLengths();return t[t.length-1]}updateArcLengths(){this.needsUpdate=!0,this.cacheLengths=null,this.getCurveLengths()}getCurveLengths(){if(this.cacheLengths&&this.cacheLengths.length===this.curves.length)return this.cacheLengths;const t=[];let e=0;for(let n=0,i=this.curves.length;n<i;n++)e+=this.curves[n].getLength(),t.push(e);return this.cacheLengths=t,t}getSpacedPoints(t=40){const e=[];for(let n=0;n<=t;n++)e.push(this.getPoint(n/t));return this.autoClose&&e.push(e[0]),e}getPoints(t=12){const e=[];let n;for(let i=0,r=this.curves;i<r.length;i++){const o=r[i],a=o.isEllipseCurve?t*2:o.isLineCurve||o.isLineCurve3?1:o.isSplineCurve?t*o.points.length:t,c=o.getPoints(a);for(let l=0;l<c.length;l++){const h=c[l];n&&n.equals(h)||(e.push(h),n=h)}}return this.autoClose&&e.length>1&&!e[e.length-1].equals(e[0])&&e.push(e[0]),e}copy(t){super.copy(t),this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){const i=t.curves[e];this.curves.push(i.clone())}return this.autoClose=t.autoClose,this}toJSON(){const t=super.toJSON();t.autoClose=this.autoClose,t.curves=[];for(let e=0,n=this.curves.length;e<n;e++){const i=this.curves[e];t.curves.push(i.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.autoClose=t.autoClose,this.curves=[];for(let e=0,n=t.curves.length;e<n;e++){const i=t.curves[e];this.curves.push(new Wh[i.type]().fromJSON(i))}return this}}class Xh extends Kv{constructor(t){super(),this.type="Path",this.currentPoint=new it,t&&this.setFromPoints(t)}setFromPoints(t){this.moveTo(t[0].x,t[0].y);for(let e=1,n=t.length;e<n;e++)this.lineTo(t[e].x,t[e].y);return this}moveTo(t,e){return this.currentPoint.set(t,e),this}lineTo(t,e){const n=new yd(this.currentPoint.clone(),new it(t,e));return this.curves.push(n),this.currentPoint.set(t,e),this}quadraticCurveTo(t,e,n,i){const r=new xd(this.currentPoint.clone(),new it(t,e),new it(n,i));return this.curves.push(r),this.currentPoint.set(n,i),this}bezierCurveTo(t,e,n,i,r,o){const a=new vd(this.currentPoint.clone(),new it(t,e),new it(n,i),new it(r,o));return this.curves.push(a),this.currentPoint.set(r,o),this}splineThru(t){const e=[this.currentPoint.clone()].concat(t),n=new Md(e);return this.curves.push(n),this.currentPoint.copy(t[t.length-1]),this}arc(t,e,n,i,r,o){const a=this.currentPoint.x,c=this.currentPoint.y;return this.absarc(t+a,e+c,n,i,r,o),this}absarc(t,e,n,i,r,o){return this.absellipse(t,e,n,n,i,r,o),this}ellipse(t,e,n,i,r,o,a,c){const l=this.currentPoint.x,h=this.currentPoint.y;return this.absellipse(t+l,e+h,n,i,r,o,a,c),this}absellipse(t,e,n,i,r,o,a,c){const l=new ul(t,e,n,i,r,o,a,c);if(this.curves.length>0){const d=l.getPoint(0);d.equals(this.currentPoint)||this.lineTo(d.x,d.y)}this.curves.push(l);const h=l.getPoint(1);return this.currentPoint.copy(h),this}copy(t){return super.copy(t),this.currentPoint.copy(t.currentPoint),this}toJSON(){const t=super.toJSON();return t.currentPoint=this.currentPoint.toArray(),t}fromJSON(t){return super.fromJSON(t),this.currentPoint.fromArray(t.currentPoint),this}}class Ts extends Me{constructor(t=1,e=32,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:t,segments:e,thetaStart:n,thetaLength:i},e=Math.max(3,e);const r=[],o=[],a=[],c=[],l=new E,h=new it;o.push(0,0,0),a.push(0,0,1),c.push(.5,.5);for(let d=0,u=3;d<=e;d++,u+=3){const f=n+d/e*i;l.x=t*Math.cos(f),l.y=t*Math.sin(f),o.push(l.x,l.y,l.z),a.push(0,0,1),h.x=(o[u]/t+1)/2,h.y=(o[u+1]/t+1)/2,c.push(h.x,h.y)}for(let d=1;d<=e;d++)r.push(d,d+1,0);this.setIndex(r),this.setAttribute("position",new Yt(o,3)),this.setAttribute("normal",new Yt(a,3)),this.setAttribute("uv",new Yt(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ts(t.radius,t.segments,t.thetaStart,t.thetaLength)}}class $t extends Me{constructor(t=1,e=1,n=1,i=32,r=1,o=!1,a=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:i,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:c};const l=this;i=Math.floor(i),r=Math.floor(r);const h=[],d=[],u=[],f=[];let p=0;const _=[],m=n/2;let g=0;x(),o===!1&&(t>0&&v(!0),e>0&&v(!1)),this.setIndex(h),this.setAttribute("position",new Yt(d,3)),this.setAttribute("normal",new Yt(u,3)),this.setAttribute("uv",new Yt(f,2));function x(){const M=new E,C=new E;let R=0;const T=(e-t)/n;for(let L=0;L<=r;L++){const V=[],y=L/r,w=y*(e-t)+t;for(let F=0;F<=i;F++){const B=F/i,W=B*c+a,j=Math.sin(W),H=Math.cos(W);C.x=w*j,C.y=-y*n+m,C.z=w*H,d.push(C.x,C.y,C.z),M.set(j,T,H).normalize(),u.push(M.x,M.y,M.z),f.push(B,1-y),V.push(p++)}_.push(V)}for(let L=0;L<i;L++)for(let V=0;V<r;V++){const y=_[V][L],w=_[V+1][L],F=_[V+1][L+1],B=_[V][L+1];t>0&&(h.push(y,w,B),R+=3),e>0&&(h.push(w,F,B),R+=3)}l.addGroup(g,R,0),g+=R}function v(M){const C=p,R=new it,T=new E;let L=0;const V=M===!0?t:e,y=M===!0?1:-1;for(let F=1;F<=i;F++)d.push(0,m*y,0),u.push(0,y,0),f.push(.5,.5),p++;const w=p;for(let F=0;F<=i;F++){const W=F/i*c+a,j=Math.cos(W),H=Math.sin(W);T.x=V*H,T.y=m*y,T.z=V*j,d.push(T.x,T.y,T.z),u.push(0,y,0),R.x=j*.5+.5,R.y=H*.5*y+.5,f.push(R.x,R.y),p++}for(let F=0;F<i;F++){const B=C+F,W=w+F;M===!0?h.push(W,W+1,B):h.push(W+1,W,B),L+=3}l.addGroup(g,L,M===!0?1:2),g+=L}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new $t(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class fs extends $t{constructor(t=1,e=1,n=32,i=1,r=!1,o=0,a=Math.PI*2){super(0,t,e,n,i,r,o,a),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:o,thetaLength:a}}static fromJSON(t){return new fs(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class Mr extends Me{constructor(t=[],e=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:t,indices:e,radius:n,detail:i};const r=[],o=[];a(i),l(n),h(),this.setAttribute("position",new Yt(r,3)),this.setAttribute("normal",new Yt(r.slice(),3)),this.setAttribute("uv",new Yt(o,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function a(x){const v=new E,M=new E,C=new E;for(let R=0;R<e.length;R+=3)f(e[R+0],v),f(e[R+1],M),f(e[R+2],C),c(v,M,C,x)}function c(x,v,M,C){const R=C+1,T=[];for(let L=0;L<=R;L++){T[L]=[];const V=x.clone().lerp(M,L/R),y=v.clone().lerp(M,L/R),w=R-L;for(let F=0;F<=w;F++)F===0&&L===R?T[L][F]=V:T[L][F]=V.clone().lerp(y,F/w)}for(let L=0;L<R;L++)for(let V=0;V<2*(R-L)-1;V++){const y=Math.floor(V/2);V%2===0?(u(T[L][y+1]),u(T[L+1][y]),u(T[L][y])):(u(T[L][y+1]),u(T[L+1][y+1]),u(T[L+1][y]))}}function l(x){const v=new E;for(let M=0;M<r.length;M+=3)v.x=r[M+0],v.y=r[M+1],v.z=r[M+2],v.normalize().multiplyScalar(x),r[M+0]=v.x,r[M+1]=v.y,r[M+2]=v.z}function h(){const x=new E;for(let v=0;v<r.length;v+=3){x.x=r[v+0],x.y=r[v+1],x.z=r[v+2];const M=m(x)/2/Math.PI+.5,C=g(x)/Math.PI+.5;o.push(M,1-C)}p(),d()}function d(){for(let x=0;x<o.length;x+=6){const v=o[x+0],M=o[x+2],C=o[x+4],R=Math.max(v,M,C),T=Math.min(v,M,C);R>.9&&T<.1&&(v<.2&&(o[x+0]+=1),M<.2&&(o[x+2]+=1),C<.2&&(o[x+4]+=1))}}function u(x){r.push(x.x,x.y,x.z)}function f(x,v){const M=x*3;v.x=t[M+0],v.y=t[M+1],v.z=t[M+2]}function p(){const x=new E,v=new E,M=new E,C=new E,R=new it,T=new it,L=new it;for(let V=0,y=0;V<r.length;V+=9,y+=6){x.set(r[V+0],r[V+1],r[V+2]),v.set(r[V+3],r[V+4],r[V+5]),M.set(r[V+6],r[V+7],r[V+8]),R.set(o[y+0],o[y+1]),T.set(o[y+2],o[y+3]),L.set(o[y+4],o[y+5]),C.copy(x).add(v).add(M).divideScalar(3);const w=m(C);_(R,y+0,x,w),_(T,y+2,v,w),_(L,y+4,M,w)}}function _(x,v,M,C){C<0&&x.x===1&&(o[v]=x.x-1),M.x===0&&M.z===0&&(o[v]=C/2/Math.PI+.5)}function m(x){return Math.atan2(x.z,-x.x)}function g(x){return Math.atan2(-x.y,Math.sqrt(x.x*x.x+x.z*x.z))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Mr(t.vertices,t.indices,t.radius,t.details)}}class fl extends Mr{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,i=1/n,r=[-1,-1,-1,-1,-1,1,-1,1,-1,-1,1,1,1,-1,-1,1,-1,1,1,1,-1,1,1,1,0,-i,-n,0,-i,n,0,i,-n,0,i,n,-i,-n,0,-i,n,0,i,-n,0,i,n,0,-n,0,-i,n,0,-i,-n,0,i,n,0,i],o=[3,11,7,3,7,15,3,15,13,7,19,17,7,17,6,7,6,15,17,4,8,17,8,10,17,10,6,8,0,16,8,16,2,8,2,10,0,12,1,0,1,18,0,18,16,6,10,2,6,2,13,6,13,15,2,16,18,2,18,3,2,3,13,18,1,9,18,9,11,18,11,3,4,14,12,4,12,0,4,0,8,11,9,5,11,5,19,11,19,7,19,5,14,19,14,4,19,4,17,1,12,14,1,14,5,1,5,9];super(r,o,t,e),this.type="DodecahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new fl(t.radius,t.detail)}}class bd extends Xh{constructor(t){super(t),this.uuid=mn(),this.type="Shape",this.holes=[]}getPointsHoles(t){const e=[];for(let n=0,i=this.holes.length;n<i;n++)e[n]=this.holes[n].getPoints(t);return e}extractPoints(t){return{shape:this.getPoints(t),holes:this.getPointsHoles(t)}}copy(t){super.copy(t),this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){const i=t.holes[e];this.holes.push(i.clone())}return this}toJSON(){const t=super.toJSON();t.uuid=this.uuid,t.holes=[];for(let e=0,n=this.holes.length;e<n;e++){const i=this.holes[e];t.holes.push(i.toJSON())}return t}fromJSON(t){super.fromJSON(t),this.uuid=t.uuid,this.holes=[];for(let e=0,n=t.holes.length;e<n;e++){const i=t.holes[e];this.holes.push(new Xh().fromJSON(i))}return this}}const Zv={triangulate:function(s,t,e=2){const n=t&&t.length,i=n?t[0]*e:s.length;let r=Sd(s,0,i,e,!0);const o=[];if(!r||r.next===r.prev)return o;let a,c,l,h,d,u,f;if(n&&(r=ny(s,t,r,e)),s.length>80*e){a=l=s[0],c=h=s[1];for(let p=e;p<i;p+=e)d=s[p],u=s[p+1],d<a&&(a=d),u<c&&(c=u),d>l&&(l=d),u>h&&(h=u);f=Math.max(l-a,h-c),f=f!==0?32767/f:0}return mr(r,o,e,a,c,f,0),o}};function Sd(s,t,e,n,i){let r,o;if(i===fy(s,t,e,n)>0)for(r=t;r<e;r+=n)o=jh(r,s[r],s[r+1],o);else for(r=e-n;r>=t;r-=n)o=jh(r,s[r],s[r+1],o);return o&&Bo(o,o.next)&&(_r(o),o=o.next),o}function Fi(s,t){if(!s)return s;t||(t=s);let e=s,n;do if(n=!1,!e.steiner&&(Bo(e,e.next)||ve(e.prev,e,e.next)===0)){if(_r(e),e=t=e.prev,e===e.next)break;n=!0}else e=e.next;while(n||e!==t);return t}function mr(s,t,e,n,i,r,o){if(!s)return;!o&&r&&ay(s,n,i,r);let a=s,c,l;for(;s.prev!==s.next;){if(c=s.prev,l=s.next,r?Qv(s,n,i,r):Jv(s)){t.push(c.i/e|0),t.push(s.i/e|0),t.push(l.i/e|0),_r(s),s=l.next,a=l.next;continue}if(s=l,s===a){o?o===1?(s=ty(Fi(s),t,e),mr(s,t,e,n,i,r,2)):o===2&&ey(s,t,e,n,i,r):mr(Fi(s),t,e,n,i,r,1);break}}}function Jv(s){const t=s.prev,e=s,n=s.next;if(ve(t,e,n)>=0)return!1;const i=t.x,r=e.x,o=n.x,a=t.y,c=e.y,l=n.y,h=i<r?i<o?i:o:r<o?r:o,d=a<c?a<l?a:l:c<l?c:l,u=i>r?i>o?i:o:r>o?r:o,f=a>c?a>l?a:l:c>l?c:l;let p=n.next;for(;p!==t;){if(p.x>=h&&p.x<=u&&p.y>=d&&p.y<=f&&as(i,a,r,c,o,l,p.x,p.y)&&ve(p.prev,p,p.next)>=0)return!1;p=p.next}return!0}function Qv(s,t,e,n){const i=s.prev,r=s,o=s.next;if(ve(i,r,o)>=0)return!1;const a=i.x,c=r.x,l=o.x,h=i.y,d=r.y,u=o.y,f=a<c?a<l?a:l:c<l?c:l,p=h<d?h<u?h:u:d<u?d:u,_=a>c?a>l?a:l:c>l?c:l,m=h>d?h>u?h:u:d>u?d:u,g=Uc(f,p,t,e,n),x=Uc(_,m,t,e,n);let v=s.prevZ,M=s.nextZ;for(;v&&v.z>=g&&M&&M.z<=x;){if(v.x>=f&&v.x<=_&&v.y>=p&&v.y<=m&&v!==i&&v!==o&&as(a,h,c,d,l,u,v.x,v.y)&&ve(v.prev,v,v.next)>=0||(v=v.prevZ,M.x>=f&&M.x<=_&&M.y>=p&&M.y<=m&&M!==i&&M!==o&&as(a,h,c,d,l,u,M.x,M.y)&&ve(M.prev,M,M.next)>=0))return!1;M=M.nextZ}for(;v&&v.z>=g;){if(v.x>=f&&v.x<=_&&v.y>=p&&v.y<=m&&v!==i&&v!==o&&as(a,h,c,d,l,u,v.x,v.y)&&ve(v.prev,v,v.next)>=0)return!1;v=v.prevZ}for(;M&&M.z<=x;){if(M.x>=f&&M.x<=_&&M.y>=p&&M.y<=m&&M!==i&&M!==o&&as(a,h,c,d,l,u,M.x,M.y)&&ve(M.prev,M,M.next)>=0)return!1;M=M.nextZ}return!0}function ty(s,t,e){let n=s;do{const i=n.prev,r=n.next.next;!Bo(i,r)&&wd(i,n,n.next,r)&&gr(i,r)&&gr(r,i)&&(t.push(i.i/e|0),t.push(n.i/e|0),t.push(r.i/e|0),_r(n),_r(n.next),n=s=r),n=n.next}while(n!==s);return Fi(n)}function ey(s,t,e,n,i,r){let o=s;do{let a=o.next.next;for(;a!==o.prev;){if(o.i!==a.i&&hy(o,a)){let c=Ed(o,a);o=Fi(o,o.next),c=Fi(c,c.next),mr(o,t,e,n,i,r,0),mr(c,t,e,n,i,r,0);return}a=a.next}o=o.next}while(o!==s)}function ny(s,t,e,n){const i=[];let r,o,a,c,l;for(r=0,o=t.length;r<o;r++)a=t[r]*n,c=r<o-1?t[r+1]*n:s.length,l=Sd(s,a,c,n,!1),l===l.next&&(l.steiner=!0),i.push(ly(l));for(i.sort(iy),r=0;r<i.length;r++)e=sy(i[r],e);return e}function iy(s,t){return s.x-t.x}function sy(s,t){const e=ry(s,t);if(!e)return t;const n=Ed(e,s);return Fi(n,n.next),Fi(e,e.next)}function ry(s,t){let e=t,n=-1/0,i;const r=s.x,o=s.y;do{if(o<=e.y&&o>=e.next.y&&e.next.y!==e.y){const u=e.x+(o-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(u<=r&&u>n&&(n=u,i=e.x<e.next.x?e:e.next,u===r))return i}e=e.next}while(e!==t);if(!i)return null;const a=i,c=i.x,l=i.y;let h=1/0,d;e=i;do r>=e.x&&e.x>=c&&r!==e.x&&as(o<l?r:n,o,c,l,o<l?n:r,o,e.x,e.y)&&(d=Math.abs(o-e.y)/(r-e.x),gr(e,s)&&(d<h||d===h&&(e.x>i.x||e.x===i.x&&oy(i,e)))&&(i=e,h=d)),e=e.next;while(e!==a);return i}function oy(s,t){return ve(s.prev,s,t.prev)<0&&ve(t.next,s,s.next)<0}function ay(s,t,e,n){let i=s;do i.z===0&&(i.z=Uc(i.x,i.y,t,e,n)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==s);i.prevZ.nextZ=null,i.prevZ=null,cy(i)}function cy(s){let t,e,n,i,r,o,a,c,l=1;do{for(e=s,s=null,r=null,o=0;e;){for(o++,n=e,a=0,t=0;t<l&&(a++,n=n.nextZ,!!n);t++);for(c=l;a>0||c>0&&n;)a!==0&&(c===0||!n||e.z<=n.z)?(i=e,e=e.nextZ,a--):(i=n,n=n.nextZ,c--),r?r.nextZ=i:s=i,i.prevZ=r,r=i;e=n}r.nextZ=null,l*=2}while(o>1);return s}function Uc(s,t,e,n,i){return s=(s-e)*i|0,t=(t-n)*i|0,s=(s|s<<8)&16711935,s=(s|s<<4)&252645135,s=(s|s<<2)&858993459,s=(s|s<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,s|t<<1}function ly(s){let t=s,e=s;do(t.x<e.x||t.x===e.x&&t.y<e.y)&&(e=t),t=t.next;while(t!==s);return e}function as(s,t,e,n,i,r,o,a){return(i-o)*(t-a)>=(s-o)*(r-a)&&(s-o)*(n-a)>=(e-o)*(t-a)&&(e-o)*(r-a)>=(i-o)*(n-a)}function hy(s,t){return s.next.i!==t.i&&s.prev.i!==t.i&&!uy(s,t)&&(gr(s,t)&&gr(t,s)&&dy(s,t)&&(ve(s.prev,s,t.prev)||ve(s,t.prev,t))||Bo(s,t)&&ve(s.prev,s,s.next)>0&&ve(t.prev,t,t.next)>0)}function ve(s,t,e){return(t.y-s.y)*(e.x-t.x)-(t.x-s.x)*(e.y-t.y)}function Bo(s,t){return s.x===t.x&&s.y===t.y}function wd(s,t,e,n){const i=Qr(ve(s,t,e)),r=Qr(ve(s,t,n)),o=Qr(ve(e,n,s)),a=Qr(ve(e,n,t));return!!(i!==r&&o!==a||i===0&&Jr(s,e,t)||r===0&&Jr(s,n,t)||o===0&&Jr(e,s,n)||a===0&&Jr(e,t,n))}function Jr(s,t,e){return t.x<=Math.max(s.x,e.x)&&t.x>=Math.min(s.x,e.x)&&t.y<=Math.max(s.y,e.y)&&t.y>=Math.min(s.y,e.y)}function Qr(s){return s>0?1:s<0?-1:0}function uy(s,t){let e=s;do{if(e.i!==s.i&&e.next.i!==s.i&&e.i!==t.i&&e.next.i!==t.i&&wd(e,e.next,s,t))return!0;e=e.next}while(e!==s);return!1}function gr(s,t){return ve(s.prev,s,s.next)<0?ve(s,t,s.next)>=0&&ve(s,s.prev,t)>=0:ve(s,t,s.prev)<0||ve(s,s.next,t)<0}function dy(s,t){let e=s,n=!1;const i=(s.x+t.x)/2,r=(s.y+t.y)/2;do e.y>r!=e.next.y>r&&e.next.y!==e.y&&i<(e.next.x-e.x)*(r-e.y)/(e.next.y-e.y)+e.x&&(n=!n),e=e.next;while(e!==s);return n}function Ed(s,t){const e=new kc(s.i,s.x,s.y),n=new kc(t.i,t.x,t.y),i=s.next,r=t.prev;return s.next=t,t.prev=s,e.next=i,i.prev=e,n.next=e,e.prev=n,r.next=n,n.prev=r,n}function jh(s,t,e,n){const i=new kc(s,t,e);return n?(i.next=n.next,i.prev=n,n.next.prev=i,n.next=i):(i.prev=i,i.next=i),i}function _r(s){s.next.prev=s.prev,s.prev.next=s.next,s.prevZ&&(s.prevZ.nextZ=s.nextZ),s.nextZ&&(s.nextZ.prevZ=s.prevZ)}function kc(s,t,e){this.i=s,this.x=t,this.y=e,this.prev=null,this.next=null,this.z=0,this.prevZ=null,this.nextZ=null,this.steiner=!1}function fy(s,t,e,n){let i=0;for(let r=t,o=e-n;r<e;r+=n)i+=(s[o]-s[r])*(s[r+1]+s[o+1]),o=r;return i}class ar{static area(t){const e=t.length;let n=0;for(let i=e-1,r=0;r<e;i=r++)n+=t[i].x*t[r].y-t[r].x*t[i].y;return n*.5}static isClockWise(t){return ar.area(t)<0}static triangulateShape(t,e){const n=[],i=[],r=[];$h(t),Yh(n,t);let o=t.length;e.forEach($h);for(let c=0;c<e.length;c++)i.push(o),o+=e[c].length,Yh(n,e[c]);const a=Zv.triangulate(n,i);for(let c=0;c<a.length;c+=3)r.push(a.slice(c,c+3));return r}}function $h(s){const t=s.length;t>2&&s[t-1].equals(s[0])&&s.pop()}function Yh(s,t){for(let e=0;e<t.length;e++)s.push(t[e].x),s.push(t[e].y)}class Li extends Mr{constructor(t=1,e=0){const n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,r,t,e),this.type="IcosahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new Li(t.radius,t.detail)}}class Ii extends Mr{constructor(t=1,e=0){const n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],i=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,i,t,e),this.type="OctahedronGeometry",this.parameters={radius:t,detail:e}}static fromJSON(t){return new Ii(t.radius,t.detail)}}class pl extends Me{constructor(t=.5,e=1,n=32,i=1,r=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:t,outerRadius:e,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:o},n=Math.max(3,n),i=Math.max(1,i);const a=[],c=[],l=[],h=[];let d=t;const u=(e-t)/i,f=new E,p=new it;for(let _=0;_<=i;_++){for(let m=0;m<=n;m++){const g=r+m/n*o;f.x=d*Math.cos(g),f.y=d*Math.sin(g),c.push(f.x,f.y,f.z),l.push(0,0,1),p.x=(f.x/e+1)/2,p.y=(f.y/e+1)/2,h.push(p.x,p.y)}d+=u}for(let _=0;_<i;_++){const m=_*(n+1);for(let g=0;g<n;g++){const x=g+m,v=x,M=x+n+1,C=x+n+2,R=x+1;a.push(v,M,R),a.push(M,C,R)}}this.setIndex(a),this.setAttribute("position",new Yt(c,3)),this.setAttribute("normal",new Yt(l,3)),this.setAttribute("uv",new Yt(h,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new pl(t.innerRadius,t.outerRadius,t.thetaSegments,t.phiSegments,t.thetaStart,t.thetaLength)}}class ml extends Me{constructor(t=new bd([new it(0,.5),new it(-.5,-.5),new it(.5,-.5)]),e=12){super(),this.type="ShapeGeometry",this.parameters={shapes:t,curveSegments:e};const n=[],i=[],r=[],o=[];let a=0,c=0;if(Array.isArray(t)===!1)l(t);else for(let h=0;h<t.length;h++)l(t[h]),this.addGroup(a,c,h),a+=c,c=0;this.setIndex(n),this.setAttribute("position",new Yt(i,3)),this.setAttribute("normal",new Yt(r,3)),this.setAttribute("uv",new Yt(o,2));function l(h){const d=i.length/3,u=h.extractPoints(e);let f=u.shape;const p=u.holes;ar.isClockWise(f)===!1&&(f=f.reverse());for(let m=0,g=p.length;m<g;m++){const x=p[m];ar.isClockWise(x)===!0&&(p[m]=x.reverse())}const _=ar.triangulateShape(f,p);for(let m=0,g=p.length;m<g;m++){const x=p[m];f=f.concat(x)}for(let m=0,g=f.length;m<g;m++){const x=f[m];i.push(x.x,x.y,0),r.push(0,0,1),o.push(x.x,x.y)}for(let m=0,g=_.length;m<g;m++){const x=_[m],v=x[0]+d,M=x[1]+d,C=x[2]+d;n.push(v,M,C),c+=3}}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}toJSON(){const t=super.toJSON(),e=this.parameters.shapes;return py(e,t)}static fromJSON(t,e){const n=[];for(let i=0,r=t.shapes.length;i<r;i++){const o=e[t.shapes[i]];n.push(o)}return new ml(n,t.curveSegments)}}function py(s,t){if(t.shapes=[],Array.isArray(s))for(let e=0,n=s.length;e<n;e++){const i=s[e];t.shapes.push(i.uuid)}else t.shapes.push(s.uuid);return t}class Ue extends Me{constructor(t=1,e=32,n=16,i=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:i,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));const c=Math.min(o+a,Math.PI);let l=0;const h=[],d=new E,u=new E,f=[],p=[],_=[],m=[];for(let g=0;g<=n;g++){const x=[],v=g/n;let M=0;g===0&&o===0?M=.5/e:g===n&&c===Math.PI&&(M=-.5/e);for(let C=0;C<=e;C++){const R=C/e;d.x=-t*Math.cos(i+R*r)*Math.sin(o+v*a),d.y=t*Math.cos(o+v*a),d.z=t*Math.sin(i+R*r)*Math.sin(o+v*a),p.push(d.x,d.y,d.z),u.copy(d).normalize(),_.push(u.x,u.y,u.z),m.push(R+M,1-v),x.push(l++)}h.push(x)}for(let g=0;g<n;g++)for(let x=0;x<e;x++){const v=h[g][x+1],M=h[g][x],C=h[g+1][x],R=h[g+1][x+1];(g!==0||o>0)&&f.push(v,M,R),(g!==n-1||c<Math.PI)&&f.push(M,C,R)}this.setIndex(f),this.setAttribute("position",new Yt(p,3)),this.setAttribute("normal",new Yt(_,3)),this.setAttribute("uv",new Yt(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Ue(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}}class ln extends Me{constructor(t=1,e=.4,n=12,i=48,r=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:t,tube:e,radialSegments:n,tubularSegments:i,arc:r},n=Math.floor(n),i=Math.floor(i);const o=[],a=[],c=[],l=[],h=new E,d=new E,u=new E;for(let f=0;f<=n;f++)for(let p=0;p<=i;p++){const _=p/i*r,m=f/n*Math.PI*2;d.x=(t+e*Math.cos(m))*Math.cos(_),d.y=(t+e*Math.cos(m))*Math.sin(_),d.z=e*Math.sin(m),a.push(d.x,d.y,d.z),h.x=t*Math.cos(_),h.y=t*Math.sin(_),u.subVectors(d,h).normalize(),c.push(u.x,u.y,u.z),l.push(p/i),l.push(f/n)}for(let f=1;f<=n;f++)for(let p=1;p<=i;p++){const _=(i+1)*f+p-1,m=(i+1)*(f-1)+p-1,g=(i+1)*(f-1)+p,x=(i+1)*f+p;o.push(_,m,x),o.push(m,g,x)}this.setIndex(o),this.setAttribute("position",new Yt(a,3)),this.setAttribute("normal",new Yt(c,3)),this.setAttribute("uv",new Yt(l,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new ln(t.radius,t.tube,t.radialSegments,t.tubularSegments,t.arc)}}class gi extends Pn{constructor(t){super(),this.isMeshStandardMaterial=!0,this.defines={STANDARD:""},this.type="MeshStandardMaterial",this.color=new Tt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Tt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Zu,this.normalScale=new it(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new En,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Nn extends gi{constructor(t){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new it(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return Re(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new Tt(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new Tt(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new Tt(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(t)}get anisotropy(){return this._anisotropy}set anisotropy(t){this._anisotropy>0!=t>0&&this.version++,this._anisotropy=t}get clearcoat(){return this._clearcoat}set clearcoat(t){this._clearcoat>0!=t>0&&this.version++,this._clearcoat=t}get iridescence(){return this._iridescence}set iridescence(t){this._iridescence>0!=t>0&&this.version++,this._iridescence=t}get dispersion(){return this._dispersion}set dispersion(t){this._dispersion>0!=t>0&&this.version++,this._dispersion=t}get sheen(){return this._sheen}set sheen(t){this._sheen>0!=t>0&&this.version++,this._sheen=t}get transmission(){return this._transmission}set transmission(t){this._transmission>0!=t>0&&this.version++,this._transmission=t}copy(t){return super.copy(t),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=t.anisotropy,this.anisotropyRotation=t.anisotropyRotation,this.anisotropyMap=t.anisotropyMap,this.clearcoat=t.clearcoat,this.clearcoatMap=t.clearcoatMap,this.clearcoatRoughness=t.clearcoatRoughness,this.clearcoatRoughnessMap=t.clearcoatRoughnessMap,this.clearcoatNormalMap=t.clearcoatNormalMap,this.clearcoatNormalScale.copy(t.clearcoatNormalScale),this.dispersion=t.dispersion,this.ior=t.ior,this.iridescence=t.iridescence,this.iridescenceMap=t.iridescenceMap,this.iridescenceIOR=t.iridescenceIOR,this.iridescenceThicknessRange=[...t.iridescenceThicknessRange],this.iridescenceThicknessMap=t.iridescenceThicknessMap,this.sheen=t.sheen,this.sheenColor.copy(t.sheenColor),this.sheenColorMap=t.sheenColorMap,this.sheenRoughness=t.sheenRoughness,this.sheenRoughnessMap=t.sheenRoughnessMap,this.transmission=t.transmission,this.transmissionMap=t.transmissionMap,this.thickness=t.thickness,this.thicknessMap=t.thicknessMap,this.attenuationDistance=t.attenuationDistance,this.attenuationColor.copy(t.attenuationColor),this.specularIntensity=t.specularIntensity,this.specularIntensityMap=t.specularIntensityMap,this.specularColor.copy(t.specularColor),this.specularColorMap=t.specularColorMap,this}}class my extends zo{constructor(t){super(),this.isLineDashedMaterial=!0,this.type="LineDashedMaterial",this.scale=1,this.dashSize=3,this.gapSize=1,this.setValues(t)}copy(t){return super.copy(t),this.scale=t.scale,this.dashSize=t.dashSize,this.gapSize=t.gapSize,this}}function to(s,t,e){return!s||!e&&s.constructor===t?s:typeof t.BYTES_PER_ELEMENT=="number"?new t(s):Array.prototype.slice.call(s)}function gy(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}function _y(s){function t(i,r){return s[i]-s[r]}const e=s.length,n=new Array(e);for(let i=0;i!==e;++i)n[i]=i;return n.sort(t),n}function qh(s,t,e){const n=s.length,i=new s.constructor(n);for(let r=0,o=0;o!==n;++r){const a=e[r]*t;for(let c=0;c!==t;++c)i[o++]=s[a+c]}return i}function Td(s,t,e,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let o=r[n];if(o!==void 0)if(Array.isArray(o))do o=r[n],o!==void 0&&(t.push(r.time),e.push.apply(e,o)),r=s[i++];while(r!==void 0);else if(o.toArray!==void 0)do o=r[n],o!==void 0&&(t.push(r.time),o.toArray(e,e.length)),r=s[i++];while(r!==void 0);else do o=r[n],o!==void 0&&(t.push(r.time),e.push(o)),r=s[i++];while(r!==void 0)}class br{constructor(t,e,n,i){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){const e=this.parameterPositions;let n=this._cachedIndex,i=e[n],r=e[n-1];t:{e:{let o;n:{i:if(!(t<i)){for(let a=n+2;;){if(i===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=i,i=e[++n],t<i)break e}o=e.length;break n}if(!(t>=r)){const a=e[1];t<a&&(n=2,r=a);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(i=r,r=e[--n-1],t>=r)break e}o=n,n=0;break n}break t}for(;n<o;){const a=n+o>>>1;t<e[a]?o=a:n=a+1}if(i=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,t,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){const e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i;for(let o=0;o!==i;++o)e[o]=n[r+o];return e}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}}class vy extends br{constructor(t,e,n,i){super(t,e,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:kl,endingEnd:kl}}intervalChanged_(t,e,n){const i=this.parameterPositions;let r=t-2,o=t+1,a=i[r],c=i[o];if(a===void 0)switch(this.getSettings_().endingStart){case Ol:r=t,a=2*e-n;break;case Fl:r=i.length-2,a=e+i[r]-i[r+1];break;default:r=t,a=n}if(c===void 0)switch(this.getSettings_().endingEnd){case Ol:o=t,c=2*n-e;break;case Fl:o=1,c=n+i[1]-i[0];break;default:o=t-1,c=e}const l=(n-e)*.5,h=this.valueSize;this._weightPrev=l/(e-a),this._weightNext=l/(c-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(t,e,n,i){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=t*a,l=c-a,h=this._offsetPrev,d=this._offsetNext,u=this._weightPrev,f=this._weightNext,p=(n-e)/(i-e),_=p*p,m=_*p,g=-u*m+2*u*_-u*p,x=(1+u)*m+(-1.5-2*u)*_+(-.5+u)*p+1,v=(-1-f)*m+(1.5+f)*_+.5*p,M=f*m-f*_;for(let C=0;C!==a;++C)r[C]=g*o[h+C]+x*o[l+C]+v*o[c+C]+M*o[d+C];return r}}class yy extends br{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=t*a,l=c-a,h=(n-e)/(i-e),d=1-h;for(let u=0;u!==a;++u)r[u]=o[l+u]*d+o[c+u]*h;return r}}class xy extends br{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t){return this.copySampleValue_(t-1)}}class Un{constructor(t,e,n,i){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=to(e,this.TimeBufferType),this.values=to(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(t){const e=t.constructor;let n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:to(t.times,Array),values:to(t.values,Array)};const i=t.getInterpolation();i!==t.DefaultInterpolation&&(n.interpolation=i)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new xy(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new yy(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new vy(this.times,this.values,this.getValueSize(),t)}setInterpolation(t){let e;switch(t){case dr:e=this.InterpolantFactoryMethodDiscrete;break;case fr:e=this.InterpolantFactoryMethodLinear;break;case qo:e=this.InterpolantFactoryMethodSmooth;break}if(e===void 0){const n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return dr;case this.InterpolantFactoryMethodLinear:return fr;case this.InterpolantFactoryMethodSmooth:return qo}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){const e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]+=t}return this}scale(t){if(t!==1){const e=this.times;for(let n=0,i=e.length;n!==i;++n)e[n]*=t}return this}trim(t,e){const n=this.times,i=n.length;let r=0,o=i-1;for(;r!==i&&n[r]<t;)++r;for(;o!==-1&&n[o]>e;)--o;if(++o,r!==0||o!==i){r>=o&&(o=Math.max(o,1),r=o-1);const a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let t=!0;const e=this.getValueSize();e-Math.floor(e)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),t=!1);const n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),t=!1);let o=null;for(let a=0;a!==r;a++){const c=n[a];if(typeof c=="number"&&isNaN(c)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,c),t=!1;break}if(o!==null&&o>c){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,c,o),t=!1;break}o=c}if(i!==void 0&&gy(i))for(let a=0,c=i.length;a!==c;++a){const l=i[a];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,l),t=!1;break}}return t}optimize(){const t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===qo,r=t.length-1;let o=1;for(let a=1;a<r;++a){let c=!1;const l=t[a],h=t[a+1];if(l!==h&&(a!==1||l!==t[0]))if(i)c=!0;else{const d=a*n,u=d-n,f=d+n;for(let p=0;p!==n;++p){const _=e[d+p];if(_!==e[u+p]||_!==e[f+p]){c=!0;break}}}if(c){if(a!==o){t[o]=t[a];const d=a*n,u=o*n;for(let f=0;f!==n;++f)e[u+f]=e[d+f]}++o}}if(r>0){t[o]=t[r];for(let a=r*n,c=o*n,l=0;l!==n;++l)e[c+l]=e[a+l];++o}return o!==t.length?(this.times=t.slice(0,o),this.values=e.slice(0,o*n)):(this.times=t,this.values=e),this}clone(){const t=this.times.slice(),e=this.values.slice(),n=this.constructor,i=new n(this.name,t,e);return i.createInterpolant=this.createInterpolant,i}}Un.prototype.TimeBufferType=Float32Array;Un.prototype.ValueBufferType=Float32Array;Un.prototype.DefaultInterpolation=fr;class Us extends Un{constructor(t,e,n){super(t,e,n)}}Us.prototype.ValueTypeName="bool";Us.prototype.ValueBufferType=Array;Us.prototype.DefaultInterpolation=dr;Us.prototype.InterpolantFactoryMethodLinear=void 0;Us.prototype.InterpolantFactoryMethodSmooth=void 0;class Ad extends Un{}Ad.prototype.ValueTypeName="color";class As extends Un{}As.prototype.ValueTypeName="number";class My extends br{constructor(t,e,n,i){super(t,e,n,i)}interpolate_(t,e,n,i){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=(n-e)/(i-e);let l=t*a;for(let h=l+a;l!==h;l+=4)Te.slerpFlat(r,0,o,l-a,o,l,c);return r}}class Rs extends Un{InterpolantFactoryMethodLinear(t){return new My(this.times,this.values,this.getValueSize(),t)}}Rs.prototype.ValueTypeName="quaternion";Rs.prototype.InterpolantFactoryMethodSmooth=void 0;class ks extends Un{constructor(t,e,n){super(t,e,n)}}ks.prototype.ValueTypeName="string";ks.prototype.ValueBufferType=Array;ks.prototype.DefaultInterpolation=dr;ks.prototype.InterpolantFactoryMethodLinear=void 0;ks.prototype.InterpolantFactoryMethodSmooth=void 0;class Cs extends Un{}Cs.prototype.ValueTypeName="vector";class by{constructor(t="",e=-1,n=[],i=Bf){this.name=t,this.tracks=n,this.duration=e,this.blendMode=i,this.uuid=mn(),this.duration<0&&this.resetDuration()}static parse(t){const e=[],n=t.tracks,i=1/(t.fps||1);for(let o=0,a=n.length;o!==a;++o)e.push(wy(n[o]).scale(i));const r=new this(t.name,t.duration,e,t.blendMode);return r.uuid=t.uuid,r}static toJSON(t){const e=[],n=t.tracks,i={name:t.name,duration:t.duration,tracks:e,uuid:t.uuid,blendMode:t.blendMode};for(let r=0,o=n.length;r!==o;++r)e.push(Un.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(t,e,n,i){const r=e.length,o=[];for(let a=0;a<r;a++){let c=[],l=[];c.push((a+r-1)%r,a,(a+1)%r),l.push(0,1,0);const h=_y(c);c=qh(c,1,h),l=qh(l,1,h),!i&&c[0]===0&&(c.push(r),l.push(l[0])),o.push(new As(".morphTargetInfluences["+e[a].name+"]",c,l).scale(1/n))}return new this(t,-1,o)}static findByName(t,e){let n=t;if(!Array.isArray(t)){const i=t;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===e)return n[i];return null}static CreateClipsFromMorphTargetSequences(t,e,n){const i={},r=/^([\w-]*?)([\d]+)$/;for(let a=0,c=t.length;a<c;a++){const l=t[a],h=l.name.match(r);if(h&&h.length>1){const d=h[1];let u=i[d];u||(i[d]=u=[]),u.push(l)}}const o=[];for(const a in i)o.push(this.CreateFromMorphTargetSequence(a,i[a],e,n));return o}static parseAnimation(t,e){if(!t)return console.error("THREE.AnimationClip: No animation in JSONLoader data."),null;const n=function(d,u,f,p,_){if(f.length!==0){const m=[],g=[];Td(f,m,g,p),m.length!==0&&_.push(new d(u,m,g))}},i=[],r=t.name||"default",o=t.fps||30,a=t.blendMode;let c=t.length||-1;const l=t.hierarchy||[];for(let d=0;d<l.length;d++){const u=l[d].keys;if(!(!u||u.length===0))if(u[0].morphTargets){const f={};let p;for(p=0;p<u.length;p++)if(u[p].morphTargets)for(let _=0;_<u[p].morphTargets.length;_++)f[u[p].morphTargets[_]]=-1;for(const _ in f){const m=[],g=[];for(let x=0;x!==u[p].morphTargets.length;++x){const v=u[p];m.push(v.time),g.push(v.morphTarget===_?1:0)}i.push(new As(".morphTargetInfluence["+_+"]",m,g))}c=f.length*o}else{const f=".bones["+e[d].name+"]";n(Cs,f+".position",u,"pos",i),n(Rs,f+".quaternion",u,"rot",i),n(Cs,f+".scale",u,"scl",i)}}return i.length===0?null:new this(r,c,i,a)}resetDuration(){const t=this.tracks;let e=0;for(let n=0,i=t.length;n!==i;++n){const r=this.tracks[n];e=Math.max(e,r.times[r.times.length-1])}return this.duration=e,this}trim(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].trim(0,this.duration);return this}validate(){let t=!0;for(let e=0;e<this.tracks.length;e++)t=t&&this.tracks[e].validate();return t}optimize(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].optimize();return this}clone(){const t=[];for(let e=0;e<this.tracks.length;e++)t.push(this.tracks[e].clone());return new this.constructor(this.name,this.duration,t,this.blendMode)}toJSON(){return this.constructor.toJSON(this)}}function Sy(s){switch(s.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return As;case"vector":case"vector2":case"vector3":case"vector4":return Cs;case"color":return Ad;case"quaternion":return Rs;case"bool":case"boolean":return Us;case"string":return ks}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+s)}function wy(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");const t=Sy(s.type);if(s.times===void 0){const e=[],n=[];Td(s.keys,e,n,"value"),s.times=e,s.values=n}return t.parse!==void 0?t.parse(s):new t(s.name,s.times,s.values,s.interpolation)}const ui={enabled:!1,files:{},add:function(s,t){this.enabled!==!1&&(this.files[s]=t)},get:function(s){if(this.enabled!==!1)return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}};class Ey{constructor(t,e,n){const i=this;let r=!1,o=0,a=0,c;const l=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this.itemStart=function(h){a++,r===!1&&i.onStart!==void 0&&i.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,i.onProgress!==void 0&&i.onProgress(h,o,a),o===a&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return c?c(h):h},this.setURLModifier=function(h){return c=h,this},this.addHandler=function(h,d){return l.push(h,d),this},this.removeHandler=function(h){const d=l.indexOf(h);return d!==-1&&l.splice(d,2),this},this.getHandler=function(h){for(let d=0,u=l.length;d<u;d+=2){const f=l[d],p=l[d+1];if(f.global&&(f.lastIndex=0),f.test(h))return p}return null}}}const Ty=new Ey;class Os{constructor(t){this.manager=t!==void 0?t:Ty,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(t,e){const n=this;return new Promise(function(i,r){n.load(t,i,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}}Os.DEFAULT_MATERIAL_NAME="__DEFAULT";const Gn={};class Ay extends Error{constructor(t,e){super(t),this.response=e}}class Rd extends Os{constructor(t){super(t)}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const r=ui.get(t);if(r!==void 0)return this.manager.itemStart(t),setTimeout(()=>{e&&e(r),this.manager.itemEnd(t)},0),r;if(Gn[t]!==void 0){Gn[t].push({onLoad:e,onProgress:n,onError:i});return}Gn[t]=[],Gn[t].push({onLoad:e,onProgress:n,onError:i});const o=new Request(t,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin"}),a=this.mimeType,c=this.responseType;fetch(o).then(l=>{if(l.status===200||l.status===0){if(l.status===0&&console.warn("THREE.FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||l.body===void 0||l.body.getReader===void 0)return l;const h=Gn[t],d=l.body.getReader(),u=l.headers.get("X-File-Size")||l.headers.get("Content-Length"),f=u?parseInt(u):0,p=f!==0;let _=0;const m=new ReadableStream({start(g){x();function x(){d.read().then(({done:v,value:M})=>{if(v)g.close();else{_+=M.byteLength;const C=new ProgressEvent("progress",{lengthComputable:p,loaded:_,total:f});for(let R=0,T=h.length;R<T;R++){const L=h[R];L.onProgress&&L.onProgress(C)}g.enqueue(M),x()}},v=>{g.error(v)})}}});return new Response(m)}else throw new Ay(`fetch for "${l.url}" responded with ${l.status}: ${l.statusText}`,l)}).then(l=>{switch(c){case"arraybuffer":return l.arrayBuffer();case"blob":return l.blob();case"document":return l.text().then(h=>new DOMParser().parseFromString(h,a));case"json":return l.json();default:if(a===void 0)return l.text();{const d=/charset="?([^;"\s]*)"?/i.exec(a),u=d&&d[1]?d[1].toLowerCase():void 0,f=new TextDecoder(u);return l.arrayBuffer().then(p=>f.decode(p))}}}).then(l=>{ui.add(t,l);const h=Gn[t];delete Gn[t];for(let d=0,u=h.length;d<u;d++){const f=h[d];f.onLoad&&f.onLoad(l)}}).catch(l=>{const h=Gn[t];if(h===void 0)throw this.manager.itemError(t),l;delete Gn[t];for(let d=0,u=h.length;d<u;d++){const f=h[d];f.onError&&f.onError(l)}this.manager.itemError(t)}).finally(()=>{this.manager.itemEnd(t)}),this.manager.itemStart(t)}setResponseType(t){return this.responseType=t,this}setMimeType(t){return this.mimeType=t,this}}class Ry extends Os{constructor(t){super(t)}load(t,e,n,i){this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const r=this,o=ui.get(t);if(o!==void 0)return r.manager.itemStart(t),setTimeout(function(){e&&e(o),r.manager.itemEnd(t)},0),o;const a=pr("img");function c(){h(),ui.add(t,this),e&&e(this),r.manager.itemEnd(t)}function l(d){h(),i&&i(d),r.manager.itemError(t),r.manager.itemEnd(t)}function h(){a.removeEventListener("load",c,!1),a.removeEventListener("error",l,!1)}return a.addEventListener("load",c,!1),a.addEventListener("error",l,!1),t.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(a.crossOrigin=this.crossOrigin),r.manager.itemStart(t),a.src=t,a}}class Cd extends Os{constructor(t){super(t)}load(t,e,n,i){const r=new De,o=new Ry(this.manager);return o.setCrossOrigin(this.crossOrigin),o.setPath(this.path),o.load(t,function(a){r.image=a,r.needsUpdate=!0,e!==void 0&&e(r)},n,i),r}}class Ho extends le{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Tt(t),this.intensity=e}dispose(){}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){const e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,this.groundColor!==void 0&&(e.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(e.object.distance=this.distance),this.angle!==void 0&&(e.object.angle=this.angle),this.decay!==void 0&&(e.object.decay=this.decay),this.penumbra!==void 0&&(e.object.penumbra=this.penumbra),this.shadow!==void 0&&(e.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(e.object.target=this.target.uuid),e}}class Cy extends Ho{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(le.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Tt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}}const Pa=new Dt,Kh=new E,Zh=new E;class gl{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new it(512,512),this.map=null,this.mapPass=null,this.matrix=new Dt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new rl,this._frameExtents=new it(1,1),this._viewportCount=1,this._viewports=[new te(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){const e=this.camera,n=this.matrix;Kh.setFromMatrixPosition(t.matrixWorld),e.position.copy(Kh),Zh.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Zh),e.updateMatrixWorld(),Pa.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Pa),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Pa)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.mapSize.copy(t.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}}class Py extends gl{constructor(){super(new Oe(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1}updateMatrices(t){const e=this.camera,n=ws*2*t.angle*this.focus,i=this.mapSize.width/this.mapSize.height,r=t.distance||e.far;(n!==e.fov||i!==e.aspect||r!==e.far)&&(e.fov=n,e.aspect=i,e.far=r,e.updateProjectionMatrix()),super.updateMatrices(t)}copy(t){return super.copy(t),this.focus=t.focus,this}}class Ly extends Ho{constructor(t,e,n=0,i=Math.PI/3,r=0,o=2){super(t,e),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(le.DEFAULT_UP),this.updateMatrix(),this.target=new le,this.distance=n,this.angle=i,this.penumbra=r,this.decay=o,this.map=null,this.shadow=new Py}get power(){return this.intensity*Math.PI}set power(t){this.intensity=t/Math.PI}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.angle=t.angle,this.penumbra=t.penumbra,this.decay=t.decay,this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}}const Jh=new Dt,js=new E,La=new E;class Iy extends gl{constructor(){super(new Oe(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new it(4,2),this._viewportCount=6,this._viewports=[new te(2,1,1,1),new te(0,1,1,1),new te(3,1,1,1),new te(1,1,1,1),new te(3,0,1,1),new te(1,0,1,1)],this._cubeDirections=[new E(1,0,0),new E(-1,0,0),new E(0,0,1),new E(0,0,-1),new E(0,1,0),new E(0,-1,0)],this._cubeUps=[new E(0,1,0),new E(0,1,0),new E(0,1,0),new E(0,1,0),new E(0,0,1),new E(0,0,-1)]}updateMatrices(t,e=0){const n=this.camera,i=this.matrix,r=t.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),js.setFromMatrixPosition(t.matrixWorld),n.position.copy(js),La.copy(n.position),La.add(this._cubeDirections[e]),n.up.copy(this._cubeUps[e]),n.lookAt(La),n.updateMatrixWorld(),i.makeTranslation(-js.x,-js.y,-js.z),Jh.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Jh)}}class Dy extends Ho{constructor(t,e,n=0,i=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new Iy}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}}class Ny extends gl{constructor(){super(new ol(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Pd extends Ho{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(le.DEFAULT_UP),this.updateMatrix(),this.target=new le,this.shadow=new Ny}dispose(){this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}}class cr{static decodeText(t){if(console.warn("THREE.LoaderUtils: decodeText() has been deprecated with r165 and will be removed with r175. Use TextDecoder instead."),typeof TextDecoder<"u")return new TextDecoder().decode(t);let e="";for(let n=0,i=t.length;n<i;n++)e+=String.fromCharCode(t[n]);try{return decodeURIComponent(escape(e))}catch{return e}}static extractUrlBase(t){const e=t.lastIndexOf("/");return e===-1?"./":t.slice(0,e+1)}static resolveURL(t,e){return typeof t!="string"||t===""?"":(/^https?:\/\//i.test(e)&&/^\//.test(t)&&(e=e.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(t)||/^data:.*,.*$/i.test(t)||/^blob:.*$/i.test(t)?t:e+t)}}class Uy extends Os{constructor(t){super(t),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&console.warn("THREE.ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&console.warn("THREE.ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"}}setOptions(t){return this.options=t,this}load(t,e,n,i){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);const r=this,o=ui.get(t);if(o!==void 0){if(r.manager.itemStart(t),o.then){o.then(l=>{e&&e(l),r.manager.itemEnd(t)}).catch(l=>{i&&i(l)});return}return setTimeout(function(){e&&e(o),r.manager.itemEnd(t)},0),o}const a={};a.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",a.headers=this.requestHeader;const c=fetch(t,a).then(function(l){return l.blob()}).then(function(l){return createImageBitmap(l,Object.assign(r.options,{colorSpaceConversion:"none"}))}).then(function(l){return ui.add(t,l),e&&e(l),r.manager.itemEnd(t),l}).catch(function(l){i&&i(l),ui.remove(t),r.manager.itemError(t),r.manager.itemEnd(t)});ui.add(t,c),r.manager.itemStart(t)}}const _l="\\[\\]\\.:\\/",ky=new RegExp("["+_l+"]","g"),vl="[^"+_l+"]",Oy="[^"+_l.replace("\\.","")+"]",Fy=/((?:WC+[\/:])*)/.source.replace("WC",vl),zy=/(WCOD+)?/.source.replace("WCOD",Oy),By=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",vl),Hy=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",vl),Gy=new RegExp("^"+Fy+zy+By+Hy+"$"),Vy=["material","materials","bones","map"];class Wy{constructor(t,e,n){const i=n||re.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,i)}getValue(t,e){this.bind();const n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(t,e)}setValue(t,e){const n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(t,e)}bind(){const t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){const t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}}class re{constructor(t,e,n){this.path=e,this.parsedPath=n||re.parseTrackName(e),this.node=re.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new re.Composite(t,e,n):new re(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(ky,"")}static parseTrackName(t){const e=Gy.exec(t);if(e===null)throw new Error("PropertyBinding: Cannot parse trackName: "+t);const n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){const r=n.nodeName.substring(i+1);Vy.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){const n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){const n=function(r){for(let o=0;o<r.length;o++){const a=r[o];if(a.name===e||a.uuid===e)return a;const c=n(a.children);if(c)return c}return null},i=n(t.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)t[e++]=n[i]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++]}_setValue_array_setNeedsUpdate(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){const n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node;const e=this.parsedPath,n=e.objectName,i=e.propertyName;let r=e.propertyIndex;if(t||(t=re.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=e.objectIndex;switch(n){case"materials":if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let h=0;h<t.length;h++)if(t[h].name===l){l=h;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(l!==void 0){if(t[l]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[l]}}const o=t[i];if(o===void 0){const l=e.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+l+"."+i+" but it wasn't found.",t);return}let a=this.Versioning.None;this.targetObject=t,t.needsUpdate!==void 0?a=this.Versioning.NeedsUpdate:t.matrixWorldNeedsUpdate!==void 0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!t.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}}re.Composite=Wy;re.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};re.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};re.prototype.GetterByBindingType=[re.prototype._getValue_direct,re.prototype._getValue_array,re.prototype._getValue_arrayElement,re.prototype._getValue_toArray];re.prototype.SetterByBindingTypeAndVersioning=[[re.prototype._setValue_direct,re.prototype._setValue_direct_setNeedsUpdate,re.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[re.prototype._setValue_array,re.prototype._setValue_array_setNeedsUpdate,re.prototype._setValue_array_setMatrixWorldNeedsUpdate],[re.prototype._setValue_arrayElement,re.prototype._setValue_arrayElement_setNeedsUpdate,re.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[re.prototype._setValue_fromArray,re.prototype._setValue_fromArray_setNeedsUpdate,re.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];const Qh=new Dt;class ps{constructor(t,e,n=0,i=1/0){this.ray=new Is(t,e),this.near=n,this.far=i,this.camera=null,this.layers=new sl,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(t,e){this.ray.set(t,e)}setFromCamera(t,e){e.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(t.x,t.y,.5).unproject(e).sub(this.ray.origin).normalize(),this.camera=e):e.isOrthographicCamera?(this.ray.origin.set(t.x,t.y,(e.near+e.far)/(e.near-e.far)).unproject(e),this.ray.direction.set(0,0,-1).transformDirection(e.matrixWorld),this.camera=e):console.error("THREE.Raycaster: Unsupported camera type: "+e.type)}setFromXRController(t){return Qh.identity().extractRotation(t.matrixWorld),this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(Qh),this}intersectObject(t,e=!0,n=[]){return Oc(t,this,n,e),n.sort(tu),n}intersectObjects(t,e=!0,n=[]){for(let i=0,r=t.length;i<r;i++)Oc(t[i],this,n,e);return n.sort(tu),n}}function tu(s,t){return s.distance-t.distance}function Oc(s,t,e,n){let i=!0;if(s.layers.test(t.layers)&&s.raycast(t,e)===!1&&(i=!1),i===!0&&n===!0){const r=s.children;for(let o=0,a=r.length;o<a;o++)Oc(r[o],t,e,!0)}}class eu{constructor(t=1,e=0,n=0){return this.radius=t,this.phi=e,this.theta=n,this}set(t,e,n){return this.radius=t,this.phi=e,this.theta=n,this}copy(t){return this.radius=t.radius,this.phi=t.phi,this.theta=t.theta,this}makeSafe(){return this.phi=Math.max(1e-6,Math.min(Math.PI-1e-6,this.phi)),this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,e,n){return this.radius=Math.sqrt(t*t+e*e+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(t,n),this.phi=Math.acos(Re(e/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}}class Ld extends zi{constructor(t,e=null){super(),this.object=t,this.domElement=e,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(){}disconnect(){}dispose(){}update(){}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Yc}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Yc);const Xy="https://flyai-mine.fly.dev",Id=()=>window.flyNav,Dd=s=>{var t;return(((t=Id())==null?void 0:t.MINE_API)??Xy)+s};function jy(s=!0){var n,i;const t=s?{"Content-Type":"application/json"}:{},e=(i=(n=Id())==null?void 0:n.session)==null?void 0:i.call(n);return e!=null&&e.token&&(t["x-flyai-session"]=e.token),t}function Tn(s,t={}){return fetch(Dd(s),{...t,headers:{...jy(t.method==="POST"),...t.headers}})}const Nd=s=>Dd("/api/fv/textures/"+s);async function $y(){try{return await(await Tn("/api/fv/access",{cache:"no-store"})).json()}catch{return{ok:!1,why:"Can't reach the server"}}}function eo(s,t=!1){return new Promise(e=>{const n=document.createElement("script");n.src=s,t&&(n.type="module"),n.onload=()=>e(),n.onerror=()=>e(),document.head.appendChild(n)})}async function Yy(){const s=document.createElement("link");s.rel="stylesheet",s.href="/assets/site.css",document.head.prepend(s),await eo("/assets/i18n/boot.js"),await eo("/assets/site.js"),await eo("/assets/nav.js"),eo("/assets/i18n/page.js",!0)}let Ud=new Map,Fc=[];function qy(s){Fc=s.slice(),Ud=new Map(Fc.map(t=>[t.id,t]))}const Cn=s=>s?Ud.get(s):void 0,nu=()=>Fc;let kd=new Map,zc=[];function Od(s){zc=s.slice(),kd=new Map(zc.map(t=>[t.id,t]))}function iu(s){Od([...zc.filter(t=>t.id!==s.id),s])}const Fd=s=>s?kd.get(s):void 0,Ky=new Set(["block","wall","platform","door"]),zd=["parkour","coins","race","survive","maze","shooter","zombies","hill"],Zy=new Set(["race","coins","hill","shooter","zombies","survive"]),Bd=["flag","coins","survive","targets","waves","hill"],Hd=["block","ramp","platform","wall","coin","gem","spike","lava","bounce","speed","checkpoint","flag","enemy","target","turret","spawner","heart","key","door","zone","model","tree","rock","flower","mushroom"],Jy=new Set(["block","ramp","platform","wall","bounce","speed","turret"]),Bc=new Set(["spike","lava"]),Qy=new Set(["tree","rock","flower","mushroom"]),Gd=new Set(["block","ramp","platform","wall","spike","lava","bounce","speed","door","zone","model"]),Go=s=>{var t;return Jy.has(s.kind)||s.kind==="model"&&!!((t=Cn(s.asset))!=null&&t.solid)},tx=s=>{var t;return Qy.has(s.kind)||s.kind==="model"&&!((t=Cn(s.asset))!=null&&t.solid)},Vd=["meadow","sunset","candy","ocean","lava","ice","night","desert"],Wd=["third","chase","top","side","first"],mi={meadow:{sky:"#8fd3ff",horizon:"#e6f7ff",fog:.012,light:"#fff6e0",colors:["#7bc96f","#5aa65a","#c9a26b","#f2e6c9","#e07a5f","#6c8ead"],hazard:"#ff5a3c"},sunset:{sky:"#ff9a6b",horizon:"#ffd9a8",fog:.016,light:"#ffd2a1",colors:["#e8a87c","#c38d9e","#8e6c8a","#f6d6ad","#5c4f74","#41b3a3"],hazard:"#ff3b3b"},candy:{sky:"#ffc6e8",horizon:"#fff0fa",fog:.01,light:"#ffffff",colors:["#ff8fc7","#8fd8ff","#fff08f","#b89cff","#8fffc1","#ffffff"],hazard:"#ff4f6d"},ocean:{sky:"#6cc7e8",horizon:"#d7f4ff",fog:.014,light:"#f2fbff",colors:["#f5deb3","#3fa7c8","#2d6e8e","#ffffff","#f28c6b","#6fcf97"],hazard:"#ff6b3d"},lava:{sky:"#6b2c22",horizon:"#c0603a",fog:.012,light:"#ffd0a8",colors:["#6b5a55","#8a7466","#4a3c3a","#a8957f","#d0683f","#e8c890"],hazard:"#ff4500"},ice:{sky:"#bfe6ff",horizon:"#f2fbff",fog:.018,light:"#ffffff",colors:["#e8f6ff","#a8d8f0","#7fb8d8","#ffffff","#5c7fa8","#c8b8f0"],hazard:"#4fd1ff"},night:{sky:"#141a33",horizon:"#2e3a66",fog:.02,light:"#b8c8ff",colors:["#3b4a7a","#5ef2cc","#7a5ea8","#2a3358","#f2d35e","#ff7ab8"],hazard:"#ff3d6e",night:!0},desert:{sky:"#f5c88a",horizon:"#fff0d0",fog:.014,light:"#fff2d6",colors:["#e8c08a","#d09a5a","#a8743e","#f6e2bc","#6fa86b","#c0503a"],hazard:"#ff5a2a"}},no=24,ex=24,nx=-4,su=500,ru=40,ix=30,Ge={gravity:30,jumpV:11.5,run:7,bounceDefault:6,halfW:.3,height:.9,killY:-10},Ps={block:[4,1,4],ramp:[4,2,3],platform:[3,.5,3],wall:[6,3,.6],spike:[1,.6,1],lava:[6,.3,6],bounce:[1.6,.3,1.6],speed:[2,.15,3],door:[3,3,.6],zone:[4,.1,4],turret:[1,1.2,1]},sx=[.3,.1,.3],rx=[48,24,48],Ee=(s,t)=>{const e=typeof s=="number"?s:typeof s=="string"?Number(s):NaN;return Number.isFinite(e)?e:t},Ie=(s,t,e)=>Math.min(e,Math.max(t,s)),Xn=s=>Math.round(s*100)/100;function lr(s,t){return Array.isArray(s)?[Ee(s[0],t[0]),Ee(s[1],t[1]),Ee(s[2],t[2])]:[...t]}function yo(s,t=[0,0,0]){const e=lr(s,t);return[Xn(Ie(e[0],-no,no)),Xn(Ie(e[1],nx,ex)),Xn(Ie(e[2],-no,no))]}function Ia(s,t){const e=lr(s,t);return[0,1,2].map(n=>Xn(Ie(Math.abs(e[n]),sx[n],rx[n])))}function ou(s,t,e){return(typeof s=="string"?s:t).replace(/[\u0000-\u001f<>]/g,"").trim().slice(0,e)||t}function io(s,t,e){return typeof s=="string"&&t.includes(s.toLowerCase())?s.toLowerCase():e}const ox={cube:"block",box:"block",ground:"block",floor:"block",island:"block",step:"block",stair:"block",slope:"ramp",stairs:"ramp",moving_platform:"platform",lift:"platform",elevator:"platform",coins:"coin",star:"gem",diamond:"gem",crystal:"gem",spikes:"spike",trap:"spike",fire:"lava",water:"lava",acid:"lava",jump_pad:"bounce",trampoline:"bounce",spring:"bounce",boost:"speed",speed_pad:"speed",goal:"flag",finish:"flag",end:"flag",save:"checkpoint",monster:"enemy",beetle:"enemy",bug:"enemy",spider:"enemy",guard:"enemy",bush:"tree",stone:"rock",boulder:"rock",plant:"flower",shroom:"mushroom",bullseye:"target",balloon:"target",cannon:"turret",tower:"turret",gun:"turret",portal:"spawner",nest:"spawner",hive:"spawner",zombie:"spawner",health:"heart",life:"heart",gate:"door",hill:"zone",area:"zone",capture:"zone"};function Xd(s){if(typeof s!="string")return null;const t=s.toLowerCase().trim().replace(/[\s-]+/g,"_");return Hd.includes(t)?t:ox[t]??null}let ax=0;const xo=()=>`o${Date.now().toString(36)}${(ax++).toString(36)}`;function cx(s,t,e){if(!s||typeof s!="object")return null;const n=Xd(s.kind??s.type);if(!n)return e.push(`unknown kind "${String(s.kind??s.type).slice(0,20)}" dropped`),null;const i={id:t,kind:n,at:yo(s.at??s.pos??s.position)};if(n==="model"){const r=Cn(typeof s.asset=="string"?s.asset:void 0);if(!r)return e.push(`unknown model "${String(s.asset??"").slice(0,30)}" dropped`),null;i.asset=r.id;const o=Ee(s.scale,0);i.size=s.size?Ia(s.size,r.size):Ia(o>0?r.size.map(c=>c*Ie(o,.1,10)):r.size,r.size);const a=Math.round(Ee(s.rot,0)/90)*90;a%360&&(i.rot=(a%360+360)%360)}else Gd.has(n)&&(i.size=Ia(s.size,Ps[n]));return s.color!==void 0&&(i.color=Ie(Math.round(Ee(s.color,0)),0,5)),Ky.has(n)&&typeof s.tex=="string"&&(Fd(s.tex)?i.tex=s.tex:e.push(`unknown texture "${s.tex.slice(0,30)}" ignored`)),n==="ramp"&&(i.dir=(Math.round(Ee(s.dir,0))%4+4)%4),n==="platform"&&(s.move&&typeof s.move=="object"&&(i.move={to:yo(s.move.to,i.at),speed:Xn(Ie(Ee(s.move.speed,2),.3,8))},i.move.to.every((r,o)=>r===i.at[o])&&delete i.move),s.spin!==void 0&&Ee(s.spin,0)!==0&&(i.spin=Xn(Ie(Ee(s.spin,45),-180,180))),s.fall&&(i.fall=!0)),n==="enemy"&&(Array.isArray(s.path)&&(i.path=s.path.slice(0,6).map(r=>yo(r,i.at))),s.chase&&(i.chase=!0),i.speed=Xn(Ie(Ee(s.speed,2.5),.5,6))),n==="bounce"&&(i.power=Xn(Ie(Ee(s.power,Ge.bounceDefault),3,12))),n==="turret"&&(i.rate=Xn(Ie(Ee(s.rate,2),.6,6))),n==="spawner"&&(i.waves=Math.round(Ie(Ee(s.waves,3),1,10)),i.count=Math.round(Ie(Ee(s.count,3),1,10)),i.every=Math.round(Ie(Ee(s.every,15),5,60))),(n==="key"||n==="door")&&i.color===void 0&&(i.color=0),i}function _e(s){var u,f,p;const t=[],e=s&&typeof s=="object"?s:{},n=e.rules??{},i=io(e.type,zd,"parkour"),r=i==="coins"?"coins":i==="survive"?"survive":i==="shooter"?"targets":i==="zombies"?"waves":i==="hill"?"hill":"flag",o=i==="race"?"chase":i==="zombies"?"top":"third",a={v:1,title:ou(e.title,"Untitled game",40),type:i,goal:"",look:{palette:io(((u=e.look)==null?void 0:u.palette)??e.palette,Vd,"meadow"),camera:io(((f=e.look)==null?void 0:f.camera)??e.camera,Wd,o)},rules:{win:io(n.win,Bd,r),timer:Math.round(Ie(Ee(n.timer,i==="survive"?45:120),10,300)),lives:Math.round(Ie(Ee(n.lives,3),1,9)),hold:Math.round(Ie(Ee(n.hold,20),3,120)),shoot:n.shoot===void 0?i==="shooter"||i==="zombies":!!n.shoot,multi:n.multi===void 0?Zy.has(i):!!n.multi},spawn:yo(e.spawn,[0,1,0]),objects:[]},c=Array.isArray(e.objects)?e.objects:[],l=new Set;let h=0;t:for(const _ of c){const m=_==null?void 0:_.repeat,g=m?Ie(Math.round(Ee(m.count,1)),1,ix):1,x=m?lr(m.step,[0,0,0]):[0,0,0];for(let v=0;v<g;v++){if(a.objects.length>=su){t.push(`more than ${su} objects: the rest dropped`);break t}const M=lr((_==null?void 0:_.at)??(_==null?void 0:_.pos)??(_==null?void 0:_.position),[0,0,0]),C={..._,at:[M[0]+x[0]*v,M[1]+x[1]*v,M[2]+x[2]*v]};if((p=_==null?void 0:_.move)!=null&&p.to&&v>0){const V=lr(_.move.to,M);C.move={..._.move,to:[V[0]+x[0]*v,V[1]+x[1]*v,V[2]+x[2]*v]}}let R=typeof(_==null?void 0:_.id)=="string"&&g===1?_.id.slice(0,24):"";(!R||l.has(R))&&(R=xo());const T=cx(C,R,t);if(!T)continue;if((T.kind==="platform"&&(T.move||T.spin||T.fall)||T.kind==="enemy"||T.kind==="turret")&&++h>ru){t.push(`more than ${ru} moving things: extra dropped`);continue}l.add(R),a.objects.push(T)}}let d=0;return a.objects=a.objects.filter(_=>_.kind!=="flag"||++d===1),d>1&&t.push("more than one flag: kept the first"),a.rules.win==="targets"&&(a.rules.shoot=!0),a.goal=ou(e.goal,lx(a),90),{spec:a,warnings:t}}function lx(s){const t=s.objects.filter(e=>e.kind==="coin").length;return s.rules.win==="coins"?`Collect all ${t} coins in ${s.rules.timer} s`:s.rules.win==="survive"?`Stay alive for ${s.rules.timer} s`:s.rules.win==="targets"?`Shoot all ${s.objects.filter(e=>e.kind==="target").length} targets in ${s.rules.timer} s`:s.rules.win==="waves"?"Survive every zombie wave":s.rules.win==="hill"?`Hold the glowing zone for ${s.rules.hold} s`:`Reach the flag in ${s.rules.timer} s`}function Hc(s,t=s.at){const e=s.size??Ps[s.kind]??[1,1,1],n=s.rot===90||s.rot===270?[e[2],e[1],e[0]]:e;return{x0:t[0]-n[0]/2,x1:t[0]+n[0]/2,z0:t[2]-n[2]/2,z1:t[2]+n[2]/2,y0:t[1],y1:t[1]+n[1]}}function hx(s){const t=[];for(const e of s.objects){if(!Go(e))continue;const n=i=>{const r=Hc(e,i);t.push({id:e.id,x0:r.x0,x1:r.x1,z0:r.z0,z1:r.z1,top:r.y1,lo:e.kind==="ramp"?r.y0:r.y1,boost:e.kind==="bounce"?e.power??Ge.bounceDefault:0})};n(e.at),e.kind==="platform"&&e.move&&(n(e.move.to),n([(e.at[0]+e.move.to[0])/2,(e.at[1]+e.move.to[1])/2,(e.at[2]+e.move.to[2])/2]))}return t}function ux(s,t){const e=Math.max(0,s.x0-t.x1,t.x0-s.x1),n=Math.max(0,s.z0-t.z1,t.z0-s.z1);return Math.hypot(e,n)}function au(s,t){const e=Math.max(0,t.x0-s[0],s[0]-t.x1),n=Math.max(0,t.z0-s[2],s[2]-t.z1);return Math.hypot(e,n)}const jd=Ge.jumpV*Ge.jumpV/(2*Ge.gravity),dx=4.5;function fx(s,t){const e=t.lo-s.top,n=s.boost>0?s.boost:jd;if(e>n-.2)return!1;const i=Math.max(0,-e),r=dx+(s.boost>0?3:0)+Math.min(4,i*.9);return ux(s,t)<=r}function cu(s){const t=[],e=hx(s);if(!e.length)return[{level:"error",text:"nothing to stand on: add blocks or a floor"}];let n=-1,i=-1/0;e.forEach((f,p)=>{au(s.spawn,f)<=.5&&f.top<=s.spawn[1]+.6&&f.top>i&&(i=f.top,n=p)}),n<0&&t.push({level:"error",text:"the spawn point is not above anything: the player falls straight away"});const r=new Set;if(n>=0){const f=[n];for(r.add(n);f.length;){const p=f.pop();for(let _=0;_<e.length;_++)!r.has(_)&&fx(e[p],e[_])&&(r.add(_),f.push(_))}}const o=f=>[...r].some(p=>{const _=e[p],m=f[1]-_.top,g=_.boost>0?_.boost+1:jd+1;return au(f,_)<=1.5&&m>=-1.2&&m<=g}),a=s.objects.find(f=>f.kind==="flag"),c=s.objects.filter(f=>f.kind==="coin");if(s.rules.win==="flag"&&(a?n>=0&&!o(a.at)&&t.push({level:"error",text:`the flag at [${a.at.join(", ")}] cannot be reached from the spawn: gaps must be at most ~4.5 wide and steps at most ~2 high`}):t.push({level:"error",text:"the game is won at a flag but there is no flag"})),s.rules.win==="coins"){c.length||t.push({level:"error",text:"it is a coin hunt but there are no coins"});const f=n>=0?c.filter(p=>!o(p.at)):[];f.length&&t.push({level:"error",text:`${f.length} coin(s) cannot be reached, e.g. at [${f[0].at.join(", ")}]`})}if(s.rules.win==="survive"&&!s.objects.some(f=>Bc.has(f.kind)||f.kind==="enemy"||f.kind==="platform"&&f.fall)&&t.push({level:"warn",text:"a survive game with no danger: add enemies, lava, spikes or falling platforms"}),s.rules.win==="targets"&&!s.objects.some(f=>f.kind==="target")&&t.push({level:"error",text:"it is won by shooting targets but there are no targets"}),s.rules.win==="waves"&&!s.objects.some(f=>f.kind==="spawner")&&t.push({level:"error",text:"it is won by beating zombie waves but there is no spawner"}),s.rules.win==="hill"){const f=s.objects.find(p=>p.kind==="zone");f?n>=0&&!o(f.at)&&t.push({level:"error",text:`the zone at [${f.at.join(", ")}] cannot be reached from the spawn`}):t.push({level:"error",text:"it is won by holding a zone but there is no zone"})}for(const f of s.objects.filter(p=>p.kind==="door"))s.objects.some(p=>p.kind==="key"&&(p.color??0)===(f.color??0))||t.push({level:"error",text:`a door (colour ${f.color??0}) has no key of the same colour`});if(s.look.camera==="side"){const f=s.objects.filter(p=>(p.kind==="flag"||p.kind==="coin"||p.kind==="key")&&Math.abs(p.at[2]-s.spawn[2])>1.2);f.length&&t.push({level:"error",text:`side-scroller: ${f.length} item(s) are off the play line z=${s.spawn[2]}, e.g. a ${f[0].kind} at [${f[0].at.join(", ")}]`})}const l=s.objects.filter(f=>Go(f)&&f.kind!=="ramp").map(f=>Hc(f)),h=f=>l.some(p=>f[0]>p.x0+.1&&f[0]<p.x1-.1&&f[2]>p.z0+.1&&f[2]<p.z1-.1&&f[1]+.3>p.y0+.05&&f[1]+.3<p.y1-.05),d=s.objects.filter(f=>(f.kind==="coin"||f.kind==="gem"||f.kind==="flag"||f.kind==="checkpoint"||f.kind==="key"||f.kind==="heart")&&h(f.at));return d.length&&t.push({level:"error",text:`${d.length} item(s) are inside solid blocks, e.g. a ${d[0].kind} at [${d[0].at.join(", ")}]`}),h(s.spawn)&&t.push({level:"error",text:"the spawn point is inside a block"}),s.objects.filter(f=>Bc.has(f.kind)).map(f=>Hc(f)).some(f=>s.spawn[0]>f.x0-.4&&s.spawn[0]<f.x1+.4&&s.spawn[2]>f.z0-.4&&s.spawn[2]<f.z1+.4&&Math.abs(s.spawn[1]-f.y1)<1)&&t.push({level:"error",text:"the spawn point is on or next to lava/spikes"}),t}const px=["kind","at","size","color","dir","move","spin","fall","path","chase","speed","power","rate","waves","count","every","asset","rot","tex"];function mx(s){return _e({objects:[s]}).spec.objects}function lu(s,t){const e=ms(s);for(const n of t)if(!(!n||typeof n!="object"))if(n.op==="add"&&n.obj){const i=n.obj.id&&!n.obj.repeat?[n.obj]:mx(n.obj);i.some(r=>Xd(r.kind)==="flag")&&(e.objects=e.objects.filter(r=>r.kind!=="flag"));for(const r of i)e.objects.push(r)}else if(n.op==="remove")e.objects=e.objects.filter(i=>i.id!==n.id);else if(n.op==="set"){const i=e.objects.find(r=>r.id===n.id);if(!i)continue;for(const r of px)r in n&&(n[r]===null||n[r]===!1?delete i[r]:i[r]=n[r])}else n.op==="game"&&(n.title!==void 0&&(e.title=n.title),n.goal!==void 0&&(e.goal=n.goal),n.type!==void 0&&(e.type=n.type),n.spawn&&(e.spawn=n.spawn),n.look&&typeof n.look=="object"&&(e.look={...e.look,...n.look}),n.rules&&typeof n.rules=="object"&&(e.rules={...e.rules,...n.rules}));return _e(e).spec}function Io(s){const t={x0:s.spawn[0],x1:s.spawn[0],y0:s.spawn[1],y1:s.spawn[1],z0:s.spawn[2],z1:s.spawn[2]};for(const e of s.objects){const n=e.size??[1,1,1];t.x0=Math.min(t.x0,e.at[0]-n[0]/2),t.x1=Math.max(t.x1,e.at[0]+n[0]/2),t.z0=Math.min(t.z0,e.at[2]-n[2]/2),t.z1=Math.max(t.z1,e.at[2]+n[2]/2),t.y0=Math.min(t.y0,e.at[1]),t.y1=Math.max(t.y1,e.at[1]+n[1])}return t}const ms=s=>JSON.parse(JSON.stringify(s)),gx={title:"Sky Steps",type:"parkour",goal:"Hop up the floating steps and reach the flag",look:{palette:"meadow"},rules:{win:"flag",timer:120,lives:3},spawn:[0,1,0],objects:[{kind:"block",at:[0,0,0],size:[6,1,6],color:0},{kind:"tree",at:[-2,1,-2]},{kind:"flower",at:[1.5,1,2]},{kind:"flower",at:[-1.8,1,1.6]},{kind:"block",at:[6,.5,0],size:[2.5,1,2.5],color:2},{kind:"block",at:[10,1.5,2],size:[2.5,1,2.5],color:2},{kind:"block",at:[14,2.5,-1],size:[2.5,1,2.5],color:2},{kind:"coin",at:[6,1.5,0]},{kind:"coin",at:[10,2.5,2]},{kind:"coin",at:[14,3.5,-1]},{kind:"platform",at:[18,3,-1],size:[3,.5,3],color:5,move:{to:[18,3,-9],speed:2.2}},{kind:"block",at:[18,3,-13],size:[4,1,4],color:0},{kind:"checkpoint",at:[17,4,-12]},{kind:"spike",at:[18.5,4,-13.5],size:[1,.6,1]},{kind:"bounce",at:[19.4,4,-14.4],power:6},{kind:"block",at:[14,7,-16],size:[3,1,3],color:1},{kind:"gem",at:[14,8,-16]},{kind:"block",at:[9,7.5,-16],size:[3,1,3],color:1},{kind:"platform",at:[5,8,-16],size:[2.5,.5,2.5],color:4,fall:!0,repeat:{count:3,step:[-4,0,0]}},{kind:"coin",at:[5,8.5,-16],repeat:{count:3,step:[-4,0,0]}},{kind:"block",at:[-8,7.5,-16],size:[5,1,5],color:0},{kind:"flag",at:[-8,8.5,-17]},{kind:"lava",at:[8,-3,-8],size:[40,.4,36]}]},_x={title:"Mushroom Meadow",type:"coins",goal:"Collect all 12 coins before time runs out",look:{palette:"candy"},rules:{win:"coins",timer:90,lives:3},spawn:[0,0,0],objects:[{kind:"block",at:[0,-1,0],size:[32,1,32],color:4},{kind:"coin",at:[6,0,6]},{kind:"coin",at:[-7,0,5]},{kind:"coin",at:[9,0,-8]},{kind:"coin",at:[-10,0,-10]},{kind:"coin",at:[0,0,12]},{kind:"coin",at:[13,0,1]},{kind:"block",at:[-6,0,-4],size:[3,1.5,3],color:1},{kind:"coin",at:[-6,1.5,-4]},{kind:"block",at:[8,0,10],size:[3,1.5,3],color:3},{kind:"coin",at:[8,1.5,10]},{kind:"block",at:[-12,0,8],size:[3,1.5,3],color:2},{kind:"block",at:[-12,1.5,11],size:[3,1.5,3],color:2},{kind:"coin",at:[-12,3,11]},{kind:"bounce",at:[3,0,-12],power:6},{kind:"block",at:[3,4,-15],size:[3,.6,3],color:0},{kind:"coin",at:[3,4.6,-15]},{kind:"coin",at:[-14,0,-2]},{kind:"enemy",at:[4,0,4],path:[[10,0,4],[10,0,-4]],speed:2},{kind:"enemy",at:[-8,0,-12],path:[[-2,0,-12]],speed:2.5},{kind:"mushroom",at:[-3,0,7]},{kind:"mushroom",at:[11,0,-12]},{kind:"mushroom",at:[-13,0,-13]},{kind:"tree",at:[12,0,12]},{kind:"tree",at:[-14,0,14]},{kind:"tree",at:[14,0,-14]},{kind:"rock",at:[5,0,-5]},{kind:"rock",at:[-4,0,13]},{kind:"flower",at:[2,0,3],repeat:{count:4,step:[-3,0,2]}}]},vx={title:"Dune Dash",type:"race",goal:"Race to the flag: speed pads make you fast",look:{palette:"desert"},rules:{win:"flag",timer:60,lives:3},spawn:[0,0,-21],objects:[{kind:"block",at:[0,-1,-18],size:[6,1,12],color:0},{kind:"speed",at:[0,0,-16]},{kind:"coin",at:[0,0,-13],repeat:{count:2,step:[0,0,1.5]}},{kind:"block",at:[0,-1,-4],size:[6,1,10],color:1},{kind:"wall",at:[-1.5,0,-6],size:[3,1.5,.6],color:2},{kind:"wall",at:[1.5,0,-2],size:[3,1.5,.6],color:2},{kind:"coin",at:[1.5,0,-6]},{kind:"coin",at:[-1.5,0,-2]},{kind:"block",at:[0,-1,8],size:[6,1,8],color:0},{kind:"speed",at:[0,0,5]},{kind:"ramp",at:[0,0,9],size:[4,1.5,4],dir:1,color:3},{kind:"block",at:[0,.5,17],size:[6,1,8],color:1},{kind:"spike",at:[-2.4,1.5,15],size:[1,.6,1],repeat:{count:3,step:[0,0,2]}},{kind:"spike",at:[2.4,1.5,16],size:[1,.6,1],repeat:{count:2,step:[0,0,2]}},{kind:"gem",at:[0,3.5,13]},{kind:"flag",at:[0,1.5,20]},{kind:"rock",at:[-5,-1,-10]},{kind:"rock",at:[5,-1,2]}]},yx={title:"Beetle Arena",type:"survive",goal:"Survive 45 s: jump on beetles for points, grab gems",look:{palette:"lava"},rules:{win:"survive",timer:45,lives:3},spawn:[0,0,0],objects:[{kind:"block",at:[0,-1,0],size:[16,1,16],color:0},{kind:"lava",at:[0,-2.5,0],size:[40,.4,40]},{kind:"enemy",at:[6,0,6],chase:!0,speed:2.4},{kind:"enemy",at:[-6,0,-6],chase:!0,speed:2.2},{kind:"enemy",at:[-6,0,6],path:[[6,0,6],[6,0,-6],[-6,0,-6]],speed:3},{kind:"spike",at:[0,0,4],size:[1,.6,1],repeat:{count:3,step:[3,0,0]}},{kind:"spike",at:[-3,0,-4],size:[1,.6,1],repeat:{count:3,step:[-3,0,0]}},{kind:"platform",at:[10,-.5,0],size:[2.5,.5,2.5],color:4,fall:!0},{kind:"platform",at:[-10,-.5,0],size:[2.5,.5,2.5],color:4,fall:!0},{kind:"gem",at:[10,0,0]},{kind:"gem",at:[-10,0,0]},{kind:"block",at:[0,0,-7],size:[2,1.5,2],color:1},{kind:"gem",at:[0,1.5,-7]},{kind:"coin",at:[5,0,-3]},{kind:"coin",at:[-5,0,3]},{kind:"coin",at:[3,0,7]},{kind:"coin",at:[-4,0,-7]},{kind:"rock",at:[7,0,-7]},{kind:"rock",at:[-7,0,7]}]};function $d(){let n=7;const i=()=>(n=n*16807%2147483647)/2147483647,r=new Set,o=new Set([0]),a=[0];for(;a.length;){const u=a[a.length-1],f=u%6,p=Math.floor(u/6),_=[[f+1,p],[f-1,p],[f,p+1],[f,p-1]].filter(([v,M])=>v>=0&&M>=0&&v<6&&M<6&&!o.has(M*6+v));if(!_.length){a.pop();continue}const[m,g]=_[Math.floor(i()*_.length)],x=g*6+m;r.add(`${Math.min(u,x)}-${Math.max(u,x)}`),o.add(x),a.push(x)}const c=[{kind:"block",at:[0,-1,0],size:[6*4.5+1,1,6*4.5+1],color:3}],l=2.6,h=.6;for(let u=0;u<6;u++)for(let f=0;f<6;f++){const p=u*6+f,_=-13.5+f*4.5+4.5/2,m=-13.5+u*4.5+4.5/2;f<5&&!r.has(`${p}-${p+1}`)&&c.push({kind:"wall",at:[_+4.5/2,0,m],size:[h,l,4.5+h],color:0}),u<5&&!r.has(`${p}-${p+6}`)&&c.push({kind:"wall",at:[_,0,m+4.5/2],size:[4.5+h,l,h],color:0}),(f+u)%3===1&&c.push({kind:"coin",at:[_,0,m]})}c.push({kind:"wall",at:[0,0,-13.5],size:[6*4.5+h,l,h],color:2},{kind:"wall",at:[0,0,13.5],size:[6*4.5+h,l,h],color:2},{kind:"wall",at:[-13.5,0,0],size:[h,l,6*4.5+h],color:2},{kind:"wall",at:[13.5,0,0],size:[h,l,6*4.5+h],color:2});const d=13.5-4.5/2;return c.push({kind:"flag",at:[d,0,d]}),c.push({kind:"enemy",at:[-13.5+4.5*2.5,0,-13.5+4.5*.5],path:[[-13.5+4.5*2.5,0,-13.5+4.5*3.5]],speed:2}),c.push({kind:"gem",at:[-13.5+4.5*.5,0,13.5-4.5*.5]}),{title:"Glow Maze",type:"maze",goal:"Find your way through the maze to the flag",look:{palette:"night"},rules:{win:"flag",timer:150,lives:3},spawn:[-13.5+4.5/2,0,-13.5+4.5/2],objects:c}}const xx={title:"Pollen Range",type:"shooter",goal:"Shoot all 10 targets, dodge the turret fireballs",look:{palette:"meadow",camera:"first"},rules:{win:"targets",timer:90,lives:4,shoot:!0},spawn:[0,0,-10],objects:[{kind:"block",at:[0,-1,2],size:[32,1,30],color:0},{kind:"lava",at:[0,-3,2],size:[48,.4,44]},{kind:"wall",at:[-4,0,-3],size:[3,1.4,.6],color:2},{kind:"wall",at:[4,0,1],size:[3,1.4,.6],color:2},{kind:"wall",at:[0,0,7],size:[4,1.4,.6],color:2},{kind:"block",at:[-6,0,6],size:[3,1.5,3],color:1},{kind:"block",at:[6,0,6],size:[2,3,2],color:3},{kind:"ramp",at:[8.5,0,6],size:[3,3,2],dir:2,color:3},{kind:"target",at:[-10,0,0]},{kind:"target",at:[10,0,0]},{kind:"target",at:[0,0,9]},{kind:"target",at:[-6,1.5,6]},{kind:"target",at:[6,3,6]},{kind:"target",at:[0,0,15]},{kind:"target",at:[-12,0,12]},{kind:"target",at:[12,0,12]},{kind:"target",at:[-3,0,3]},{kind:"target",at:[4,0,-4]},{kind:"turret",at:[-8,0,13],rate:2.5},{kind:"turret",at:[8,0,13],rate:3},{kind:"heart",at:[-12,0,-6]},{kind:"heart",at:[12,0,-6]},{kind:"tree",at:[-14,0,-12]},{kind:"tree",at:[14,0,-12]},{kind:"tree",at:[-14,0,16]},{kind:"tree",at:[14,0,16]},{kind:"flower",at:[-2,0,-12],repeat:{count:5,step:[1,0,.3]}},{kind:"rock",at:[9,0,-9]},{kind:"rock",at:[-9,0,9]}]},Mx={title:"Beetle Night",type:"zombies",goal:"Hold out against 4 waves of zombie beetles",look:{palette:"night",camera:"top"},rules:{win:"waves",timer:240,lives:5,shoot:!0},spawn:[0,0,0],objects:[{kind:"block",at:[0,-1,0],size:[34,1,34],color:3},{kind:"wall",at:[0,0,-17],size:[34,1.5,.6],color:0},{kind:"wall",at:[0,0,17],size:[34,1.5,.6],color:0},{kind:"wall",at:[-17,0,0],size:[.6,1.5,34],color:0},{kind:"wall",at:[17,0,0],size:[.6,1.5,34],color:0},{kind:"block",at:[-6,0,-5],size:[3,1.2,3],color:2},{kind:"block",at:[6,0,5],size:[3,1.2,3],color:2},{kind:"wall",at:[6,0,-6],size:[4,1.5,.6],color:0},{kind:"wall",at:[-6,0,6],size:[4,1.5,.6],color:0},{kind:"spawner",at:[-12,0,-12],waves:4,count:3,every:18},{kind:"spawner",at:[12,0,-12],waves:4,count:3,every:18},{kind:"spawner",at:[0,0,13],waves:4,count:2,every:18},{kind:"heart",at:[-13,0,8]},{kind:"heart",at:[13,0,8]},{kind:"heart",at:[0,0,-13]},{kind:"gem",at:[-6,1.2,-5]},{kind:"gem",at:[6,1.2,5]},{kind:"mushroom",at:[-14,0,14]},{kind:"mushroom",at:[14,0,14]},{kind:"rock",at:[-3,0,10]},{kind:"rock",at:[9,0,-1]},{kind:"tree",at:[-14,0,-2]},{kind:"tree",at:[14,0,-3]}]},bx={title:"Sky Ghost",type:"race",goal:"Race to the flag, then race your own ghost",look:{palette:"ice",camera:"chase"},rules:{win:"flag",timer:45,lives:3},spawn:[0,0,-22],objects:[{kind:"block",at:[0,-1,-17],size:[6,1,14],color:0},{kind:"speed",at:[0,0,-15]},{kind:"block",at:[6,-1,-7],size:[18,1,6],color:1},{kind:"speed",at:[7,0,-7],size:[3,.15,2]},{kind:"wall",at:[3,0,-5.5],size:[.6,1.4,3],color:2},{kind:"block",at:[12,-1,3],size:[6,1,14],color:0},{kind:"wall",at:[10.5,0,0],size:[3,1.4,.6],color:2},{kind:"speed",at:[12,0,2.5]},{kind:"ramp",at:[12,0,6],size:[4,1.5,4],dir:1,color:3},{kind:"block",at:[12,.5,14],size:[6,1,8],color:1},{kind:"flag",at:[12,1.5,17]},{kind:"coin",at:[0,0,-19],repeat:{count:4,step:[0,0,2]}},{kind:"coin",at:[1,0,-7],repeat:{count:5,step:[2.5,0,0]}},{kind:"coin",at:[12,0,-2],repeat:{count:3,step:[0,0,2]}},{kind:"gem",at:[12,3.5,10]},{kind:"lava",at:[6,-4,-2],size:[44,.4,48]},{kind:"tree",at:[-2,0,-12]},{kind:"tree",at:[14.5,0,-5]},{kind:"rock",at:[14,1.5,16]}]},Sx={title:"Hill of Honey",type:"hill",goal:"Stand on the glowing hilltop for 20 seconds",look:{palette:"sunset",camera:"third"},rules:{win:"hill",timer:90,lives:4,hold:20},spawn:[0,0,-12],objects:[{kind:"block",at:[0,-1,0],size:[30,1,30],color:3},{kind:"block",at:[0,0,0],size:[8,1.5,8],color:0},{kind:"ramp",at:[0,0,5],size:[3,1.5,2],dir:3,color:1},{kind:"ramp",at:[0,0,-5],size:[3,1.5,2],dir:1,color:1},{kind:"ramp",at:[5,0,0],size:[2,1.5,3],dir:2,color:1},{kind:"ramp",at:[-5,0,0],size:[2,1.5,3],dir:0,color:1},{kind:"zone",at:[0,1.5,0],size:[4,.1,4]},{kind:"enemy",at:[3,1.5,3],chase:!0,speed:2.2},{kind:"enemy",at:[-3,1.5,-3],chase:!0,speed:1.8},{kind:"enemy",at:[-9,0,-9],path:[[9,0,-9],[9,0,9],[-9,0,9]],speed:3},{kind:"bounce",at:[-10,0,10]},{kind:"bounce",at:[10,0,-10]},{kind:"heart",at:[10,0,10]},{kind:"gem",at:[-10,0,-10]},{kind:"tree",at:[-13,0,0]},{kind:"tree",at:[13,0,2]},{kind:"tree",at:[0,0,13]},{kind:"flower",at:[-4,1.5,3.2]},{kind:"flower",at:[3.5,1.5,-3.4]}]},wx={title:"Key Crypt",type:"parkour",goal:"Grab the keys to open the doors and reach the flag",look:{palette:"lava",camera:"side"},rules:{win:"flag",timer:120,lives:3},spawn:[-20,1,0],objects:[{kind:"block",at:[-18,0,0],size:[10,1,4],color:0},{kind:"block",at:[-15,1,0],size:[2,1,4],color:1},{kind:"key",at:[-15,2,0],color:4},{kind:"block",at:[-8,0,0],size:[8,1,4],color:0},{kind:"door",at:[-11,1,0],size:[.6,3,4],color:4},{kind:"enemy",at:[-7,1,0],path:[[-5,1,0]],speed:1.5},{kind:"platform",at:[-2,1,0],size:[2.5,.5,4],color:5,move:{to:[-2,4,0],speed:1.5}},{kind:"block",at:[2,3.5,0],size:[4,1,4],color:1},{kind:"key",at:[2,4.5,0],color:1},{kind:"block",at:[8,2,0],size:[6,1,4],color:0},{kind:"door",at:[9,3,0],size:[.6,3,4],color:1},{kind:"spike",at:[6.5,3,0],size:[1,.6,4]},{kind:"block",at:[16,2,0],size:[6,1,4],color:0},{kind:"heart",at:[14,3,0]},{kind:"flag",at:[18,3,0]},{kind:"coin",at:[-21,1,0],repeat:{count:3,step:[1.5,0,0]}},{kind:"coin",at:[-9,1,0],repeat:{count:3,step:[1.5,0,0]}},{kind:"coin",at:[-2,5,0]},{kind:"coin",at:[12,3.6,0]},{kind:"block",at:[-6,0,-4],size:[3,6,2],color:2},{kind:"block",at:[6,0,-4],size:[3,8,2],color:2},{kind:"block",at:[16,0,-4],size:[4,7,2],color:2},{kind:"lava",at:[0,-3,0],size:[48,.4,10]},{kind:"mushroom",at:[-17,1,-1.5]},{kind:"rock",at:[17,3,1.5]}]},tr=[{id:"sample-sky-steps",spec:_e(gx).spec},{id:"sample-dune-dash",spec:_e(vx).spec},{id:"sample-mushroom-meadow",spec:_e(_x).spec},{id:"sample-beetle-arena",spec:_e(yx).spec},{id:"sample-glow-maze",spec:_e($d()).spec},{id:"sample-pollen-range",spec:_e(xx).spec},{id:"sample-beetle-night",spec:_e(Mx).spec},{id:"sample-sky-ghost",spec:_e(bx).spec},{id:"sample-hill-of-honey",spec:_e(Sx).spec},{id:"sample-key-crypt",spec:_e(wx).spec}];$d();const pe=1/60,Da=22,Ex=9,hu=.22,we=Ge.halfW,ss=Ge.height,$e=1e-4,hr=s=>s.size??Ps[s.kind]??[1,1,1];class Na{constructor(t){U(this,"spec");U(this,"status","ready");U(this,"reason","");U(this,"steps",0);U(this,"time",0);U(this,"p");U(this,"v",[0,0,0]);U(this,"facing",0);U(this,"grounded",!1);U(this,"groundId",null);U(this,"coyote",0);U(this,"jumpBuf",0);U(this,"prevJump",!1);U(this,"gliding",!1);U(this,"lives");U(this,"points",0);U(this,"coinsTotal");U(this,"coinsTaken",0);U(this,"checkpoint");U(this,"checkpointId",null);U(this,"invuln",0);U(this,"boost",0);U(this,"taken",new Set);U(this,"plats",new Map);U(this,"enemies",new Map);U(this,"events",[]);U(this,"finish",0);U(this,"statics",[]);U(this,"hazards",[]);U(this,"ramps",[]);U(this,"byId",new Map);U(this,"doors",[]);U(this,"shots",[]);U(this,"shotSeq",0);U(this,"fireCool",0);U(this,"prevFire",!1);U(this,"targetsTotal",0);U(this,"targetsHit",0);U(this,"turrets",new Map);U(this,"keys",new Set);U(this,"hold",0);U(this,"inZone",!1);U(this,"wave",0);U(this,"totalWaves",0);U(this,"nextWaveAt",2);U(this,"spawned",[]);U(this,"zombies",new Set);U(this,"lockZ");this.spec=t,this.p=[...t.spawn],this.checkpoint=[...t.spawn],this.lives=t.rules.lives,this.coinsTotal=t.objects.filter(e=>e.kind==="coin").length,this.targetsTotal=t.objects.filter(e=>e.kind==="target").length,this.totalWaves=Math.max(0,...t.objects.filter(e=>e.kind==="spawner").map(e=>e.waves??3)),this.lockZ=t.look.camera==="side"?t.spawn[2]:null;for(const e of t.objects)if(this.byId.set(e.id,e),e.kind==="ramp")this.ramps.push(e);else if(e.kind==="platform"&&(e.move||e.spin||e.fall))this.plats.set(e.id,{pos:[...e.at],prev:[...e.at],angle:0,fallT:-1,vy:0,gone:0});else if(e.kind==="door")this.doors.push(e);else if(Go(e))this.statics.push(is(e,e.at)),e.kind==="turret"&&this.turrets.set(e.id,{cool:(e.rate??2)*.6,yaw:0,hp:3});else if(Bc.has(e.kind)){const n=is(e,e.at);e.kind==="spike"&&(n.x0+=.12,n.x1-=.12,n.z0+=.12,n.z1-=.12,n.y1-=.1),this.hazards.push(n)}else e.kind==="enemy"&&this.enemies.set(e.id,{pos:[...e.at],alive:!0,leg:0,target:1,facing:0});this.snapToGround()}obj(t){return this.byId.get(t)}start(){this.status==="ready"&&(this.status="play")}get left(){return Math.max(0,this.spec.rules.timer-this.time)}get score(){const t=this.spec.rules.win;return t==="survive"||t==="waves"?{kind:"points",value:this.points}:{kind:"time",value:Math.round(this.finish*1e3)}}step(t){if(this.events=[],this.status!=="play"){this.prevJump=t.jump;return}this.steps++,this.time=this.steps*pe,this.movePlatforms(),this.moveEnemies(),this.movePlayer(t),this.fire(t),this.moveShots(),this.runTurrets(),this.runWaves(),this.status==="play"&&(this.touch(),this.status==="play"&&(this.p[1]<Ge.killY&&this.die("fall"),this.status==="play"&&this.time>=this.spec.rules.timer&&(this.spec.rules.win==="survive"?this.win():this.lose("Time's up"))))}movePlatforms(){for(const[t,e]of this.plats){const n=this.byId.get(t);if(e.prev=[...e.pos],e.gone>0){e.gone-=pe,e.gone<=0&&(e.pos=[...n.at],e.prev=[...n.at],e.fallT=-1,e.vy=0);continue}if(e.fallT>=0){e.fallT+=pe,e.fallT>.55&&(e.vy-=Ge.gravity*.6*pe,e.pos[1]+=e.vy*pe,e.pos[1]<Ge.killY&&(e.gone=3,e.pos[1]=-999));continue}if(n.move){const i=Math.hypot(n.move.to[0]-n.at[0],n.move.to[1]-n.at[1],n.move.to[2]-n.at[2]),r=this.time*n.move.speed%(2*i),o=r<i?r/i:2-r/i,a=o*o*(3-2*o);for(let c=0;c<3;c++)e.pos[c]=n.at[c]+(n.move.to[c]-n.at[c])*a}n.spin&&(e.angle=n.spin*Math.PI/180*this.time)}}moveEnemies(){var t;for(const[e,n]of this.enemies){if(!n.alive)continue;const i=this.byId.get(e),r=(i.speed??2.5)*pe,o=this.p[0]-n.pos[0],a=this.p[2]-n.pos[2],c=this.zombies.has(e),l=c||Math.hypot(o,a)<9&&Math.abs(this.p[1]-n.pos[1])<2.5;let h,d;if(i.chase&&l)h=this.p[0],d=this.p[2];else if((t=i.path)!=null&&t.length){const _=[i.at,...i.path],m=_[n.target%_.length];h=m[0],d=m[2],Math.hypot(h-n.pos[0],d-n.pos[2])<.1&&(n.target=(n.target+1)%_.length)}else h=i.at[0],d=i.at[2];if(i.chase&&!c){const _=h-i.at[0],m=d-i.at[2],g=Math.hypot(_,m);g>10&&(h=i.at[0]+_/g*10,d=i.at[2]+m/g*10)}const u=h-n.pos[0],f=d-n.pos[2],p=Math.hypot(u,f);if(p>.01){const _=Math.min(1,r/p);n.pos[0]+=u*_,n.pos[2]+=f*_,n.facing=Math.atan2(u,f),n.leg+=r*6}}}boxes(){const t=this.statics.slice();for(const e of this.doors)this.keys.has(e.color??0)||t.push(is(e,e.at));for(const[e,n]of this.plats)n.gone<=0&&t.push(is(this.byId.get(e),n.pos));return t}movePlayer(t){const e=this.p,n=this.v;if(this.grounded&&this.groundId){const p=this.plats.get(this.groundId);if(p&&p.gone<=0){for(let m=0;m<3;m++)e[m]+=p.pos[m]-p.prev[m];const _=this.byId.get(this.groundId);if(_.spin){const m=_.spin*Math.PI/180*pe,g=e[0]-p.pos[0],x=e[2]-p.pos[2],v=Math.cos(m),M=Math.sin(m);e[0]=p.pos[0]+g*v+x*M,e[2]=p.pos[2]-g*M+x*v,this.facing+=m}_.fall&&p.fallT<0&&(p.fallT=0)}}let i=t.x,r=this.lockZ===null?t.z:0;const o=Math.hypot(i,r);o>1&&(i/=o,r/=o),this.boost>0&&(this.boost-=pe);const a=Ge.run*(this.boost>0?1.7:1),c=this.grounded?14:6,l=Math.min(1,c*pe);n[0]+=(i*a-n[0])*l,n[2]+=(r*a-n[2])*l,o>.1&&(this.facing=Math.atan2(i,r));const h=t.jump&&!this.prevJump;this.prevJump=t.jump,h?this.jumpBuf=.12:this.jumpBuf=Math.max(0,this.jumpBuf-pe),this.coyote=this.grounded?.1:Math.max(0,this.coyote-pe),this.jumpBuf>0&&this.coyote>0&&(n[1]=Ge.jumpV,this.grounded=!1,this.groundId=null,this.coyote=0,this.jumpBuf=0,this.events.push("jump")),n[1]-=Ge.gravity*pe,this.gliding=!this.grounded&&t.jump&&n[1]<-2.6,this.gliding&&(n[1]=-2.6),n[1]<-40&&(n[1]=-40);const d=this.boxes(),u=this.grounded;for(const p of[0,2]){e[p]+=n[p]*pe;for(const _ of d){if(!Mo(e,_))continue;const m=_.y1-e[1];if(u&&m>0&&m<=.35&&!Tx(e,_.y1,d)){e[1]=_.y1+$e;continue}p===0?e[0]=n[0]>0?_.x0-we-$e:n[0]<0?_.x1+we+$e:uu(e[0],_.x0,_.x1,we):e[2]=n[2]>0?_.z0-we-$e:n[2]<0?_.z1+we+$e:uu(e[2],_.z0,_.z1,we),n[p]=0}}this.grounded=!1;let f=null;e[1]+=n[1]*pe;for(const p of d)Mo(e,p)&&(n[1]<=0&&e[1]-n[1]*pe>=p.y1-.25?(e[1]=p.y1,n[1]=0,this.grounded=!0,f=p):n[1]>0?(e[1]=p.y0-ss-$e,n[1]=0):(e[1]=p.y1,n[1]=0,this.grounded=!0,f=p));if(!this.grounded&&u&&this.groundId&&this.plats.has(this.groundId)&&n[1]<=0){const p=this.plats.get(this.groundId),_=is(this.byId.get(this.groundId),p.pos);p.gone<=0&&e[0]+we>_.x0&&e[0]-we<_.x1&&e[2]+we>_.z0&&e[2]-we<_.z1&&e[1]-_.y1<.4&&e[1]-_.y1>-.05&&(e[1]=_.y1,n[1]=0,this.grounded=!0,f=_)}for(const p of this.ramps){const _=du(p,e[0],e[2]);if(_===null)continue;const m=e[1]-_;(n[1]<=0&&m<.05&&m>-.8||u&&n[1]<=0&&m>=0&&m<.35)&&(e[1]=_,n[1]=0,this.grounded=!0,f={id:p.id,kind:"ramp",x0:0,x1:0,y0:0,y1:_,z0:0,z1:0})}if(this.lockZ!==null&&(e[2]=this.lockZ,n[2]=0),this.groundId=(f==null?void 0:f.id)??null,this.grounded&&!u&&this.events.push("land"),f&&this.grounded)if(f.kind==="bounce"){const p=this.byId.get(f.id);n[1]=Math.sqrt(2*Ge.gravity*(p.power??Ge.bounceDefault)),this.grounded=!1,this.groundId=null,this.coyote=0,this.events.push("bounce")}else f.kind==="speed"&&(this.boost<=0&&this.events.push("speed"),this.boost=1.6)}touch(){const t=this.p,e=t[0],n=t[1]+ss/2,i=t[2];if(this.invuln>0)this.invuln-=pe;else for(const r of this.hazards)if(Mo(t,r)){this.die("hurt");return}for(const[r,o]of this.enemies)if(o.alive&&Math.abs(e-o.pos[0])<we+.45&&Math.abs(i-o.pos[2])<we+.45&&t[1]<o.pos[1]+.75&&t[1]+ss>o.pos[1]){if(this.v[1]<0&&t[1]>o.pos[1]+.35)o.alive=!1,this.v[1]=9,this.points+=25,this.events.push("stomp");else if(this.invuln<=0){this.die("hurt");return}}for(const r of this.spec.objects)if(r.kind==="coin"||r.kind==="gem"){if(this.taken.has(r.id))continue;const o=n-(r.at[1]+.6);if(Math.hypot(e-r.at[0],o,i-r.at[2])<.95&&(this.taken.add(r.id),r.kind==="coin"?(this.coinsTaken++,this.points+=10,this.events.push("coin")):(this.points+=50,this.events.push("gem")),this.spec.rules.win==="coins"&&this.coinsTaken>=this.coinsTotal)){this.win();return}}else if(r.kind==="checkpoint"){if(this.checkpointId===r.id)continue;Math.hypot(e-r.at[0],i-r.at[2])<1&&t[1]>r.at[1]-.6&&t[1]<r.at[1]+2&&(this.checkpointId=r.id,this.checkpoint=[r.at[0],r.at[1]+.05,r.at[2]],this.events.push("checkpoint"))}else if(r.kind==="key"||r.kind==="heart"){if(this.taken.has(r.id))continue;Math.hypot(e-r.at[0],n-(r.at[1]+.6),i-r.at[2])<.95&&(this.taken.add(r.id),r.kind==="key"?(this.keys.add(r.color??0),this.events.push("key")):(this.lives=Math.min(this.spec.rules.lives+2,this.lives+1),this.events.push("heart")))}else if(r.kind==="zone"){const o=hr(r),a=Math.abs(e-r.at[0])<o[0]/2&&Math.abs(i-r.at[2])<o[2]/2&&t[1]>r.at[1]-.5&&t[1]<r.at[1]+3;if(this.inZone=a,a&&this.spec.rules.win==="hill"&&(this.hold+=pe,this.hold>=this.spec.rules.hold)){this.win();return}}else if(r.kind==="flag"&&this.spec.rules.win==="flag"&&Math.hypot(e-r.at[0],i-r.at[2])<1&&t[1]>r.at[1]-.6&&t[1]<r.at[1]+2.6){this.win();return}}fire(t){this.fireCool>0&&(this.fireCool-=pe);const e=!!t.fire,n=e&&!this.prevFire;if(this.prevFire=e,!this.spec.rules.shoot||!e||this.fireCool>0)return;let i=t.aim??[Math.sin(this.facing),0,Math.cos(this.facing)];const r=Math.hypot(i[0],i[1],i[2])||1;i=[i[0]/r,i[1]/r,i[2]/r];const o=[this.p[0]+i[0]*.45,this.p[1]+.55+i[1]*.45,this.p[2]+i[2]*.45];this.shots.push({id:++this.shotSeq,pos:o,vel:[i[0]*Da,i[1]*Da,i[2]*Da],life:1.6,foe:!1}),this.fireCool=n?hu:hu*1.4,this.events.push("shoot")}moveShots(){if(!this.shots.length)return;const t=this.boxes(),e=[],n=this.p[0],i=this.p[1]+ss/2,r=this.p[2];t:for(const o of this.shots){o.life-=pe;for(let a=0;a<2;a++){for(let c=0;c<3;c++)o.pos[c]+=o.vel[c]*pe/2;if(o.life<=0||o.pos[1]<Ge.killY)continue t;if(t.some(c=>o.pos[0]>c.x0&&o.pos[0]<c.x1&&o.pos[1]>c.y0&&o.pos[1]<c.y1&&o.pos[2]>c.z0&&o.pos[2]<c.z1)){o.foe||this.shotTurret(o.pos);continue t}if(o.foe){if(Math.hypot(o.pos[0]-n,o.pos[1]-i,o.pos[2]-r)<.55){this.invuln<=0&&this.die("hurt");continue t}}else{for(const[,c]of this.enemies)if(c.alive&&Math.hypot(o.pos[0]-c.pos[0],o.pos[1]-(c.pos[1]+.4),o.pos[2]-c.pos[2])<.75){c.alive=!1,this.points+=25,this.events.push("hit");continue t}for(const[c,l]of this.turrets){if(l.hp<=0)continue;const h=this.byId.get(c);if(Math.hypot(o.pos[0]-h.at[0],o.pos[1]-(h.at[1]+hr(h)[1]+.25),o.pos[2]-h.at[2])<.6){l.hp--,this.events.push("hit"),l.hp<=0&&(this.points+=30,this.events.push("turret"));continue t}}for(const c of this.spec.objects)if(!(c.kind!=="target"||this.taken.has(c.id))&&Math.hypot(o.pos[0]-c.at[0],o.pos[1]-(c.at[1]+1.2),o.pos[2]-c.at[2])<.75){this.taken.add(c.id),this.targetsHit++,this.points+=50,this.events.push("target"),this.spec.rules.win==="targets"&&this.targetsHit>=this.targetsTotal&&this.win();continue t}}}e.push(o)}this.shots=e}shotTurret(t){for(const[e,n]of this.turrets){if(n.hp<=0)continue;const i=is(this.byId.get(e),this.byId.get(e).at);if(t[0]>i.x0-.1&&t[0]<i.x1+.1&&t[1]>i.y0-.1&&t[1]<i.y1+.6&&t[2]>i.z0-.1&&t[2]<i.z1+.1){n.hp--,this.events.push("hit"),n.hp<=0&&(this.points+=30,this.events.push("turret"));return}}}runTurrets(){for(const[t,e]of this.turrets){if(e.hp<=0)continue;const n=this.byId.get(t),i=hr(n),r=[n.at[0],n.at[1]+i[1]+.25,n.at[2]],o=this.p[0]-r[0],a=this.p[1]+ss/2-r[1],c=this.p[2]-r[2],l=Math.hypot(o,a,c);if(!(l>20)&&(e.yaw=Math.atan2(o,c),e.cool-=pe,e.cool<=0)){e.cool=n.rate??2;const h=Ex/l;this.shots.push({id:++this.shotSeq,pos:[r[0]+o/l*.7,r[1]+a/l*.7,r[2]+c/l*.7],vel:[o*h,a*h,c*h],life:3,foe:!0})}}}runWaves(){if(!this.totalWaves)return;const t=[...this.zombies].filter(i=>{var r;return(r=this.enemies.get(i))==null?void 0:r.alive}).length;if(this.wave>=this.totalWaves){!t&&this.spec.rules.win==="waves"&&this.win();return}if(!t&&this.wave>0&&(this.nextWaveAt=Math.min(this.nextWaveAt,this.time+3)),this.time<this.nextWaveAt)return;const e=this.wave++;let n=60;for(const i of this.spec.objects){if(i.kind!=="spawner"||(i.waves??3)<=e)continue;n=Math.min(n,i.every??15);const r=(i.count??3)+Math.floor(e/2);for(let o=0;o<r;o++){const a=o/r*Math.PI*2+e,c=`z:${i.id}:${e}:${o}`,l={id:c,kind:"enemy",at:[i.at[0]+Math.cos(a)*1.4,i.at[1],i.at[2]+Math.sin(a)*1.4],chase:!0,speed:Math.min(4.5,1.8+e*.3)};this.byId.set(c,l),this.spawned.push(l),this.zombies.add(c),this.enemies.set(c,{pos:[...l.at],alive:!0,leg:o,target:1,facing:0})}}this.nextWaveAt=this.time+n,this.events.push("wave")}get zombiesLeft(){return[...this.zombies].filter(t=>{var e;return(e=this.enemies.get(t))==null?void 0:e.alive}).length}die(t){if(this.lives--,this.events.push(t),this.lives<=0){this.lose(t==="fall"?"You fell":"Out of lives");return}this.p=[...this.checkpoint],this.v=[0,0,0],this.boost=0,this.shots=this.shots.filter(e=>!e.foe),this.invuln=1.5,this.grounded=!1,this.groundId=null,this.snapToGround()}win(){this.status="won",this.finish=this.time,this.points+=this.lives*20,this.spec.rules.win!=="survive"&&(this.points+=Math.round(this.left*2)),this.events.push("win")}lose(t){this.status="lost",this.reason=t,this.events.push("lose")}snapToGround(){const t=this.p;let e=-1/0;for(const n of this.boxes())t[0]+we>n.x0&&t[0]-we<n.x1&&t[2]+we>n.z0&&t[2]-we<n.z1&&n.y1<=t[1]+1.2&&n.y1>e&&(e=n.y1);for(const n of this.ramps){const i=du(n,t[0],t[2]);i!==null&&i<=t[1]+1.2&&i>e&&(e=i)}e>-1/0&&t[1]-e<3&&(t[1]=e,this.grounded=!0)}}function is(s,t){const e=hr(s),n=s.rot===90||s.rot===270?[e[2],e[1],e[0]]:e;return{id:s.id,kind:s.kind,x0:t[0]-n[0]/2,x1:t[0]+n[0]/2,y0:t[1],y1:t[1]+n[1],z0:t[2]-n[2]/2,z1:t[2]+n[2]/2}}function Mo(s,t){return s[0]+we>t.x0+$e&&s[0]-we<t.x1-$e&&s[2]+we>t.z0+$e&&s[2]-we<t.z1-$e&&s[1]+ss>t.y0+$e&&s[1]<t.y1-$e}function Tx(s,t,e){const n=[s[0],t+$e,s[2]];return e.some(i=>Mo(n,i))}function uu(s,t,e,n){return s-t<e-s?t-n-$e:e+n+$e}function du(s,t,e){const n=hr(s),i=s.at[0]-n[0]/2,r=s.at[0]+n[0]/2,o=s.at[2]-n[2]/2,a=s.at[2]+n[2]/2;if(t<i||t>r||e<o||e>a)return null;const c=s.dir??0,l=c===0?(t-i)/n[0]:c===1?(e-o)/n[2]:c===2?(r-t)/n[0]:(a-e)/n[2];return s.at[1]+n[1]*Math.min(1,Math.max(0,l))}function fu(s,t){if(t===Hf)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),s;if(t===Pc||t===Ku){let e=s.getIndex();if(e===null){const o=[],a=s.getAttribute("position");if(a!==void 0){for(let c=0;c<a.count;c++)o.push(c);s.setIndex(o),e=s.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),s}const n=e.count-2,i=[];if(t===Pc)for(let o=1;o<=n;o++)i.push(e.getX(0)),i.push(e.getX(o)),i.push(e.getX(o+1));else for(let o=0;o<n;o++)o%2===0?(i.push(e.getX(o)),i.push(e.getX(o+1)),i.push(e.getX(o+2))):(i.push(e.getX(o+2)),i.push(e.getX(o+1)),i.push(e.getX(o)));i.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");const r=s.clone();return r.setIndex(i),r.clearGroups(),r}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",t),s}class Ax extends Os{constructor(t){super(t),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(e){return new Ix(e)}),this.register(function(e){return new Dx(e)}),this.register(function(e){return new Gx(e)}),this.register(function(e){return new Vx(e)}),this.register(function(e){return new Wx(e)}),this.register(function(e){return new Ux(e)}),this.register(function(e){return new kx(e)}),this.register(function(e){return new Ox(e)}),this.register(function(e){return new Fx(e)}),this.register(function(e){return new Lx(e)}),this.register(function(e){return new zx(e)}),this.register(function(e){return new Nx(e)}),this.register(function(e){return new Hx(e)}),this.register(function(e){return new Bx(e)}),this.register(function(e){return new Cx(e)}),this.register(function(e){return new Xx(e)}),this.register(function(e){return new jx(e)})}load(t,e,n,i){const r=this;let o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){const l=cr.extractUrlBase(t);o=cr.resolveURL(l,this.path)}else o=cr.extractUrlBase(t);this.manager.itemStart(t);const a=function(l){i?i(l):console.error(l),r.manager.itemError(t),r.manager.itemEnd(t)},c=new Rd(this.manager);c.setPath(this.path),c.setResponseType("arraybuffer"),c.setRequestHeader(this.requestHeader),c.setWithCredentials(this.withCredentials),c.load(t,function(l){try{r.parse(l,o,function(h){e(h),r.manager.itemEnd(t)},a)}catch(h){a(h)}},n,a)}setDRACOLoader(t){return this.dracoLoader=t,this}setKTX2Loader(t){return this.ktx2Loader=t,this}setMeshoptDecoder(t){return this.meshoptDecoder=t,this}register(t){return this.pluginCallbacks.indexOf(t)===-1&&this.pluginCallbacks.push(t),this}unregister(t){return this.pluginCallbacks.indexOf(t)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(t),1),this}parse(t,e,n,i){let r;const o={},a={},c=new TextDecoder;if(typeof t=="string")r=JSON.parse(t);else if(t instanceof ArrayBuffer)if(c.decode(new Uint8Array(t,0,4))===Yd){try{o[Bt.KHR_BINARY_GLTF]=new $x(t)}catch(d){i&&i(d);return}r=JSON.parse(o[Bt.KHR_BINARY_GLTF].content)}else r=JSON.parse(c.decode(t));else r=t;if(r.asset===void 0||r.asset.version[0]<2){i&&i(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const l=new oM(r,{path:e||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});l.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){const d=this.pluginCallbacks[h](l);d.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),a[d.name]=d,o[d.name]=!0}if(r.extensionsUsed)for(let h=0;h<r.extensionsUsed.length;++h){const d=r.extensionsUsed[h],u=r.extensionsRequired||[];switch(d){case Bt.KHR_MATERIALS_UNLIT:o[d]=new Px;break;case Bt.KHR_DRACO_MESH_COMPRESSION:o[d]=new Yx(r,this.dracoLoader);break;case Bt.KHR_TEXTURE_TRANSFORM:o[d]=new qx;break;case Bt.KHR_MESH_QUANTIZATION:o[d]=new Kx;break;default:u.indexOf(d)>=0&&a[d]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+d+'".')}}l.setExtensions(o),l.setPlugins(a),l.parse(n,i)}parseAsync(t,e){const n=this;return new Promise(function(i,r){n.parse(t,e,i,r)})}}function Rx(){let s={};return{get:function(t){return s[t]},add:function(t,e){s[t]=e},remove:function(t){delete s[t]},removeAll:function(){s={}}}}const Bt={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class Cx{constructor(t){this.parser=t,this.name=Bt.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const t=this.parser,e=this.parser.json.nodes||[];for(let n=0,i=e.length;n<i;n++){const r=e[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&t._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(t){const e=this.parser,n="light:"+t;let i=e.cache.get(n);if(i)return i;const r=e.json,c=((r.extensions&&r.extensions[this.name]||{}).lights||[])[t];let l;const h=new Tt(16777215);c.color!==void 0&&h.setRGB(c.color[0],c.color[1],c.color[2],Fe);const d=c.range!==void 0?c.range:0;switch(c.type){case"directional":l=new Pd(h),l.target.position.set(0,0,-1),l.add(l.target);break;case"point":l=new Dy(h),l.distance=d;break;case"spot":l=new Ly(h),l.distance=d,c.spot=c.spot||{},c.spot.innerConeAngle=c.spot.innerConeAngle!==void 0?c.spot.innerConeAngle:0,c.spot.outerConeAngle=c.spot.outerConeAngle!==void 0?c.spot.outerConeAngle:Math.PI/4,l.angle=c.spot.outerConeAngle,l.penumbra=1-c.spot.innerConeAngle/c.spot.outerConeAngle,l.target.position.set(0,0,-1),l.add(l.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+c.type)}return l.position.set(0,0,0),l.decay=2,Wn(l,c),c.intensity!==void 0&&(l.intensity=c.intensity),l.name=e.createUniqueName(c.name||"light_"+t),i=Promise.resolve(l),e.cache.add(n,i),i}getDependency(t,e){if(t==="light")return this._loadLight(e)}createNodeAttachment(t){const e=this,n=this.parser,r=n.json.nodes[t],a=(r.extensions&&r.extensions[this.name]||{}).light;return a===void 0?null:this._loadLight(a).then(function(c){return n._getNodeRef(e.cache,a,c)})}}class Px{constructor(){this.name=Bt.KHR_MATERIALS_UNLIT}getMaterialType(){return Ve}extendParams(t,e,n){const i=[];t.color=new Tt(1,1,1),t.opacity=1;const r=e.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){const o=r.baseColorFactor;t.color.setRGB(o[0],o[1],o[2],Fe),t.opacity=o[3]}r.baseColorTexture!==void 0&&i.push(n.assignTexture(t,"map",r.baseColorTexture,ke))}return Promise.all(i)}}class Lx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(t,e){const i=this.parser.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=i.extensions[this.name].emissiveStrength;return r!==void 0&&(e.emissiveIntensity=r),Promise.resolve()}}class Ix{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_CLEARCOAT}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];if(o.clearcoatFactor!==void 0&&(e.clearcoat=o.clearcoatFactor),o.clearcoatTexture!==void 0&&r.push(n.assignTexture(e,"clearcoatMap",o.clearcoatTexture)),o.clearcoatRoughnessFactor!==void 0&&(e.clearcoatRoughness=o.clearcoatRoughnessFactor),o.clearcoatRoughnessTexture!==void 0&&r.push(n.assignTexture(e,"clearcoatRoughnessMap",o.clearcoatRoughnessTexture)),o.clearcoatNormalTexture!==void 0&&(r.push(n.assignTexture(e,"clearcoatNormalMap",o.clearcoatNormalTexture)),o.clearcoatNormalTexture.scale!==void 0)){const a=o.clearcoatNormalTexture.scale;e.clearcoatNormalScale=new it(a,a)}return Promise.all(r)}}class Dx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_DISPERSION}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const i=this.parser.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=i.extensions[this.name];return e.dispersion=r.dispersion!==void 0?r.dispersion:0,Promise.resolve()}}class Nx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_IRIDESCENCE}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];return o.iridescenceFactor!==void 0&&(e.iridescence=o.iridescenceFactor),o.iridescenceTexture!==void 0&&r.push(n.assignTexture(e,"iridescenceMap",o.iridescenceTexture)),o.iridescenceIor!==void 0&&(e.iridescenceIOR=o.iridescenceIor),e.iridescenceThicknessRange===void 0&&(e.iridescenceThicknessRange=[100,400]),o.iridescenceThicknessMinimum!==void 0&&(e.iridescenceThicknessRange[0]=o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&(e.iridescenceThicknessRange[1]=o.iridescenceThicknessMaximum),o.iridescenceThicknessTexture!==void 0&&r.push(n.assignTexture(e,"iridescenceThicknessMap",o.iridescenceThicknessTexture)),Promise.all(r)}}class Ux{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_SHEEN}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[];e.sheenColor=new Tt(0,0,0),e.sheenRoughness=0,e.sheen=1;const o=i.extensions[this.name];if(o.sheenColorFactor!==void 0){const a=o.sheenColorFactor;e.sheenColor.setRGB(a[0],a[1],a[2],Fe)}return o.sheenRoughnessFactor!==void 0&&(e.sheenRoughness=o.sheenRoughnessFactor),o.sheenColorTexture!==void 0&&r.push(n.assignTexture(e,"sheenColorMap",o.sheenColorTexture,ke)),o.sheenRoughnessTexture!==void 0&&r.push(n.assignTexture(e,"sheenRoughnessMap",o.sheenRoughnessTexture)),Promise.all(r)}}class kx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_TRANSMISSION}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];return o.transmissionFactor!==void 0&&(e.transmission=o.transmissionFactor),o.transmissionTexture!==void 0&&r.push(n.assignTexture(e,"transmissionMap",o.transmissionTexture)),Promise.all(r)}}class Ox{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_VOLUME}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];e.thickness=o.thicknessFactor!==void 0?o.thicknessFactor:0,o.thicknessTexture!==void 0&&r.push(n.assignTexture(e,"thicknessMap",o.thicknessTexture)),e.attenuationDistance=o.attenuationDistance||1/0;const a=o.attenuationColor||[1,1,1];return e.attenuationColor=new Tt().setRGB(a[0],a[1],a[2],Fe),Promise.all(r)}}class Fx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_IOR}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const i=this.parser.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=i.extensions[this.name];return e.ior=r.ior!==void 0?r.ior:1.5,Promise.resolve()}}class zx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_SPECULAR}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];e.specularIntensity=o.specularFactor!==void 0?o.specularFactor:1,o.specularTexture!==void 0&&r.push(n.assignTexture(e,"specularIntensityMap",o.specularTexture));const a=o.specularColorFactor||[1,1,1];return e.specularColor=new Tt().setRGB(a[0],a[1],a[2],Fe),o.specularColorTexture!==void 0&&r.push(n.assignTexture(e,"specularColorMap",o.specularColorTexture,ke)),Promise.all(r)}}class Bx{constructor(t){this.parser=t,this.name=Bt.EXT_MATERIALS_BUMP}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];return e.bumpScale=o.bumpFactor!==void 0?o.bumpFactor:1,o.bumpTexture!==void 0&&r.push(n.assignTexture(e,"bumpMap",o.bumpTexture)),Promise.all(r)}}class Hx{constructor(t){this.parser=t,this.name=Bt.KHR_MATERIALS_ANISOTROPY}getMaterialType(t){const n=this.parser.json.materials[t];return!n.extensions||!n.extensions[this.name]?null:Nn}extendMaterialParams(t,e){const n=this.parser,i=n.json.materials[t];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();const r=[],o=i.extensions[this.name];return o.anisotropyStrength!==void 0&&(e.anisotropy=o.anisotropyStrength),o.anisotropyRotation!==void 0&&(e.anisotropyRotation=o.anisotropyRotation),o.anisotropyTexture!==void 0&&r.push(n.assignTexture(e,"anisotropyMap",o.anisotropyTexture)),Promise.all(r)}}class Gx{constructor(t){this.parser=t,this.name=Bt.KHR_TEXTURE_BASISU}loadTexture(t){const e=this.parser,n=e.json,i=n.textures[t];if(!i.extensions||!i.extensions[this.name])return null;const r=i.extensions[this.name],o=e.options.ktx2Loader;if(!o){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return e.loadTextureImage(t,r.source,o)}}class Vx{constructor(t){this.parser=t,this.name=Bt.EXT_TEXTURE_WEBP,this.isSupported=null}loadTexture(t){const e=this.name,n=this.parser,i=n.json,r=i.textures[t];if(!r.extensions||!r.extensions[e])return null;const o=r.extensions[e],a=i.images[o.source];let c=n.textureLoader;if(a.uri){const l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return this.detectSupport().then(function(l){if(l)return n.loadTextureImage(t,o.source,c);if(i.extensionsRequired&&i.extensionsRequired.indexOf(e)>=0)throw new Error("THREE.GLTFLoader: WebP required by asset but unsupported.");return n.loadTexture(t)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(t){const e=new Image;e.src="data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",e.onload=e.onerror=function(){t(e.height===1)}})),this.isSupported}}class Wx{constructor(t){this.parser=t,this.name=Bt.EXT_TEXTURE_AVIF,this.isSupported=null}loadTexture(t){const e=this.name,n=this.parser,i=n.json,r=i.textures[t];if(!r.extensions||!r.extensions[e])return null;const o=r.extensions[e],a=i.images[o.source];let c=n.textureLoader;if(a.uri){const l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return this.detectSupport().then(function(l){if(l)return n.loadTextureImage(t,o.source,c);if(i.extensionsRequired&&i.extensionsRequired.indexOf(e)>=0)throw new Error("THREE.GLTFLoader: AVIF required by asset but unsupported.");return n.loadTexture(t)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(t){const e=new Image;e.src="data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=",e.onload=e.onerror=function(){t(e.height===1)}})),this.isSupported}}class Xx{constructor(t){this.name=Bt.EXT_MESHOPT_COMPRESSION,this.parser=t}loadBufferView(t){const e=this.parser.json,n=e.bufferViews[t];if(n.extensions&&n.extensions[this.name]){const i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(e.extensionsRequired&&e.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(a){const c=i.byteOffset||0,l=i.byteLength||0,h=i.count,d=i.byteStride,u=new Uint8Array(a,c,l);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(h,d,u,i.mode,i.filter).then(function(f){return f.buffer}):o.ready.then(function(){const f=new ArrayBuffer(h*d);return o.decodeGltfBuffer(new Uint8Array(f),h,d,u,i.mode,i.filter),f})})}else return null}}class jx{constructor(t){this.name=Bt.EXT_MESH_GPU_INSTANCING,this.parser=t}createNodeMesh(t){const e=this.parser.json,n=e.nodes[t];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;const i=e.meshes[n.mesh];for(const l of i.primitives)if(l.mode!==dn.TRIANGLES&&l.mode!==dn.TRIANGLE_STRIP&&l.mode!==dn.TRIANGLE_FAN&&l.mode!==void 0)return null;const o=n.extensions[this.name].attributes,a=[],c={};for(const l in o)a.push(this.parser.getDependency("accessor",o[l]).then(h=>(c[l]=h,c[l])));return a.length<1?null:(a.push(this.parser.createNodeMesh(t)),Promise.all(a).then(l=>{const h=l.pop(),d=h.isGroup?h.children:[h],u=l[0].count,f=[];for(const p of d){const _=new Dt,m=new E,g=new Te,x=new E(1,1,1),v=new Nv(p.geometry,p.material,u);for(let M=0;M<u;M++)c.TRANSLATION&&m.fromBufferAttribute(c.TRANSLATION,M),c.ROTATION&&g.fromBufferAttribute(c.ROTATION,M),c.SCALE&&x.fromBufferAttribute(c.SCALE,M),v.setMatrixAt(M,_.compose(m,g,x));for(const M in c)if(M==="_COLOR_0"){const C=c[M];v.instanceColor=new Dc(C.array,C.itemSize,C.normalized)}else M!=="TRANSLATION"&&M!=="ROTATION"&&M!=="SCALE"&&p.geometry.setAttribute(M,c[M]);le.prototype.copy.call(v,p),this.parser.assignFinalMaterial(v),f.push(v)}return h.isGroup?(h.clear(),h.add(...f),h):f[0]}))}}const Yd="glTF",$s=12,pu={JSON:1313821514,BIN:5130562};class $x{constructor(t){this.name=Bt.KHR_BINARY_GLTF,this.content=null,this.body=null;const e=new DataView(t,0,$s),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(t.slice(0,4))),version:e.getUint32(4,!0),length:e.getUint32(8,!0)},this.header.magic!==Yd)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const i=this.header.length-$s,r=new DataView(t,$s);let o=0;for(;o<i;){const a=r.getUint32(o,!0);o+=4;const c=r.getUint32(o,!0);if(o+=4,c===pu.JSON){const l=new Uint8Array(t,$s+o,a);this.content=n.decode(l)}else if(c===pu.BIN){const l=$s+o;this.body=t.slice(l,l+a)}o+=a}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class Yx{constructor(t,e){if(!e)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=Bt.KHR_DRACO_MESH_COMPRESSION,this.json=t,this.dracoLoader=e,this.dracoLoader.preload()}decodePrimitive(t,e){const n=this.json,i=this.dracoLoader,r=t.extensions[this.name].bufferView,o=t.extensions[this.name].attributes,a={},c={},l={};for(const h in o){const d=Gc[h]||h.toLowerCase();a[d]=o[h]}for(const h in t.attributes){const d=Gc[h]||h.toLowerCase();if(o[h]!==void 0){const u=n.accessors[t.attributes[h]],f=gs[u.componentType];l[d]=f.name,c[d]=u.normalized===!0}}return e.getDependency("bufferView",r).then(function(h){return new Promise(function(d,u){i.decodeDracoFile(h,function(f){for(const p in f.attributes){const _=f.attributes[p],m=c[p];m!==void 0&&(_.normalized=m)}d(f)},a,l,Fe,u)})})}}class qx{constructor(){this.name=Bt.KHR_TEXTURE_TRANSFORM}extendTexture(t,e){return(e.texCoord===void 0||e.texCoord===t.channel)&&e.offset===void 0&&e.rotation===void 0&&e.scale===void 0||(t=t.clone(),e.texCoord!==void 0&&(t.channel=e.texCoord),e.offset!==void 0&&t.offset.fromArray(e.offset),e.rotation!==void 0&&(t.rotation=e.rotation),e.scale!==void 0&&t.repeat.fromArray(e.scale),t.needsUpdate=!0),t}}class Kx{constructor(){this.name=Bt.KHR_MESH_QUANTIZATION}}class qd extends br{constructor(t,e,n,i){super(t,e,n,i)}copySampleValue_(t){const e=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=t*i*3+i;for(let o=0;o!==i;o++)e[o]=n[r+o];return e}interpolate_(t,e,n,i){const r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=a*2,l=a*3,h=i-e,d=(n-e)/h,u=d*d,f=u*d,p=t*l,_=p-l,m=-2*f+3*u,g=f-u,x=1-m,v=g-u+d;for(let M=0;M!==a;M++){const C=o[_+M+a],R=o[_+M+c]*h,T=o[p+M+a],L=o[p+M]*h;r[M]=x*C+v*R+m*T+g*L}return r}}const Zx=new Te;class Jx extends qd{interpolate_(t,e,n,i){const r=super.interpolate_(t,e,n,i);return Zx.fromArray(r).normalize().toArray(r),r}}const dn={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},gs={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},mu={9728:qe,9729:cn,9984:Bu,9985:ho,9986:Js,9987:jn},gu={33071:hi,33648:Eo,10497:Ui},Ua={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Gc={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},si={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},Qx={CUBICSPLINE:void 0,LINEAR:fr,STEP:dr},ka={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function tM(s){return s.DefaultMaterial===void 0&&(s.DefaultMaterial=new gi({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Yn})),s.DefaultMaterial}function wi(s,t,e){for(const n in e.extensions)s[n]===void 0&&(t.userData.gltfExtensions=t.userData.gltfExtensions||{},t.userData.gltfExtensions[n]=e.extensions[n])}function Wn(s,t){t.extras!==void 0&&(typeof t.extras=="object"?Object.assign(s.userData,t.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+t.extras))}function eM(s,t,e){let n=!1,i=!1,r=!1;for(let l=0,h=t.length;l<h;l++){const d=t[l];if(d.POSITION!==void 0&&(n=!0),d.NORMAL!==void 0&&(i=!0),d.COLOR_0!==void 0&&(r=!0),n&&i&&r)break}if(!n&&!i&&!r)return Promise.resolve(s);const o=[],a=[],c=[];for(let l=0,h=t.length;l<h;l++){const d=t[l];if(n){const u=d.POSITION!==void 0?e.getDependency("accessor",d.POSITION):s.attributes.position;o.push(u)}if(i){const u=d.NORMAL!==void 0?e.getDependency("accessor",d.NORMAL):s.attributes.normal;a.push(u)}if(r){const u=d.COLOR_0!==void 0?e.getDependency("accessor",d.COLOR_0):s.attributes.color;c.push(u)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c)]).then(function(l){const h=l[0],d=l[1],u=l[2];return n&&(s.morphAttributes.position=h),i&&(s.morphAttributes.normal=d),r&&(s.morphAttributes.color=u),s.morphTargetsRelative=!0,s})}function nM(s,t){if(s.updateMorphTargets(),t.weights!==void 0)for(let e=0,n=t.weights.length;e<n;e++)s.morphTargetInfluences[e]=t.weights[e];if(t.extras&&Array.isArray(t.extras.targetNames)){const e=t.extras.targetNames;if(s.morphTargetInfluences.length===e.length){s.morphTargetDictionary={};for(let n=0,i=e.length;n<i;n++)s.morphTargetDictionary[e[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function iM(s){let t;const e=s.extensions&&s.extensions[Bt.KHR_DRACO_MESH_COMPRESSION];if(e?t="draco:"+e.bufferView+":"+e.indices+":"+Oa(e.attributes):t=s.indices+":"+Oa(s.attributes)+":"+s.mode,s.targets!==void 0)for(let n=0,i=s.targets.length;n<i;n++)t+=":"+Oa(s.targets[n]);return t}function Oa(s){let t="";const e=Object.keys(s).sort();for(let n=0,i=e.length;n<i;n++)t+=e[n]+":"+s[e[n]]+";";return t}function Vc(s){switch(s){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function sM(s){return s.search(/\.jpe?g($|\?)/i)>0||s.search(/^data\:image\/jpeg/)===0?"image/jpeg":s.search(/\.webp($|\?)/i)>0||s.search(/^data\:image\/webp/)===0?"image/webp":"image/png"}const rM=new Dt;class oM{constructor(t={},e={}){this.json=t,this.extensions={},this.plugins={},this.options=e,this.cache=new Rx,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,o=-1;if(typeof navigator<"u"){const a=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(a)===!0;const c=a.match(/Version\/(\d+)/);i=n&&c?parseInt(c[1],10):-1,r=a.indexOf("Firefox")>-1,o=r?a.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&i<17||r&&o<98?this.textureLoader=new Cd(this.options.manager):this.textureLoader=new Uy(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Rd(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(t){this.extensions=t}setPlugins(t){this.plugins=t}parse(t,e){const n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(o){const a={scene:o[0][i.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:i.asset,parser:n,userData:{}};return wi(r,a,i),Wn(a,i),Promise.all(n._invokeAll(function(c){return c.afterRoot&&c.afterRoot(a)})).then(function(){for(const c of a.scenes)c.updateMatrixWorld();t(a)})}).catch(e)}_markDefs(){const t=this.json.nodes||[],e=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=e.length;i<r;i++){const o=e[i].joints;for(let a=0,c=o.length;a<c;a++)t[o[a]].isBone=!0}for(let i=0,r=t.length;i<r;i++){const o=t[i];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(n[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(t,e){e!==void 0&&(t.refs[e]===void 0&&(t.refs[e]=t.uses[e]=0),t.refs[e]++)}_getNodeRef(t,e,n){if(t.refs[e]<=1)return n;const i=n.clone(),r=(o,a)=>{const c=this.associations.get(o);c!=null&&this.associations.set(a,c);for(const[l,h]of o.children.entries())r(h,a.children[l])};return r(n,i),i.name+="_instance_"+t.uses[e]++,i}_invokeOne(t){const e=Object.values(this.plugins);e.push(this);for(let n=0;n<e.length;n++){const i=t(e[n]);if(i)return i}return null}_invokeAll(t){const e=Object.values(this.plugins);e.unshift(this);const n=[];for(let i=0;i<e.length;i++){const r=t(e[i]);r&&n.push(r)}return n}getDependency(t,e){const n=t+":"+e;let i=this.cache.get(n);if(!i){switch(t){case"scene":i=this.loadScene(e);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(e)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(e)});break;case"accessor":i=this.loadAccessor(e);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(e)});break;case"buffer":i=this.loadBuffer(e);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(e)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(e)});break;case"skin":i=this.loadSkin(e);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(e)});break;case"camera":i=this.loadCamera(e);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(t,e)}),!i)throw new Error("Unknown type: "+t);break}this.cache.add(n,i)}return i}getDependencies(t){let e=this.cache.get(t);if(!e){const n=this,i=this.json[t+(t==="mesh"?"es":"s")]||[];e=Promise.all(i.map(function(r,o){return n.getDependency(t,o)})),this.cache.add(t,e)}return e}loadBuffer(t){const e=this.json.buffers[t],n=this.fileLoader;if(e.type&&e.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+e.type+" buffer type is not supported.");if(e.uri===void 0&&t===0)return Promise.resolve(this.extensions[Bt.KHR_BINARY_GLTF].body);const i=this.options;return new Promise(function(r,o){n.load(cr.resolveURL(e.uri,i.path),r,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+e.uri+'".'))})})}loadBufferView(t){const e=this.json.bufferViews[t];return this.getDependency("buffer",e.buffer).then(function(n){const i=e.byteLength||0,r=e.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(t){const e=this,n=this.json,i=this.json.accessors[t];if(i.bufferView===void 0&&i.sparse===void 0){const o=Ua[i.type],a=gs[i.componentType],c=i.normalized===!0,l=new a(i.count*o);return Promise.resolve(new Ze(l,o,c))}const r=[];return i.bufferView!==void 0?r.push(this.getDependency("bufferView",i.bufferView)):r.push(null),i.sparse!==void 0&&(r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(r).then(function(o){const a=o[0],c=Ua[i.type],l=gs[i.componentType],h=l.BYTES_PER_ELEMENT,d=h*c,u=i.byteOffset||0,f=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,p=i.normalized===!0;let _,m;if(f&&f!==d){const g=Math.floor(u/f),x="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+g+":"+i.count;let v=e.cache.get(x);v||(_=new l(a,g*f,i.count*f/h),v=new Cv(_,f/h),e.cache.add(x,v)),m=new ll(v,c,u%f/h,p)}else a===null?_=new l(i.count*c):_=new l(a,u,i.count*c),m=new Ze(_,c,p);if(i.sparse!==void 0){const g=Ua.SCALAR,x=gs[i.sparse.indices.componentType],v=i.sparse.indices.byteOffset||0,M=i.sparse.values.byteOffset||0,C=new x(o[1],v,i.sparse.count*g),R=new l(o[2],M,i.sparse.count*c);a!==null&&(m=new Ze(m.array.slice(),m.itemSize,m.normalized)),m.normalized=!1;for(let T=0,L=C.length;T<L;T++){const V=C[T];if(m.setX(V,R[T*c]),c>=2&&m.setY(V,R[T*c+1]),c>=3&&m.setZ(V,R[T*c+2]),c>=4&&m.setW(V,R[T*c+3]),c>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}m.normalized=p}return m})}loadTexture(t){const e=this.json,n=this.options,r=e.textures[t].source,o=e.images[r];let a=this.textureLoader;if(o.uri){const c=n.manager.getHandler(o.uri);c!==null&&(a=c)}return this.loadTextureImage(t,r,a)}loadTextureImage(t,e,n){const i=this,r=this.json,o=r.textures[t],a=r.images[e],c=(a.uri||a.bufferView)+":"+o.sampler;if(this.textureCache[c])return this.textureCache[c];const l=this.loadImageSource(e,n).then(function(h){h.flipY=!1,h.name=o.name||a.name||"",h.name===""&&typeof a.uri=="string"&&a.uri.startsWith("data:image/")===!1&&(h.name=a.uri);const u=(r.samplers||{})[o.sampler]||{};return h.magFilter=mu[u.magFilter]||cn,h.minFilter=mu[u.minFilter]||jn,h.wrapS=gu[u.wrapS]||Ui,h.wrapT=gu[u.wrapT]||Ui,i.associations.set(h,{textures:t}),h}).catch(function(){return null});return this.textureCache[c]=l,l}loadImageSource(t,e){const n=this,i=this.json,r=this.options;if(this.sourceCache[t]!==void 0)return this.sourceCache[t].then(d=>d.clone());const o=i.images[t],a=self.URL||self.webkitURL;let c=o.uri||"",l=!1;if(o.bufferView!==void 0)c=n.getDependency("bufferView",o.bufferView).then(function(d){l=!0;const u=new Blob([d],{type:o.mimeType});return c=a.createObjectURL(u),c});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+t+" is missing URI and bufferView");const h=Promise.resolve(c).then(function(d){return new Promise(function(u,f){let p=u;e.isImageBitmapLoader===!0&&(p=function(_){const m=new De(_);m.needsUpdate=!0,u(m)}),e.load(cr.resolveURL(d,r.path),p,void 0,f)})}).then(function(d){return l===!0&&a.revokeObjectURL(c),Wn(d,o),d.userData.mimeType=o.mimeType||sM(o.uri),d}).catch(function(d){throw console.error("THREE.GLTFLoader: Couldn't load texture",c),d});return this.sourceCache[t]=h,h}assignTexture(t,e,n,i){const r=this;return this.getDependency("texture",n.index).then(function(o){if(!o)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(o=o.clone(),o.channel=n.texCoord),r.extensions[Bt.KHR_TEXTURE_TRANSFORM]){const a=n.extensions!==void 0?n.extensions[Bt.KHR_TEXTURE_TRANSFORM]:void 0;if(a){const c=r.associations.get(o);o=r.extensions[Bt.KHR_TEXTURE_TRANSFORM].extendTexture(o,a),r.associations.set(o,c)}}return i!==void 0&&(o.colorSpace=i),t[e]=o,o})}assignFinalMaterial(t){const e=t.geometry;let n=t.material;const i=e.attributes.tangent===void 0,r=e.attributes.color!==void 0,o=e.attributes.normal===void 0;if(t.isPoints){const a="PointsMaterial:"+n.uuid;let c=this.cache.get(a);c||(c=new _d,Pn.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,c.sizeAttenuation=!1,this.cache.add(a,c)),n=c}else if(t.isLine){const a="LineBasicMaterial:"+n.uuid;let c=this.cache.get(a);c||(c=new zo,Pn.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,this.cache.add(a,c)),n=c}if(i||r||o){let a="ClonedMaterial:"+n.uuid+":";i&&(a+="derivative-tangents:"),r&&(a+="vertex-colors:"),o&&(a+="flat-shading:");let c=this.cache.get(a);c||(c=n.clone(),r&&(c.vertexColors=!0),o&&(c.flatShading=!0),i&&(c.normalScale&&(c.normalScale.y*=-1),c.clearcoatNormalScale&&(c.clearcoatNormalScale.y*=-1)),this.cache.add(a,c),this.associations.set(c,this.associations.get(n))),n=c}t.material=n}getMaterialType(){return gi}loadMaterial(t){const e=this,n=this.json,i=this.extensions,r=n.materials[t];let o;const a={},c=r.extensions||{},l=[];if(c[Bt.KHR_MATERIALS_UNLIT]){const d=i[Bt.KHR_MATERIALS_UNLIT];o=d.getMaterialType(),l.push(d.extendParams(a,r,e))}else{const d=r.pbrMetallicRoughness||{};if(a.color=new Tt(1,1,1),a.opacity=1,Array.isArray(d.baseColorFactor)){const u=d.baseColorFactor;a.color.setRGB(u[0],u[1],u[2],Fe),a.opacity=u[3]}d.baseColorTexture!==void 0&&l.push(e.assignTexture(a,"map",d.baseColorTexture,ke)),a.metalness=d.metallicFactor!==void 0?d.metallicFactor:1,a.roughness=d.roughnessFactor!==void 0?d.roughnessFactor:1,d.metallicRoughnessTexture!==void 0&&(l.push(e.assignTexture(a,"metalnessMap",d.metallicRoughnessTexture)),l.push(e.assignTexture(a,"roughnessMap",d.metallicRoughnessTexture))),o=this._invokeOne(function(u){return u.getMaterialType&&u.getMaterialType(t)}),l.push(Promise.all(this._invokeAll(function(u){return u.extendMaterialParams&&u.extendMaterialParams(t,a)})))}r.doubleSided===!0&&(a.side=Ye);const h=r.alphaMode||ka.OPAQUE;if(h===ka.BLEND?(a.transparent=!0,a.depthWrite=!1):(a.transparent=!1,h===ka.MASK&&(a.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&o!==Ve&&(l.push(e.assignTexture(a,"normalMap",r.normalTexture)),a.normalScale=new it(1,1),r.normalTexture.scale!==void 0)){const d=r.normalTexture.scale;a.normalScale.set(d,d)}if(r.occlusionTexture!==void 0&&o!==Ve&&(l.push(e.assignTexture(a,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(a.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&o!==Ve){const d=r.emissiveFactor;a.emissive=new Tt().setRGB(d[0],d[1],d[2],Fe)}return r.emissiveTexture!==void 0&&o!==Ve&&l.push(e.assignTexture(a,"emissiveMap",r.emissiveTexture,ke)),Promise.all(l).then(function(){const d=new o(a);return r.name&&(d.name=r.name),Wn(d,r),e.associations.set(d,{materials:t}),r.extensions&&wi(i,d,r),d})}createUniqueName(t){const e=re.sanitizeNodeName(t||"");return e in this.nodeNamesUsed?e+"_"+ ++this.nodeNamesUsed[e]:(this.nodeNamesUsed[e]=0,e)}loadGeometries(t){const e=this,n=this.extensions,i=this.primitiveCache;function r(a){return n[Bt.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(a,e).then(function(c){return _u(c,a,e)})}const o=[];for(let a=0,c=t.length;a<c;a++){const l=t[a],h=iM(l),d=i[h];if(d)o.push(d.promise);else{let u;l.extensions&&l.extensions[Bt.KHR_DRACO_MESH_COMPRESSION]?u=r(l):u=_u(new Me,l,e),i[h]={primitive:l,promise:u},o.push(u)}}return Promise.all(o)}loadMesh(t){const e=this,n=this.json,i=this.extensions,r=n.meshes[t],o=r.primitives,a=[];for(let c=0,l=o.length;c<l;c++){const h=o[c].material===void 0?tM(this.cache):this.getDependency("material",o[c].material);a.push(h)}return a.push(e.loadGeometries(o)),Promise.all(a).then(function(c){const l=c.slice(0,c.length-1),h=c[c.length-1],d=[];for(let f=0,p=h.length;f<p;f++){const _=h[f],m=o[f];let g;const x=l[f];if(m.mode===dn.TRIANGLES||m.mode===dn.TRIANGLE_STRIP||m.mode===dn.TRIANGLE_FAN||m.mode===void 0)g=r.isSkinnedMesh===!0?new Lv(_,x):new nt(_,x),g.isSkinnedMesh===!0&&g.normalizeSkinWeights(),m.mode===dn.TRIANGLE_STRIP?g.geometry=fu(g.geometry,Ku):m.mode===dn.TRIANGLE_FAN&&(g.geometry=fu(g.geometry,Pc));else if(m.mode===dn.LINES)g=new Uv(_,x);else if(m.mode===dn.LINE_STRIP)g=new fn(_,x);else if(m.mode===dn.LINE_LOOP)g=new kv(_,x);else if(m.mode===dn.POINTS)g=new Ov(_,x);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+m.mode);Object.keys(g.geometry.morphAttributes).length>0&&nM(g,r),g.name=e.createUniqueName(r.name||"mesh_"+t),Wn(g,r),m.extensions&&wi(i,g,m),e.assignFinalMaterial(g),d.push(g)}for(let f=0,p=d.length;f<p;f++)e.associations.set(d[f],{meshes:t,primitives:f});if(d.length===1)return r.extensions&&wi(i,d[0],r),d[0];const u=new ue;r.extensions&&wi(i,u,r),e.associations.set(u,{meshes:t});for(let f=0,p=d.length;f<p;f++)u.add(d[f]);return u})}loadCamera(t){let e;const n=this.json.cameras[t],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?e=new Oe(Qu.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(e=new ol(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(e.name=this.createUniqueName(n.name)),Wn(e,n),Promise.resolve(e)}loadSkin(t){const e=this.json.skins[t],n=[];for(let i=0,r=e.joints.length;i<r;i++)n.push(this._loadNodeShallow(e.joints[i]));return e.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",e.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){const r=i.pop(),o=i,a=[],c=[];for(let l=0,h=o.length;l<h;l++){const d=o[l];if(d){a.push(d);const u=new Dt;r!==null&&u.fromArray(r.array,l*16),c.push(u)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',e.joints[l])}return new hl(a,c)})}loadAnimation(t){const e=this.json,n=this,i=e.animations[t],r=i.name?i.name:"animation_"+t,o=[],a=[],c=[],l=[],h=[];for(let d=0,u=i.channels.length;d<u;d++){const f=i.channels[d],p=i.samplers[f.sampler],_=f.target,m=_.node,g=i.parameters!==void 0?i.parameters[p.input]:p.input,x=i.parameters!==void 0?i.parameters[p.output]:p.output;_.node!==void 0&&(o.push(this.getDependency("node",m)),a.push(this.getDependency("accessor",g)),c.push(this.getDependency("accessor",x)),l.push(p),h.push(_))}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c),Promise.all(l),Promise.all(h)]).then(function(d){const u=d[0],f=d[1],p=d[2],_=d[3],m=d[4],g=[];for(let x=0,v=u.length;x<v;x++){const M=u[x],C=f[x],R=p[x],T=_[x],L=m[x];if(M===void 0)continue;M.updateMatrix&&M.updateMatrix();const V=n._createAnimationTracks(M,C,R,T,L);if(V)for(let y=0;y<V.length;y++)g.push(V[y])}return new by(r,void 0,g)})}createNodeMesh(t){const e=this.json,n=this,i=e.nodes[t];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(r){const o=n._getNodeRef(n.meshCache,i.mesh,r);return i.weights!==void 0&&o.traverse(function(a){if(a.isMesh)for(let c=0,l=i.weights.length;c<l;c++)a.morphTargetInfluences[c]=i.weights[c]}),o})}loadNode(t){const e=this.json,n=this,i=e.nodes[t],r=n._loadNodeShallow(t),o=[],a=i.children||[];for(let l=0,h=a.length;l<h;l++)o.push(n.getDependency("node",a[l]));const c=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(o),c]).then(function(l){const h=l[0],d=l[1],u=l[2];u!==null&&h.traverse(function(f){f.isSkinnedMesh&&f.bind(u,rM)});for(let f=0,p=d.length;f<p;f++)h.add(d[f]);return h})}_loadNodeShallow(t){const e=this.json,n=this.extensions,i=this;if(this.nodeCache[t]!==void 0)return this.nodeCache[t];const r=e.nodes[t],o=r.name?i.createUniqueName(r.name):"",a=[],c=i._invokeOne(function(l){return l.createNodeMesh&&l.createNodeMesh(t)});return c&&a.push(c),r.camera!==void 0&&a.push(i.getDependency("camera",r.camera).then(function(l){return i._getNodeRef(i.cameraCache,r.camera,l)})),i._invokeAll(function(l){return l.createNodeAttachment&&l.createNodeAttachment(t)}).forEach(function(l){a.push(l)}),this.nodeCache[t]=Promise.all(a).then(function(l){let h;if(r.isBone===!0?h=new md:l.length>1?h=new ue:l.length===1?h=l[0]:h=new le,h!==l[0])for(let d=0,u=l.length;d<u;d++)h.add(l[d]);if(r.name&&(h.userData.name=r.name,h.name=o),Wn(h,r),r.extensions&&wi(n,h,r),r.matrix!==void 0){const d=new Dt;d.fromArray(r.matrix),h.applyMatrix4(d)}else r.translation!==void 0&&h.position.fromArray(r.translation),r.rotation!==void 0&&h.quaternion.fromArray(r.rotation),r.scale!==void 0&&h.scale.fromArray(r.scale);return i.associations.has(h)||i.associations.set(h,{}),i.associations.get(h).nodes=t,h}),this.nodeCache[t]}loadScene(t){const e=this.extensions,n=this.json.scenes[t],i=this,r=new ue;n.name&&(r.name=i.createUniqueName(n.name)),Wn(r,n),n.extensions&&wi(e,r,n);const o=n.nodes||[],a=[];for(let c=0,l=o.length;c<l;c++)a.push(i.getDependency("node",o[c]));return Promise.all(a).then(function(c){for(let h=0,d=c.length;h<d;h++)r.add(c[h]);const l=h=>{const d=new Map;for(const[u,f]of i.associations)(u instanceof Pn||u instanceof De)&&d.set(u,f);return h.traverse(u=>{const f=i.associations.get(u);f!=null&&d.set(u,f)}),d};return i.associations=l(r),r})}_createAnimationTracks(t,e,n,i,r){const o=[],a=t.name?t.name:t.uuid,c=[];si[r.path]===si.weights?t.traverse(function(u){u.morphTargetInfluences&&c.push(u.name?u.name:u.uuid)}):c.push(a);let l;switch(si[r.path]){case si.weights:l=As;break;case si.rotation:l=Rs;break;case si.position:case si.scale:l=Cs;break;default:switch(n.itemSize){case 1:l=As;break;case 2:case 3:default:l=Cs;break}break}const h=i.interpolation!==void 0?Qx[i.interpolation]:fr,d=this._getArrayFromAccessor(n);for(let u=0,f=c.length;u<f;u++){const p=new l(c[u]+"."+si[r.path],e.array,d,h);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(p),o.push(p)}return o}_getArrayFromAccessor(t){let e=t.array;if(t.normalized){const n=Vc(e.constructor),i=new Float32Array(e.length);for(let r=0,o=e.length;r<o;r++)i[r]=e[r]*n;e=i}return e}_createCubicSplineTrackInterpolant(t){t.createInterpolant=function(n){const i=this instanceof Rs?Jx:qd;return new i(this.times,this.values,this.getValueSize()/3,n)},t.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function aM(s,t,e){const n=t.attributes,i=new Ln;if(n.POSITION!==void 0){const a=e.json.accessors[n.POSITION],c=a.min,l=a.max;if(c!==void 0&&l!==void 0){if(i.set(new E(c[0],c[1],c[2]),new E(l[0],l[1],l[2])),a.normalized){const h=Vc(gs[a.componentType]);i.min.multiplyScalar(h),i.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const r=t.targets;if(r!==void 0){const a=new E,c=new E;for(let l=0,h=r.length;l<h;l++){const d=r[l];if(d.POSITION!==void 0){const u=e.json.accessors[d.POSITION],f=u.min,p=u.max;if(f!==void 0&&p!==void 0){if(c.setX(Math.max(Math.abs(f[0]),Math.abs(p[0]))),c.setY(Math.max(Math.abs(f[1]),Math.abs(p[1]))),c.setZ(Math.max(Math.abs(f[2]),Math.abs(p[2]))),u.normalized){const _=Vc(gs[u.componentType]);c.multiplyScalar(_)}a.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}i.expandByVector(a)}s.boundingBox=i;const o=new In;i.getCenter(o.center),o.radius=i.min.distanceTo(i.max)/2,s.boundingSphere=o}function _u(s,t,e){const n=t.attributes,i=[];function r(o,a){return e.getDependency("accessor",o).then(function(c){s.setAttribute(a,c)})}for(const o in n){const a=Gc[o]||o.toLowerCase();a in s.attributes||i.push(r(n[o],a))}if(t.indices!==void 0&&!s.index){const o=e.getDependency("accessor",t.indices).then(function(a){s.setIndex(a)});i.push(o)}return Zt.workingColorSpace!==Fe&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Zt.workingColorSpace}" not supported.`),Wn(s,t),aM(s,t,e),Promise.all(i).then(function(){return t.targets!==void 0?eM(s,t.targets,e):s})}const cM=new Cd,Do=new Map,No=new Map;function lM(s){var t,e;(t=Do.get(s))==null||t.dispose(),Do.delete(s),(e=No.get(s))==null||e.dispose(),No.delete(s)}function hM(s){const t=Fd(s);if(!t||!t.file)return null;let e=No.get(s);if(!e){let n=Do.get(s);n||(n=cM.load(Nd(t.file)),n.wrapS=n.wrapT=Ui,n.colorSpace=ke,n.anisotropy=4,Do.set(s,n)),e=new gi({map:n,roughness:.95,metalness:0}),No.set(s,e)}return e}function uM(s,t,e,n=2){const i=new Ft(s,t,e),r=i.attributes.uv,o=[[e,t],[e,t],[s,e],[s,e],[s,t],[s,t]];for(let a=0;a<6;a++)for(let c=0;c<4;c++){const l=a*4+c;r.setXY(l,r.getX(l)*o[a][0]/n,r.getY(l)*o[a][1]/n)}return r.needsUpdate=!0,i}const Wc=new Map;function yt(s,t={}){const e=`${s}|${t.emissive??""}|${t.ei??0}|${t.opacity??1}`;let n=Wc.get(e);return n||(n=new gi({color:s,roughness:.95,metalness:0,flatShading:!0,emissive:t.emissive??"#000000",emissiveIntensity:t.ei??0,transparent:t.transparent??!1,opacity:t.opacity??1}),Wc.set(e,n)),n}function vu(s){const t=new Set(Wc.values());s.traverse(e=>{var r;const n=e;if(!n.isMesh)return;(r=n.geometry)==null||r.dispose();const i=Array.isArray(n.material)?n.material:[n.material];for(const o of i)o&&!t.has(o)&&o.dispose()})}const Fa=(s,t)=>"#"+new Tt(s).lerp(new Tt("#ffffff"),t).getHexString(),za=(s,t)=>"#"+new Tt(s).lerp(new Tt("#000000"),t).getHexString();function dt(s,t,e=!0){const n=new nt(s,t);return n.castShadow=e,n.receiveShadow=!0,n}function yu(s,t,e){const n=-s/2,i=s/2,r=-e/2,o=e/2,a=[n,0,r,i,0,r,i,0,o,n,0,r,i,0,o,n,0,o,n,0,o,i,t,o,i,t,r,n,0,o,i,t,r,n,0,r,i,0,r,i,t,r,i,t,o,i,0,r,i,t,o,i,0,o,n,0,o,i,0,o,i,t,o,n,0,r,i,t,r,i,0,r],c=new Me;return c.setAttribute("position",new Yt(a,3)),c.computeVertexNormals(),c}const dM=s=>s.size??Ps[s.kind]??[1,1,1],fM=new Ax,xu=new Map,pM=()=>"/flyverse/models/";function mM(s){let t=xu.get(s);return t||(t=fM.loadAsync(pM()+s).then(e=>(e.scene.traverse(n=>{const i=n;i.isMesh&&(i.castShadow=!0,i.receiveShadow=!0)}),{scene:e.scene,box:new Ln().setFromObject(e.scene)})),xu.set(s,t)),t}async function gM(s,t,e,n){const{scene:i,box:r}=await mM(s),o=i.clone(!0),a=r.getSize(new E),c=t/Math.max(.001,a.x),l=e/Math.max(.001,a.y),h=n/Math.max(.001,a.z),d=new ue;return o.position.set(-(r.min.x+a.x/2),-r.min.y,-(r.min.z+a.z/2)),d.add(o),d.scale.set(c,l,h),d}function _M(s,t){const e=mi[t.look.palette],n=e.colors[s.color??0],i=new ue;i.userData.id=s.id,i.position.set(s.at[0],s.at[1],s.at[2]);const[r,o,a]=dM(s);let c;const l=s.tex?hM(s.tex):null;if(l&&(s.kind==="block"||s.kind==="wall"||s.kind==="platform"||s.kind==="door")){const h=dt(uM(r,o,a),l);if(h.position.y=o/2,s.kind==="door"){const d=new ue;d.name="slab",d.add(h),i.add(d)}else i.add(h);if(s.kind==="platform"&&s.fall){const d=dt(new Ft(r*.08,.05,a*.9),yt("#222222"),!1);d.position.y=o+.03,d.rotation.y=.5,i.add(d)}return{root:i,anim:c}}switch(s.kind){case"block":{const h=dt(new Ft(r,o,a),yt(n));if(h.position.y=o/2,i.add(h),o>.4){const d=dt(new Ft(r+.04,.14,a+.04),yt(Fa(n,.18)),!1);d.position.y=o-.06,i.add(d)}break}case"wall":{const h=dt(new Ft(r,o,a),yt(n));if(h.position.y=o/2,i.add(h),e.night){const d=dt(new Ft(r+.02,.08,a+.02),yt(e.colors[1],{emissive:e.colors[1],ei:1.2}),!1);d.position.y=o-.04,i.add(d)}break}case"ramp":{const h=dt(yu(r,o,a),yt(n)),d=s.dir??0;if(d===1||d===3){const u=dt(yu(a,o,r),yt(n));u.rotation.y=d===1?-Math.PI/2:Math.PI/2,i.add(u)}else d===2&&(h.rotation.y=Math.PI),i.add(h);break}case"platform":{const h=s.fall?e.colors[4]:n,d=dt(new Ft(r,o,a),yt(h));d.position.y=o/2,i.add(d);const u=dt(new Ft(r*.7,.04,a*.7),yt(Fa(h,.35)),!1);if(u.position.y=o+.02,i.add(u),s.fall){const f=dt(new Ft(r*.08,.05,a*.9),yt(za(h,.5)),!1);f.position.y=o+.03,f.rotation.y=.5,i.add(f)}break}case"coin":{const h=dt(new $t(.38,.38,.1,10),yt("#ffd23f",{emissive:"#ffb000",ei:.35}));h.rotation.x=Math.PI/2;const d=new ue;d.position.y=.6,d.add(h),i.add(d);const u=(s.at[0]+s.at[2])*.7;c=f=>{d.rotation.y=f*2.5+u,d.position.y=.6+Math.sin(f*3+u)*.08};break}case"gem":{const h=dt(new Ii(.42,0),yt("#7af5ff",{emissive:"#38d6ff",ei:.5}));h.scale.y=1.3;const d=new ue;d.position.y=.7,d.add(h),i.add(d),c=u=>{d.rotation.y=u*1.8,d.position.y=.7+Math.sin(u*2.4)*.12};break}case"spike":{const h=dt(new Ft(r,.1,a),yt("#5a5a66"));h.position.y=.05,i.add(h);const d=Math.max(1,Math.min(4,Math.round(r/.5))),u=Math.max(1,Math.min(4,Math.round(a/.5))),f=new fs(Math.min(r/d,a/u)*.45,o-.1,5),p=yt("#d8dde6");for(let _=0;_<d;_++)for(let m=0;m<u;m++){const g=dt(f,p);g.position.set(-r/2+(_+.5)*(r/d),.1+(o-.1)/2,-a/2+(m+.5)*(a/u)),i.add(g)}break}case"lava":{const h=new gi({color:za(e.hazard,.45),emissive:e.hazard,emissiveIntensity:.5,flatShading:!0,roughness:.4}),d=new Ft(r,o,a,Math.min(24,Math.ceil(r/2)),1,Math.min(24,Math.ceil(a/2))),u=dt(d,h,!1);u.position.y=o/2,i.add(u);const f=d.attributes.position,p=Float32Array.from(f.array);c=_=>{h.emissiveIntensity=.45+Math.sin(_*2)*.12;for(let m=0;m<f.count;m++)p[m*3+1]>0&&f.setY(m,p[m*3+1]+Math.sin(_*2+p[m*3]*.8+p[m*3+2]*.6)*.06);f.needsUpdate=!0};break}case"bounce":{const h=dt(new $t(r/2,r/2,o*.6,12),yt("#3a3f4a"));h.position.y=o*.3;const d=dt(new $t(r/2*.9,r/2*.9,o*.4,12),yt("#ff5fa2",{emissive:"#ff5fa2",ei:.3}));d.position.y=o*.8,i.add(h,d),c=u=>{d.position.y=o*.8+Math.abs(Math.sin(u*4))*.05};break}case"speed":{const h=dt(new Ft(r,o,a),yt("#2a2f3a"));h.position.y=o/2,i.add(h);const d=new bd;d.moveTo(-.5,0),d.lineTo(0,.45),d.lineTo(.5,0),d.lineTo(.5,-.25),d.lineTo(0,.2),d.lineTo(-.5,-.25);const u=new ml(d),f=yt("#5ef2cc",{emissive:"#5ef2cc",ei:.9}),p=Math.max(1,Math.floor(a/1)),_=[];for(let m=0;m<p;m++){const g=new nt(u,f);g.rotation.x=-Math.PI/2,g.scale.setScalar(Math.min(r,1.6)*.8),g.position.set(0,o+.01,-a/2+(m+.5)*(a/p)),i.add(g),_.push(g)}i.rotation.y=0,c=m=>_.forEach((g,x)=>{g.material.emissiveIntensity=.5+.5*Math.max(0,Math.sin(m*6-x))});break}case"checkpoint":{const h=dt(new $t(.06,.06,1.6,6),yt("#d0d4dc"));h.position.y=.8;const d=dt(new $t(.7,.8,.12,10),yt("#9aa3b0"));d.position.y=.06;const u=dt(new fs(.28,.6,3),yt("#9ba5a1"));u.rotation.z=-Math.PI/2,u.position.set(.32,1.35,0),u.name="pennant",i.add(h,d,u);break}case"flag":{const h=dt(new $t(.08,.08,3,6),yt("#f4f7f6"));h.position.y=1.5;const d=dt(new $t(.9,1.1,.2,10),yt("#1a1d1c"));d.position.y=.1;const u=dt(new $t(.8,.8,.04,16),yt("#5ef2cc",{emissive:"#5ef2cc",ei:1}),!1);u.position.y=.22;const f=new Ds(1.3,.8,6,2);f.translate(.65,0,0);const p=dt(f,new gi({color:"#5ef2cc",side:Ye,flatShading:!0,roughness:.8,emissive:"#1f8a73",emissiveIntensity:.3}));p.position.set(.08,2.55,0),i.add(h,d,u,p);const _=f.attributes.position,m=Float32Array.from(_.array);c=g=>{for(let x=0;x<_.count;x++){const v=m[x*3];_.setZ(x,Math.sin(g*5-v*3)*.12*v)}_.needsUpdate=!0,f.computeVertexNormals()};break}case"enemy":{const h=new ue,d=s.id.startsWith("z:"),u=dt(new Ue(.45,8,6),yt(d?"#5c8a3a":"#c0392b"));u.scale.set(1,.7,1.2),u.position.y=.38;const f=dt(new Ft(.04,.32,1.06),yt("#1a1d1c"),!1);f.position.y=.42;const p=dt(new Ue(.24,7,5),yt("#1a1d1c"));p.position.set(0,.32,.55);const _=d?yt("#d8ff5e",{emissive:"#b8ff2e",ei:1.2}):yt("#ffffff",{emissive:"#ffffff",ei:.4}),m=dt(new Ue(.07,6,4),_,!1);m.position.set(.11,.42,.72);const g=m.clone();g.position.x=-.11;const x=[],v=new Ft(.5,.05,.05);for(let M=0;M<3;M++)for(const C of[-1,1]){const R=dt(v,yt("#1a1d1c"),!1);R.position.set(C*.45,.12,-.3+M*.3),R.rotation.z=C*-.5,x.push(R)}h.add(u,f,p,m,g,...x),h.name="body",i.add(h);break}case"tree":{const h=dt(new $t(.15,.22,1.2,6),yt("#8a5a3b"));h.position.y=.6;const d=e.night?"#2f6f5e":t.look.palette==="candy"?"#ff9fd0":t.look.palette==="ice"?"#e8f6ff":t.look.palette==="desert"?"#6fa86b":"#4fae5a",u=dt(new Li(.9,0),yt(d));u.position.y=1.7;const f=dt(new Li(.6,0),yt(Fa(d,.15)));f.position.set(.3,2.3,.1),i.add(h,u,f);break}case"rock":{const h=dt(new fl(.6,0),yt(t.look.palette==="lava"?"#2e2626":"#9aa0a6"));h.scale.set(1.2,.7,1),h.position.y=.35,h.rotation.y=s.at[0]*1.3,i.add(h);break}case"flower":{const h=dt(new $t(.03,.03,.5,4),yt("#4f9a4a"),!1);h.position.y=.25;const d=["#ff7ab8","#ffd23f","#b89cff","#ffffff"],u=dt(new Li(.16,0),yt(d[Math.abs(Math.round(s.at[0]*3+s.at[2]))%4]),!1);u.position.y=.55,i.add(h,u);break}case"model":{const h=Cn(s.asset),d=new nt(new Ft(r,o,a),new Ve({color:"#5ef2cc",wireframe:!0,transparent:!0,opacity:.35}));if(d.position.y=o/2,i.add(d),s.rot&&(i.rotation.y=s.rot*Math.PI/180),h){const u=gM(h.file,r,o,a).then(f=>{i.remove(d),i.add(f)}).catch(()=>{});return{root:i,ready:u}}break}case"target":{const h=dt(new $t(.04,.04,.8,5),yt("#d0d4dc"),!1);h.position.y=.4;const d=new ue;d.position.y=1.2;const u=dt(new Li(.5,1),yt("#ff4f5e",{emissive:"#ff2e40",ei:.25})),f=dt(new ln(.5,.07,4,16),yt("#ffffff",{emissive:"#ffffff",ei:.3}),!1);f.rotation.x=Math.PI/2;const p=f.clone();p.rotation.set(0,0,0),d.add(u,f,p),i.add(h,d);const _=s.at[0]*.9+s.at[2]*.4;c=m=>{d.rotation.y=m*.8+_,d.position.y=1.2+Math.sin(m*2+_)*.08};break}case"turret":{const h=dt(new $t(r*.55,r*.65,o,8),yt("#4a4f5c"));h.position.y=o/2;const d=new ue;d.name="head",d.position.y=o+.25;const u=dt(new Ue(.38,8,6),yt("#ff7a3d",{emissive:"#ff5a1d",ei:.3})),f=dt(new $t(.09,.11,.7,6),yt("#2b2f33"));f.rotation.x=Math.PI/2,f.position.z=.42,d.add(u,f),i.add(h,d);break}case"spawner":{const h=dt(new ln(1.1,.16,6,18),yt("#3b2a4a",{emissive:"#8a3bff",ei:.6}));h.rotation.x=Math.PI/2,h.position.y=.12;const d=dt(new Ts(1,18),new Ve({color:"#12081c"}),!1);d.rotation.x=-Math.PI/2,d.position.y=.03;const u=dt(new pl(.3,.9,18,1,0,Math.PI*1.2),new Ve({color:"#b46bff",transparent:!0,opacity:.5,side:Ye}),!1);u.rotation.x=-Math.PI/2,u.position.y=.05,i.add(h,d,u),c=f=>{u.rotation.z=f*2};break}case"heart":{const h=new ue;h.position.y=.7;const d=yt("#ff4f7a",{emissive:"#ff2e5e",ei:.45}),u=dt(new Ue(.22,8,6),d);u.position.set(-.16,.08,0);const f=dt(new Ue(.22,8,6),d);f.position.set(.16,.08,0);const p=dt(new fs(.31,.45,8),d);p.rotation.z=Math.PI,p.position.y=-.17,h.add(u,f,p),i.add(h),c=_=>{h.rotation.y=_*2,h.position.y=.7+Math.sin(_*3)*.08};break}case"key":{const h=e.colors[s.color??0],d=yt(h,{emissive:h,ei:.45}),u=new ue;u.position.y=.7;const f=dt(new ln(.2,.07,6,12),d);f.position.y=.2;const p=dt(new Ft(.09,.5,.09),d);p.position.y=-.15;const _=dt(new Ft(.18,.08,.09),d);_.position.set(.09,-.32,0),u.add(f,p,_),i.add(u),c=m=>{u.rotation.y=m*2.2,u.position.y=.7+Math.sin(m*2.6)*.1};break}case"door":{const h=e.colors[s.color??0],d=new ue;d.name="slab";const u=dt(new Ft(r,o,a),yt(h));u.position.y=o/2;const f=dt(new Ft(r+.02,.12,a+.02),yt(za(h,.4)),!1);f.position.y=o-.1;const p=yt("#ffd23f",{emissive:"#ffb000",ei:.4}),_=dt(new ln(.16,.05,6,10),p,!1);_.position.set(0,o*.55,a/2+.03);const m=_.clone();m.position.z=-a/2-.03,d.add(u,f,_,m),i.add(d);break}case"zone":{const h=new Ve({color:"#5ef2cc",transparent:!0,opacity:.22,depthWrite:!1,side:Ye}),d=new nt(new $t(Math.min(r,a)/2,Math.min(r,a)/2,2.6,24,1,!0),h);d.scale.set(r/Math.min(r,a),1,a/Math.min(r,a)),d.position.y=1.3;const u=dt(new Ts(Math.min(r,a)/2,24),yt("#5ef2cc",{emissive:"#5ef2cc",ei:.8,transparent:!0,opacity:.55}),!1);u.scale.set(r/Math.min(r,a),a/Math.min(r,a),1),u.rotation.x=-Math.PI/2,u.position.y=.04,d.name="column",i.add(d,u),c=f=>{h.opacity=.16+Math.sin(f*3)*.06};break}case"mushroom":{const h=dt(new $t(.16,.22,.6,7),yt("#f6ecd9"));h.position.y=.3;const d=dt(new Ue(.55,8,4,0,Math.PI*2,0,Math.PI/2),yt("#e8483f"));d.position.y=.55;const u=yt("#ffffff");for(let f=0;f<4;f++){const p=dt(new Ue(.08,5,3),u,!1),_=f*1.7;p.position.set(Math.cos(_)*.3,.92-f%2*.1,Math.sin(_)*.3),i.add(p)}i.add(h,d);break}}return{root:i,anim:c}}function Vo(){const s=new ue,t=new ue;t.position.y=.45,s.add(t);const e=yt("#2b2f33"),n=dt(new Ue(.26,8,6),e);n.scale.set(1,.9,1.1);const i=dt(new Ue(.24,8,6),yt("#3a4046"));i.scale.set(.9,.8,1.4),i.position.set(0,-.04,-.36);const r=dt(new ln(.2,.035,4,10),yt("#5ef2cc",{emissive:"#5ef2cc",ei:.5}),!1);r.position.set(0,-.04,-.36),r.scale.set(1,.85,1);const o=dt(new Ue(.18,8,6),e);o.position.set(0,.05,.3);const a=yt("#c0392b",{emissive:"#7a1a12",ei:.3}),c=dt(new Ue(.13,8,6),a);c.position.set(.13,.1,.36);const l=dt(new Ue(.13,8,6),a);l.position.set(-.13,.1,.36);const h=new $t(.02,.02,.4,4);for(let g=0;g<3;g++)for(const x of[-1,1]){const v=dt(h,e,!1);v.position.set(x*.2,-.27,.15-g*.17),v.rotation.z=x*.5,t.add(v)}const d=new gi({color:"#dff6ff",transparent:!0,opacity:.55,side:Ye,roughness:.3,emissive:"#9fe8ff",emissiveIntensity:.15}),u=new Ts(.4,8);u.scale(.5,1,1),u.translate(0,.38,0);const f=new nt(u,d),p=new nt(u,d),_=new ue,m=new ue;return _.position.set(.1,.2,-.05),m.position.set(-.1,.2,-.05),f.rotation.x=-Math.PI/2+.3,p.rotation.x=-Math.PI/2+.3,_.add(f),m.add(p),t.add(n,i,r,o,c,l,_,m),{root:s,anim:(g,x)=>{const v=x.glide?38:x.air?26:x.speed>.5?4:1.5,M=x.glide?.5:x.air?.7:.15,C=Math.sin(g*v)*M;_.rotation.z=-.5-C,m.rotation.z=.5+C,t.position.y=.45+(x.air?0:Math.abs(Math.sin(g*x.speed*2.2))*.05),t.rotation.x=x.air?-.15:0}}}function vM(s,t){const e=new Ue(400,24,12),n=new Kn({side:Ke,depthWrite:!1,fog:!1,uniforms:{top:{value:new Tt(s)},bottom:{value:new Tt(t)}},vertexShader:"varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",fragmentShader:"uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.1, 0.5, h)), 1.0); }"}),i=new nt(e,n);return i.renderOrder=-1,i}class yl{constructor(t,e={}){U(this,"scene",new Rv);U(this,"objects",new Map);U(this,"solidMeshes",[]);U(this,"decorRoots",[]);U(this,"fly",Vo());U(this,"shadowBlob");U(this,"sun");U(this,"t",0);U(this,"spec");U(this,"hideFly",!1);U(this,"skyMesh");U(this,"hemi");U(this,"pending",[]);U(this,"shotMeshes",new Map);U(this,"shotGeo",new Li(.14,0));U(this,"ray",new ps);this.spec=t;const n=mi[t.look.palette];this.skyMesh=vM(n.sky,n.horizon),this.scene.add(this.skyMesh),this.scene.fog=new cl(n.horizon,n.fog);const i=new Cy(n.sky,n.night?"#1a1420":"#6b5a48",n.night?.9:1.1);this.hemi=i,this.scene.add(i),this.sun=new Pd(n.light,n.night?1.4:2.2),this.sun.position.set(18,30,12),this.sun.castShadow=!0;const r=e.lowShadows?1024:2048;this.sun.shadow.mapSize.set(r,r);const o=this.sun.shadow.camera;o.left=-32,o.right=32,o.top=32,o.bottom=-32,o.near=1,o.far=90,this.sun.shadow.bias=-8e-4,this.sun.shadow.normalBias=.03,this.scene.add(this.sun,this.sun.target),this.scene.add(this.fly.root),this.shadowBlob=new nt(new Ts(.4,16),new Ve({color:"#000000",transparent:!0,opacity:.35,depthWrite:!1})),this.shadowBlob.rotation.x=-Math.PI/2,this.scene.add(this.shadowBlob),this.rebuild(t)}get palette(){return mi[this.spec.look.palette]}setLook(t){this.spec=t;const e=mi[t.look.palette],n=this.skyMesh.material.uniforms;n.top.value.set(e.sky),n.bottom.value.set(e.horizon),this.scene.fog.color.set(e.horizon),this.scene.fog.density=e.fog,this.hemi.color.set(e.sky),this.hemi.groundColor.set(e.night?"#1a1420":"#6b5a48"),this.hemi.intensity=e.night?.9:1.1,this.sun.color.set(e.light),this.sun.intensity=e.night?1.4:2.2}rebuild(t){this.spec=t;for(const e of this.objects.values())this.scene.remove(e.root),vu(e.root);this.objects.clear();for(const e of this.shotMeshes.values())this.scene.remove(e);this.shotMeshes.clear(),this.solidMeshes=[],this.decorRoots=[];for(const e of t.objects)this.add(e);this.fly.root.position.set(t.spawn[0],t.spawn[1],t.spawn[2])}ready(){return Promise.all(this.pending).then(()=>{})}add(t){const e=_M(t,this.spec);return e.ready&&this.pending.push(e.ready),this.objects.set(t.id,e),this.scene.add(e.root),Go(t)&&this.solidMeshes.push(e.root),tx(t)&&this.decorRoots.push(e.root),e}remove(t){const e=this.objects.get(t);e&&(this.scene.remove(e.root),vu(e.root),this.objects.delete(t),this.solidMeshes=this.solidMeshes.filter(n=>n!==e.root),this.decorRoots=this.decorRoots.filter(n=>n!==e.root))}animate(t){var e;this.t+=t;for(const n of this.objects.values())(e=n.anim)==null||e.call(n,this.t,t)}sync(t,e,n,i){var c,l,h,d;this.animate(i);const r=[0,1,2].map(u=>e[u]+(t.p[u]-e[u])*n),o=this.fly.root;o.position.set(r[0],r[1],r[2]);let a=t.facing-o.rotation.y;a=Math.atan2(Math.sin(a),Math.cos(a)),o.rotation.y+=a*Math.min(1,i*14),o.visible=!this.hideFly&&!(t.invuln>0&&Math.floor(t.invuln*10)%2===0),this.fly.anim(this.t,{air:!t.grounded,glide:t.gliding,speed:Math.hypot(t.v[0],t.v[2])});for(const[u,f]of t.plats){const p=this.objects.get(u);if(!p)continue;p.root.visible=f.gone<=0;const _=f.fallT>=0&&f.fallT<.55?Math.sin(this.t*60)*.05:0;p.root.position.set(f.pos[0]+_,f.pos[1],f.pos[2]),p.root.rotation.y=f.angle}for(const u of t.spawned)this.objects.has(u.id)||this.add(u).root.scale.setScalar(.01);for(const[u,f]of t.enemies){const p=this.objects.get(u);if(!p)continue;if(f.alive&&p.root.scale.x<1&&p.root.scale.setScalar(Math.min(1,p.root.scale.x+i*2.5)),!f.alive){p.root.scale.y=Math.max(.01,p.root.scale.y-i*4),p.root.scale.y<=.02&&(p.root.visible=!1);continue}p.root.position.set(f.pos[0],f.pos[1],f.pos[2]),p.root.rotation.y=f.facing;const _=p.root.getObjectByName("body");_&&(_.position.y=Math.abs(Math.sin(f.leg))*.06)}for(const u of t.taken){const f=this.objects.get(u);f&&f.root.visible&&(f.root.scale.multiplyScalar(.8),f.root.position.y+=i*4,f.root.scale.x<.05&&(f.root.visible=!1))}for(const[u,f]of t.turrets){const p=(c=this.objects.get(u))==null?void 0:c.root.getObjectByName("head");if(!p)continue;if(f.hp<=0){p.visible=!1;continue}let _=f.yaw-p.rotation.y;_=Math.atan2(Math.sin(_),Math.cos(_)),p.rotation.y+=_*Math.min(1,i*8)}for(const u of t.spec.objects)if(u.kind==="door"&&t.keys.has(u.color??0)){const f=(l=this.objects.get(u.id))==null?void 0:l.root.getObjectByName("slab"),p=(u.size??[3,3,.6])[1];f&&f.position.y>-p&&(f.position.y=Math.max(-p-.05,f.position.y-i*p*1.5))}else if(u.kind==="zone"){const f=(h=this.objects.get(u.id))==null?void 0:h.root.getObjectByName("column");f&&(f.scale.y=t.inZone?1+Math.sin(this.t*10)*.05:1)}if(this.syncShots(t,n),t.checkpointId){const u=(d=this.objects.get(t.checkpointId))==null?void 0:d.root.getObjectByName("pennant");u&&(u.material=yt("#5ef2cc",{emissive:"#5ef2cc",ei:.8}))}this.placeShadow(r),this.sun.position.set(r[0]+18,r[1]+30,r[2]+12),this.sun.target.position.set(r[0],r[1],r[2])}syncShots(t,e){const n=new Set;for(const i of t.shots){n.add(i.id);let r=this.shotMeshes.get(i.id);r||(r=new nt(this.shotGeo,i.foe?yt("#ff5a3c",{emissive:"#ff3a1c",ei:1.4}):yt("#ffe35e",{emissive:"#ffd000",ei:1.4})),i.foe&&r.scale.setScalar(1.5),this.scene.add(r),this.shotMeshes.set(i.id,r));const o=(1-e)/60;r.position.set(i.pos[0]-i.vel[0]*o,i.pos[1]-i.vel[1]*o,i.pos[2]-i.vel[2]*o)}for(const[i,r]of this.shotMeshes)n.has(i)||(this.scene.remove(r),this.shotMeshes.delete(i))}placeShadow(t){this.ray.set(new E(t[0],t[1]+.3,t[2]),new E(0,-1,0)),this.ray.far=30;const e=this.ray.intersectObjects(this.solidMeshes.filter(n=>n.visible),!0)[0];if(e){this.shadowBlob.visible=!0,this.shadowBlob.position.set(t[0],e.point.y+.02,t[2]);const n=t[1]-e.point.y,i=Math.max(.4,1-n*.08);this.shadowBlob.scale.setScalar(i),this.shadowBlob.material.opacity=.35*i}else this.shadowBlob.visible=!1}}const di=()=>matchMedia("(pointer: coarse)").matches||"ontouchstart"in window;class yM{constructor(t,e,n={}){U(this,"c",{mx:0,my:0,jump:!1,dragX:0,dragY:0,zoom:0,turn:0,anyPressed:!1,fire:!1});U(this,"mouseFire",!1);U(this,"touchFire",-1);U(this,"lockLook");U(this,"shoot");U(this,"keys",new Set);U(this,"off",[]);U(this,"stick",{id:-1,ox:0,oy:0,x:0,y:0});U(this,"cam",{id:-1,x:0,y:0});U(this,"jumpTouch",-1);U(this,"ui",null);U(this,"knob",null);U(this,"base",null);U(this,"el");this.el=t,this.lockLook=!!n.lockLook&&!di(),this.shoot=!!n.shoot;const i=(c,l,h,d)=>{c.addEventListener(l,h,d),this.off.push(()=>c.removeEventListener(l,h,d))};i(window,"keydown",c=>{var l,h;(h=(l=c.target)==null?void 0:l.closest)!=null&&h.call(l,"input,textarea,select")||(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(c.code)&&c.preventDefault(),this.keys.add(c.code),this.c.anyPressed=!0)}),i(window,"keyup",c=>this.keys.delete(c.code)),i(window,"blur",()=>this.keys.clear());let r=!1,o=0,a=0;i(t,"mousedown",c=>{var l;if(this.c.anyPressed=!0,this.lockLook){if(document.pointerLockElement!==t)try{(l=t.requestPointerLock)==null||l.call(t)}catch{}else c.button===0&&(this.mouseFire=!0);return}if(this.shoot&&c.button===2){this.mouseFire=!0;return}r=!0,o=c.clientX,a=c.clientY}),i(t,"contextmenu",c=>c.preventDefault()),i(window,"mouseup",()=>{r=!1,this.mouseFire=!1}),i(window,"mousemove",c=>{if(document.pointerLockElement===t){this.c.dragX+=c.movementX,this.c.dragY+=c.movementY;return}r&&(this.c.dragX+=c.clientX-o,this.c.dragY+=c.clientY-a,o=c.clientX,a=c.clientY)}),i(t,"wheel",c=>{c.preventDefault(),this.c.zoom+=Math.sign(c.deltaY)},{passive:!1}),di()&&this.touchUi(e,i)}touchUi(t,e){const n=document.createElement("div");n.className="fv-touch",n.innerHTML=`<div class="fv-stick"><div class="fv-knob"></div></div><button class="fv-jump" aria-label="Jump">⤒</button>${this.shoot?'<button class="fv-fire" aria-label="Fire">✸</button>':""}`,t.appendChild(n),this.ui=n,this.base=n.querySelector(".fv-stick"),this.knob=n.querySelector(".fv-knob");const i=n.querySelector(".fv-jump"),r=n.querySelector(".fv-fire");r&&(e(r,"touchstart",a=>{a.preventDefault(),this.touchFire=a.changedTouches[0].identifier,this.c.anyPressed=!0},{passive:!1}),e(r,"touchend",a=>{a.preventDefault(),this.touchFire=-1},{passive:!1})),e(i,"touchstart",a=>{a.preventDefault(),this.jumpTouch=a.changedTouches[0].identifier,this.c.anyPressed=!0},{passive:!1}),e(i,"touchend",a=>{a.preventDefault(),this.jumpTouch=-1},{passive:!1}),e(this.el,"touchstart",a=>{a.preventDefault(),this.c.anyPressed=!0;for(const c of Array.from(a.changedTouches))c.clientX<window.innerWidth*.45&&this.stick.id<0?(this.stick={id:c.identifier,ox:c.clientX,oy:c.clientY,x:c.clientX,y:c.clientY},this.base&&(this.base.style.left=`${c.clientX}px`,this.base.style.top=`${c.clientY}px`,this.base.classList.add("on"))):this.cam.id<0&&(this.cam={id:c.identifier,x:c.clientX,y:c.clientY})},{passive:!1}),e(this.el,"touchmove",a=>{a.preventDefault();for(const c of Array.from(a.changedTouches))c.identifier===this.stick.id?(this.stick.x=c.clientX,this.stick.y=c.clientY):c.identifier===this.cam.id&&(this.c.dragX+=(c.clientX-this.cam.x)*1.4,this.c.dragY+=(c.clientY-this.cam.y)*1.4,this.cam.x=c.clientX,this.cam.y=c.clientY)},{passive:!1});const o=a=>{var c;for(const l of Array.from(a.changedTouches))l.identifier===this.stick.id&&(this.stick.id=-1,(c=this.base)==null||c.classList.remove("on")),l.identifier===this.cam.id&&(this.cam.id=-1)};e(this.el,"touchend",o),e(this.el,"touchcancel",o)}read(){const t=this.keys;let e=(t.has("KeyD")||t.has("ArrowRight")?1:0)-(t.has("KeyA")||t.has("ArrowLeft")?1:0),n=(t.has("KeyW")||t.has("ArrowUp")?1:0)-(t.has("KeyS")||t.has("ArrowDown")?1:0);if(this.stick.id>=0){let r=this.stick.x-this.stick.ox,o=this.stick.y-this.stick.oy;const a=Math.hypot(r,o);a>50&&(r=r/a*50,o=o/a*50),this.knob&&(this.knob.style.transform=`translate(${r}px, ${o}px)`),e=r/50,n=-o/50,Math.hypot(e,n)<.15&&(e=0,n=0)}else this.knob&&(this.knob.style.transform="");return this.c.mx=e,this.c.my=n,this.c.jump=t.has("Space")||this.jumpTouch>=0,this.c.turn=(t.has("KeyE")?1:0)-(t.has("KeyQ")?1:0),this.c.fire=this.mouseFire||this.touchFire>=0||t.has("KeyF")||t.has("Enter"),this.c}consume(){this.c.dragX=0,this.c.dragY=0,this.c.zoom=0,this.c.anyPressed=!1}get locked(){return document.pointerLockElement===this.el}dispose(){var t,e;this.off.forEach(n=>n()),(t=this.ui)==null||t.remove(),document.pointerLockElement===this.el&&((e=document.exitPointerLock)==null||e.call(document))}}const Ni="fv.games.v1",xl=s=>`fv.board.${s}`;function Bi(s,t){try{const e=localStorage.getItem(s);return e?JSON.parse(e):t}catch{return t}}function Ls(s,t){try{return localStorage.setItem(s,JSON.stringify(t)),!0}catch{return!1}}function Xc(){return Bi(Ni,[]).map(s=>({...s,spec:_e(s.spec).spec})).sort((s,t)=>t.updated-s.updated)}function Kd(s){return Xc().find(t=>t.id===s)??null}function _s(s,t={}){const e=Bi(Ni,[]).filter(i=>i.id!==s.id),n={...s,updated:t.push===!1?s.updated:Date.now()};return e.push(n),t.push!==!1&&!n.pendingBuild&&Jd(n),Ls(Ni,e)?!0:(e.sort((i,r)=>i.updated-r.updated).forEach((i,r)=>{r<e.length-3&&delete i.cover}),Ls(Ni,e))}function xM(s){Ls(Ni,Bi(Ni,[]).filter(t=>t.id!==s)),Tn("/api/fv/games/delete",{method:"POST",body:JSON.stringify({id:s})}).catch(()=>{});try{localStorage.removeItem(xl(s))}catch{}}const Zd=()=>"g"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);function jc(s){return Bi(xl(s),[])}function MM(s,t){const e=jc(s);e.push(t),e.sort((i,r)=>t.kind==="time"?i.value-r.value:r.value-i.value);const n=e.slice(0,10);return Ls(xl(s),n),n.indexOf(t)+1}function bo(){return Bi("fv.name","")}function bM(s){Ls("fv.name",s.slice(0,16))}function Ba(s){const t=JSON.stringify({o:s.objects,s:s.spawn,r:s.rules,c:s.look.camera});let e=2166136261;for(let n=0;n<t.length;n++)e^=t.charCodeAt(n),e=Math.imul(e,16777619);return(e>>>0).toString(36)}function $c(s,t){const e=Bi(`fv.ghost.${s}`,null);if(!e||e.sig!==t)return null;const n=[];for(const[i,...r]of e.rle)for(let o=0;o<i;o++)n.push(r);return{sig:t,value:e.value,runs:n}}function SM(s,t,e,n){const i=$c(s,t);if(i&&i.value<=e)return!1;const r=[];for(const o of n){const a=r[r.length-1];a&&a.length-1===o.length&&o.every((c,l)=>c===a[l+1])?a[0]++:r.push([1,...o])}return Ls(`fv.ghost.${s}`,{sig:t,value:e,rle:r})}const Ha=new Map;function Jd(s){clearTimeout(Ha.get(s.id)),Ha.set(s.id,setTimeout(()=>{Ha.delete(s.id);const{pendingBuild:t,...e}=s;Tn("/api/fv/games/save",{method:"POST",body:JSON.stringify({game:e})}).catch(()=>{})},900))}const Ml=s=>({id:s.id,spec:_e(s.spec).spec,created:s.created,updated:s.updated,prompts:s.prompts??[],cover:s.cover??void 0,creator:s.creator??void 0,remixOf:s.remixOf??void 0,revisions:s.revisions??[],owner:s.owner});async function wM(){let s;try{const n=await Tn("/api/fv/games?mine=1",{cache:"no-store"});if(!n.ok)return!1;s=(await n.json()).games??[]}catch{return!1}const t=Bi(Ni,[]);let e=!1;for(const n of s){const i=t.find(r=>r.id===n.id);(!i||n.updated>i.updated)&&(_s(Ml(n),{push:!1}),e=!0)}for(const n of t)!n.pendingBuild&&!s.some(i=>i.id===n.id)&&Jd(n);return e}async function EM(){try{const s=await Tn("/api/fv/games",{cache:"no-store"});return s.ok?((await s.json()).games??[]).map(Ml):[]}catch{return[]}}async function TM(s){try{const t=await Tn("/api/fv/games/"+encodeURIComponent(s),{cache:"no-store"});return t.ok?Ml(await t.json()):null}catch{return null}}async function AM(s,t,e,n){try{const i=await Tn("/api/fv/scores",{method:"POST",body:JSON.stringify({game:s,name:t,kind:e,value:n})});return i.ok?(await i.json()).board??[]:null}catch{return null}}const RM=()=>window.flyNav;async function vr(){var e;const s=RM(),t=(e=s==null?void 0:s.session)==null?void 0:e.call(s);if(t!=null&&t.wallet){const n=t.wallet.toLowerCase();let i="";try{i=(await s.names([n]))[n]??""}catch{}return{wallet:n,name:i||s.short(n)}}return{name:bo()||"You"}}const Uo={name:"fly.ai"};function Di(s,t){const e=(s==null?void 0:s.name)??"someone";return t?`by ${e} · remix of “${t.title}” by ${t.by}`:`by ${e}`}const Et=s=>String(s??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]);function ci(s){const t=Math.floor(s/60),e=s-t*60;return t?`${t}:${e.toFixed(1).padStart(4,"0")}`:`${e.toFixed(1)}s`}const so=["#5ef2cc","#ff7a3d","#5ec8ff","#c77dff","#ffd23f"];class CM{constructor(t,e,n,i,r,o,a){U(this,"remotes",new Map);U(this,"sentGame",new Set);U(this,"sendT",0);U(this,"countdown",0);U(this,"cdEl");U(this,"t",0);U(this,"colorOf",new Map);U(this,"lobbyChanged",null);this.room=t,this.world=e,this.overlay=n,this.spec=i,this.gameId=r,this.by=o,this.hooks=a,this.cdEl=document.createElement("div"),this.cdEl.className="fv-countdown",this.cdEl.hidden=!0,n.appendChild(this.cdEl),t.onMessage=(c,l)=>this.onMessage(c,l),t.onChange=()=>this.onChange(),this.onChange()}get isHost(){return this.room.host}color(t){let e=this.colorOf.get(t);return e||(e=so[(this.colorOf.size+1)%so.length],this.colorOf.set(t,e)),e}onChange(){var t;if(this.isHost)for(const e of this.room.openPeers)this.sentGame.has(e.id)||(this.sentGame.add(e.id),this.room.sendTo(e.id,{t:"game",spec:this.spec,gameId:this.gameId,by:this.by}));for(const e of[...this.remotes.keys()])this.room.peers.has(e)||this.dropRemote(e);(t=this.lobbyChanged)==null||t.call(this)}ensureRemote(t){let e=this.remotes.get(t);if(e)return e;const n=this.room.peers.get(t);if(!n)return null;const i=this.color(t),r=Vo(),o=new ue;o.add(r.root);const a=new nt(new fs(.16,.3,4),yt(i,{emissive:i,ei:1}));a.rotation.x=Math.PI,a.position.y=1.45,o.add(a),this.world.scene.add(o);const c=document.createElement("div");return c.className="fv-tag",c.style.borderColor=i,c.textContent=n.name,this.overlay.appendChild(c),e={id:t,name:n.name,color:i,fly:r,root:o,label:c,pos:new E(...this.spec.spawn),want:new E(...this.spec.spawn),facing:0,air:!1,glide:!1,status:"ready",points:0,finish:0,lives:this.spec.rules.lives,seen:!1},this.remotes.set(t,e),e}dropRemote(t){const e=this.remotes.get(t);e&&(this.world.scene.remove(e.root),e.label.remove(),this.remotes.delete(t))}onMessage(t,e){if(e.t==="start")this.startCountdown(Math.max(500,Number(e.ms)||3e3));else if(e.t==="again")this.hooks.onAgain();else if(e.t==="st"||e.t==="end"){const n=this.ensureRemote(t);if(!n)return;e.p&&(n.want.set(e.p[0],e.p[1],e.p[2]),n.seen||(n.pos.copy(n.want),n.seen=!0)),e.f!==void 0&&(n.facing=e.f),n.air=!!e.a,n.glide=!!e.g;const i=n.status+n.points+n.finish;n.status=e.s??n.status,n.points=e.pts??n.points,n.finish=e.fin??n.finish,n.lives=e.l??n.lives,i!==n.status+n.points+n.finish&&this.hooks.onResults()}}start(){this.isHost&&(this.room.send({t:"start",ms:3e3}),this.startCountdown(3e3))}again(){this.isHost&&(this.room.send({t:"again"}),this.hooks.onAgain())}startCountdown(t){this.countdown=t/1e3,this.cdEl.hidden=!1}tick(t,e,n,i){if(this.t+=e,this.countdown>0){this.countdown-=e;const r=Math.ceil(this.countdown);this.cdEl.textContent=r>0?String(r):"Go!",this.countdown<=0&&(this.hooks.onStart(),setTimeout(()=>{this.cdEl.hidden=!0},600))}this.sendT-=e,this.sendT<=0&&(this.sendT=1/12,this.room.send({t:"st",p:t.p.map(r=>Math.round(r*100)/100),f:Math.round(t.facing*100)/100,a:!t.grounded,g:t.gliding,s:t.status,pts:t.points,fin:t.finish,l:t.lives}));for(const r of this.remotes.values()){r.pos.lerp(r.want,Math.min(1,e*12)),r.root.position.copy(r.pos);let o=r.facing-r.fly.root.rotation.y;o=Math.atan2(Math.sin(o),Math.cos(o)),r.fly.root.rotation.y+=o*Math.min(1,e*12),r.fly.anim(this.t,{air:r.air,glide:r.glide,speed:r.air?4:2});const a=r.pos.clone().add(new E(0,1.9,0)).project(n),c=a.z<1&&Math.abs(a.x)<1.1&&Math.abs(a.y)<1.1;r.label.style.display=c?"":"none",c&&(r.label.style.transform=`translate(${(a.x*.5+.5)*i.w}px, ${(-a.y*.5+.5)*i.h}px) translate(-50%, -100%)`),r.label.textContent=`${r.name}${r.status==="won"?" 🏁":r.status==="lost"?" 💀":""}`}}finished(t){this.room.send({t:"end",p:t.p,s:t.status,pts:t.points,fin:t.finish,l:t.lives})}standings(t){const e=t.score.kind==="time",n=[{name:this.room.myName+" (you)",color:so[0],status:t.status,points:t.points,finish:t.finish,me:!0},...[...this.room.peers.values()].map(r=>{const o=this.remotes.get(r.id);return{name:r.name,color:(o==null?void 0:o.color)??"#9ba5a1",status:(o==null?void 0:o.status)??"ready",points:(o==null?void 0:o.points)??0,finish:(o==null?void 0:o.finish)??0,me:!1}})],i=r=>r.status==="won"?0:r.status==="play"?1:r.status==="ready"?2:3;return n.sort((r,o)=>i(r)-i(o)||(e&&r.status==="won"?r.finish-o.finish:o.points-r.points)),n}hudHtml(t){const e=t.score.kind==="time";return`<div class="fv-ranks">${this.standings(t).map((n,i)=>`<div class="${n.me?"me":""}"><i style="background:${n.color}"></i>${i+1}. ${Et(n.name.replace(" (you)",""))} <b>${n.status==="won"?e?ci(n.finish):"★"+n.points:n.status==="lost"?"💀":n.status==="play"?"★"+n.points:"…"}</b></div>`).join("")}</div>`}lobbyHtml(){const t=`${location.origin}${location.pathname}#room=${this.room.code}`,e=[`<li><i style="background:${so[0]}"></i>${Et(this.room.myName)} (you)${this.isHost?" · host":""}</li>`,...[...this.room.peers.values()].map(n=>`<li><i style="background:${this.color(n.id)}"></i>${Et(n.name)}${n.host?" · host":""} ${n.open?"✓":"<em>connecting…</em>"}</li>`)].join("");return`
      <div class="fv-panel fv-lobby">
        <p class="fv-eyebrow">Play with friends · room ${Et(this.room.code)}</p>
        <h2>${Et(this.spec.title)}</h2>
        <p class="fv-goal">${Et(this.spec.goal)}</p>
        <div class="fv-invite"><input readonly value="${Et(t)}"><button data-a="copy">Copy link</button></div>
        <ul class="fv-players">${e}</ul>
        <p class="fv-keys">Up to 4 players. Everyone races through their own copy of the level; you see each other live.</p>
        ${this.isHost?'<button class="fv-primary" data-a="startall">Start for everyone</button>':'<p class="fv-keys"><b>Waiting for the host to start…</b></p>'}
        <div class="fv-row"><button data-a="leave">Leave room</button></div>
      </div>`}resultsHtml(t){const e=t.score.kind==="time",n=this.standings(t).map((i,r)=>`<li class="${i.me?"me":""}"><span><i style="background:${i.color}"></i>${r+1}. ${Et(i.name)}</span><b>${i.status==="won"?e?ci(i.finish):`★ ${i.points}`:i.status==="lost"?"out":"still playing…"}</b></li>`).join("");return`
      <div class="fv-panel">
        <p class="fv-eyebrow">Room ${Et(this.room.code)} · results</p>
        <h2>${t.status==="won"?"🏁 ":""}${Et(this.spec.title)}</h2>
        <ol class="fv-board fv-mboard">${n}</ol>
        <div class="fv-row">
          ${this.isHost?'<button class="fv-primary" data-a="rematch">Rematch</button>':'<p class="fv-keys">The host can start a rematch.</p>'}
          <button data-a="leave">Leave room</button>
        </div>
      </div>`}dispose(){for(const t of[...this.remotes.keys()])this.dropRemote(t);this.cdEl.remove(),this.room.close()}}const Ys=s=>Math.round(s*100)/100,PM=s=>{var t,e,n;return[Ys(s.x),Ys(s.z),s.jump?1:0,s.fire?1:0,Ys(((t=s.aim)==null?void 0:t[0])??0),Ys(((e=s.aim)==null?void 0:e[1])??0),Ys(((n=s.aim)==null?void 0:n[2])??0)]},Mu=s=>({x:s[0],z:s[1],jump:!!s[2],fire:!!s[3],aim:s[3]||s[4]||s[5]||s[6]?[s[4],s[5],s[6]]:void 0});class So{constructor(t,e,n,i){U(this,"world");U(this,"sim");U(this,"input");U(this,"cam");U(this,"yaw",0);U(this,"pitch",.45);U(this,"look",0);U(this,"dist",7.5);U(this,"camPos",new E);U(this,"acc",0);U(this,"last",0);U(this,"prevP");U(this,"hud");U(this,"card");U(this,"cross");U(this,"alive",!0);U(this,"ended",!1);U(this,"dragQuiet",9);U(this,"party",null);U(this,"onResize",()=>this.resize());U(this,"rec",[]);U(this,"ghost",null);U(this,"camRay",new ps);U(this,"toastEl",null);U(this,"hudKey","");this.renderer=t,this.host=e,this.spec=n,this.opts=i,e.innerHTML="",e.classList.add("fv-play"),e.appendChild(t.domElement);const r=document.createElement("div");r.className="fv-overlay",e.appendChild(r),this.hud=document.createElement("div"),this.hud.className="fv-hud",r.appendChild(this.hud),this.cross=document.createElement("div"),this.cross.className="fv-cross",this.cross.hidden=n.look.camera!=="first",r.appendChild(this.cross),this.card=document.createElement("div"),this.card.className="fv-card",r.appendChild(this.card),this.world=new yl(n,{lowShadows:di()}),this.sim=new Na(n),this.prevP=[...this.sim.p],this.cam=new Oe(60,1,.05,900),this.input=new yM(t.domElement,r,{lockLook:n.rules.shoot||n.look.camera==="first",shoot:n.rules.shoot}),i.room&&(this.party=new CM(i.room,this.world,r,n,i.gameId,i.by??"",{onStart:()=>this.begin(),onAgain:()=>this.restart(),onResults:()=>{this.ended&&this.end()}}),this.party.lobbyChanged=()=>{this.sim.status==="ready"&&this.showStart()}),this.aimCamera(),this.resize(),window.addEventListener("resize",this.onResize),this.showStart(),this.last=performance.now(),t.setAnimationLoop(o=>this.frame(o))}get mode(){return this.spec.look.camera}aimCamera(){const t=this.spec.objects.find(o=>o.kind==="flag"),e=Io(this.spec),n=t&&(this.spec.type==="race"||this.mode==="chase")?t.at:[(e.x0+e.x1)/2,0,(e.z0+e.z1)/2],i=n[0]-this.spec.spawn[0],r=n[2]-this.spec.spawn[2];this.yaw=Math.hypot(i,r)>1?Math.atan2(i,r):0,this.pitch=.45,this.dist=7.5,this.look=0,this.spec.type==="maze"&&(this.pitch=1,this.dist=9),(this.spec.type==="survive"||this.spec.type==="coins")&&(this.pitch=.6,this.dist=9),this.mode==="top"&&(this.yaw=0,this.pitch=1.15,this.dist=21),this.mode==="side"&&(this.yaw=Math.PI,this.pitch=.12,this.dist=15),this.mode==="chase"&&(this.pitch=.32,this.dist=6.5),this.world.hideFly=this.mode==="first",this.world.fly.root.visible=this.mode!=="first",this.placeCamera(1)}resize(){const t=this.host.clientWidth||window.innerWidth,e=this.host.clientHeight||window.innerHeight;this.renderer.setSize(t,e,!1),this.cam.aspect=t/e,this.cam.fov=this.mode==="first"||this.cam.aspect<.8?75:60,this.cam.updateProjectionMatrix()}frame(t){if(!this.alive)return;const e=Math.min(.1,(t-this.last)/1e3);this.last=t,this.tick(e)}tick(t){var d;const e=this.input.read(),n=this.mode;if(e.dragX||e.dragY?this.dragQuiet=0:this.dragQuiet+=t,n==="first")this.yaw-=e.dragX*.0035+e.turn*t*2.2,this.look=Math.min(1.2,Math.max(-1.2,this.look-e.dragY*.0035));else if(n==="top"||n==="side")n==="top"&&(this.yaw-=e.turn*t*2.2),this.dist=Math.min(26,Math.max(8,this.dist+e.zoom*1));else if(this.yaw-=e.dragX*.006+e.turn*t*2.2,this.pitch=Math.min(1.3,Math.max(.05,this.pitch+e.dragY*.004)),this.dist=Math.min(16,Math.max(3.5,this.dist+e.zoom*.8)),n==="chase"&&this.dragQuiet>1&&Math.hypot(this.sim.v[0],this.sim.v[2])>2){let u=this.sim.facing-this.yaw;u=Math.atan2(Math.sin(u),Math.cos(u)),this.yaw+=u*Math.min(1,t*2.2)}!this.party&&this.sim.status==="ready"&&e.anyPressed&&(e.mx||e.my||e.jump||e.fire||di()||this.input.locked)&&this.begin();const i=Math.sin(this.yaw),r=Math.cos(this.yaw),o=-r,a=i;let c=i*e.my+o*e.mx,l=r*e.my+a*e.mx,h=e.jump;for(n==="side"&&(c=e.mx,l=0,h=e.jump||e.my>.5),this.acc+=t;this.acc>=pe;){this.prevP=[...this.sim.p];const u={x:c,z:l,jump:h,fire:e.fire&&this.spec.rules.shoot,aim:this.spec.rules.shoot?this.aim():void 0},f=PM(u);this.sim.status==="play"&&this.rec.push(f),this.sim.step(Mu(f)),this.stepGhost(),this.acc-=pe,this.sim.events.length&&this.onEvents()}if(this.input.consume(),this.world.sync(this.sim,this.prevP,this.acc/pe,t),this.ghost){const u=this.ghost;u.fly.root.position.set(...u.sim.p),u.fly.root.rotation.y=u.sim.facing,u.fly.anim(performance.now()/1e3,{air:!u.sim.grounded,glide:u.sim.gliding,speed:Math.hypot(u.sim.v[0],u.sim.v[2])})}this.placeCamera(t),(d=this.party)==null||d.tick(this.sim,t,this.cam,{w:this.host.clientWidth||window.innerWidth,h:this.host.clientHeight||window.innerHeight}),this.renderer.render(this.world.scene,this.cam),this.drawHud(),!this.ended&&(this.sim.status==="won"||this.sim.status==="lost")&&this.end()}aim(){var l,h;const t=this.sim,e=this.mode;let n;e==="first"?n=[Math.sin(this.yaw)*Math.cos(this.look),Math.sin(this.look),Math.cos(this.yaw)*Math.cos(this.look)]:e==="top"||e==="side"?n=[Math.sin(t.facing),0,Math.cos(t.facing)]:n=[Math.sin(this.yaw),0,Math.cos(this.yaw)];const i=e==="first"?.12:e==="top"?.9:di()?.45:.3,r=[t.p[0],t.p[1]+.55,t.p[2]];let o=null,a=i;const c=d=>{const u=[d[0]-r[0],d[1]-r[1],d[2]-r[2]],f=Math.hypot(...u);if(f<.5||f>26)return;const p=(u[0]*n[0]+u[1]*n[1]+u[2]*n[2])/f,_=Math.acos(Math.max(-1,Math.min(1,p))),m=e!=="first"?Math.acos(Math.max(-1,Math.min(1,(u[0]*n[0]+u[2]*n[2])/(Math.hypot(u[0],u[2])||1)))):_;m<a&&(a=m,o=[u[0]/f,u[1]/f,u[2]/f])};for(const[,d]of t.enemies)d.alive&&c([d.pos[0],d.pos[1]+.4,d.pos[2]]);for(const d of t.spec.objects)d.kind==="target"&&!t.taken.has(d.id)&&c([d.at[0],d.at[1]+1.2,d.at[2]]),d.kind==="turret"&&(((l=t.turrets.get(d.id))==null?void 0:l.hp)??0)>0&&c([d.at[0],d.at[1]+(((h=d.size)==null?void 0:h[1])??1.2)+.25,d.at[2]]);return o??n}placeCamera(t){const e=this.world.fly.root.position,n=this.mode;if(n==="first"){const u=new E(e.x,e.y+.62,e.z);this.cam.position.copy(u),this.camPos.copy(u),this.cam.lookAt(u.x+Math.sin(this.yaw)*Math.cos(this.look),u.y+Math.sin(this.look),u.z+Math.cos(this.yaw)*Math.cos(this.look));return}const i=new E(e.x,e.y+.9,e.z),r=Math.sin(this.yaw),o=Math.cos(this.yaw),a=new E(i.x-r*this.dist*Math.cos(this.pitch),i.y+this.dist*Math.sin(this.pitch),i.z-o*this.dist*Math.cos(this.pitch));if(n==="third"||n==="chase"){const u=a.clone().sub(i),f=u.length();u.normalize(),this.camRay.set(i,u),this.camRay.far=f;const p=this.camRay.intersectObjects(this.world.solidMeshes,!0)[0];p&&a.copy(i).addScaledVector(u,Math.max(1.2,p.distance-.35))}const c=a.distanceTo(i)<this.camPos.distanceTo(i);this.camPos.lerp(a,Math.min(1,t*(c?25:8))),t>=1&&this.camPos.copy(a),this.cam.position.copy(this.camPos),this.cam.lookAt(i);const l=this.camPos.clone().sub(i),h=l.length();this.camRay.set(i,l.normalize()),this.camRay.far=h;const d=new Set;for(const u of this.camRay.intersectObjects(this.world.decorRoots,!0)){let f=u.object;for(;f&&!f.userData.id;)f=f.parent;f&&d.add(f)}for(const u of this.world.decorRoots)u.visible=!d.has(u)}onEvents(){for(const t of this.sim.events)(t==="hurt"||t==="fall")&&(this.host.classList.add("fv-hurt"),setTimeout(()=>this.host.classList.remove("fv-hurt"),250)),t==="checkpoint"&&this.toast("Checkpoint!"),t==="stomp"&&this.toast("+25"),t==="gem"&&this.toast("+50"),t==="target"&&this.toast(`🎯 ${this.sim.targetsHit}/${this.sim.targetsTotal}`),t==="turret"&&this.toast("Turret down! +30"),t==="key"&&this.toast("🔑 Key! A door opened"),t==="heart"&&this.toast("+1 ♥"),t==="wave"&&this.toast(`Wave ${this.sim.wave}${this.sim.totalWaves?` of ${this.sim.totalWaves}`:""}!`)}toast(t){var n;(n=this.toastEl)==null||n.remove();const e=document.createElement("div");e.className="fv-toast",e.textContent=t,this.hud.parentElement.appendChild(e),this.toastEl=e,setTimeout(()=>e.remove(),1e3)}drawHud(){const t=this.sim,e=t.spec.rules.win,n=e==="survive",i=n?Math.ceil(t.left):t.time,r=[];if(r.push(`<span class="fv-pill${t.left<10&&t.status==="play"?" fv-low":""}">⏱ ${n?`${i}s left`:`${ci(i)} / ${t.spec.rules.timer}s`}</span>`),t.coinsTotal&&r.push(`<span class="fv-pill">🪙 ${t.coinsTaken}/${t.coinsTotal}</span>`),t.targetsTotal&&r.push(`<span class="fv-pill">🎯 ${t.targetsHit}/${t.targetsTotal}</span>`),t.totalWaves&&r.push(`<span class="fv-pill">🧟 wave ${Math.max(1,t.wave)}/${t.totalWaves} · ${t.zombiesLeft} left</span>`),e==="hill"&&r.push(`<span class="fv-pill${t.inZone?" fv-on":""}">⛳ ${Math.floor(t.hold)}/${t.spec.rules.hold}s</span>`),t.keys.size){const c=[...t.keys].map(l=>`<i class="fv-dot" style="background:${this.world.palette.colors[l]}"></i>`).join("");r.push(`<span class="fv-pill">🔑 ${c}</span>`)}r.push(`<span class="fv-pill">★ ${t.points}</span>`),this.ghost&&r.push(`<span class="fv-pill fv-ghost">👻 best ${ci(this.ghost.runs.length*pe)}</span>`);const o="♥".repeat(Math.max(0,t.lives))+`<span class="fv-lost">${"♥".repeat(Math.max(0,t.spec.rules.lives-t.lives))}</span>`,a=`<div class="fv-hud-l">${r.join("")}</div>
      <div class="fv-hud-r"><span class="fv-pill fv-hearts">${o}</span><button class="fv-pill fv-btn" data-a="exit" aria-label="Leave">✕</button>${this.party?this.party.hudHtml(t):""}</div>`;a!==this.hudKey&&(this.hudKey=a,this.hud.innerHTML=a,this.hud.querySelector("[data-a=exit]").onclick=()=>this.exit())}showStart(){if(this.party){this.card.innerHTML=this.party.lobbyHtml(),this.card.hidden=!1;const c=l=>this.card.querySelector(`[data-a=${l}]`);c("copy").onclick=()=>{var h;const l=this.card.querySelector(".fv-invite input");l.select(),(h=navigator.clipboard)==null||h.writeText(l.value).catch(()=>{}),c("copy").textContent="Copied!"},c("startall")&&(c("startall").onclick=()=>this.party.start()),c("leave").onclick=()=>this.exit();return}const t=di(),e=this.mode,n=this.spec.rules.shoot,i=t?`Left thumb moves · ${e==="first"||e==="third"||e==="chase"?"right thumb looks · ":""}⤒ jumps${n?" · ✸ shoots (aims for you)":""}`:e==="side"?`A/D or ←/→ run · Space or W jumps (hold to glide)${n?" · F or click shoots":""}`:`WASD moves · Space jumps (hold to glide)${n||e==="first"?" · click to lock the mouse, move it to look":" · drag to look"}${n?" · click or F shoots":""}`,r={third:"",chase:"Chase cam",top:"Top-down",side:"Side-scroller",first:"First person"}[e],o=this.opts.test?null:$c(this.opts.gameId,Ba(this.spec));this.card.innerHTML=`
      <div class="fv-panel">
        <p class="fv-eyebrow">${Et(this.spec.type)}${r?` · ${r}`:""}</p>
        <h2>${Et(this.spec.title)}</h2>
        ${this.opts.by?`<p class="fv-keys">${Et(this.opts.by)}</p>`:""}
        <p class="fv-goal">${Et(this.spec.goal)}</p>
        <p class="fv-keys">${i}</p>
        ${o?`<p class="fv-keys">👻 Race your best run: ${ci(o.value/1e3)}</p>`:""}
        <div class="fv-row">
          <button class="fv-primary" data-a="go">Play</button>
          ${this.spec.rules.multi&&this.opts.onFriends&&!this.opts.test?'<button data-a="friends">👥 Play with friends</button>':""}
        </div>
      </div>`,this.card.hidden=!1;const a=this.card.querySelector("[data-a=friends]");a&&(a.onclick=()=>{a.textContent="Opening a room…",this.opts.onFriends()}),this.card.querySelector("[data-a=go]").onclick=()=>{var c,l;if(this.spec.rules.shoot||e==="first")try{(l=(c=this.renderer.domElement).requestPointerLock)==null||l.call(c)}catch{}this.begin()}}begin(){this.sim.status==="ready"&&(this.card.hidden=!0,this.sim.start(),this.rec=[],this.party||this.startGhost(),this.last=performance.now(),this.acc=0)}startGhost(){if(this.clearGhost(),this.opts.test||this.sim.score.kind!=="time")return;const t=$c(this.opts.gameId,Ba(this.spec));if(!t)return;const e=new Na(this.spec);e.start();const n=Vo();n.root.traverse(i=>{const r=i;r.isMesh&&(r.material=new Ve({color:"#bfe9ff",transparent:!0,opacity:.35,depthWrite:!1}),r.castShadow=!1)}),this.world.scene.add(n.root),this.ghost={sim:e,runs:t.runs,i:0,fly:n}}stepGhost(){const t=this.ghost;!t||this.sim.status!=="play"||t.i<t.runs.length&&t.sim.step(Mu(t.runs[t.i++]))}clearGhost(){this.ghost&&(this.world.scene.remove(this.ghost.fly.root),this.ghost=null)}end(){var u;const t=!this.ended;this.ended=!0,document.pointerLockElement&&((u=document.exitPointerLock)==null||u.call(document));const e=this.sim;if(this.party){t&&this.party.finished(e),this.card.innerHTML=this.party.resultsHtml(e),this.card.hidden=!1;const f=p=>this.card.querySelector(`[data-a=${p}]`);f("rematch")&&(f("rematch").onclick=()=>this.party.again()),f("leave").onclick=()=>this.exit();return}const n=e.status==="won",i=e.score;let r=0,o="",a="";if(n&&!this.opts.test){const f={name:bo()||"You",kind:i.kind,value:i.value,at:Date.now()};r=MM(this.opts.gameId,f),bo()||(o='<label class="fv-name">Your name on the board <input maxlength="16" placeholder="You"></label>'),i.kind==="time"&&SM(this.opts.gameId,Ba(this.spec),i.value,this.rec)&&(a=`<p class="fv-keys">👻 New best: next time you race this run's ghost</p>`),(async()=>{const p=bo()||(await vr()).name,_=await AM(this.opts.gameId,p,i.kind,i.value);_&&this.ended&&this.alive&&this.showBoard(_,i.value)})()}const c=n?i.kind==="time"?`Finished in <b>${ci(e.finish)}</b>`:e.spec.rules.win==="waves"?`All waves beaten with <b>${e.points}</b> points`:`Survived with <b>${e.points}</b> points`:Et(e.reason),l=this.opts.test?"":jc(this.opts.gameId).map((f,p)=>`<li class="${p+1===r?"me":""}"><span>${p+1}. ${Et(f.name)}</span><b>${f.kind==="time"?ci(f.value/1e3):f.value}</b></li>`).join("");this.card.innerHTML=`
      <div class="fv-panel">
        <p class="fv-eyebrow">${n?"You win!":"Game over"}</p>
        <h2>${n?"🏁 ":""}${Et(this.spec.title)}</h2>
        <p class="fv-goal">${c} · ★ ${e.points}</p>
        ${r?`<p class="fv-place">#${r} on this game's board</p>`:""}
        ${a}
        ${o}
        ${l?`<ol class="fv-board">${l}</ol>`:""}
        <div class="fv-row">
          <button class="fv-primary" data-a="again">Play again</button>
          ${this.opts.test||this.opts.onEdit?`<button data-a="edit">${this.opts.test?"Back to editor":"Edit"}</button>`:""}
          ${this.opts.test?"":'<button data-a="exit">All games</button>'}
        </div>
      </div>`,this.card.hidden=!1;const h=f=>this.card.querySelector(`[data-a=${f}]`);h("again").onclick=()=>this.restart(),h("edit")&&(h("edit").onclick=()=>{var f,p;return this.opts.test?this.exit():(p=(f=this.opts).onEdit)==null?void 0:p.call(f)}),h("exit")&&(h("exit").onclick=()=>this.exit());const d=this.card.querySelector(".fv-name input");d&&(d.onchange=()=>{const f=d.value.trim();if(!f)return;bM(f);const p=jc(this.opts.gameId),_=p.find(m=>m.name==="You"&&m.value===i.value);_&&(_.name=f,localStorage.setItem(`fv.board.${this.opts.gameId}`,JSON.stringify(p)))})}showBoard(t,e){var a;const n=this.card.querySelector(".fv-board"),i=t.slice(0,10).map((c,l)=>`<li class="${c.value===e?"me":""}"><span>${l+1}. ${Et(c.name)}</span><b>${c.kind==="time"?ci(c.value/1e3):c.value}</b></li>`).join("");n?n.innerHTML=i:(a=this.card.querySelector(".fv-row"))==null||a.insertAdjacentHTML("beforebegin",`<ol class="fv-board">${i}</ol>`);const r=this.card.querySelector(".fv-place"),o=t.findIndex(c=>c.value===e);r&&o>=0&&(r.textContent=`#${o+1} on this game's board (everyone)`)}restart(){this.clearGhost(),this.world.rebuild(this.spec),this.sim=new Na(this.spec),this.prevP=[...this.sim.p],this.ended=!1,this.hudKey="",this.aimCamera(),this.showStart()}exit(){this.dispose(),this.opts.onExit()}dispose(){var t;this.alive&&(this.alive=!1,(t=this.party)==null||t.dispose(),this.renderer.setAnimationLoop(null),this.input.dispose(),window.removeEventListener("resize",this.onResize),this.host.classList.remove("fv-play"))}}const bu={type:"change"},bl={type:"start"},Qd={type:"end"},ro=new Is,Su=new ai,LM=Math.cos(70*Qu.DEG2RAD),Ae=new E,tn=2*Math.PI,ae={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},Ga=1e-6;class IM extends Ld{constructor(t,e=null){super(t,e),this.state=ae.NONE,this.enabled=!0,this.target=new E,this.cursor=new E,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:ls.ROTATE,MIDDLE:ls.DOLLY,RIGHT:ls.PAN},this.touches={ONE:rs.ROTATE,TWO:rs.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new E,this._lastQuaternion=new Te,this._lastTargetPosition=new E,this._quat=new Te().setFromUnitVectors(t.up,new E(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new eu,this._sphericalDelta=new eu,this._scale=1,this._panOffset=new E,this._rotateStart=new it,this._rotateEnd=new it,this._rotateDelta=new it,this._panStart=new it,this._panEnd=new it,this._panDelta=new it,this._dollyStart=new it,this._dollyEnd=new it,this._dollyDelta=new it,this._dollyDirection=new E,this._mouse=new it,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=NM.bind(this),this._onPointerDown=DM.bind(this),this._onPointerUp=UM.bind(this),this._onContextMenu=GM.bind(this),this._onMouseWheel=FM.bind(this),this._onKeyDown=zM.bind(this),this._onTouchStart=BM.bind(this),this._onTouchMove=HM.bind(this),this._onMouseDown=kM.bind(this),this._onMouseMove=OM.bind(this),this._interceptControlDown=VM.bind(this),this._interceptControlUp=WM.bind(this),this.domElement!==null&&this.connect(),this.update()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(bu),this.update(),this.state=ae.NONE}update(t=null){const e=this.object.position;Ae.copy(e).sub(this.target),Ae.applyQuaternion(this._quat),this._spherical.setFromVector3(Ae),this.autoRotate&&this.state===ae.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,i=this.maxAzimuthAngle;isFinite(n)&&isFinite(i)&&(n<-Math.PI?n+=tn:n>Math.PI&&(n-=tn),i<-Math.PI?i+=tn:i>Math.PI&&(i-=tn),n<=i?this._spherical.theta=Math.max(n,Math.min(i,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+i)/2?Math.max(n,this._spherical.theta):Math.min(i,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const o=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=o!=this._spherical.radius}if(Ae.setFromSpherical(this._spherical),Ae.applyQuaternion(this._quatInverse),e.copy(this.target).add(Ae),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let o=null;if(this.object.isPerspectiveCamera){const a=Ae.length();o=this._clampDistance(a*this._scale);const c=a-o;this.object.position.addScaledVector(this._dollyDirection,c),this.object.updateMatrixWorld(),r=!!c}else if(this.object.isOrthographicCamera){const a=new E(this._mouse.x,this._mouse.y,0);a.unproject(this.object);const c=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=c!==this.object.zoom;const l=new E(this._mouse.x,this._mouse.y,0);l.unproject(this.object),this.object.position.sub(l).add(a),this.object.updateMatrixWorld(),o=Ae.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;o!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(o).add(this.object.position):(ro.origin.copy(this.object.position),ro.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(ro.direction))<LM?this.object.lookAt(this.target):(Su.setFromNormalAndCoplanarPoint(this.object.up,this.target),ro.intersectPlane(Su,this.target))))}else if(this.object.isOrthographicCamera){const o=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),o!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>Ga||8*(1-this._lastQuaternion.dot(this.object.quaternion))>Ga||this._lastTargetPosition.distanceToSquared(this.target)>Ga?(this.dispatchEvent(bu),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?tn/60*this.autoRotateSpeed*t:tn/60/60*this.autoRotateSpeed}_getZoomScale(t){const e=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*e)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,e){Ae.setFromMatrixColumn(e,0),Ae.multiplyScalar(-t),this._panOffset.add(Ae)}_panUp(t,e){this.screenSpacePanning===!0?Ae.setFromMatrixColumn(e,1):(Ae.setFromMatrixColumn(e,0),Ae.crossVectors(this.object.up,Ae)),Ae.multiplyScalar(t),this._panOffset.add(Ae)}_pan(t,e){const n=this.domElement;if(this.object.isPerspectiveCamera){const i=this.object.position;Ae.copy(i).sub(this.target);let r=Ae.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*r/n.clientHeight,this.object.matrix),this._panUp(2*e*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(e*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,e){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const n=this.domElement.getBoundingClientRect(),i=t-n.left,r=e-n.top,o=n.width,a=n.height;this._mouse.x=i/o*2-1,this._mouse.y=-(r/a)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(tn*this._rotateDelta.x/e.clientHeight),this._rotateUp(tn*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let e=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateUp(tn*this.rotateSpeed/this.domElement.clientHeight):this._pan(0,this.keyPanSpeed),e=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateUp(-tn*this.rotateSpeed/this.domElement.clientHeight):this._pan(0,-this.keyPanSpeed),e=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateLeft(tn*this.rotateSpeed/this.domElement.clientHeight):this._pan(this.keyPanSpeed,0),e=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this._rotateLeft(-tn*this.rotateSpeed/this.domElement.clientHeight):this._pan(-this.keyPanSpeed,0),e=!0;break}e&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._rotateStart.set(n,i)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._panStart.set(n,i)}}_handleTouchStartDolly(t){const e=this._getSecondPointerPosition(t),n=t.pageX-e.x,i=t.pageY-e.y,r=Math.sqrt(n*n+i*i);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{const n=this._getSecondPointerPosition(t),i=.5*(t.pageX+n.x),r=.5*(t.pageY+n.y);this._rotateEnd.set(i,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const e=this.domElement;this._rotateLeft(tn*this._rotateDelta.x/e.clientHeight),this._rotateUp(tn*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{const e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),i=.5*(t.pageY+e.y);this._panEnd.set(n,i)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){const e=this._getSecondPointerPosition(t),n=t.pageX-e.x,i=t.pageY-e.y,r=Math.sqrt(n*n+i*i);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const o=(t.pageX+e.x)*.5,a=(t.pageY+e.y)*.5;this._updateZoomParameters(o,a)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId){this._pointers.splice(e,1);return}}_isTrackingPointer(t){for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId)return!0;return!1}_trackPointer(t){let e=this._pointerPositions[t.pointerId];e===void 0&&(e=new it,this._pointerPositions[t.pointerId]=e),e.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){const e=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[e]}_customWheelEvent(t){const e=t.deltaMode,n={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(e){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}}function DM(s){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(s.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(s)&&(this._addPointer(s),s.pointerType==="touch"?this._onTouchStart(s):this._onMouseDown(s)))}function NM(s){this.enabled!==!1&&(s.pointerType==="touch"?this._onTouchMove(s):this._onMouseMove(s))}function UM(s){switch(this._removePointer(s),this._pointers.length){case 0:this.domElement.releasePointerCapture(s.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(Qd),this.state=ae.NONE;break;case 1:const t=this._pointers[0],e=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:e.x,pageY:e.y});break}}function kM(s){let t;switch(s.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case ls.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(s),this.state=ae.DOLLY;break;case ls.ROTATE:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=ae.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=ae.ROTATE}break;case ls.PAN:if(s.ctrlKey||s.metaKey||s.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(s),this.state=ae.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(s),this.state=ae.PAN}break;default:this.state=ae.NONE}this.state!==ae.NONE&&this.dispatchEvent(bl)}function OM(s){switch(this.state){case ae.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(s);break;case ae.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(s);break;case ae.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(s);break}}function FM(s){this.enabled===!1||this.enableZoom===!1||this.state!==ae.NONE||(s.preventDefault(),this.dispatchEvent(bl),this._handleMouseWheel(this._customWheelEvent(s)),this.dispatchEvent(Qd))}function zM(s){this.enabled===!1||this.enablePan===!1||this._handleKeyDown(s)}function BM(s){switch(this._trackPointer(s),this._pointers.length){case 1:switch(this.touches.ONE){case rs.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(s),this.state=ae.TOUCH_ROTATE;break;case rs.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(s),this.state=ae.TOUCH_PAN;break;default:this.state=ae.NONE}break;case 2:switch(this.touches.TWO){case rs.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(s),this.state=ae.TOUCH_DOLLY_PAN;break;case rs.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(s),this.state=ae.TOUCH_DOLLY_ROTATE;break;default:this.state=ae.NONE}break;default:this.state=ae.NONE}this.state!==ae.NONE&&this.dispatchEvent(bl)}function HM(s){switch(this._trackPointer(s),this.state){case ae.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(s),this.update();break;case ae.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(s),this.update();break;case ae.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(s),this.update();break;case ae.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(s),this.update();break;default:this.state=ae.NONE}}function GM(s){this.enabled!==!1&&s.preventDefault()}function VM(s){s.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function WM(s){s.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}const Ei=new ps,He=new E,ri=new E,ge=new Te,wu={X:new E(1,0,0),Y:new E(0,1,0),Z:new E(0,0,1)},Va={type:"change"},Eu={type:"mouseDown",mode:null},Tu={type:"mouseUp",mode:null},Au={type:"objectChange"};class XM extends Ld{constructor(t,e=null){super(void 0,e);const n=new ZM(this);this._root=n;const i=new JM;this._gizmo=i,n.add(i);const r=new QM;this._plane=r,n.add(r);const o=this;function a(v,M){let C=M;Object.defineProperty(o,v,{get:function(){return C!==void 0?C:M},set:function(R){C!==R&&(C=R,r[v]=R,i[v]=R,o.dispatchEvent({type:v+"-changed",value:R}),o.dispatchEvent(Va))}}),o[v]=M,r[v]=M,i[v]=M}a("camera",t),a("object",void 0),a("enabled",!0),a("axis",null),a("mode","translate"),a("translationSnap",null),a("rotationSnap",null),a("scaleSnap",null),a("space","world"),a("size",1),a("dragging",!1),a("showX",!0),a("showY",!0),a("showZ",!0);const c=new E,l=new E,h=new Te,d=new Te,u=new E,f=new Te,p=new E,_=new E,m=new E,g=0,x=new E;a("worldPosition",c),a("worldPositionStart",l),a("worldQuaternion",h),a("worldQuaternionStart",d),a("cameraPosition",u),a("cameraQuaternion",f),a("pointStart",p),a("pointEnd",_),a("rotationAxis",m),a("rotationAngle",g),a("eye",x),this._offset=new E,this._startNorm=new E,this._endNorm=new E,this._cameraScale=new E,this._parentPosition=new E,this._parentQuaternion=new Te,this._parentQuaternionInv=new Te,this._parentScale=new E,this._worldScaleStart=new E,this._worldQuaternionInv=new Te,this._worldScale=new E,this._positionStart=new E,this._quaternionStart=new Te,this._scaleStart=new E,this._getPointer=jM.bind(this),this._onPointerDown=YM.bind(this),this._onPointerHover=$M.bind(this),this._onPointerMove=qM.bind(this),this._onPointerUp=KM.bind(this),e!==null&&this.connect()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointermove",this._onPointerHover),this.domElement.addEventListener("pointerup",this._onPointerUp),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerHover),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.style.touchAction="auto"}getHelper(){return this._root}pointerHover(t){if(this.object===void 0||this.dragging===!0)return;t!==null&&Ei.setFromCamera(t,this.camera);const e=Wa(this._gizmo.picker[this.mode],Ei);e?this.axis=e.object.name:this.axis=null}pointerDown(t){if(!(this.object===void 0||this.dragging===!0||t!=null&&t.button!==0)&&this.axis!==null){t!==null&&Ei.setFromCamera(t,this.camera);const e=Wa(this._plane,Ei,!0);e&&(this.object.updateMatrixWorld(),this.object.parent.updateMatrixWorld(),this._positionStart.copy(this.object.position),this._quaternionStart.copy(this.object.quaternion),this._scaleStart.copy(this.object.scale),this.object.matrixWorld.decompose(this.worldPositionStart,this.worldQuaternionStart,this._worldScaleStart),this.pointStart.copy(e.point).sub(this.worldPositionStart)),this.dragging=!0,Eu.mode=this.mode,this.dispatchEvent(Eu)}}pointerMove(t){const e=this.axis,n=this.mode,i=this.object;let r=this.space;if(n==="scale"?r="local":(e==="E"||e==="XYZE"||e==="XYZ")&&(r="world"),i===void 0||e===null||this.dragging===!1||t!==null&&t.button!==-1)return;t!==null&&Ei.setFromCamera(t,this.camera);const o=Wa(this._plane,Ei,!0);if(o){if(this.pointEnd.copy(o.point).sub(this.worldPositionStart),n==="translate")this._offset.copy(this.pointEnd).sub(this.pointStart),r==="local"&&e!=="XYZ"&&this._offset.applyQuaternion(this._worldQuaternionInv),e.indexOf("X")===-1&&(this._offset.x=0),e.indexOf("Y")===-1&&(this._offset.y=0),e.indexOf("Z")===-1&&(this._offset.z=0),r==="local"&&e!=="XYZ"?this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale):this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale),i.position.copy(this._offset).add(this._positionStart),this.translationSnap&&(r==="local"&&(i.position.applyQuaternion(ge.copy(this._quaternionStart).invert()),e.search("X")!==-1&&(i.position.x=Math.round(i.position.x/this.translationSnap)*this.translationSnap),e.search("Y")!==-1&&(i.position.y=Math.round(i.position.y/this.translationSnap)*this.translationSnap),e.search("Z")!==-1&&(i.position.z=Math.round(i.position.z/this.translationSnap)*this.translationSnap),i.position.applyQuaternion(this._quaternionStart)),r==="world"&&(i.parent&&i.position.add(He.setFromMatrixPosition(i.parent.matrixWorld)),e.search("X")!==-1&&(i.position.x=Math.round(i.position.x/this.translationSnap)*this.translationSnap),e.search("Y")!==-1&&(i.position.y=Math.round(i.position.y/this.translationSnap)*this.translationSnap),e.search("Z")!==-1&&(i.position.z=Math.round(i.position.z/this.translationSnap)*this.translationSnap),i.parent&&i.position.sub(He.setFromMatrixPosition(i.parent.matrixWorld))));else if(n==="scale"){if(e.search("XYZ")!==-1){let a=this.pointEnd.length()/this.pointStart.length();this.pointEnd.dot(this.pointStart)<0&&(a*=-1),ri.set(a,a,a)}else He.copy(this.pointStart),ri.copy(this.pointEnd),He.applyQuaternion(this._worldQuaternionInv),ri.applyQuaternion(this._worldQuaternionInv),ri.divide(He),e.search("X")===-1&&(ri.x=1),e.search("Y")===-1&&(ri.y=1),e.search("Z")===-1&&(ri.z=1);i.scale.copy(this._scaleStart).multiply(ri),this.scaleSnap&&(e.search("X")!==-1&&(i.scale.x=Math.round(i.scale.x/this.scaleSnap)*this.scaleSnap||this.scaleSnap),e.search("Y")!==-1&&(i.scale.y=Math.round(i.scale.y/this.scaleSnap)*this.scaleSnap||this.scaleSnap),e.search("Z")!==-1&&(i.scale.z=Math.round(i.scale.z/this.scaleSnap)*this.scaleSnap||this.scaleSnap))}else if(n==="rotate"){this._offset.copy(this.pointEnd).sub(this.pointStart);const a=20/this.worldPosition.distanceTo(He.setFromMatrixPosition(this.camera.matrixWorld));let c=!1;e==="XYZE"?(this.rotationAxis.copy(this._offset).cross(this.eye).normalize(),this.rotationAngle=this._offset.dot(He.copy(this.rotationAxis).cross(this.eye))*a):(e==="X"||e==="Y"||e==="Z")&&(this.rotationAxis.copy(wu[e]),He.copy(wu[e]),r==="local"&&He.applyQuaternion(this.worldQuaternion),He.cross(this.eye),He.length()===0?c=!0:this.rotationAngle=this._offset.dot(He.normalize())*a),(e==="E"||c)&&(this.rotationAxis.copy(this.eye),this.rotationAngle=this.pointEnd.angleTo(this.pointStart),this._startNorm.copy(this.pointStart).normalize(),this._endNorm.copy(this.pointEnd).normalize(),this.rotationAngle*=this._endNorm.cross(this._startNorm).dot(this.eye)<0?1:-1),this.rotationSnap&&(this.rotationAngle=Math.round(this.rotationAngle/this.rotationSnap)*this.rotationSnap),r==="local"&&e!=="E"&&e!=="XYZE"?(i.quaternion.copy(this._quaternionStart),i.quaternion.multiply(ge.setFromAxisAngle(this.rotationAxis,this.rotationAngle)).normalize()):(this.rotationAxis.applyQuaternion(this._parentQuaternionInv),i.quaternion.copy(ge.setFromAxisAngle(this.rotationAxis,this.rotationAngle)),i.quaternion.multiply(this._quaternionStart).normalize())}this.dispatchEvent(Va),this.dispatchEvent(Au)}}pointerUp(t){t!==null&&t.button!==0||(this.dragging&&this.axis!==null&&(Tu.mode=this.mode,this.dispatchEvent(Tu)),this.dragging=!1,this.axis=null)}dispose(){this.disconnect(),this.traverse(function(t){t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}attach(t){return this.object=t,this._root.visible=!0,this}detach(){return this.object=void 0,this.axis=null,this._root.visible=!1,this}reset(){this.enabled&&this.dragging&&(this.object.position.copy(this._positionStart),this.object.quaternion.copy(this._quaternionStart),this.object.scale.copy(this._scaleStart),this.dispatchEvent(Va),this.dispatchEvent(Au),this.pointStart.copy(this.pointEnd))}getRaycaster(){return Ei}getMode(){return this.mode}setMode(t){this.mode=t}setTranslationSnap(t){this.translationSnap=t}setRotationSnap(t){this.rotationSnap=t}setScaleSnap(t){this.scaleSnap=t}setSize(t){this.size=t}setSpace(t){this.space=t}}function jM(s){if(this.domElement.ownerDocument.pointerLockElement)return{x:0,y:0,button:s.button};{const t=this.domElement.getBoundingClientRect();return{x:(s.clientX-t.left)/t.width*2-1,y:-(s.clientY-t.top)/t.height*2+1,button:s.button}}}function $M(s){if(this.enabled)switch(s.pointerType){case"mouse":case"pen":this.pointerHover(this._getPointer(s));break}}function YM(s){this.enabled&&(document.pointerLockElement||this.domElement.setPointerCapture(s.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.pointerHover(this._getPointer(s)),this.pointerDown(this._getPointer(s)))}function qM(s){this.enabled&&this.pointerMove(this._getPointer(s))}function KM(s){this.enabled&&(this.domElement.releasePointerCapture(s.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.pointerUp(this._getPointer(s)))}function Wa(s,t,e){const n=t.intersectObject(s,!0);for(let i=0;i<n.length;i++)if(n[i].object.visible||e)return n[i];return!1}const oo=new En,ce=new E(0,1,0),Ru=new E(0,0,0),Cu=new Dt,ao=new Te,wo=new Te,An=new E,Pu=new Dt,er=new E(1,0,0),Ri=new E(0,1,0),nr=new E(0,0,1),co=new E,qs=new E,Ks=new E;class ZM extends le{constructor(t){super(),this.isTransformControlsRoot=!0,this.controls=t,this.visible=!1}updateMatrixWorld(t){const e=this.controls;e.object!==void 0&&(e.object.updateMatrixWorld(),e.object.parent===null?console.error("TransformControls: The attached 3D object must be a part of the scene graph."):e.object.parent.matrixWorld.decompose(e._parentPosition,e._parentQuaternion,e._parentScale),e.object.matrixWorld.decompose(e.worldPosition,e.worldQuaternion,e._worldScale),e._parentQuaternionInv.copy(e._parentQuaternion).invert(),e._worldQuaternionInv.copy(e.worldQuaternion).invert()),e.camera.updateMatrixWorld(),e.camera.matrixWorld.decompose(e.cameraPosition,e.cameraQuaternion,e._cameraScale),e.camera.isOrthographicCamera?e.camera.getWorldDirection(e.eye).negate():e.eye.copy(e.cameraPosition).sub(e.worldPosition).normalize(),super.updateMatrixWorld(t)}}class JM extends le{constructor(){super(),this.isTransformControlsGizmo=!0,this.type="TransformControlsGizmo";const t=new Ve({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),e=new zo({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),n=t.clone();n.opacity=.15;const i=e.clone();i.opacity=.5;const r=t.clone();r.color.setHex(16711680);const o=t.clone();o.color.setHex(65280);const a=t.clone();a.color.setHex(255);const c=t.clone();c.color.setHex(16711680),c.opacity=.5;const l=t.clone();l.color.setHex(65280),l.opacity=.5;const h=t.clone();h.color.setHex(255),h.opacity=.5;const d=t.clone();d.opacity=.25;const u=t.clone();u.color.setHex(16776960),u.opacity=.25,t.clone().color.setHex(16776960);const p=t.clone();p.color.setHex(7895160);const _=new $t(0,.04,.1,12);_.translate(0,.05,0);const m=new Ft(.08,.08,.08);m.translate(0,.04,0);const g=new Me;g.setAttribute("position",new Yt([0,0,0,1,0,0],3));const x=new $t(.0075,.0075,.5,3);x.translate(0,.25,0);function v(j,H){const K=new ln(j,.0075,3,64,H*Math.PI*2);return K.rotateY(Math.PI/2),K.rotateX(Math.PI/2),K}function M(){const j=new Me;return j.setAttribute("position",new Yt([0,0,0,1,1,1],3)),j}const C={X:[[new nt(_,r),[.5,0,0],[0,0,-Math.PI/2]],[new nt(_,r),[-.5,0,0],[0,0,Math.PI/2]],[new nt(x,r),[0,0,0],[0,0,-Math.PI/2]]],Y:[[new nt(_,o),[0,.5,0]],[new nt(_,o),[0,-.5,0],[Math.PI,0,0]],[new nt(x,o)]],Z:[[new nt(_,a),[0,0,.5],[Math.PI/2,0,0]],[new nt(_,a),[0,0,-.5],[-Math.PI/2,0,0]],[new nt(x,a),null,[Math.PI/2,0,0]]],XYZ:[[new nt(new Ii(.1,0),d.clone()),[0,0,0]]],XY:[[new nt(new Ft(.15,.15,.01),h.clone()),[.15,.15,0]]],YZ:[[new nt(new Ft(.15,.15,.01),c.clone()),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new nt(new Ft(.15,.15,.01),l.clone()),[.15,0,.15],[-Math.PI/2,0,0]]]},R={X:[[new nt(new $t(.2,0,.6,4),n),[.3,0,0],[0,0,-Math.PI/2]],[new nt(new $t(.2,0,.6,4),n),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new nt(new $t(.2,0,.6,4),n),[0,.3,0]],[new nt(new $t(.2,0,.6,4),n),[0,-.3,0],[0,0,Math.PI]]],Z:[[new nt(new $t(.2,0,.6,4),n),[0,0,.3],[Math.PI/2,0,0]],[new nt(new $t(.2,0,.6,4),n),[0,0,-.3],[-Math.PI/2,0,0]]],XYZ:[[new nt(new Ii(.2,0),n)]],XY:[[new nt(new Ft(.2,.2,.01),n),[.15,.15,0]]],YZ:[[new nt(new Ft(.2,.2,.01),n),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new nt(new Ft(.2,.2,.01),n),[.15,0,.15],[-Math.PI/2,0,0]]]},T={START:[[new nt(new Ii(.01,2),i),null,null,null,"helper"]],END:[[new nt(new Ii(.01,2),i),null,null,null,"helper"]],DELTA:[[new fn(M(),i),null,null,null,"helper"]],X:[[new fn(g,i.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new fn(g,i.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new fn(g,i.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]},L={XYZE:[[new nt(v(.5,1),p),null,[0,Math.PI/2,0]]],X:[[new nt(v(.5,.5),r)]],Y:[[new nt(v(.5,.5),o),null,[0,0,-Math.PI/2]]],Z:[[new nt(v(.5,.5),a),null,[0,Math.PI/2,0]]],E:[[new nt(v(.75,1),u),null,[0,Math.PI/2,0]]]},V={AXIS:[[new fn(g,i.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]]},y={XYZE:[[new nt(new Ue(.25,10,8),n)]],X:[[new nt(new ln(.5,.1,4,24),n),[0,0,0],[0,-Math.PI/2,-Math.PI/2]]],Y:[[new nt(new ln(.5,.1,4,24),n),[0,0,0],[Math.PI/2,0,0]]],Z:[[new nt(new ln(.5,.1,4,24),n),[0,0,0],[0,0,-Math.PI/2]]],E:[[new nt(new ln(.75,.1,2,24),n)]]},w={X:[[new nt(m,r),[.5,0,0],[0,0,-Math.PI/2]],[new nt(x,r),[0,0,0],[0,0,-Math.PI/2]],[new nt(m,r),[-.5,0,0],[0,0,Math.PI/2]]],Y:[[new nt(m,o),[0,.5,0]],[new nt(x,o)],[new nt(m,o),[0,-.5,0],[0,0,Math.PI]]],Z:[[new nt(m,a),[0,0,.5],[Math.PI/2,0,0]],[new nt(x,a),[0,0,0],[Math.PI/2,0,0]],[new nt(m,a),[0,0,-.5],[-Math.PI/2,0,0]]],XY:[[new nt(new Ft(.15,.15,.01),h),[.15,.15,0]]],YZ:[[new nt(new Ft(.15,.15,.01),c),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new nt(new Ft(.15,.15,.01),l),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new nt(new Ft(.1,.1,.1),d.clone())]]},F={X:[[new nt(new $t(.2,0,.6,4),n),[.3,0,0],[0,0,-Math.PI/2]],[new nt(new $t(.2,0,.6,4),n),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new nt(new $t(.2,0,.6,4),n),[0,.3,0]],[new nt(new $t(.2,0,.6,4),n),[0,-.3,0],[0,0,Math.PI]]],Z:[[new nt(new $t(.2,0,.6,4),n),[0,0,.3],[Math.PI/2,0,0]],[new nt(new $t(.2,0,.6,4),n),[0,0,-.3],[-Math.PI/2,0,0]]],XY:[[new nt(new Ft(.2,.2,.01),n),[.15,.15,0]]],YZ:[[new nt(new Ft(.2,.2,.01),n),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new nt(new Ft(.2,.2,.01),n),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new nt(new Ft(.2,.2,.2),n),[0,0,0]]]},B={X:[[new fn(g,i.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new fn(g,i.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new fn(g,i.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]};function W(j){const H=new le;for(const K in j)for(let G=j[K].length;G--;){const st=j[K][G][0].clone(),at=j[K][G][1],mt=j[K][G][2],Ht=j[K][G][3],Jt=j[K][G][4];st.name=K,st.tag=Jt,at&&st.position.set(at[0],at[1],at[2]),mt&&st.rotation.set(mt[0],mt[1],mt[2]),Ht&&st.scale.set(Ht[0],Ht[1],Ht[2]),st.updateMatrix();const $=st.geometry.clone();$.applyMatrix4(st.matrix),st.geometry=$,st.renderOrder=1/0,st.position.set(0,0,0),st.rotation.set(0,0,0),st.scale.set(1,1,1),H.add(st)}return H}this.gizmo={},this.picker={},this.helper={},this.add(this.gizmo.translate=W(C)),this.add(this.gizmo.rotate=W(L)),this.add(this.gizmo.scale=W(w)),this.add(this.picker.translate=W(R)),this.add(this.picker.rotate=W(y)),this.add(this.picker.scale=W(F)),this.add(this.helper.translate=W(T)),this.add(this.helper.rotate=W(V)),this.add(this.helper.scale=W(B)),this.picker.translate.visible=!1,this.picker.rotate.visible=!1,this.picker.scale.visible=!1}updateMatrixWorld(t){const n=(this.mode==="scale"?"local":this.space)==="local"?this.worldQuaternion:wo;this.gizmo.translate.visible=this.mode==="translate",this.gizmo.rotate.visible=this.mode==="rotate",this.gizmo.scale.visible=this.mode==="scale",this.helper.translate.visible=this.mode==="translate",this.helper.rotate.visible=this.mode==="rotate",this.helper.scale.visible=this.mode==="scale";let i=[];i=i.concat(this.picker[this.mode].children),i=i.concat(this.gizmo[this.mode].children),i=i.concat(this.helper[this.mode].children);for(let r=0;r<i.length;r++){const o=i[r];o.visible=!0,o.rotation.set(0,0,0),o.position.copy(this.worldPosition);let a;if(this.camera.isOrthographicCamera?a=(this.camera.top-this.camera.bottom)/this.camera.zoom:a=this.worldPosition.distanceTo(this.cameraPosition)*Math.min(1.9*Math.tan(Math.PI*this.camera.fov/360)/this.camera.zoom,7),o.scale.set(1,1,1).multiplyScalar(a*this.size/4),o.tag==="helper"){o.visible=!1,o.name==="AXIS"?(o.visible=!!this.axis,this.axis==="X"&&(ge.setFromEuler(oo.set(0,0,0)),o.quaternion.copy(n).multiply(ge),Math.abs(ce.copy(er).applyQuaternion(n).dot(this.eye))>.9&&(o.visible=!1)),this.axis==="Y"&&(ge.setFromEuler(oo.set(0,0,Math.PI/2)),o.quaternion.copy(n).multiply(ge),Math.abs(ce.copy(Ri).applyQuaternion(n).dot(this.eye))>.9&&(o.visible=!1)),this.axis==="Z"&&(ge.setFromEuler(oo.set(0,Math.PI/2,0)),o.quaternion.copy(n).multiply(ge),Math.abs(ce.copy(nr).applyQuaternion(n).dot(this.eye))>.9&&(o.visible=!1)),this.axis==="XYZE"&&(ge.setFromEuler(oo.set(0,Math.PI/2,0)),ce.copy(this.rotationAxis),o.quaternion.setFromRotationMatrix(Cu.lookAt(Ru,ce,Ri)),o.quaternion.multiply(ge),o.visible=this.dragging),this.axis==="E"&&(o.visible=!1)):o.name==="START"?(o.position.copy(this.worldPositionStart),o.visible=this.dragging):o.name==="END"?(o.position.copy(this.worldPosition),o.visible=this.dragging):o.name==="DELTA"?(o.position.copy(this.worldPositionStart),o.quaternion.copy(this.worldQuaternionStart),He.set(1e-10,1e-10,1e-10).add(this.worldPositionStart).sub(this.worldPosition).multiplyScalar(-1),He.applyQuaternion(this.worldQuaternionStart.clone().invert()),o.scale.copy(He),o.visible=this.dragging):(o.quaternion.copy(n),this.dragging?o.position.copy(this.worldPositionStart):o.position.copy(this.worldPosition),this.axis&&(o.visible=this.axis.search(o.name)!==-1));continue}o.quaternion.copy(n),this.mode==="translate"||this.mode==="scale"?(o.name==="X"&&Math.abs(ce.copy(er).applyQuaternion(n).dot(this.eye))>.99&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="Y"&&Math.abs(ce.copy(Ri).applyQuaternion(n).dot(this.eye))>.99&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="Z"&&Math.abs(ce.copy(nr).applyQuaternion(n).dot(this.eye))>.99&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="XY"&&Math.abs(ce.copy(nr).applyQuaternion(n).dot(this.eye))<.2&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="YZ"&&Math.abs(ce.copy(er).applyQuaternion(n).dot(this.eye))<.2&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1),o.name==="XZ"&&Math.abs(ce.copy(Ri).applyQuaternion(n).dot(this.eye))<.2&&(o.scale.set(1e-10,1e-10,1e-10),o.visible=!1)):this.mode==="rotate"&&(ao.copy(n),ce.copy(this.eye).applyQuaternion(ge.copy(n).invert()),o.name.search("E")!==-1&&o.quaternion.setFromRotationMatrix(Cu.lookAt(this.eye,Ru,Ri)),o.name==="X"&&(ge.setFromAxisAngle(er,Math.atan2(-ce.y,ce.z)),ge.multiplyQuaternions(ao,ge),o.quaternion.copy(ge)),o.name==="Y"&&(ge.setFromAxisAngle(Ri,Math.atan2(ce.x,ce.z)),ge.multiplyQuaternions(ao,ge),o.quaternion.copy(ge)),o.name==="Z"&&(ge.setFromAxisAngle(nr,Math.atan2(ce.y,ce.x)),ge.multiplyQuaternions(ao,ge),o.quaternion.copy(ge))),o.visible=o.visible&&(o.name.indexOf("X")===-1||this.showX),o.visible=o.visible&&(o.name.indexOf("Y")===-1||this.showY),o.visible=o.visible&&(o.name.indexOf("Z")===-1||this.showZ),o.visible=o.visible&&(o.name.indexOf("E")===-1||this.showX&&this.showY&&this.showZ),o.material._color=o.material._color||o.material.color.clone(),o.material._opacity=o.material._opacity||o.material.opacity,o.material.color.copy(o.material._color),o.material.opacity=o.material._opacity,this.enabled&&this.axis&&(o.name===this.axis||this.axis.split("").some(function(c){return o.name===c}))&&(o.material.color.setHex(16776960),o.material.opacity=1)}super.updateMatrixWorld(t)}}class QM extends nt{constructor(){super(new Ds(1e5,1e5,2,2),new Ve({visible:!1,wireframe:!0,side:Ye,transparent:!0,opacity:.1,toneMapped:!1})),this.isTransformControlsPlane=!0,this.type="TransformControlsPlane"}updateMatrixWorld(t){let e=this.space;switch(this.position.copy(this.worldPosition),this.mode==="scale"&&(e="local"),co.copy(er).applyQuaternion(e==="local"?this.worldQuaternion:wo),qs.copy(Ri).applyQuaternion(e==="local"?this.worldQuaternion:wo),Ks.copy(nr).applyQuaternion(e==="local"?this.worldQuaternion:wo),ce.copy(qs),this.mode){case"translate":case"scale":switch(this.axis){case"X":ce.copy(this.eye).cross(co),An.copy(co).cross(ce);break;case"Y":ce.copy(this.eye).cross(qs),An.copy(qs).cross(ce);break;case"Z":ce.copy(this.eye).cross(Ks),An.copy(Ks).cross(ce);break;case"XY":An.copy(Ks);break;case"YZ":An.copy(co);break;case"XZ":ce.copy(Ks),An.copy(qs);break;case"XYZ":case"E":An.set(0,0,0);break}break;case"rotate":default:An.set(0,0,0)}An.length()===0?this.quaternion.copy(this.cameraQuaternion):(Pu.lookAt(He.set(0,0,0),An,ce),this.quaternion.setFromRotationMatrix(Pu)),super.updateMatrixWorld(t)}}async function tb(s,t=512){const e=await new Promise((d,u)=>{const f=new Image;f.onload=()=>d(f),f.onerror=()=>u(new Error("bad image")),f.src=s}),n=document.createElement("canvas");n.width=n.height=t;const i=n.getContext("2d"),r=Math.min(e.width,e.height);i.drawImage(e,(e.width-r)/2,(e.height-r)/2,r,r,0,0,t,t);const o=i.getImageData(0,0,t,t),a=i.createImageData(t,t),c=t/2,l=t*.22,h=d=>Math.min(1,d/l);for(let d=0;d<t;d++){const u=h(Math.min(d,t-1-d)),f=(d+c)%t;for(let p=0;p<t;p++){const m=h(Math.min(p,t-1-p))*u,g=m*m*(3-2*m),x=(p+c)%t,v=(d*t+p)*4,M=(f*t+x)*4;for(let C=0;C<3;C++)a.data[v+C]=o.data[v+C]*g+o.data[M+C]*(1-g);a.data[v+3]=255}}return i.putImageData(a,0,0),n.toDataURL("image/webp",.88)}async function eb(s,t){let e;try{e=await Tn("/api/fv/stream",{method:"POST",body:JSON.stringify(s)})}catch{throw new Error("Can't reach the game maker right now")}if(!e.ok||!e.body){const a=await e.json().catch(()=>({}));throw new Error((a==null?void 0:a.error)??`Game maker error ${e.status}`)}const n=e.body.getReader(),i=new TextDecoder;let r="",o="";for(;;){const{value:a,done:c}=await n.read();if(c)break;r+=i.decode(a,{stream:!0});let l;for(;(l=r.indexOf(`
`))>=0;){const h=r.slice(0,l).trim();if(r=r.slice(l+1),!h)continue;let d;try{d=JSON.parse(h)}catch{continue}if(d.t==="error"){o=d.error;continue}d.t==="done"&&(d={...d,spec:_e(d.spec).spec}),t(d)}}if(o)throw new Error(o)}class nb{constructor(t,e){U(this,"root",new ue);U(this,"fly",Vo());U(this,"halo");U(this,"target",new E(0,4,0));U(this,"vel",new E);U(this,"t",0);U(this,"thinking",!1);U(this,"busy",!1);U(this,"bubble");U(this,"bar");U(this,"input");U(this,"chips");U(this,"bubbleTimer",0);U(this,"rec",null);U(this,"listening",!1);this.view=t,this.opts=e,this.fly.root.scale.setScalar(1.6),this.root.add(this.fly.root),this.halo=new nt(new ln(.75,.05,6,24),yt("#5ef2cc",{emissive:"#5ef2cc",ei:1.4})),this.halo.rotation.x=Math.PI/2,this.halo.position.y=1.75,this.root.add(this.halo),this.root.userData.builder=!0,this.bubble=document.createElement("div"),this.bubble.className="fv-bubble",this.bubble.hidden=!0,t.appendChild(this.bubble);const n=window.SpeechRecognition||window.webkitSpeechRecognition;this.bar=document.createElement("form"),this.bar.className="fv-talk",this.bar.innerHTML=`
      <div class="fv-chips2"></div>
      <div class="fv-talk-row">
        <span class="fv-talk-fly" aria-hidden="true">🪰</span>
        <input type="text" maxlength="400" placeholder="Tell the builder fly what to make or change… (T)" aria-label="Tell the builder fly">
        ${n?'<button type="button" class="fv-mic" title="Hold to talk" aria-label="Talk">🎤</button>':""}
        <button type="submit" class="fv-primary fv-send" aria-label="Send">↑</button>
      </div>`,t.appendChild(this.bar),this.input=this.bar.querySelector("input"),this.chips=this.bar.querySelector(".fv-chips2"),this.bar.onsubmit=r=>{r.preventDefault();const o=this.input.value.trim();o.length<2||this.busy||(this.input.value="",this.opts.onAsk(o))};const i=this.bar.querySelector(".fv-mic");i&&n&&this.wireMic(i,n)}wireMic(t,e){const n=()=>{if(!(this.busy||this.listening))try{const r=new e;r.lang=document.documentElement.lang||"en-US",r.interimResults=!0,r.continuous=!1;let o="";r.onresult=a=>{let c="";for(let l=0;l<a.results.length;l++)c+=a.results[l][0].transcript,a.results[l].isFinal&&(o=c);this.input.value=c},r.onend=()=>{this.listening=!1,t.classList.remove("on");const a=(o||this.input.value).trim();a.length>=2&&!this.busy&&(this.input.value="",this.opts.onAsk(a))},r.onerror=()=>{this.listening=!1,t.classList.remove("on")},this.rec=r,this.listening=!0,t.classList.add("on"),r.start(),this.say("I'm listening…",0)}catch{}},i=()=>{var r;this.listening&&((r=this.rec)==null||r.stop())};t.addEventListener("pointerdown",r=>{r.preventDefault(),n()}),t.addEventListener("pointerup",i),t.addEventListener("pointerleave",i)}focus(){this.input.focus()}setChips(t){this.chips.innerHTML=t.map(e=>`<button type="button" class="fv-chip${e.strong?" strong":""}" data-chip="${Et(e.id)}">${Et(e.label)}</button>`).join(""),this.chips.querySelectorAll("[data-chip]").forEach(e=>e.onclick=()=>{this.busy||this.opts.onChip(e.dataset.chip)})}setBusy(t){this.busy=t,this.bar.classList.toggle("busy",t),this.input.disabled=t,this.input.placeholder=t?"Building…":"Tell the builder fly what to make or change… (T)",t||(this.thinking=!1)}say(t,e=4500){this.bubble.innerHTML=Et(t),this.bubble.hidden=!1,this.bubbleTimer=e?e/1e3:1/0}think(t){this.thinking=t}flyTo(t,e=2.2){const n=Array.isArray(t)?new E(t[0],t[1],t[2]):t.clone();this.target.set(n.x,n.y+e,n.z)}place(t){this.root.position.copy(t),this.target.copy(t)}update(t,e,n){this.t+=t;const i=this.target.clone().sub(this.root.position);this.vel.addScaledVector(i,t*18).multiplyScalar(Math.pow(.02,t)),this.root.position.addScaledVector(this.vel,t);const r=this.vel.length();if(r>.3&&(this.root.rotation.y+=(Math.atan2(this.vel.x,this.vel.z)-this.root.rotation.y)*Math.min(1,t*6)),this.fly.root.position.y=Math.sin(this.t*2.4)*.12,this.thinking?this.fly.root.rotation.y+=t*5:this.fly.root.rotation.y*=Math.pow(.05,t),this.halo.rotation.z+=t*(this.thinking?6:1.2),this.halo.material.emissiveIntensity=this.thinking?1.2+Math.sin(this.t*12)*.6:1.2,this.fly.anim(this.t,{air:!0,glide:!1,speed:r}),this.bubbleTimer-=t,this.bubbleTimer<=0&&(this.bubble.hidden=!0),!this.bubble.hidden){const o=this.root.position.clone().add(new E(0,2.4,0)).project(e),a=o.z>1,c=(o.x*.5+.5)*n.w,l=(-o.y*.5+.5)*n.h;this.bubble.style.transform=`translate(${Math.min(n.w-120,Math.max(120,c))}px, ${Math.min(n.h-150,Math.max(70,l))}px) translate(-50%, -100%)`,this.bubble.style.opacity=a?"0":"1"}}dispose(){var t;this.bubble.remove(),this.bar.remove();try{(t=this.rec)==null||t.abort()}catch{}}}function ib(s,t){const e={parkour:["Make the jumps harder","Add a moving platform","Add a secret gem route","Turn it into night"],race:["Add speed pads","Add a shortcut","Make the track longer","Add walls to dodge"],coins:["Hide more coins","Add patrolling beetles","Add a high coin tower","Make it a candy land"],survive:["More chasing beetles","Add falling platforms","Add lava pools","Make it shorter and harder"],maze:["Add keys and doors","Make the maze bigger","Hide gems in dead ends","Make it spooky"],shooter:["Add more targets","Add a turret tower","Add cover walls","Switch to first person"],zombies:["Add another nest","Add more hearts","One more wave","Add cover blocks"],hill:["More beetles on the hill","Add bounce pads","Make the hill higher","Add lava around it"]},n=(e[s]??e.parkour).map(r=>({id:"say:"+r,label:r}));return[...t?[{id:"fix",label:"🔧 Fix it",strong:!0}]:[],{id:"polish",label:"✨ Polish it",strong:!t},...n,{id:"back",label:"↶ Put it back"}]}async function tf(s,t,e=480,n=270){const i=new yl(t,{lowShadows:!0});await Promise.race([i.ready(),new Promise(p=>setTimeout(p,4e3))]);const r=Io(t),o=(r.x0+r.x1)/2,a=(r.z0+r.z1)/2,c=(r.y0+r.y1)/2,l=Math.max(r.x1-r.x0,r.z1-r.z0,8),h=new Oe(50,e/n,.1,900);h.position.set(o-l*.42,c+l*.42,a-l*.58),h.lookAt(o,c,a),i.fly.root.scale.setScalar(1.6),i.animate(.5),i.placeShadow(t.spawn);const d=new it;s.getSize(d);const u=s.getPixelRatio();s.setPixelRatio(1),s.setSize(e,n,!1),s.render(i.scene,h);const f=s.domElement.toDataURL("image/jpeg",.72);return s.setPixelRatio(u),s.setSize(d.x||1,d.y||1,!1),f}const oi="__spawn",an="::to",Xa={model:"Model",block:"Block",ramp:"Ramp",platform:"Platform",wall:"Wall",coin:"Coin",gem:"Gem",spike:"Spikes",lava:"Lava",bounce:"Bounce pad",speed:"Speed pad",checkpoint:"Checkpoint",flag:"Flag",enemy:"Beetle",target:"Target",turret:"Turret",spawner:"Zombie nest",heart:"Heart",key:"Key",door:"Door",zone:"Hill zone",tree:"Tree",rock:"Rock",flower:"Flower",mushroom:"Mushroom"},Lu={model:"🧱",block:"▦",ramp:"◢",platform:"▬",wall:"▮",coin:"🪙",gem:"💎",spike:"▲",lava:"🔥",bounce:"⤒",speed:"»",checkpoint:"⚑",flag:"🏁",enemy:"🪲",target:"🎯",turret:"🗼",spawner:"🧟",heart:"❤️",key:"🔑",door:"🚪",zone:"⛳",tree:"🌳",rock:"🪨",flower:"🌼",mushroom:"🍄"};class sb{constructor(t,e,n,i){U(this,"spec");U(this,"world");U(this,"cam");U(this,"orbit");U(this,"gizmo");U(this,"sel",null);U(this,"undo",[]);U(this,"redo",[]);U(this,"view");U(this,"panel");U(this,"extras",new ue);U(this,"alive",!0);U(this,"dirtyCover",!0);U(this,"last",performance.now());U(this,"onResize",()=>this.resize());U(this,"onKey",t=>this.key(t));U(this,"builder");U(this,"building",!1);U(this,"pops",[]);U(this,"frameT",0);U(this,"tab","ai");U(this,"modelQuery","");if(this.renderer=t,this.host=e,this.game=n,this.opts=i,this.spec=ms(n.spec),e.innerHTML=`
      <div class="fv-edit">
        <div class="fv-view"></div>
        <aside class="fv-side"></aside>
      </div>`,this.view=e.querySelector(".fv-view"),this.panel=e.querySelector(".fv-side"),this.view.appendChild(t.domElement),this.world=new yl(this.spec,{lowShadows:!0}),this.world.scene.add(this.extras),this.cam=new Oe(55,1,.1,900),this.orbit=new IM(this.cam,t.domElement),this.orbit.enableDamping=!0,this.orbit.maxPolarAngle=Math.PI*.49,this.gizmo=new XM(this.cam,t.domElement),this.gizmo.setTranslationSnap(.25),this.gizmo.setSize(di()?1.3:.9),this.world.scene.add(this.gizmo.getHelper()),this.gizmo.addEventListener("dragging-changed",r=>{this.orbit.enabled=!r.value,r.value||this.dropped()}),this.frameAll(),this.builder=new nb(this.view,{onAsk:r=>void this.ask(this.spec.objects.length?"edit":"create",r),onChip:r=>{r==="fix"?this.ask("fix",""):r==="polish"?this.ask("polish",""):r==="back"?this.putBack():r.startsWith("say:")&&this.ask("edit",r.slice(4))}}),this.world.scene.add(this.builder.root),this.builder.place(this.orbit.target.clone().add(new E(2,3.5,0))),this.builder.flyTo(this.orbit.target.clone().add(new E(1.5,0,0)),2.5),this.refreshChips(),this.decorate(),this.wirePick(),this.drawPanel(),this.resize(),window.addEventListener("resize",this.onResize),window.addEventListener("keydown",this.onKey),t.setAnimationLoop(r=>this.frame(r)),n.pendingBuild){const r=n.pendingBuild;this.game={...this.game,pendingBuild:void 0},_s(this.game),this.ask("create",r)}else this.spec.objects.length?this.builder.say("Click a piece and tell me what to change, or ask for something new.",6e3):this.builder.say("Hi! Tell me what game to build 👇",0)}refreshChips(){this.builder.setChips(this.spec.objects.length?ib(this.spec.type,cu(this.spec).some(t=>t.level==="error")):[])}pop(t){t.scale.setScalar(.01),this.pops.push({root:t,t:0})}liveOp(t){const e=this.world;if(t.op==="add")this.spec.objects.push(t.obj),this.pop(e.add(t.obj).root),this.builder.flyTo(t.obj.at);else if(t.op==="remove"){const n=this.spec.objects.find(i=>i.id===t.id);n&&this.builder.flyTo(n.at),e.remove(t.id),this.spec.objects=this.spec.objects.filter(i=>i.id!==t.id)}else if(t.op==="set"){this.spec=lu(this.spec,[t]);const n=this.spec.objects.find(i=>i.id===t.id);e.remove(t.id),n&&(this.pop(e.add(n).root),this.builder.flyTo(n.at))}else t.op==="game"&&(this.spec=lu(this.spec,[t]),e.setLook(this.spec))}async ask(t,e){if(this.building)return;const n=ms(this.spec),i=t==="edit"?this.selObj():null;this.building=!0,this.sel=null,this.gizmo.detach(),this.builder.setBusy(!0),this.builder.setChips([]),this.builder.think(!0);const r=t==="create"?"Ooh, nice idea. Let me picture it…":t==="fix"?"Let me find what's broken…":t==="polish"?"Polishing! Adding the good stuff…":i?`On it: this ${Xa[i.kind].toLowerCase()}…`:"On it!";this.builder.say(r,0),i&&this.builder.flyTo(i.at),this.drawPanel(),t==="create"&&(this.spec=_e({...this.spec,objects:[]}).spec,this.world.rebuild(this.spec),this.decorate());let o=0;const a=[],c=["Placing the ground…","Laying out the route…","A tricky jump here…","Hiding some coins…","Adding a few surprises…","Making it pretty…"];try{if(await eb({mode:t,prompt:e,spec:t==="create"?void 0:this.spec,focus:i==null?void 0:i.id},l=>{if(l.t==="thinking")this.builder.say(t==="create"?"Thinking it through…":"Thinking…",0);else if(l.t==="meta")this.spec=_e({...this.spec,...l.meta,objects:this.spec.objects}).spec,this.world.setLook(this.spec),this.builder.say(`Building “${this.spec.title}”…`,0),this.drawPanel();else if(l.t==="obj"||l.t==="op")o===0&&this.builder.think(!1),o++,l.t==="obj"?(this.spec.objects.push(l.obj),this.pop(this.world.add(l.obj).root),this.builder.flyTo(l.obj.at)):this.liveOp(l.op),t==="create"&&o%9===0&&this.builder.say(c[Math.min(c.length-1,Math.floor(o/9)-1)],0);else if(l.t==="texture-start")iu({...l.tex,file:""}),this.builder.say(`Painting a new texture: ${l.tex.name}…`,0);else if(l.t==="texture")a.push((async()=>{const h=await tb(l.dataUrl),d=await Tn("/api/fv/texture/save",{method:"POST",body:JSON.stringify({id:l.tex.id,name:l.tex.name,tags:l.tex.tags,prompt:l.tex.prompt,dataUrl:h})});if(d.ok){iu(await d.json()),lM(l.tex.id);for(const u of this.spec.objects)u.tex===l.tex.id&&(this.world.remove(u.id),this.world.add(u))}})().catch(()=>{}));else if(l.t==="fixing")this.builder.think(!0),this.builder.say("Hmm, something can't be reached. Fixing it…",0);else if(l.t==="done"){this.spec=l.spec;const h=l.issues.filter(u=>u.level==="error"),d=h.length?`Built it, but ${h[0].text}. Tap 🔧 Fix it.`:t==="create"?`Done! ${this.spec.objects.length} pieces. Press ▶ Play to try it.`:t==="fix"?"Fixed! It's playable now.":o?`Done: ${o} change${o===1?"":"s"}. Want anything else?`:"I didn't change anything. Try saying it another way?";this.builder.say(d,9e3)}}),await Promise.all(a),n.objects.length){const l=[...this.game.revisions??[],{at:Date.now(),prompt:e||t,spec:n}].slice(-10);this.game={...this.game,revisions:l}}e&&(this.game.prompts=[...this.game.prompts,e].slice(-20)),this.undo.push(JSON.stringify(n)),this.redo=[]}catch(l){this.builder.think(!1),this.builder.say(`${l instanceof Error?l.message:"That didn't work"}. Try again?`,8e3),(t!=="create"||!this.spec.objects.length)&&(this.spec=n)}this.building=!1,this.tab="ai",this.builder.setBusy(!1),this.spec=_e(this.spec).spec,this.save(),this.rebuild(),this.builder.flyTo(this.orbit.target.clone().add(new E(1.5,0,0)),2.5),this.refreshChips(),this.drawPanel()}putBack(){const t=this.game.revisions??[],e=t[t.length-1];if(!e){this.builder.say("There's nothing to put back yet.",4e3);return}this.game={...this.game,revisions:t.slice(0,-1)},this.replace(_e(e.spec).spec),this.builder.say("Put it back the way it was.",4e3),this.refreshChips()}frameAll(){const t=Io(this.spec),e=(t.x0+t.x1)/2,n=(t.z0+t.z1)/2,i=Math.max(0,(t.y0+t.y1)/2),r=Math.max(t.x1-t.x0,t.z1-t.z0,10);this.orbit.target.set(e,i,n),this.cam.position.set(e-r*.5,i+r*.6,n-r*.8),this.orbit.update()}decorate(){var e;this.extras.clear();const t=this.world.fly.root;t.userData.id=oi,t.position.set(...this.spec.spawn),t.scale.setScalar(1.3),this.world.shadowBlob.visible=!1;for(const n of this.spec.objects){if(n.kind==="platform"&&n.move){const i=n.size??Ps.platform,r=new nt(new Ft(i[0],i[1],i[2]),new Ve({color:"#5ef2cc",transparent:!0,opacity:.25,depthWrite:!1}));r.geometry.translate(0,i[1]/2,0);const o=new ue;o.add(r),o.userData.id=n.id+an,o.position.set(...n.move.to),this.extras.add(o),this.extras.add(Iu([n.at[0],n.at[1]+i[1],n.at[2]],[n.move.to[0],n.move.to[1]+i[1],n.move.to[2]]))}if(n.kind==="enemy"&&((e=n.path)!=null&&e.length)){const i=[n.at,...n.path];for(let r=0;r<i.length;r++)this.extras.add(Iu([i[r][0],i[r][1]+.1,i[r][2]],[i[(r+1)%i.length][0],i[(r+1)%i.length][1]+.1,i[(r+1)%i.length][2]],"#ff7a70"))}}}rebuild(){this.world.rebuild(this.spec),this.decorate(),this.attach()}attach(){const t=this.rootOf(this.sel);t?this.gizmo.attach(t):this.gizmo.detach()}rootOf(t){var e;return t?t===oi?this.world.fly.root:t.endsWith(an)?this.extras.children.find(n=>n.userData.id===t)??null:((e=this.world.objects.get(t))==null?void 0:e.root)??null:null}wirePick(){const t=this.renderer.domElement;let e=null;t.addEventListener("pointerdown",n=>{e={x:n.clientX,y:n.clientY}}),t.addEventListener("pointerup",n=>{if(!e||this.building||Math.hypot(n.clientX-e.x,n.clientY-e.y)>6||this.gizmo.dragging){e=null;return}e=null;const i=t.getBoundingClientRect(),r=new ps;if(r.setFromCamera(new it((n.clientX-i.left)/i.width*2-1,-((n.clientY-i.top)/i.height)*2+1),this.cam),r.intersectObject(this.builder.root,!0).length){this.builder.focus();return}const o=[this.world.fly.root,...this.extras.children.filter(l=>l.userData.id),...[...this.world.objects.values()].map(l=>l.root)],a=r.intersectObjects(o,!0).map(l=>{let h=l.object;for(;h&&!h.userData.id;)h=h.parent;return(h==null?void 0:h.userData.id)??null}).filter(l=>!!l),c=l=>{var h;return((h=this.spec.objects.find(d=>d.id===l))==null?void 0:h.kind)==="lava"};this.select(a.find(l=>!c(l))??a[0]??null)})}select(t){this.sel=t,this.attach(),this.drawPanel()}dropped(){const t=this.sel,e=this.rootOf(t);if(!t||!e)return;const n=[Ti(e.position.x),Ti(e.position.y),Ti(e.position.z)];this.commit(i=>{if(t===oi)i.spawn=n;else if(t.endsWith(an)){const r=i.objects.find(o=>o.id===t.slice(0,-an.length));r!=null&&r.move&&(r.move.to=n)}else{const r=i.objects.find(a=>a.id===t);if(!r)return;const o=[n[0]-r.at[0],n[1]-r.at[1],n[2]-r.at[2]];r.at=n,r.move&&(r.move.to=r.move.to.map((a,c)=>Ti(a+o[c]))),r.path&&(r.path=r.path.map(a=>a.map((c,l)=>Ti(c+o[l]))))}})}commit(t,e={}){this.undo.push(JSON.stringify(this.spec)),this.undo.length>80&&this.undo.shift(),this.redo=[];const n=ms(this.spec);t(n),this.spec=_e(n).spec,this.sel&&this.sel!==oi&&!this.rootIdExists(this.sel)&&(this.sel=null),this.save(),this.rebuild(),e.panel!==!1&&this.drawPanel()}rootIdExists(t){const e=t.endsWith(an)?t.slice(0,-an.length):t;return this.spec.objects.some(n=>n.id===e)}replace(t){this.undo.push(JSON.stringify(this.spec)),this.redo=[],this.spec=t,this.sel=null,this.save(),this.rebuild(),this.drawPanel()}doUndo(){const t=this.undo.pop();t&&(this.redo.push(JSON.stringify(this.spec)),this.spec=JSON.parse(t),this.afterHistory())}doRedo(){const t=this.redo.pop();t&&(this.undo.push(JSON.stringify(this.spec)),this.spec=JSON.parse(t),this.afterHistory())}afterHistory(){this.sel&&this.sel!==oi&&!this.rootIdExists(this.sel)&&(this.sel=null),this.save(),this.rebuild(),this.drawPanel()}save(){this.game={...this.game,spec:this.spec},this.dirtyCover=!0,_s(this.game)}async saveCover(){if(this.dirtyCover){this.dirtyCover=!1;try{const t=this.game;t.cover=await tf(this.renderer,this.spec),_s(t)}catch{}this.alive&&this.resize()}}addObj(t){const e=new ps;e.setFromCamera(new it(0,0),this.cam);const n=e.intersectObjects(this.world.solidMeshes,!0)[0],i=n?n.point:this.orbit.target,r=[Math.round(i.x*2)/2,Ti(i.y),Math.round(i.z*2)/2],o=xo(),a={id:o,kind:t,at:r};Gd.has(t)&&(a.size=[...Ps[t]]),t==="platform"&&(a.move={to:[r[0]+6,r[1],r[2]],speed:2}),t==="enemy"&&(a.path=[[r[0]+5,r[1],r[2]]],a.speed=2.5),t==="flag"?this.commit(c=>{c.objects=c.objects.filter(l=>l.kind!=="flag"),c.objects.push(a)},{panel:!1}):this.commit(c=>{c.objects.push(a)},{panel:!1}),this.select(o)}key(t){var n,i;if((i=(n=t.target)==null?void 0:n.closest)!=null&&i.call(n,"input,textarea,select"))return;const e=t.ctrlKey||t.metaKey;e&&t.key.toLowerCase()==="z"?(t.preventDefault(),t.shiftKey?this.doRedo():this.doUndo()):e&&t.key.toLowerCase()==="y"?(t.preventDefault(),this.doRedo()):e&&t.key.toLowerCase()==="d"?(t.preventDefault(),this.duplicate()):(t.key==="Delete"||t.key==="Backspace")&&this.sel?(t.preventDefault(),this.remove()):t.key==="Escape"?this.select(null):t.key.toLowerCase()==="t"&&!e&&(t.preventDefault(),this.builder.focus())}duplicate(){var i;const t=this.selObj();if(!t)return;const e=JSON.parse(JSON.stringify(t));e.id=xo();const n=(((i=t.size)==null?void 0:i[0])??1)+1;e.at=[t.at[0]+n,t.at[1],t.at[2]],e.move&&(e.move.to=[e.move.to[0]+n,e.move.to[1],e.move.to[2]]),e.path&&(e.path=e.path.map(r=>[r[0]+n,r[1],r[2]])),e.kind!=="flag"&&(this.commit(r=>{r.objects.push(e)},{panel:!1}),this.select(e.id))}remove(){const t=this.sel;if(!t||t===oi)return;const e=t.endsWith(an)?t.slice(0,-an.length):t;t.endsWith(an)?this.commit(n=>{const i=n.objects.find(r=>r.id===e);i&&delete i.move}):(this.sel=null,this.commit(n=>{n.objects=n.objects.filter(i=>i.id!==e)}))}selObj(){if(!this.sel||this.sel===oi)return null;const t=this.sel.endsWith(an)?this.sel.slice(0,-an.length):this.sel;return this.spec.objects.find(e=>e.id===t)??null}modelList(){const t=this.modelQuery.toLowerCase().trim(),e=nu().filter(i=>!t||i.name.toLowerCase().includes(t)||i.tags.some(r=>r.includes(t))).slice(0,60);if(!e.length)return'<p class="fv-small">No models match.</p>';const n="/flyverse/models/";return e.map(i=>`<button class="fv-model" data-model="${Et(i.id)}" title="${Et(i.name)} · ${i.size.join("×")}${i.solid?" · solid":""}">${i.thumb?`<img src="${n}${Et(i.thumb)}" alt="" loading="lazy">`:"<span>🧱</span>"}<em>${Et(i.name)}</em></button>`).join("")}addModel(t){const e=Cn(t);if(!e)return;const n=new ps;n.setFromCamera(new it(0,0),this.cam);const i=n.intersectObjects(this.world.solidMeshes,!0)[0],r=i?i.point:this.orbit.target,o={id:xo(),kind:"model",asset:e.id,at:[Math.round(r.x*2)/2,Ti(r.y),Math.round(r.z*2)/2],size:[...e.size]};this.commit(a=>{a.objects.push(o)},{panel:!1}),this.select(o.id)}drawPanel(){this.sel&&this.tab!=="object"&&(this.tab="object");const t=cu(this.spec),e=t.filter(r=>r.level==="error"),n=this.selObj(),i=["ai","object","game","add"].map(r=>`<button class="fv-tab${this.tab===r?" on":""}" data-tab="${r}">${{ai:"✨ AI",object:"Selected",game:"Game",add:"+ Add"}[r]}</button>`).join("");this.panel.innerHTML=`
      <div class="fv-bar">
        <button data-a="back" title="All games">←</button>
        <input class="fv-title" value="${Et(this.spec.title)}" maxlength="40" aria-label="Title">
        <button data-a="undo" title="Undo (Ctrl+Z)" ${this.undo.length?"":"disabled"}>↶</button>
        <button data-a="redo" title="Redo (Ctrl+Y)" ${this.redo.length?"":"disabled"}>↷</button>
        <button class="fv-primary" data-a="test">▶ Play</button>
      </div>
      <p class="fv-by">${Et(Di(this.game.creator,this.game.remixOf))}</p>
      <div class="fv-check ${this.building?"":e.length?"bad":"good"}">
        ${this.building?"🪰 The builder fly is working…":this.spec.objects.length?e.length?`⚠ ${e.length===1?"1 problem":`${e.length} problems`}: ${Et(e[0].text)}`:"✓ Looks playable":"Empty: tell the builder fly what to make"}
        ${t.filter(r=>r.level==="warn").map(r=>`<div class="fv-warn">${Et(r.text)}</div>`).join("")}
      </div>
      <div class="fv-tabs">${i}</div>
      <div class="fv-pane">${this.pane(n)}</div>
      <p class="fv-hint">${di()?"Tap a piece to select it, drag the arrows to move it.":"Click a piece to select it · drag the arrows to move · Del deletes · Ctrl+D copies"}</p>`,this.wirePanel()}pane(t){var o,a,c,l,h,d;const e=this.spec;if(this.tab==="ai"){const u=[...this.game.revisions??[]].reverse(),f=p=>{const _=Math.round((Date.now()-p)/6e4);return _<1?"just now":_<60?`${_} min ago`:`${Math.round(_/60)} h ago`};return`
        <p class="fv-small"><b>Talk to the builder fly</b> in the box under the scene (or press T). Click a piece first to point at it: “make <i>this</i> bigger”.</p>
        ${u.length?`<div class="fv-hist"><p class="fv-small">Before each change</p><ol class="fv-revs">${u.map((p,_)=>`<li><span>“${Et(p.prompt)}” · ${f(p.at)}</span><button class="sm" data-rev="${u.length-1-_}">Restore</button></li>`).join("")}</ol></div>`:""}
        ${this.game.prompts.length?`<div class="fv-hist"><p class="fv-small">What you asked</p><ol>${this.game.prompts.slice(-6).map(p=>`<li>${Et(p)}</li>`).join("")}</ol></div>`:""}`}if(this.tab==="game"){const u=(f,p)=>f.map(_=>`<option ${_===p?"selected":""}>${_}</option>`).join("");return`
        <label>Goal <input data-g="goal" value="${Et(e.goal)}" maxlength="90"></label>
        <div class="fv-two">
          <label>Type <select data-g="type">${u(zd,e.type)}</select></label>
          <label>Win by <select data-g="win">${u(Bd,e.rules.win)}</select></label>
        </div>
        <div class="fv-two">
          <label>Time (s) <input data-g="timer" type="number" min="10" max="300" value="${e.rules.timer}"></label>
          <label>Lives <input data-g="lives" type="number" min="1" max="9" value="${e.rules.lives}"></label>
        </div>
        <div class="fv-two">
          <label>Camera <select data-g="camera">${Wd.map(f=>`<option value="${f}" ${f===e.look.camera?"selected":""}>${{third:"Behind the fly",chase:"Chase cam",top:"Top-down",side:"Side-scroller",first:"First person"}[f]}</option>`).join("")}</select></label>
          ${e.rules.win==="hill"?`<label>Hold zone (s) <input data-g="hold" type="number" min="3" max="120" value="${e.rules.hold}"></label>`:"<span></span>"}
        </div>
        <label class="fv-check-row"><input type="checkbox" data-g="shoot" ${e.rules.shoot?"checked":""}> The fly can shoot pollen</label>
        <label class="fv-check-row"><input type="checkbox" data-g="multi" ${e.rules.multi?"checked":""}> Friends can play together (up to 4)</label>
        <label>Look</label>
        <div class="fv-pals">${Vd.map(f=>`<button class="fv-pal${f===e.look.palette?" on":""}" data-pal="${f}" title="${f}" style="background:linear-gradient(160deg,${mi[f].sky},${mi[f].colors[0]})"></button>`).join("")}</div>
        <p class="fv-small">${e.objects.length} pieces</p>`}if(this.tab==="add"){const u=nu();return`<div class="fv-add">${Hd.filter(f=>f!=="model").map(f=>`<button data-add="${f}"><span>${Lu[f]}</span>${Xa[f]}</button>`).join("")}</div>
        <p class="fv-small">New pieces land where the camera is looking.</p>
        ${u.length?`<h3>Models <span class="fv-small">${u.length}</span></h3>
        <input class="fv-msearch" placeholder="Search models: tree, house, ship…" value="${Et(this.modelQuery)}">
        <div class="fv-models">${this.modelList()}</div>`:""}`}if(this.sel===oi)return'<h3>Start point</h3><p class="fv-small">Where the fly starts. Drag the arrows to move it; keep it on top of a block.</p>';if(!t)return'<p class="fv-small">Nothing selected. Click a piece in the scene, or add one.</p>';const n=(o=this.sel)==null?void 0:o.endsWith(an),i=(u,f,p,_=.25)=>`<label>${u}<input type="number" step="${_}" data-o="${f}" value="${p}"></label>`,r=mi[e.look.palette].colors.map((u,f)=>`<button class="fv-sw${(t.color??0)===f?" on":""}" data-color="${f}" style="background:${u}"></button>`).join("");return`
      <h3>${Lu[t.kind]} ${t.kind==="model"?Et(((a=Cn(t.asset))==null?void 0:a.name)??"Model"):Xa[t.kind]}${n?" · where it moves to":""}</h3>
      <div class="fv-three">${i("x","at.0",t.at[0])}${i("y","at.1",t.at[1])}${i("z","at.2",t.at[2])}</div>
      ${t.size?`<p class="fv-small">Size</p><div class="fv-three">${i("w","size.0",t.size[0])}${i("h","size.1",t.size[1])}${i("d","size.2",t.size[2])}</div>`:""}
      ${["block","ramp","platform","wall"].includes(t.kind)?`<p class="fv-small">Colour</p><div class="fv-sws">${r}</div>`:""}
      ${t.kind==="key"||t.kind==="door"?`<p class="fv-small">Colour (a key opens doors of the same colour)</p><div class="fv-sws">${r}</div>`:""}
      ${t.kind==="turret"?i("Seconds between shots","rate",t.rate??2,.5):""}
      ${t.kind==="spawner"?`<div class="fv-three">${i("Waves","waves",t.waves??3,1)}${i("Per wave","count",t.count??3,1)}${i("Every (s)","every",t.every??15,1)}</div>`:""}
      ${t.kind==="ramp"?'<button data-a="turn">↻ Turn ramp</button>':""}
      ${t.kind==="model"?`<p class="fv-small">${Et(((c=Cn(t.asset))==null?void 0:c.name)??t.asset??"")} · ${(l=Cn(t.asset))!=null&&l.solid?"solid: the fly can stand on it":"scenery: the fly passes through"} · ${Et(((h=Cn(t.asset))==null?void 0:h.author)??"")}, ${Et(((d=Cn(t.asset))==null?void 0:d.licence)??"")}</p><button data-a="turnm">↻ Turn 90°</button>`:""}
      ${t.kind==="platform"?`
        <label class="fv-check-row"><input type="checkbox" data-flag="move" ${t.move?"checked":""}> Moves back and forth</label>
        ${t.move?i("Speed","move.speed",t.move.speed,.5):""}
        <label class="fv-check-row"><input type="checkbox" data-flag="fall" ${t.fall?"checked":""}> Falls when you land</label>
        ${i("Spin (°/s)","spin",t.spin??0,15)}
        ${t.move?'<p class="fv-small">Select the see-through copy to move where it goes.</p>':""}`:""}
      ${t.kind==="enemy"?`
        <label class="fv-check-row"><input type="checkbox" data-flag="chase" ${t.chase?"checked":""}> Chases you when near</label>
        ${i("Speed","speed",t.speed??2.5,.5)}`:""}
      ${t.kind==="bounce"?i("Jump height","power",t.power??6,.5):""}
      <div class="fv-row">
        <button data-a="dup">Copy</button>
        <button data-a="del" class="danger">${n?"Stop moving":"Delete"}</button>
      </div>`}wirePanel(){var d;const t=u=>this.panel.querySelector(u),e=u=>Array.from(this.panel.querySelectorAll(u));t("[data-a=back]").onclick=()=>this.exit(),t("[data-a=undo]").onclick=()=>this.doUndo(),t("[data-a=redo]").onclick=()=>this.doRedo(),t("[data-a=test]").onclick=()=>{this.saveCover(),this.dispose(),this.opts.onTest()};const n=t(".fv-title");n.onchange=()=>this.commit(u=>{u.title=n.value},{panel:!1}),e("[data-tab]").forEach(u=>u.onclick=()=>{this.tab=u.dataset.tab,this.tab!=="object"&&(this.sel=null,this.attach()),this.drawPanel()}),e("[data-rev]").forEach(u=>u.onclick=()=>{var p;const f=(p=this.game.revisions)==null?void 0:p[Number(u.dataset.rev)];!f||this.building||(this.replace(_e(f.spec).spec),this.builder.say(`Back to how it was before “${f.prompt}”.`,4e3),this.refreshChips())}),this.building&&this.panel.querySelectorAll("button,input,select").forEach(u=>{!u.dataset.tab&&u.dataset.a!=="back"&&(u.disabled=!0)});const i=u=>t(`[data-g=${u}]`);i("goal")&&(i("goal").onchange=u=>this.commit(f=>{f.goal=u.target.value}),i("type").onchange=u=>this.commit(f=>{f.type=u.target.value}),i("win").onchange=u=>this.commit(f=>{f.rules.win=u.target.value}),i("timer").onchange=u=>this.commit(f=>{f.rules.timer=Number(u.target.value)}),i("lives").onchange=u=>this.commit(f=>{f.rules.lives=Number(u.target.value)}),i("camera").onchange=u=>this.commit(f=>{f.look.camera=u.target.value}),i("hold")&&(i("hold").onchange=u=>this.commit(f=>{f.rules.hold=Number(u.target.value)})),i("shoot").onchange=u=>this.commit(f=>{f.rules.shoot=u.target.checked}),i("multi").onchange=u=>this.commit(f=>{f.rules.multi=u.target.checked}),e("[data-pal]").forEach(u=>u.onclick=()=>this.commit(f=>{f.look.palette=u.dataset.pal}))),e("[data-add]").forEach(u=>u.onclick=()=>this.addObj(u.dataset.add));const r=()=>e("[data-model]").forEach(u=>u.onclick=()=>this.addModel(u.dataset.model));r();const o=t(".fv-msearch");o&&(o.oninput=()=>{this.modelQuery=o.value,t(".fv-models").innerHTML=this.modelList(),r()});const a=this.selObj();if(!a)return;const c=a.id,l=(d=this.sel)==null?void 0:d.endsWith(an),h=u=>this.commit(f=>{const p=f.objects.find(_=>_.id===c);p&&u(p)});e("[data-o]").forEach(u=>u.onchange=()=>{const f=Number(u.value);if(!Number.isFinite(f))return;const[p,_]=u.dataset.o.split(".");h(m=>{if(p==="at"&&l&&m.move){m.move.to[Number(_)]=f;return}_===void 0?m[p]=f:p==="move"?m.move[_]=f:m[p][Number(_)]=f})}),e("[data-color]").forEach(u=>u.onclick=()=>h(f=>{f.color=Number(u.dataset.color)})),e("[data-flag]").forEach(u=>u.onchange=()=>h(f=>{const p=u.dataset.flag;p==="move"&&(u.checked?f.move={to:[f.at[0]+6,f.at[1],f.at[2]],speed:2}:delete f.move),p==="fall"&&(u.checked?f.fall=!0:delete f.fall),p==="chase"&&(u.checked?f.chase=!0:delete f.chase)})),t("[data-a=turn]")&&(t("[data-a=turn]").onclick=()=>h(u=>{u.dir=((u.dir??0)+1)%4})),t("[data-a=turnm]")&&(t("[data-a=turnm]").onclick=()=>h(u=>{u.rot=((u.rot??0)+90)%360})),t("[data-a=dup]").onclick=()=>this.duplicate(),t("[data-a=del]").onclick=()=>this.remove()}resize(){const t=this.view.clientWidth||window.innerWidth,e=this.view.clientHeight||window.innerHeight;this.renderer.setSize(t,e,!1),this.cam.aspect=t/e,this.cam.updateProjectionMatrix()}frame(t){if(!this.alive)return;const e=Math.min(.1,(t-this.last)/1e3);this.last=t;for(const n of this.pops){n.t+=e;const i=Math.min(1,n.t/.35),r=1+2.2*Math.pow(i-1,3)+1.2*Math.pow(i-1,2);n.root.scale.setScalar(Math.max(.01,r))}if(this.pops=this.pops.filter(n=>n.t<.35),this.building&&this.spec.objects.length){this.frameT+=e;const n=Io(this.spec),i=new E((n.x0+n.x1)/2,Math.max(0,(n.y0+n.y1)/2),(n.z0+n.z1)/2),r=Math.max(n.x1-n.x0,n.z1-n.z0,n.y1-n.y0,10),o=Math.min(1,e*1.5),a=this.cam.position.clone().sub(this.orbit.target).normalize();this.orbit.target.lerp(i,o);const c=this.orbit.target.clone().addScaledVector(a,r*1.15);this.cam.position.lerp(c,o)}this.orbit.update(),this.world.animate(e),this.builder.update(e,this.cam,{w:this.view.clientWidth,h:this.view.clientHeight}),this.world.fly.anim(t/1e3,{air:!1,glide:!1,speed:0}),this.renderer.render(this.world.scene,this.cam)}exit(){this.saveCover(),this.dispose(),this.opts.onExit()}dispose(){if(this.alive){this.alive=!1,this.renderer.setAnimationLoop(null),this.gizmo.detach(),this.world.scene.remove(this.gizmo.getHelper());try{this.gizmo.disconnect()}catch{}this.orbit.dispose(),window.removeEventListener("resize",this.onResize),window.removeEventListener("keydown",this.onKey),this.builder.dispose()}}}const Ti=s=>Math.round(s*100)/100;function Iu(s,t,e="#5ef2cc"){const n=new Me().setFromPoints([new E(s[0],s[1],s[2]),new E(t[0],t[1],t[2])]),i=new fn(n,new my({color:e,dashSize:.4,gapSize:.25}));return i.computeLineDistances(),i}const rb=[{urls:"stun:stun.l.google.com:19302"}],ef="/api/fv/room";async function ja(s,t){const e=await Tn(ef+s,{method:"POST",body:JSON.stringify(t)}),n=await e.json().catch(()=>({}));if(!e.ok)throw new Error((n==null?void 0:n.error)??`room error ${e.status}`);return n}class Wo{constructor(t,e,n,i){U(this,"peers",new Map);U(this,"onMessage",()=>{});U(this,"onChange",()=>{});U(this,"alive",!0);this.code=t,this.me=e,this.myName=n,this.host=i}static async open(t,e){const n=await ja("/join",{room:t,name:e}),i=n.members.find(o=>o.id===n.me),r=new Wo(n.room,n.me,(i==null?void 0:i.name)??e,!!(i!=null&&i.host));for(const o of n.members)o.id!==n.me&&(r.peers.set(o.id,{id:o.id,name:o.name,host:o.host,open:!1}),r.call(o.id));return r.loop(),r}get openPeers(){return[...this.peers.values()].filter(t=>t.open)}get hostId(){var t;return this.host?this.me:(t=[...this.peers.values()].find(e=>e.host))==null?void 0:t.id}send(t){var n;const e=JSON.stringify(t);for(const i of this.peers.values())if(i.open&&((n=i.dc)==null?void 0:n.readyState)==="open")try{i.dc.send(e)}catch{}}sendTo(t,e){var i;const n=this.peers.get(t);((i=n==null?void 0:n.dc)==null?void 0:i.readyState)==="open"&&n.dc.send(JSON.stringify(e))}signal(t,e){return ja("/send",{room:this.code,from:this.me,to:t,data:e}).catch(()=>{})}makePc(t){const e=new RTCPeerConnection({iceServers:rb});return e.onicecandidate=n=>{n.candidate&&this.signal(t,{ice:n.candidate.toJSON()})},e.onconnectionstatechange=()=>{if(e.connectionState==="failed"||e.connectionState==="closed"){const n=this.peers.get(t);n&&(n.open=!1,this.onChange())}},e.ondatachannel=n=>this.wire(t,n.channel),e}wire(t,e){const n=this.peers.get(t);n&&(n.dc=e,e.onopen=()=>{n.open=!0,this.onChange()},e.onclose=()=>{n.open=!1,this.onChange()},e.onmessage=i=>{try{this.onMessage(t,JSON.parse(i.data))}catch{}})}async call(t){const e=this.peers.get(t);e.pc=this.makePc(t),this.wire(t,e.pc.createDataChannel("game"));const n=await e.pc.createOffer();await e.pc.setLocalDescription(n),await this.signal(t,{sdp:e.pc.localDescription})}async onSignal(t,e){let n=this.peers.get(t);if(n){if(e.sdp)if(e.sdp.type==="offer"){n.pc=this.makePc(t),await n.pc.setRemoteDescription(e.sdp);const i=await n.pc.createAnswer();await n.pc.setLocalDescription(i),await this.signal(t,{sdp:n.pc.localDescription})}else n.pc&&await n.pc.setRemoteDescription(e.sdp);else if(e.ice&&n.pc)try{await n.pc.addIceCandidate(e.ice)}catch{}}}async loop(){var t;for(;this.alive;){let e;try{const n=await Tn(`${ef}/poll?room=${this.code}&me=${this.me}`,{cache:"no-store"});if(n.status===410){this.alive=!1;break}e=await n.json()}catch{await new Promise(n=>setTimeout(n,1500));continue}for(const n of e.msgs??[])if(n.t==="joined")this.peers.set(n.member.id,{id:n.member.id,name:n.member.name,host:n.member.host,open:!1}),this.onChange();else if(n.t==="left"){const i=this.peers.get(n.id);(t=i==null?void 0:i.pc)==null||t.close(),this.peers.delete(n.id),n.host===this.me&&(this.host=!0);for(const r of this.peers.values())r.host=r.id===n.host;this.onChange()}else n.t==="signal"&&await this.onSignal(n.from,n.data)}}close(){var t;this.alive=!1;for(const e of this.peers.values())try{(t=e.pc)==null||t.close()}catch{}ja("/leave",{room:this.code,me:this.me}).catch(()=>{})}}Yy();const Sn=document.getElementById("app"),wn=new Av({antialias:!0,powerPreference:"high-performance",preserveDrawingBuffer:!1});wn.setPixelRatio(Math.min(2,window.devicePixelRatio));wn.shadowMap.enabled=!0;wn.shadowMap.type=Ou;wn.outputColorSpace=ke;wn.domElement.className="fv-canvas";let je=null;function nf(s){const t=Kd(s);if(t)return{spec:t.spec,mine:t};const e=tr.find(n=>n.id===s);return e?{spec:ms(e.spec),mine:null}:null}async function Du(s){const t=nf(s);if(t)return t;const e=await TM(s);return e?{spec:e.spec,mine:null,other:e}:null}async function yr(){var i,r,o,a,c,l;je==null||je.dispose(),je=null,document.body.classList.remove("fv-full");const s=new URLSearchParams(location.hash.slice(1)),t=s.get("play"),e=s.get("edit"),n=s.get("room");if(n&&!t)return ob(n);if(t){const h=await Du(t);if(!h)return vs("That game doesn't exist (or was deleted).");document.body.classList.add("fv-full");const d=Di(((i=h.mine)==null?void 0:i.creator)??((r=h.other)==null?void 0:r.creator)??Uo,((o=h.mine)==null?void 0:o.remixOf)??((a=h.other)==null?void 0:a.remixOf));je=new So(wn,Sn,h.spec,{gameId:t,by:d,onExit:()=>cs(""),onEdit:h.mine?()=>cs(`edit=${t}`):void 0,onFriends:async()=>{try{const u=await Wo.open(void 0,(await vr()).name);je==null||je.dispose(),history.replaceState(null,"",`#play=${t}&host=${u.code}`),je=new So(wn,Sn,h.spec,{gameId:t,by:d,room:u,onExit:()=>cs("")})}catch(u){alert(u instanceof Error?u.message:"Couldn't open a room")}}});return}if(e){let h=await Du(e);if(!h)return vs("That game doesn't exist (or was deleted).");let d=e;if(!h.mine){d=Zd();const u=ms(h.spec);u.title=`${u.title} remix`.slice(0,40),_s({id:d,spec:u,created:Date.now(),updated:Date.now(),prompts:[],creator:await vr(),remixOf:{id:e,title:h.spec.title,by:((l=(c=h.other)==null?void 0:c.creator)==null?void 0:l.name)??Uo.name}}),history.replaceState(null,"",`#edit=${d}`),h=nf(d)}document.body.classList.add("fv-full"),je=new sb(wn,Sn,h.mine,{onExit:()=>cs(""),onTest:()=>{const u=Kd(d);if(!u)return void yr();je=new So(wn,Sn,u.spec,{gameId:d,test:!0,by:Di(u.creator,u.remixOf),onExit:()=>void yr()})}});return}vs()}async function ob(s){document.body.classList.add("fv-full"),Sn.innerHTML=`<div class="fv-play"><div class="fv-card"><div class="fv-panel"><p class="fv-eyebrow">Room ${Et(s.toUpperCase())}</p><h2>Joining…</h2><p class="fv-keys" id="fv-join">Connecting to your friends</p><div class="fv-row"><button data-a="cancel">Cancel</button></div></div></div></div>`;const t=document.getElementById("fv-join");let e,n=!1;Sn.querySelector("[data-a=cancel]").onclick=()=>{n=!0,e==null||e.close(),cs("")};try{e=await Wo.open(s,(await vr()).name)}catch(r){return vs(r instanceof Error?r.message:"Couldn't join that room")}if(n)return e.close();e.onChange=()=>{t.textContent=e.openPeers.length?"Connected. Getting the level from the host…":"Connecting to your friends"};const i=setTimeout(()=>{je||(t.textContent="Still connecting… (your network may block direct connections)")},12e3);e.onMessage=(r,o)=>{if(o.t!=="game"||je||n)return;clearTimeout(i);const a=_e(o.spec).spec;je=new So(wn,Sn,a,{gameId:`room-${String(o.gameId).slice(0,40)}`,by:String(o.by??""),room:e,onExit:()=>cs("")})}}function cs(s){"#"+s===location.hash||!s&&!location.hash?yr():location.hash=s}window.addEventListener("hashchange",()=>void yr());const Nu=["Lava parkour up a volcano with moving platforms and 3 checkpoints","Coin hunt in a candy forest with beetles patrolling","A short race on floating ice islands with speed pads","Survive 40 seconds on a shrinking island of falling platforms","A glowing night maze with gems hidden in dead ends"],Zs=new Map;function lo(s,t,e,n,i){const r=mi[t.look.palette],o=e?`url(${e}) center/cover`:`linear-gradient(160deg, ${r.sky}, ${r.horizon})`;return`<article class="fv-game" data-id="${Et(s)}">
    <a class="fv-cover" href="#play=${Et(s)}" style="background:${o}"><span class="fv-type">${Et(t.type)}</span></a>
    <div class="fv-meta">
      <h3>${Et(t.title)}</h3>
      <p class="fv-by2">${Et(i)}</p>
      <p>${Et(t.goal)}</p>
      <div class="fv-acts">
        <a class="fv-primary sm" href="#play=${Et(s)}">Play</a>
        <a class="sm" href="#edit=${Et(s)}">${n?"Edit":"Remix"}</a>
        ${n?`<button class="sm ghost" data-del="${Et(s)}" aria-label="Delete">Delete</button>`:""}
      </div>
    </div>
  </article>`}let Uu=!1;function vs(s=""){const t=Xc();Uu||(Uu=!0,wM().then(i=>{i&&!je&&!location.hash.slice(1)&&vs(s)})),Sn.innerHTML=`
  <section class="fv-home">
    <header class="fv-head">
      <p class="eyebrow">Flyverse Maker · early test</p>
      <h1>Type a game. Play it.</h1>
      <p class="lede">Describe a minigame in a sentence. A few seconds later it's a 3D level you can play, change and share.</p>
    </header>
    ${s?`<p class="fv-note">${Et(s)}</p>`:""}
    <form class="fv-make" autocomplete="off">
      <textarea name="p" rows="2" maxlength="400" placeholder="e.g. ${Et(Nu[0])}"></textarea>
      <div class="fv-make-row">
        <div class="fv-chips">${Nu.slice(1).map(i=>`<button type="button" class="fv-chip">${Et(i)}</button>`).join("")}</div>
        <button class="fv-primary" type="submit">Make it</button>
      </div>
      <p class="fv-status" aria-live="polite"></p>
    </form>
    ${t.length?`<h2 class="fv-h2">Your games</h2><div class="fv-grid">${t.map(i=>lo(i.id,i.spec,i.cover,!0,Di(i.creator,i.remixOf))).join("")}</div>`:""}
    <div id="fv-others"></div>
    <h2 class="fv-h2">Starter games</h2>
    <div class="fv-grid" id="fv-samples">${tr.map(i=>lo(i.id,i.spec,Zs.get(i.id),!1,Di(Uo))).join("")}</div>
  </section>`;const e=Sn.querySelector(".fv-make"),n=e.querySelector("textarea");e.querySelector(".fv-status"),e.querySelectorAll(".fv-chip").forEach(i=>i.onclick=()=>{n.value=i.textContent??"",n.focus()}),n.onkeydown=i=>{i.key==="Enter"&&!i.shiftKey&&(i.preventDefault(),e.requestSubmit())},e.onsubmit=async i=>{i.preventDefault();const r=n.value.trim();if(r.length<4){n.focus();return}const o=Zd(),a=_e({title:r.slice(0,40),objects:[]}).spec;_s({id:o,spec:a,created:Date.now(),updated:Date.now(),prompts:[],creator:await vr(),pendingBuild:r}),location.hash=`edit=${o}`},Sn.querySelectorAll("[data-del]").forEach(i=>i.onclick=()=>{confirm("Delete this game? It goes from every device.")&&(xM(i.dataset.del),vs())}),EM().then(i=>{const r=document.getElementById("fv-others");if(!r)return;const o=new Set(Xc().map(c=>c.id)),a=i.filter(c=>!o.has(c.id)&&c.spec.objects.length).slice(0,24);a.length&&(r.innerHTML=`<h2 class="fv-h2">Games by testers</h2><div class="fv-grid">${a.map(c=>lo(c.id,c.spec,c.cover,!1,Di(c.creator,c.remixOf))).join("")}</div>`)}),Zs.size<tr.length&&requestAnimationFrame(async()=>{for(const r of tr)Zs.has(r.id)||Zs.set(r.id,await tf(wn,r.spec));const i=document.getElementById("fv-samples");i&&(i.innerHTML=tr.map(r=>lo(r.id,r.spec,Zs.get(r.id),!1,Di(Uo))).join(""))})}fetch("/flyverse/models/catalog.json").then(s=>s.ok?s.json():[]).catch(()=>[]).then(async s=>{qy(Array.isArray(s)?s:[]);const t=await fetch(Nd("catalog.json"),{cache:"no-store"}).then(e=>e.ok?e.json():[]).catch(()=>[]);Od(Array.isArray(t)?t:[]),await ab(),yr()});async function ab(){for(let s=0;s<50&&!window.flyNav;s++)await new Promise(t=>setTimeout(t,100));for(;;){const s=await $y();if(s.ok)return;const t=!!s.wallet;Sn.innerHTML=`
      <section class="fv-home"><header class="fv-head">
        <p class="eyebrow">Flyverse Maker · closed test</p>
        <h1>Not open yet</h1>
        <p class="lede">${t?`This wallet (${Et(s.wallet.slice(0,6))}…${Et(s.wallet.slice(-4))}) isn't on the test list.`:s.why&&!/sign in/i.test(s.why)?Et(s.why):"Sign in at the top right with a test wallet to get in."}</p>
        <p><button class="fv-primary" id="fv-recheck">Check again</button></p>
      </header></section>`,await new Promise(e=>{const n=()=>{window.removeEventListener("flyai-session",n),window.removeEventListener("storage",n),e()};window.addEventListener("flyai-session",n),window.addEventListener("storage",n),document.getElementById("fv-recheck").onclick=n})}}
