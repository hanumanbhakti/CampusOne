import {scene} from "./scene.js";
import {camera} from "./camera.js";
import {renderer} from "./renderer.js";

import "./lights.js";
import "./particles.js";

document
.getElementById("three-background")
.appendChild(renderer.domElement);

function animate(){

requestAnimationFrame(animate);

scene.rotation.y+=0.0002;

renderer.render(scene,camera);

}

animate();

window.addEventListener("resize",()=>{

camera.aspect=
window.innerWidth/window.innerHeight;

camera.updateProjectionMatrix();

renderer.setSize(
window.innerWidth,
window.innerHeight
);

});
