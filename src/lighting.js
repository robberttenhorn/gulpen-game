// Licht voor de hele game, als aanvulling op de standaardmaterialen van three.js:
// - randlicht (rim): een heldere rand langs de randen van poppetjes, bomen, auto's en gevels, het sterkst
//   als je tegen de zon in kijkt. Alleen op staande vlakken (geen gloeiende grond in de verte) en dichtbij.
// - mist met zon: richting de zon kleurt de mist warm, ervan af blijft hij koel, en vlakbij is er geen mist.
// Dit wordt één keer bij het laden in de shaders van three.js gezet, vóór er iets getekend is.
import * as THREE from 'three';

// Lantaarnlicht voor de hele wereld, zonder honderden echte lampen:
// - uLampMap: kaart van het dorp (2 m per vakje) met per vakje de dichtstbijzijnde lichtbron
//   (plek ten opzichte van het midden van het vakje, hoogte en sterkte). Elk verlicht materiaal leest
//   daar één vakje uit en rekent het licht van die ene lamp precies uit: afstand, richting, kegel naar beneden.
// - uGlobals: twee getallenvakjes voor de hele game: [lampen aan, natheid, tijd, -] en de omtrek van de kaart.
// Beide zitten als texture in de standaardmaterialen van three.js, zodat elk materiaal ze vanzelf krijgt.
const lampTex = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
lampTex.magFilter = lampTex.minFilter = THREE.NearestFilter; lampTex.needsUpdate = true;
const globals = new Float32Array(8);
const globalTex = new THREE.DataTexture(globals, 2, 1, THREE.RGBAFormat, THREE.FloatType);
globalTex.magFilter = globalTex.minFilter = THREE.NearestFilter; globalTex.needsUpdate = true;

// kaart met lichtbronnen zetten: data = Uint16Array (halve floats, 4 per vakje), box = [x0, z0, breedte, diepte]
export function setLampMap(data, w, h, box) {
  lampTex.image = { data, width: w, height: h };
  lampTex.needsUpdate = true;
  globals.set(box, 4);
  globalTex.needsUpdate = true;
}
// lampen aan (0..1) en natheid van de straat (0..1)
export function setLampGlobals(on, wet = 0) {
  if (globals[0] === on && globals[1] === wet) return;
  globals[0] = on; globals[1] = wet;
  globalTex.needsUpdate = true;
}
export const lampUniforms = { uLampMap: { value: lampTex }, uGlobals: { value: globalTex } };

let done = false;
export function installLighting({ lamps = true } = {}) {
  if (done) return;
  done = true;
  const C = THREE.ShaderChunk;
  // in verlichte materialen bestaan de lampen; zo weet de mist straks dat hij de zonrichting kan gebruiken
  C.lights_pars_begin = C.lights_pars_begin + '\n#define LOCALS_HAS_LIGHTS 1\n' + (lamps ? '#define LOCALS_LAMPS 1\nuniform highp sampler2D uLampMap;\nuniform highp sampler2D uGlobals;\n' : '');
  if (lamps) for (const k of ['standard', 'physical', 'phong', 'lambert', 'toon']) Object.assign(THREE.ShaderLib[k].uniforms, { uLampMap: { value: lampTex }, uGlobals: { value: globalTex } });
  C.lights_fragment_end = C.lights_fragment_end + `
#if NUM_DIR_LIGHTS > 0
  {
    vec3 sunDirVS = directionalLights[ 0 ].direction; // naar de zon toe (in beeldruimte)
    vec3 upVS = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float fres = pow( 1.0 - saturate( dot( normal, geometryViewDir ) ), 3.0 );
    float back = 0.3 + 0.7 * saturate( dot( sunDirVS, -geometryViewDir ) ); // tegenlicht: sterker
    float sideLit = saturate( dot( normal, sunDirVS ) + 0.45 ); // de kant van de zon
    float upright = smoothstep( 0.25, 0.75, 1.0 - abs( dot( normal, upVS ) ) ); // niet op de grond of daken
    float nearFade = 1.0 - smoothstep( 60.0, 160.0, length( vViewPosition ) );
    vec3 rimCol = directionalLights[ 0 ].color;
    float rimAmt = 0.16 * fres * back * sideLit * upright * nearFade;
    #ifdef USE_ALPHATEST
      // bladeren: geen witte rand maar licht dat groen door het blad schijnt
      rimCol *= diffuseColor.rgb * 1.6;
      rimAmt *= 0.7;
    #endif
    reflectedLight.directDiffuse += rimCol * rimAmt;
  }
#endif
#ifdef LOCALS_LAMPS
  {
    vec4 lampG = texelFetch( uGlobals, ivec2( 0, 0 ), 0 );
    if ( lampG.x > 0.01 ) {
      vec4 lampBox = texelFetch( uGlobals, ivec2( 1, 0 ), 0 );
      mat3 lampV2W = transpose( mat3( viewMatrix ) );
      vec3 lampWP = cameraPosition + lampV2W * ( - vViewPosition );
      vec2 lampUV = ( lampWP.xz - lampBox.xy ) / lampBox.zw;
      if ( lampUV.x > 0.0 && lampUV.x < 1.0 && lampUV.y > 0.0 && lampUV.y < 1.0 ) {
        ivec2 lampTS = textureSize( uLampMap, 0 );
        ivec2 lampTC = ivec2( lampUV * vec2( lampTS ) );
        vec4 lampD = texelFetch( uLampMap, lampTC, 0 );
        if ( lampD.a > 0.0 ) {
          vec2 lampCen = lampBox.xy + ( vec2( lampTC ) + 0.5 ) / vec2( lampTS ) * lampBox.zw;
          vec3 lampL = vec3( lampCen.x + lampD.x - lampWP.x, lampD.z - lampWP.y, lampCen.y + lampD.y - lampWP.z );
          float lampD2 = dot( lampL, lampL );
          vec3 lampDir = lampL * inversesqrt( lampD2 + 1e-4 );
          float lampNL = saturate( dot( lampV2W * normal, lampDir ) );
          float lampCone = smoothstep( 0.2, 0.85, lampDir.y ); // de lamp schijnt naar beneden
          float lampAtt = saturate( 1.0 - lampD2 / 620.0 ) / ( 1.0 + lampD2 * 0.028 );
          vec3 lampIrr = vec3( 1.0, 0.76, 0.5 ) * ( lampD.a * lampG.x * 15.0 * lampAtt * lampCone * lampNL );
          reflectedLight.directDiffuse += lampIrr * BRDF_Lambert( material.diffuseColor );
        }
      }
    }
  }
#endif
`;
  // Mist als atmosfeer in plaats van een grijze wand:
  // - luchtperspectief: hoe verder weg, hoe meer het landschap naar de kleur van de horizon trekt (fogFar regelt de sterkte);
  // - hoogtemist: in het dal van de Gulp hangt meer nevel dan boven op de heuvels (fogNear regelt de sterkte);
  // - richting de zon kleurt de nevel warm en licht op.
  C.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    vec3 fogCol = fogColor;
  #else
    float fogBeta = 2.3 / fogFar;
    float fogTau = fogBeta * vFogDepth;
    vec3 fogCol = fogColor;
    #if defined( LOCALS_HAS_LIGHTS )
      {
        // straal van de camera naar dit punt, in wereldrichting
        vec3 fogRay = transpose( mat3( viewMatrix ) ) * ( - vViewPosition );
        float fk = clamp( fogRay.y / 38.0, -20.0, 20.0 );
        float fogH = exp( clamp( - ( cameraPosition.y + 12.0 ) / 38.0, -8.0, 1.5 ) ) * ( abs( fk ) > 0.001 ? ( 1.0 - exp( - fk ) ) / fk : 1.0 );
        fogTau += fogBeta * fogNear * 2.5 * vFogDepth * fogH;
        #if NUM_DIR_LIGHTS > 0
          float toSun = pow( saturate( dot( normalize( - vViewPosition ), directionalLights[ 0 ].direction ) ), 6.0 );
          fogCol = mix( fogCol, fogCol * 0.9 + directionalLights[ 0 ].color * vec3( 0.12, 0.09, 0.06 ), toSun * 0.8 );
        #endif
      }
    #endif
    float fogFactor = 1.0 - exp( - fogTau );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;
}
