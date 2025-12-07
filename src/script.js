import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js' 
import GUI from 'lil-gui'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as CANNON from 'cannon-es'
import { gsap } from "gsap";

console.log(GLTFLoader);
console.log(CANNON);
console.log(gsap);

/**
 * Base
 */
// Debug
const gui = new GUI()

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

/**
 * Floor
 */
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({
        color: '#444444',
        metalness: 0,
        roughness: 0.5
    })
)
floor.receiveShadow = true
floor.rotation.x = - Math.PI * 0.5


/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 2.4)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.8)
directionalLight.castShadow = true
directionalLight.shadow.mapSize.set(1024, 1024)
directionalLight.shadow.camera.far = 15
directionalLight.shadow.camera.left = - 7
directionalLight.shadow.camera.top = 7
directionalLight.shadow.camera.right = 7
directionalLight.shadow.camera.bottom = - 7
directionalLight.position.set(5, 5, 5)
scene.add(directionalLight)

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(2, 2, 2)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 0.75, 0)
controls.object.position.set(0, 2, 7) // posicionar la camara al pato y en tick 
controls.enableDamping = true
controls.enabled = false

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

/**
* Physics
*/
const world = new CANNON.World({
   gravity: new CANNON.Vec3(0, -9.82, 0) // m/s^2 (Earth's gravity)
});


//Models

let mixer = null;
const gltfLoader = new GLTFLoader();


gltfLoader.load(
  '/models/Level_One/scene02.glb',
  function (glb)  {
       scene.add(glb.scene);
       

       // Crear colliders estáticos para cada mesh del nivel (AABB -> CANNON.Box)
       glb.scene.traverse((child) => {
         if (!child.isMesh || !child.geometry) return;

         child.castShadow = true;
         child.receiveShadow = true;

         // asegurar boundingBox
         const geom = child.geometry.clone();
         geom.computeBoundingBox();
         const bb = geom.boundingBox;

         // tamaño en local space
         const size = new THREE.Vector3();
         bb.getSize(size);

         // tener en cuenta la escala del mesh en el mundo
         child.updateWorldMatrix(true, false);
         const worldScale = child.getWorldScale(new THREE.Vector3());
         const halfExtents = new CANNON.Vec3(
           (size.x * worldScale.x) * 0.5,
           (size.y * worldScale.y) * 0.5,
           (size.z * worldScale.z) * 0.5
         );

         // si alguna dimensión es 0 (planes muy finos) ponemos pequeño valor mínimo
         halfExtents.x = Math.max(halfExtents.x, 0.01);
         halfExtents.y = Math.max(halfExtents.y, 0.01);
         halfExtents.z = Math.max(halfExtents.z, 0.01);

         const boxShape = new CANNON.Box(halfExtents);
         const body = new CANNON.Body({ mass: 0 });
         body.addShape(boxShape);

         // calcular posición/rotación en mundo (centro del bounding box)
         const center = new THREE.Vector3();
         bb.getCenter(center); // centro en espacio local
         center.applyMatrix4(child.matrixWorld); // a espacio mundo

         body.position.set(center.x, center.y, center.z);
         const q = child.getWorldQuaternion(new THREE.Quaternion());
         body.quaternion.set(q.x, q.y, q.z, q.w);

         world.addBody(body);

        //  // opcional: helper visual para debug (comentar en producción)
        //  const debugMesh = new THREE.Mesh(
        //    new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
        //    new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, opacity: 0.35, transparent: true })
        //  );
        //  debugMesh.position.copy(body.position);
        //  debugMesh.quaternion.copy(child.getWorldQuaternion(new THREE.Quaternion()));
        //  scene.add(debugMesh);
       });
    }
);

//Zorro
gltfLoader.load(
'/models/Fox/glTF/Fox.gltf',
function (gltf)  {
       gltf.scene.scale.set(0.1, 0.1, 0.1);
       gltf.scene.position.set(0, 0, -25);
       scene.add(gltf.scene);3

       // Animation
       mixer = new THREE.AnimationMixer(gltf.scene);
       const action = mixer.clipAction(gltf.animations[1]);
       action.play();
    }
);

// Grupo para Ducky

const duckyGroup = new THREE.Group()
duckyGroup.name = 'Ducky'
duckyGroup.position.set(0, 0, 0) // ajustar la posición global del personaje
scene.add(duckyGroup)

// ...existing code...

gltfLoader.load(
  '/models/Ducky/Ducky_Cuerpo.glb',
  function (glb)  {
       // añade la pieza al grupo para que comparta el mismo sistema de referencia
       duckyGroup.add(glb.scene)
    }
);

gltfLoader.load(
  '/models/Ducky/Ducky_Patita_Derecha.glb',
  function (glb)  {
       duckyGroup.add(glb.scene)
    }
);

gltfLoader.load(
  '/models/Ducky/Ducky_Patita_Izquierda.glb',
  function (glb)  {
       duckyGroup.add(glb.scene)
    }
);

gltfLoader.load(
  '/models/Ducky/Ducky_Monito.glb',
  function (glb)  {
       duckyGroup.add(glb.scene)
    }
);


// Physics body para Ducky (ejemplo: cilindro)
const radiusTop = 0.5;
const radiusBottom = 0.5;
const height = 1.8;
const numSegments = 12;

// crea la forma y el body dinámico
const duckShape = new CANNON.Sphere(1);
const duckBody = new CANNON.Body({ mass: 5 });
duckBody.addShape(duckShape); // puede añadirse con offsets para shapes compuestos
// posición inicial (coincidir con la posición del group)
duckBody.position.set(0, 0.9, 0);
world.addBody(duckBody);


// opcional: cuerpo estático para el suelo (evita que atraviese)
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);


/**
* Player Controls
*/
const playerMovement = {
   speed: 0.1,
   forward: false,
   backward: false,
   left: false,
   right: false,
   jump: false,
}
window.addEventListener('keydown', (event) => {
   switch (event.key) {
       case 'w': playerMovement.forward = true;
           break
       case 's': playerMovement.backward = true;
           break
       case 'a': playerMovement.left = true;
           break
       case 'd': playerMovement.right = true;
           break
       case ' ': playerMovement.jump = true;
           break
   }
});

window.addEventListener('keyup', (event) => {
   switch (event.key) {
       case 'w': playerMovement.forward = false;
           break
       case 's': playerMovement.backward = false;
           break
       case 'a': playerMovement.left = false;
           break
       case 'd': playerMovement.right = false;
           break
       case ' ': playerMovement.jump = false;
           break
   }
});


/**
 * Animate
 */
const clock = new THREE.Clock()
let previousTime = 0
const fixedTimeStep = 1 / 60; // 60Hz

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()
    const deltaTime = elapsedTime - previousTime
    previousTime = elapsedTime

    world.step(fixedTimeStep, deltaTime, 3)

    // sincronizar Three.js con physics (Ducky)
    duckyGroup.position.copy(duckBody.position)
    duckyGroup.position.y -= 0.9 // ajustar offset si el modelo no está centrado en el origen

    // Model animation
   if(mixer) {
       mixer.update(deltaTime)
   }

   // Mover el body físico (no la shape) con velocidades — conserva velocidad Y para gravedad
    const moveSpeed = 5 // m/s ajusta según necesites
    const jumpSpeed = 6 // impulso de salto
    let vx = 0
    let vz = 0

    const movementVector = new THREE.Vector3(
  (playerMovement.left ? -1 : 0) + (playerMovement.right ? 1 : 0),
  0,
  (playerMovement.forward ? -1 : 0) + (playerMovement.backward ? 1 : 0)
);

// si hay entrada, normaliza para evitar diagonales más rápidas
if (movementVector.lengthSq() > 0) {
  movementVector.normalize().multiplyScalar(moveSpeed);
} else {
  movementVector.set(0, 0, 0);
}

// aplicar velocidades X/Z al body (no tocar Y para gravedad/salto)
duckBody.velocity.x = movementVector.x;
duckBody.velocity.z = movementVector.z;

// salto (misma lógica que tienes)
const groundThreshold = 1.05;
if (playerMovement.jump && Math.abs(duckBody.position.y - groundThreshold) < 0.2) {
  duckBody.velocity.y = jumpSpeed;
}

// rotación visual del ducky hacia la dirección de movimiento
if (movementVector.lengthSq() > 0.0001) {
  // calcular yaw (atan2(x, z))
  let targetAngle = Math.atan2(movementVector.x, movementVector.z);
  // si tu modelo mira por -Z por defecto, suma Math.PI:
  // targetAngle += Math.PI;
  const turnSpeed = 0.15; // suavizado (0..1)
  duckyGroup.rotation.y = THREE.MathUtils.lerp(duckyGroup.rotation.y, targetAngle, turnSpeed);
}

//    if (playerMovement.forward) { duckShape.position.z -= playerMovement.speed }
//    if (playerMovement.backward) { duckShape.position.z += playerMovement.speed }
//    if (playerMovement.left) { duckShape.position.x -= playerMovement.speed }
//    if (playerMovement.right) { duckShape.position.x += playerMovement.speed }
//    if (playerMovement.jump) { duckShape.position.y += playerMovement.speed }

//    // Player
//    duckBody.position.copy(duckBody.position)
//    duckBody.quaternion.copy(duckBody.quaternion)

   if (playerMovement.forward)  vz -= moveSpeed
    if (playerMovement.backward) vz += moveSpeed
    if (playerMovement.left)     vx -= moveSpeed
    if (playerMovement.right)    vx += moveSpeed

    // aplica velocidad (mantener Y actual)
    duckBody.velocity.x = vx
    duckBody.velocity.z = vz


    // Model animation
    if(mixer) {
       mixer.update(deltaTime)
    }


    // Update controls
    // controls.update()

    // Render
    renderer.render(scene, camera)

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()