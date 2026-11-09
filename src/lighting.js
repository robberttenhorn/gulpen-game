// Licht voor de hele game, als aanvulling op de standaardmaterialen van three.js:
// - randlicht (rim): een heldere rand langs de randen van poppetjes, bomen, auto's en gevels, het sterkst
//   als je tegen de zon in kijkt. Alleen op staande vlakken (geen gloeiende grond in de verte) en dichtbij.
// - mist met zon: richting de zon kleurt de mist warm, ervan af blijft hij koel, en vlakbij is er geen mist.
// Dit wordt één keer bij het laden in de shaders van three.js gezet, vóór er iets getekend is.
import * as THREE from 'three';

let done = false;
export function installLighting() {
  if (done) return;
  done = true;
  const C = THREE.ShaderChunk;
  // in verlichte materialen bestaan de lampen; zo weet de mist straks dat hij de zonrichting kan gebruiken
  C.lights_pars_begin = C.lights_pars_begin + '\n#define LOCALS_HAS_LIGHTS 1\n';
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
`;
  C.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    fogFactor = pow( fogFactor, 0.8 ) * 0.8; // zachter begin, en verre heuvels blijven nog net zichtbaar
  #endif
  vec3 fogCol = fogColor;
  #if defined( LOCALS_HAS_LIGHTS ) && NUM_DIR_LIGHTS > 0
    {
      float toSun = pow( saturate( dot( normalize( -vViewPosition ), directionalLights[ 0 ].direction ) ), 5.0 );
      fogCol = mix( fogCol, fogCol * 0.55 + directionalLights[ 0 ].color * vec3( 0.22, 0.17, 0.11 ), toSun * 0.75 );
    }
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;
}
