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
