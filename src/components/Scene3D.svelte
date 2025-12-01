<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';

  export let tracks = [];
  export let waveformData = [];
  export let currentTime = 0;
  export let maxDuration = 0;
  export let isPlaying = false;

  let container;
  let scene, camera, renderer;
  let roadMesh = null;
  let waveformWalls = []; // Array to hold multiple waveform walls
  let timelineIndicator = null;
  let animationId = null;
  let cameraTargetZ = 0;
  let cameraPositionZ = 0;
  let lastCurrentTime = 0;
  const ROAD_WIDTH = 8;
  const ROAD_SEGMENTS = 2000;

  // Camera settings for "driving through" experience
  const CAMERA_HEIGHT = 3;
  const CAMERA_DISTANCE = 15; // How far ahead camera looks
  const CAMERA_SPEED = 0.1; // Smooth camera movement

  function getTrackColor(index) {
    const colors = [
      '#4a9eff',
      '#9b59b6',
      '#e74c3c',
      '#f39c12',
      '#2ecc71',
      '#1abc9c',
    ];
    return colors[index % colors.length];
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
        }
      : { r: 0.3, g: 0.6, b: 1.0 };
  }

  function createRoad() {
    // Create a simple flat road
    const roadLength = maxDuration > 0 ? maxDuration * 10 : 100;
    const geometry = new THREE.PlaneGeometry(ROAD_WIDTH, roadLength, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal (road surface)
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  function createWaveformWall(waveformDataItem, trackIndex) {
    if (
      !waveformDataItem ||
      !waveformDataItem.data ||
      waveformDataItem.data.length === 0 ||
      maxDuration === 0
    ) {
      return null;
    }

    const waveform = waveformDataItem.data;
    const roadLength = maxDuration * 10; // Scale: 10 units per second
    const segmentLength = roadLength / waveform.length;

    // Create waveform wall geometry on the right side
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];

    // Waveform wall parameters
    // Position each track's waveform wall at different X positions
    const TRACK_SPACING = 3; // Space between each track's waveform wall
    const WALL_X_POSITION = ROAD_WIDTH / 2 + 0.5 + trackIndex * TRACK_SPACING; // Right side of road, offset by track index
    const BASE_HEIGHT = 0;
    const WAVEFORM_SCALE = 8; // Height of waveform visualization (slightly reduced for multiple tracks)
    const BAR_WIDTH = segmentLength * 0.9; // Width of each bar (slight gap between bars)
    const WALL_THICKNESS = 0.2; // Depth of the wall

    // Create waveform wall that extends along Z-axis (forward)
    // Waveform creates height variations (Y-axis) - like a bar chart
    for (let i = 0; i < waveform.length; i++) {
      const z = i * segmentLength;
      const waveformHeight = waveform[i] * WAVEFORM_SCALE;
      const topHeight = BASE_HEIGHT + waveformHeight;
      const bottomHeight = BASE_HEIGHT;
      const zCenter = z + segmentLength / 2;

      // Create a vertical bar at this position
      // Each bar is a box: 4 vertices for front face, 4 for back face
      // Front face (facing the road/camera)
      vertices.push(WALL_X_POSITION, bottomHeight, zCenter - BAR_WIDTH / 2); // Bottom-left-front
      vertices.push(
        WALL_X_POSITION + WALL_THICKNESS,
        bottomHeight,
        zCenter - BAR_WIDTH / 2
      ); // Bottom-right-front
      vertices.push(WALL_X_POSITION, topHeight, zCenter - BAR_WIDTH / 2); // Top-left-front
      vertices.push(
        WALL_X_POSITION + WALL_THICKNESS,
        topHeight,
        zCenter - BAR_WIDTH / 2
      ); // Top-right-front

      // Back face
      vertices.push(WALL_X_POSITION, bottomHeight, zCenter + BAR_WIDTH / 2); // Bottom-left-back
      vertices.push(
        WALL_X_POSITION + WALL_THICKNESS,
        bottomHeight,
        zCenter + BAR_WIDTH / 2
      ); // Bottom-right-back
      vertices.push(WALL_X_POSITION, topHeight, zCenter + BAR_WIDTH / 2); // Top-left-back
      vertices.push(
        WALL_X_POSITION + WALL_THICKNESS,
        topHeight,
        zCenter + BAR_WIDTH / 2
      ); // Top-right-back

      // Color based on waveform intensity and track color
      const intensity = Math.max(0.6, Math.min(1.0, waveform[i] * 1.5));
      const rgb = hexToRgb(waveformDataItem.color);

      // Add colors for all 8 vertices of this bar
      for (let j = 0; j < 8; j++) {
        colors.push(rgb.r * intensity, rgb.g * intensity, rgb.b * intensity);
      }

      // Create faces for this bar (6 faces of a box)
      const base = i * 8;

      // Front face
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);

      // Back face
      indices.push(base + 4, base + 6, base + 5);
      indices.push(base + 5, base + 6, base + 7);

      // Top face
      indices.push(base + 2, base + 3, base + 6);
      indices.push(base + 3, base + 7, base + 6);

      // Bottom face
      indices.push(base, base + 4, base + 1);
      indices.push(base + 1, base + 4, base + 5);

      // Left face
      indices.push(base, base + 2, base + 4);
      indices.push(base + 2, base + 6, base + 4);

      // Right face
      indices.push(base + 1, base + 5, base + 3);
      indices.push(base + 3, base + 5, base + 7);
    }

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.6,
      emissive: new THREE.Color(0x111111),
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  function createTimelineIndicator() {
    // Create a transparent vertical wall that moves with the user and intercepts the waveform
    const indicatorGroup = new THREE.Group();

    // Calculate width based on number of tracks
    const numTracks =
      waveformData?.filter((w) => w && w.data && w.data.length > 0).length || 1;
    const TRACK_SPACING = 3; // Same as in createWaveformWall
    const waveformAreaWidth = numTracks * TRACK_SPACING;

    // Create a tall, wide transparent wall that extends across the scene
    // This wall will intersect the waveform bars as it moves forward
    const wallHeight = 30; // Tall enough to cover waveform bars
    const wallWidth = ROAD_WIDTH + 8 + waveformAreaWidth; // Wide enough to cover road and all waveform walls
    const wallThickness = 0.2; // Thickness of the wall

    // Main transparent wall - create as a vertical plane (XY plane) perpendicular to Z-axis
    // PlaneGeometry creates a plane in XY plane by default, which is what we want
    const wallGeometry = new THREE.PlaneGeometry(wallWidth, wallHeight);
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      opacity: 0.3,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.1,
      metalness: 0.7,
      emissive: 0x888888,
      emissiveIntensity: 0.5,
    });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    // No rotation needed - plane is already in XY plane (vertical, perpendicular to Z)
    wall.position.y = wallHeight / 2; // Center vertically
    wall.position.x = 0; // Center on road
    wall.position.z = 0; // Will be updated by updateTimelineIndicator
    indicatorGroup.add(wall);

    // Add a back face for better visibility from behind
    const backWall = new THREE.Mesh(wallGeometry, wallMaterial);
    backWall.position.y = wallHeight / 2;
    backWall.position.x = 0;
    backWall.position.z = 0;
    indicatorGroup.add(backWall);

    // Add edge highlights for better visibility
    const edgeGeometry = new THREE.EdgesGeometry(wallGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.7,
      transparent: true,
      linewidth: 3,
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edges.position.y = wallHeight / 2;
    edges.position.x = 0;
    edges.position.z = 0;
    indicatorGroup.add(edges);

    // Add a subtle glow effect with a point light
    const glowLight = new THREE.PointLight(0xffffff, 0.5, 30);
    glowLight.position.set(0, wallHeight / 2, 0);
    indicatorGroup.add(glowLight);

    // Add a bright center line for better visibility
    const centerLineGeometry = new THREE.BoxGeometry(
      0.1,
      wallHeight,
      wallThickness
    );
    const centerLineMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
      opacity: 0.9,
      transparent: true,
    });
    const centerLine = new THREE.Mesh(centerLineGeometry, centerLineMaterial);
    centerLine.position.y = wallHeight / 2;
    centerLine.position.x = 0;
    centerLine.position.z = 0;
    indicatorGroup.add(centerLine);

    return indicatorGroup;
  }

  function updateTimelineIndicator() {
    if (!scene) return;

    // Remove existing indicator if it exists
    if (timelineIndicator) {
      timelineIndicator.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      scene.remove(timelineIndicator);
      timelineIndicator = null;
    }

    // Create new indicator with correct width for current number of tracks
    timelineIndicator = createTimelineIndicator();
    scene.add(timelineIndicator);

    // Update position
    if (maxDuration > 0) {
      // Calculate position based on current playback time
      // The wall should move with the camera/user position
      const roadLength = maxDuration * 10;
      const indicatorZ = (currentTime / maxDuration) * roadLength;

      // Position indicator at current playback position
      // Center it on the road, aligned with camera position
      timelineIndicator.position.z = indicatorZ;
      timelineIndicator.position.x = 0; // Center on road
      timelineIndicator.position.y = 0;
    } else {
      // Position at start when no audio
      timelineIndicator.position.z = 0;
      timelineIndicator.position.x = 0;
      timelineIndicator.position.y = 0;
    }
  }

  function updateTimelineIndicatorPosition() {
    if (!scene || !timelineIndicator) return;

    if (maxDuration > 0) {
      // Calculate position based on current playback time
      const roadLength = maxDuration * 10;
      const indicatorZ = (currentTime / maxDuration) * roadLength;

      // Position indicator at current playback position
      timelineIndicator.position.z = indicatorZ;
      timelineIndicator.position.x = 0;
      timelineIndicator.position.y = 0;
    } else {
      timelineIndicator.position.z = 0;
      timelineIndicator.position.x = 0;
      timelineIndicator.position.y = 0;
    }
  }

  function createDefaultRoad() {
    // Create a simple default road when no waveform data is available
    const geometry = new THREE.PlaneGeometry(ROAD_WIDTH, 100, 10, 10);
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    return mesh;
  }

  function initScene() {
    if (!container) {
      console.log('Scene3D: No container');
      return;
    }

    // Ensure container has dimensions
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      console.log('Scene3D: Container has no dimensions, retrying...', {
        width: container.clientWidth,
        height: container.clientHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
      });
      setTimeout(() => initScene(), 100);
      return;
    }

    // Don't re-initialize if already initialized
    if (scene && renderer && camera) {
      console.log('Scene3D: Scene already initialized');
      return;
    }

    console.log('Scene3D: Initializing scene', {
      width: container.clientWidth,
      height: container.clientHeight,
      waveformDataLength: waveformData?.length,
      maxDuration,
    });

    try {
      // Scene setup
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0a);
      scene.fog = new THREE.Fog(0x0a0a0a, 50, 200);

      // Camera setup - positioned for "driving through" view
      // Camera starts at the beginning of the road (z=0) looking forward
      const aspect = container.clientWidth / container.clientHeight || 1;
      camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
      camera.position.set(0, CAMERA_HEIGHT, -CAMERA_DISTANCE); // Start behind origin
      camera.lookAt(0, CAMERA_HEIGHT, CAMERA_DISTANCE); // Look forward

      // Renderer setup
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 20, 10);
      directionalLight.castShadow = true;
      directionalLight.shadow.camera.left = -50;
      directionalLight.shadow.camera.right = 50;
      directionalLight.shadow.camera.top = 50;
      directionalLight.shadow.camera.bottom = -50;
      scene.add(directionalLight);

      // Add some point lights for atmosphere
      const pointLight1 = new THREE.PointLight(0x4a9eff, 0.5, 100);
      pointLight1.position.set(-10, 10, 0);
      scene.add(pointLight1);

      const pointLight2 = new THREE.PointLight(0x9b59b6, 0.5, 100);
      pointLight2.position.set(10, 10, 0);
      scene.add(pointLight2);

      // Add grid helper for reference
      const gridHelper = new THREE.GridHelper(100, 20, 0x333333, 0x222222);
      scene.add(gridHelper);

      // Create road (will create default if no waveform data)
      updateRoad();

      // Create waveform wall on right side
      updateWaveformWall();

      // Create timeline indicator (will be updated when tracks change)
      updateTimelineIndicator();

      // Start animation loop
      animate();

      console.log('Scene3D: Scene initialized successfully');
    } catch (error) {
      console.error('Scene3D: Error initializing scene', error);
    }
  }

  function updateRoad() {
    if (!scene) return;

    if (roadMesh) {
      scene.remove(roadMesh);
      roadMesh.geometry.dispose();
      roadMesh.material.dispose();
      roadMesh = null;
    }

    const newRoad = createRoad();
    roadMesh = newRoad;
    scene.add(roadMesh);
    console.log('Scene3D: Road created');
  }

  function updateWaveformWall() {
    if (!scene) return;

    // Remove all existing waveform walls
    waveformWalls.forEach((wall) => {
      scene.remove(wall);
      wall.geometry.dispose();
      wall.material.dispose();
    });
    waveformWalls = [];

    // Create a waveform wall for each track with valid waveform data
    if (waveformData && waveformData.length > 0 && maxDuration > 0) {
      waveformData.forEach((waveformDataItem, index) => {
        if (
          waveformDataItem &&
          waveformDataItem.data &&
          waveformDataItem.data.length > 0
        ) {
          const newWall = createWaveformWall(waveformDataItem, index);
          if (newWall) {
            waveformWalls.push(newWall);
            scene.add(newWall);
            console.log(
              `Scene3D: Waveform wall created for track ${index} on right side`
            );
          }
        }
      });
    }
  }

  function updateCamera() {
    if (!camera) return;

    // Reset camera position if playback was reset (currentTime went backward)
    if (currentTime < lastCurrentTime) {
      cameraPositionZ = 0;
      cameraTargetZ = 0;
    }
    lastCurrentTime = currentTime;

    if (maxDuration > 0) {
      // Calculate camera position based on current playback time
      // Road extends from z=0 forward (positive Z direction)
      const roadLength = maxDuration * 10;
      const targetZ = (currentTime / maxDuration) * roadLength;

      // Smooth camera movement
      cameraTargetZ = targetZ;
      cameraPositionZ += (cameraTargetZ - cameraPositionZ) * CAMERA_SPEED;

      // Camera follows the road - positioned above the road at current playback position
      // Camera is behind the current position looking forward along the road
      camera.position.z = cameraPositionZ - CAMERA_DISTANCE; // Behind current position
      camera.position.y = CAMERA_HEIGHT;
      camera.position.x = 0;

      // Camera looks ahead along the road (forward direction)
      const lookAheadZ = cameraPositionZ + CAMERA_DISTANCE; // Look ahead
      camera.lookAt(0, CAMERA_HEIGHT, lookAheadZ);
    } else {
      // Default camera position when no audio is loaded
      // Start at beginning of road looking forward
      camera.position.set(0, CAMERA_HEIGHT, -CAMERA_DISTANCE);
      camera.lookAt(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
      cameraPositionZ = 0;
      cameraTargetZ = 0;
    }
  }

  function animate() {
    if (!renderer || !scene || !camera) {
      console.error(
        'Scene3D: Cannot animate - missing renderer, scene, or camera'
      );
      return;
    }

    animationId = requestAnimationFrame(animate);

    try {
      // Update camera based on playback
      updateCamera();

      // Update timeline indicator position (only position, not recreation)
      updateTimelineIndicatorPosition();

      renderer.render(scene, camera);
    } catch (error) {
      console.error('Scene3D: Error in animate loop', error);
    }
  }

  function handleResize() {
    if (!container || !camera || !renderer) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  // Watch for waveform data changes
  $: if (scene && container) {
    console.log('Scene3D: Waveform data changed', {
      waveformDataLength: waveformData?.length,
      maxDuration,
      hasValidData: waveformData?.some((w) => w?.data?.length > 0),
      numTracks: waveformData?.filter((w) => w && w.data && w.data.length > 0)
        .length,
    });
    updateRoad();
    updateWaveformWall();
    updateTimelineIndicator(); // Recreate indicator to match new track count
  }

  onMount(() => {
    console.log('Scene3D: Component mounted');
    // Delay initialization slightly to ensure container is ready
    const initTimer = setTimeout(() => {
      initScene();
    }, 100);

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initTimer);
    };
  });

  // Re-initialize scene if container becomes visible
  $: if (container && !scene) {
    setTimeout(() => {
      if (
        container &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        initScene();
      }
    }, 100);
  }

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    // Cleanup
    if (roadMesh) {
      scene?.remove(roadMesh);
      roadMesh.geometry?.dispose();
      roadMesh.material?.dispose();
    }

    waveformWalls.forEach((wall) => {
      scene?.remove(wall);
      wall.geometry?.dispose();
      wall.material?.dispose();
    });

    if (timelineIndicator) {
      // Clean up timeline indicator and its children
      timelineIndicator.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      scene?.remove(timelineIndicator);
    }

    if (renderer) {
      renderer.dispose();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    }

    window.removeEventListener('resize', handleResize);
  });
</script>

<div class="scene-3d-container" bind:this={container}>
  {#if !scene}
    <div class="loading-message">
      <p>Initializing 3D Scene...</p>
    </div>
  {:else if !waveformData || waveformData.length === 0 || maxDuration === 0}
    <div class="loading-message">
      <p>Load audio files to see the 3D visualization</p>
      <p class="hint">
        The waveform will appear as a road you can drive through
      </p>
    </div>
  {/if}
</div>

<style>
  .scene-3d-container {
    width: 100%;
    height: 100%;
    min-height: 600px;
    position: relative;
    overflow: hidden;
    background: #0a0a0a;
  }

  .loading-message {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: #888;
    z-index: 10;
    pointer-events: none;
  }

  .loading-message p {
    margin: 10px 0;
    font-size: 16px;
  }

  .loading-message .hint {
    font-size: 12px;
    color: #666;
  }
</style>
