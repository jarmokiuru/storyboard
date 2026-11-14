// Outline shading (Storyboarder's default "Outline" mode): black edge lines around figures and furniture, so the
// frame reads like a drawing. Drawn as a second pass: every piece again in black, its back faces only, pushed
// outwards along its normals by a fixed share of the frame height — the classic "inverted hull" outline.
// Works for posed figures too, since three.js skins the override material per object.

import * as THREE from "three";

const WIDTH = 0.008;   // outline width as a share of the frame height: ~1.8 px on screen, ~3.4 px on a 2048-px board

const material = new THREE.MeshLambertMaterial({ color: 0x000000, side: THREE.BackSide });
material.onBeforeCompile = (shader) => {
  shader.uniforms.outlineWidth = { value: WIDTH };
  shader.vertexShader = "uniform float outlineWidth;\n" + shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
    vec3 outward = normalize( transformedNormal );
    #ifdef FLIP_SIDED
      outward = - outward;   // back faces flip the normal; the outline still grows outwards
    #endif
    vec2 dir = ( projectionMatrix * vec4( outward, 0.0 ) ).xy;
    float aspect = projectionMatrix[ 1 ][ 1 ] / projectionMatrix[ 0 ][ 0 ];
    dir.x *= aspect;   // same width across and up the frame
    if ( dot( dir, dir ) > 0.0 ) dir = normalize( dir );
    dir.x /= aspect;
    gl_Position.xy += dir * outlineWidth * gl_Position.w;`);
};

// Draws the outlines over what the renderer just drew with this camera. hide: objects to leave out (the room,
// joint dots); the shadow map isn't redrawn for this pass.
export function drawOutlines(renderer, scene, camera, hide = []) {
  const was = hide.map((o) => o.visible);
  hide.forEach((o) => (o.visible = false));
  const autoShadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  scene.overrideMaterial = material;
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  renderer.shadowMap.autoUpdate = autoShadows;
  hide.forEach((o, i) => (o.visible = was[i]));
}
