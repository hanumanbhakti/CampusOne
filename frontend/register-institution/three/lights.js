import * as THREE from "three";

import {scene} from "./scene.js";

const ambient=
new THREE.AmbientLight(
0xffffff,
1.5
);

scene.add(ambient);

const point=
new THREE.PointLight(
0x2563EB,
15
);

point.position.set(
5,
8,
5
);

scene.add(point);
