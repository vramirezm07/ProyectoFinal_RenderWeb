import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as CANNON from 'cannon-es'
import { gsap } from "gsap";

console.log(GLTFLoader);
console.log(CANNON);
console.log(gsap);

let gameRunning = false;


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
// Background oscuro
scene.background = new THREE.Color(0x02030a)

// Fog (niebla)
scene.fog = new THREE.FogExp2(0x02030a, 0.055) // color, densidad

// Ambient muy tenue y azul
const ambientLight = new THREE.AmbientLight(0x223344, 0.25)
scene.add(ambientLight)


// Moon light (direccional)
const moonLight = new THREE.DirectionalLight(0x88aaff, 0.6)
moonLight.position.set(-10, 10, -10)
moonLight.castShadow = true
scene.add(moonLight)

// Luz que sigue al jugador (linterna)
const flashlight = new THREE.SpotLight(
  0x8daaff,    // azul pálido
  2.2,         // intensidad baja
  12,          // distancia corta, se pierde rápido
  Math.PI*0.11, // cono MUY estrecho
  0.85,        // borde suave
  2            // caída real
);

flashlight.castShadow = true
scene.add(flashlight)

// crear target dedicado y añadirlo a la escena
const flashlightTarget = new THREE.Object3D()
scene.add(flashlightTarget)

// asignar el target del spotLight
flashlight.target = flashlightTarget



/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight
}

window.addEventListener('resize', () => {
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
  '/models/Level_One/scene022.glb',
  function (glb) {
    scene.add(glb.scene);
    glb.scene.rotation.y = Math.PI * 1;


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
let foxScene = null;
let foxVelocityZ = 0;
const foxMaxSpeed = 3; // velocidad máxima del zorro (m/s)
const foxInitialZ = -15; // posición inicial Z del zorro
let foxBody = null; // guardar referencia

// --- NUEVO: rango mínimo/máximo garantizado para que siempre vaya rápido ---
const FOX_MIN_SPEED = 2.5; // velocidad mínima (ajusta si quieres más rápido)
const FOX_MAX_SPEED = 5.0; // velocidad máxima real usada por generateFoxSpeed
function generateFoxSpeed() {
  // genera magnitud entre min..max y siempre POSITIVA (va hacia +Z desde foxInitialZ)
  return Math.random() * (FOX_MAX_SPEED - FOX_MIN_SPEED) + FOX_MIN_SPEED;
}

gltfLoader.load(
  '/models/Fox/glTF/Fox.gltf',
  function (gltf) {
    gltf.scene.scale.set(0.1, 0.1, 0.1);
    gltf.scene.position.set(0, 0, foxInitialZ);
    scene.add(gltf.scene);
    foxScene = gltf.scene;

    // Crear un body físico estático para el zorro pero que NO colisione
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const halfExtents = new CANNON.Vec3(
      Math.max(size.x * 0.5, 0.01),
      Math.max(size.y * 0.5, 0.01),
      Math.max(size.z * 0.5, 0.01)
    );

    const foxShape = new CANNON.Box(halfExtents);
    foxBody = new CANNON.Body({ mass: 0 });
    foxBody.addShape(foxShape);

    foxBody.position.set(center.x, center.y, center.z);
    const q = gltf.scene.getWorldQuaternion(new THREE.Quaternion());
    foxBody.quaternion.set(q.x, q.y, q.z, q.w);

    foxBody.collisionFilterMask = 0;
    world.addBody(foxBody);

    // Animation
    mixer = new THREE.AnimationMixer(gltf.scene);
    const action = mixer.clipAction(gltf.animations[1]);
    action.play();

    // generar velocidad inicial random (usar la función nueva)
    foxVelocityZ = generateFoxSpeed();
  }
);


// Grupo para Ducky

let patitaDer, patitaIzq, moño; // referencias si se quieren animar por separado

const duckyGroup = new THREE.Group()
duckyGroup.name = 'Ducky'
duckyGroup.position.set(0, 0, 0) // ajustar la posición global del personaje
scene.add(duckyGroup)

// ...existing code...

gltfLoader.load(
  '/models/Ducky/Ducky_Cuerpo_c.glb',
  function (glb) {
    // añade la pieza al grupo para que comparta el mismo sistema de referencia
    duckyGroup.add(glb.scene)
  }
);

gltfLoader.load(
  '/models/Ducky/Ducky_Patita_Derecha.glb',
  function (glb) {
    patitaDer = glb.scene;
    duckyGroup.add(glb.scene)
  }
);

gltfLoader.load(
  '/models/Ducky/Ducky_Patita_Izquierda.glb',
  function (glb) {
    patitaIzq = glb.scene;
    duckyGroup.add(glb.scene)
  }
);

gltfLoader.load(
  '/models/Ducky/Ducky_Monito.glb',
  function (glb) {
    moño = glb.scene;
    duckyGroup.add(glb.scene)
  }
);


// Physics body para Ducky (ejemplo: cilindro)
const radiusTop = 0.5;
const radiusBottom = 0.5;
const height = 1.8;
const numSegments = 12;

// crea la forma y el body dinámico
const duckShape = new CANNON.Sphere(0.8);
const duckBody = new CANNON.Body({ mass: 5 });
duckBody.addShape(duckShape); // puede añadirse con offsets para shapes compuestos
// posición inicial (coincidir con la posición del group)
duckBody.position.set(0, 0.9, 0);
world.addBody(duckBody);
flashlight.target = duckyGroup


// cuerpo estático para el suelo (evita que atraviese)
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(new CANNON.Plane());
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);


function initGame() {
  // Reinicia posiciones
  duckBody.position.set(0, 0.9, 0);
  duckBody.velocity.set(0, 0, 0);
  duckyGroup.position.set(0, 0, 0);
  duckyGroup.rotation.set(0, 0, 0);

  if (foxScene && foxBody) {
    foxScene.position.set(0, 0, foxInitialZ);
    foxBody.position.set(foxScene.position.x, foxScene.position.y, foxScene.position.z);
    foxVelocityZ = generateFoxSpeed();
  }

  // Reinicia animaciones
  if (tlPataDer && tlPataIzq && tlMoño) {
    tlPataDer.pause(); tlPataDer.progress(0);
    tlPataIzq.pause(); tlPataIzq.progress(0);
    tlMoño.pause(); tlMoño.progress(0);
    isMoving = false;
  }



  // Reinicia el juego
  gameRunning = false;
}



let tlPataDer, tlPataIzq, tlMoño;
let isMoving = false;

function setupDuckyAnimations() {
  if (!patitaDer || !patitaIzq || !moño) {
    requestAnimationFrame(setupDuckyAnimations);
    return;
  }

  // PATITA DERECHA
  tlPataDer = gsap.timeline({ repeat: -1, yoyo: true, paused: true });
  tlPataDer.to(patitaDer.rotation, {
    x: 0.45,
    duration: 0.22,
    ease: "power1.inOut"
  });

  // PATITA IZQUIERDA
  tlPataIzq = gsap.timeline({ repeat: -1, yoyo: true, paused: true });
  tlPataIzq.to(patitaIzq.rotation, {
    x: -0.45,
    duration: 0.28,
    ease: "power1.inOut"
  });

  // MOÑO
  tlMoño = gsap.timeline({ repeat: -1, yoyo: true, paused: true });
  tlMoño.to(moño.position, {
    y: "+=0.04",
    duration: 0.35,
    ease: "sine.inOut",
  });
}

setupDuckyAnimations();

gsap.to(moonLight, {
  intensity: 0.4,
  duration: 3,
  repeat: -1,
  yoyo: true,
  ease: "sine.inOut"
});

gsap.to(scene.fog.color, {
  r: 0.03,
  g: 0.03,
  b: 0.06,
  duration: 6,
  repeat: -1,
  yoyo: true,
});


gsap.to(flashlight, {
  intensity: 1.8,
  duration: 1.5,
  repeat: -1,
  yoyo: true,
  ease: "sine.inOut"
});



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

const music = document.getElementById('bgMusic');
const musicStart = document.getElementById('musicStart');

// función para iniciar el juego
function startGame(){
  gameRunning = true;
  document.getElementById('startScreen').style.display = 'none';

  music.play(); // empieza la música
}

function endGame(){
  gameRunning = false;
  document.getElementById('gameOverScreen').style.display = 'flex';
  musicStart.play();
  music.pause();
}

function resetGame(){
  initGame();
  document.getElementById('gameOverScreen').style.display = 'none';
  gameRunning = true; 
  music.play();
  musicStart.pause();

  // asegurar velocidad rápida consistente en reset
  foxVelocityZ = generateFoxSpeed();
}

function victoryGame() {
  gameRunning = false;
  document.getElementById('victoryScreen').style.display = 'flex';
  musicStart.play();
  music.pause();
}




/**
 * Animate
 */
const clock = new THREE.Clock()
let previousTime = 0
const fixedTimeStep = 1 / 60; // 60Hz


const tick = () => {
  const elapsedTime = clock.getElapsedTime()
  const deltaTime = elapsedTime - previousTime
  previousTime = elapsedTime

  world.step(fixedTimeStep, deltaTime, 3)

  const victoryZ = 222; // ejemplo, ajusta según tu nivel

  if (gameRunning && duckyGroup.position.z >= victoryZ) {
  victoryGame();
}
  

  // mover zorro si el juego está corriendo (SOLO LA VISUAL, no el body)
  if (gameRunning && foxScene && foxBody) {
    foxScene.position.z += foxVelocityZ * deltaTime;
    // sincronizar solo Z del body para colisiones
    foxBody.position.z = foxScene.position.z;
  }


  // sincronizar Three.js con physics (Ducky)
  duckyGroup.position.copy(duckBody.position)
  duckyGroup.position.y -= 0.4 // ajustar offset si el modelo no está centrado en el origen
  if (gameRunning && foxScene) {
  foxScene.position.x = duckyGroup.position.x
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


  if (playerMovement.forward) vz -= moveSpeed
  if (playerMovement.backward) vz += moveSpeed
  if (playerMovement.left) vx -= moveSpeed
  if (playerMovement.right) vx += moveSpeed

  // aplica velocidad (mantener Y actual)
  duckBody.velocity.x = vx
  duckBody.velocity.z = vz


  // Model animation
  if (mixer) {
    mixer.update(deltaTime)
  }

  if (movementVector.lengthSq() > 0.0001) {
    if (!isMoving) {
      isMoving = true;
      if (tlPataDer) tlPataDer.play();
      if (tlPataIzq) tlPataIzq.play();
      if (tlMoño) tlMoño.play();
    }
  } else {
    if (isMoving) {
      isMoving = false;
      if (tlPataDer) { tlPataDer.pause(); tlPataDer.progress(0); }
      if (tlPataIzq) { tlPataIzq.pause(); tlPataIzq.progress(0); }
      if (tlMoño)   { tlMoño.pause();   tlMoño.progress(0); }
    }
  }


  // Render
  renderer.render(scene, camera)

  flashlight.position.copy(camera.position)

  // actualizar target para que apunte al ducky
  flashlightTarget.position.copy(duckyGroup.position)

  // garantizar que la jerarquía de matrices esté actualizada
  flashlightTarget.updateMatrixWorld()
  flashlight.updateMatrixWorld()

  renderer.setClearColor(0x02030a);
  renderer.toneMappingExposure = 0.6; 

  // cámara fija en X/Y y sigue a ducky solo en Z (con suavizado)
  const camFixedX = 0;         
  const camFixedY = 4;         
  const camZOffset = 7;        // distancia relativa al ducky en Z (ajusta)
  const camLerp = 0.08;        // suavizado (0 = instant, 1 = sin suavizado)

  //
  const targetZ = duckyGroup.position.z + camZOffset;

  // mantener X/Y fijos y suavizar Z
  camera.position.x = camFixedX;
  camera.position.y = camFixedY;
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, camLerp);

  // mirar hacia el pato (manteniendo la misma altura de mirada)
  camera.lookAt(new THREE.Vector3(camFixedX, camFixedY - 0.5, duckyGroup.position.z));

  if(gameRunning && foxScene){
  const dx = duckyGroup.position.x - foxScene.position.x;
  const dz = duckyGroup.position.z - foxScene.position.z;
  const dist = Math.sqrt(dx*dx + dz*dz);

  if(dist < 1.5){
    endGame();
  }
}

  // Call tick again on the next frame
  window.requestAnimationFrame(tick)
}

tick()

document.getElementById('playBtn').addEventListener('click', startGame);
document.getElementById('resetBtn').addEventListener('click', resetGame);
document.getElementById('victoryResetBtn').addEventListener('click', () => {
  initGame();
  document.getElementById('victoryScreen').style.display = 'none';
  gameRunning = true;
});
