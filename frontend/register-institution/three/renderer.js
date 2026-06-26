import * as THREE from "three";

export const renderer=
new THREE.WebGLRenderer({

antialias:true,

alpha:true

});

renderer.setPixelRatio(
Math.min(
window.devicePixelRatio,
2
));

renderer.setSize(

window.innerWidth,

window.innerHeight

);
