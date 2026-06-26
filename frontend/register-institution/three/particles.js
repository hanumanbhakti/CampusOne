import * as THREE from "three";

import {scene} from "./scene.js";

const geometry=
new THREE.BufferGeometry();

const count=2000;

const vertices=[];

for(let i=0;i<count;i++){

vertices.push(

(Math.random()-0.5)*60,

(Math.random()-0.5)*60,

(Math.random()-0.5)*60

);

}

geometry.setAttribute(

"position",

new THREE.Float32BufferAttribute(
vertices,
3
)

);

const material=
new THREE.PointsMaterial({

size:0.05,

color:0x60A5FA,

transparent:true,

opacity:.8

});

const particles=
new THREE.Points(
geometry,
material
);

scene.add(particles);
