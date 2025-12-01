<script>
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import Knob from './Knob.svelte';

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

  function createWaveformWall(waveformDataItem, trackIndex, totalTracks) {
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
    // Distribute tracks between left and right sides of the road
    const TRACK_SPACING = 5; // Space between each track's waveform wall
    const tracksPerSide = Math.ceil(totalTracks / 2); // Split tracks between left and right

    // Determine which side this track is on
    const isLeftSide = trackIndex < tracksPerSide;
    const sideIndex = isLeftSide ? trackIndex : trackIndex - tracksPerSide;

    // Position: left side uses negative X, right side uses positive X
    const WALL_X_POSITION = isLeftSide
      ? -(ROAD_WIDTH / 2 + 1 + sideIndex * TRACK_SPACING) // Left side (negative X)
      : ROAD_WIDTH / 2 + 1 + sideIndex * TRACK_SPACING; // Right side (positive X)
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
      opacity: 0.4, // Make waveform bars more transparent
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  // Helper function to handle control adjustments
  function adjustControl(track, controlType, action) {
    if (!track) return;

    const step = action === 'increase' ? 1 : -1;
    const stepSize = 0.1;

    switch (controlType) {
      case 'gain':
        const currentGain = track.getGain();
        const newGain = Math.max(0, Math.min(2, currentGain + step * stepSize));
        track.setGain(newGain);
        break;

      case 'volume':
        const currentVolume = track.getVolume();
        const newVolume = Math.max(
          0,
          Math.min(1, currentVolume + step * stepSize)
        );
        track.setVolume(newVolume);
        break;

      case 'lowEQ':
        const currentLowEQ = track.getLowEQ();
        const newLowEQ = Math.max(-12, Math.min(12, currentLowEQ + step * 1));
        track.setLowEQ(newLowEQ);
        break;

      case 'midEQ':
        const currentMidEQ = track.getMidEQ();
        const newMidEQ = Math.max(-12, Math.min(12, currentMidEQ + step * 1));
        track.setMidEQ(newMidEQ);
        break;

      case 'highEQ':
        const currentHighEQ = track.getHighEQ();
        const newHighEQ = Math.max(-12, Math.min(12, currentHighEQ + step * 1));
        track.setHighEQ(newHighEQ);
        break;
    }
  }

  // Get track side (left or right) for positioning cards
  function getTrackSide(trackIndex, totalTracks) {
    const tracksPerSide = Math.ceil(totalTracks / 2);
    return trackIndex < tracksPerSide ? 'left' : 'right';
  }

  // Track state for reactive updates
  let trackStates = {};

  // Card positions for dragging
  let cardPositions = {};

  // Track names (custom names for each track)
  let trackNames = {};

  // Editing state
  let editingTrackName = null;
  let nameInput = null;

  // Track mute/solo state for reactivity
  let trackMuteSolo = {};

  // Auto-focus action for input
  function autoFocus(node) {
    node.focus();
    node.select();
  }

  // Drag state
  let draggedCard = null;
  let dragOffset = { x: 0, y: 0 };

  // Initialize card positions and names
  $: if (tracks && tracks.length > 0) {
    const validTracks =
      waveformData?.filter((w) => w && w.data && w.data.length > 0) || [];
    const totalTracks = validTracks.length;
    const tracksPerSide = Math.ceil(totalTracks / 2);

    tracks.forEach((track, index) => {
      if (
        track &&
        waveformData[index] &&
        waveformData[index].data &&
        waveformData[index].data.length > 0
      ) {
        if (!cardPositions[index]) {
          const isLeftSide = index < tracksPerSide;
          const sideIndex = isLeftSide ? index : index - tracksPerSide;
          cardPositions[index] = {
            x: isLeftSide ? 20 : null, // null means use right positioning
            y: 20 + sideIndex * 280, // Reduced spacing
          };
        }
        // Initialize track name if not set
        if (!trackNames[index]) {
          trackNames[index] = `Track ${index + 1}`;
        }
        // Initialize mute/solo state
        if (!trackMuteSolo[index]) {
          trackMuteSolo[index] = {
            muted: track.getMute(),
            soloed: track.getSolo(),
          };
        } else {
          // Update existing state
          trackMuteSolo[index].muted = track.getMute();
          trackMuteSolo[index].soloed = track.getSolo();
        }
      }
    });
    cardPositions = { ...cardPositions }; // Trigger reactivity
    trackNames = { ...trackNames }; // Trigger reactivity
    trackMuteSolo = { ...trackMuteSolo }; // Trigger reactivity
  }

  function startEditingName(trackIndex, event) {
    event.stopPropagation(); // Prevent card dragging
    editingTrackName = trackIndex;
  }

  function finishEditingName(trackIndex, event) {
    const newName = event.target.value.trim() || `Track ${trackIndex + 1}`;
    trackNames[trackIndex] = newName;
    trackNames = { ...trackNames };
    editingTrackName = null;
  }

  function handleNameKeydown(trackIndex, event) {
    if (event.key === 'Enter') {
      event.target.blur();
    } else if (event.key === 'Escape') {
      editingTrackName = null;
      event.target.blur();
    }
  }

  function handleCardMouseDown(event, trackIndex) {
    if (
      event.target.closest('.knob-container') ||
      event.target.closest('input') ||
      event.target.closest('canvas')
    ) {
      return; // Don't drag if clicking on controls
    }
    draggedCard = trackIndex;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    dragOffset.x = event.clientX - rect.left;
    dragOffset.y = event.clientY - rect.top;
    event.preventDefault();
  }

  function handleCardMouseMove(event) {
    if (draggedCard === null) return;

    if (!cardPositions[draggedCard]) {
      cardPositions[draggedCard] = { x: 0, y: 0 };
    }

    const containerRect = container?.getBoundingClientRect();
    if (!containerRect) return;

    const newX = event.clientX - containerRect.left - dragOffset.x;
    const newY = event.clientY - containerRect.top - dragOffset.y;

    // Constrain to viewport
    const cardWidth = 300; // Reduced width
    const cardHeight = 400; // Approximate height
    cardPositions[draggedCard].x = Math.max(
      0,
      Math.min(newX, containerRect.width - cardWidth)
    );
    cardPositions[draggedCard].y = Math.max(
      0,
      Math.min(newY, containerRect.height - cardHeight)
    );
    cardPositions[draggedCard].x = cardPositions[draggedCard].x; // Clear right positioning
    cardPositions = { ...cardPositions };
  }

  function handleCardMouseUp() {
    draggedCard = null;
  }

  // Initialize track state
  $: if (tracks && tracks.length > 0) {
    tracks.forEach((track, index) => {
      if (track && !trackStates[index]) {
        trackStates[index] = {
          gain: track.getGain(),
          volume: track.getVolume(),
          lowEQ: track.getLowEQ(),
          midEQ: track.getMidEQ(),
          highEQ: track.getHighEQ(),
          lowFreq: track.getLowFrequency(),
          midFreq: track.getMidFrequency(),
          highFreq: track.getHighFrequency(),
        };
      }
      // Update state from track
      if (track && trackStates[index]) {
        trackStates[index].gain = track.getGain();
        trackStates[index].volume = track.getVolume();
        trackStates[index].lowEQ = track.getLowEQ();
        trackStates[index].midEQ = track.getMidEQ();
        trackStates[index].highEQ = track.getHighEQ();
        trackStates[index].lowFreq = track.getLowFrequency();
        trackStates[index].midFreq = track.getMidFrequency();
        trackStates[index].highFreq = track.getHighFrequency();
      }
    });
  }

  // Format frequency display
  function formatFrequency(freq) {
    if (freq >= 1000) {
      return `${(freq / 1000).toFixed(1)}k`;
    }
    return Math.round(freq).toString();
  }

  // Draw EQ curve on canvas
  function drawEQ(canvas, track, trackIndex) {
    if (!canvas || !track || !trackStates[trackIndex]) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const state = trackStates[trackIndex];

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;

    // Horizontal center line (0dB)
    const centerY = height / 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Frequency range (logarithmic): 20Hz to 20kHz
    const minFreq = 20;
    const maxFreq = 20000;

    // Draw frequency response curve
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      const freq = minFreq * Math.pow(maxFreq / minFreq, i / width);

      // Calculate response for each filter
      let response = 0;

      // Low shelf response (simplified)
      if (freq <= state.lowFreq) {
        response += state.lowEQ;
      } else if (freq <= state.lowFreq * 2) {
        response += state.lowEQ * (1 - (freq - state.lowFreq) / state.lowFreq);
      }

      // Mid peaking response (simplified)
      const midDist = Math.abs(Math.log2(freq / state.midFreq));
      if (midDist < 1.5) {
        const bell = Math.cos(((midDist / 1.5) * Math.PI) / 2);
        response += state.midEQ * bell;
      }

      // High shelf response (simplified)
      if (freq >= state.highFreq) {
        response += state.highEQ;
      } else if (freq >= state.highFreq / 2) {
        response +=
          state.highEQ * ((freq - state.highFreq / 2) / (state.highFreq / 2));
      }

      // Convert to dB for display (clamped to -24dB to +24dB)
      const displayGain = Math.max(-24, Math.min(24, response));

      // Map to canvas coordinates
      const y = centerY - (displayGain / 24) * (height / 2 - 10);

      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();

    // Draw frequency markers
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const markerFreqs = [100, 1000, 10000];
    markerFreqs.forEach((freq) => {
      const x =
        (Math.log(freq / minFreq) / Math.log(maxFreq / minFreq)) * width;
      ctx.beginPath();
      ctx.moveTo(x, height - 15);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillText(formatFrequency(freq), x, height - 12);
    });
  }

  // Setup canvas for EQ display
  function setupEQCanvas(canvas, track, trackIndex) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    drawEQ(canvas, track, trackIndex);
  }

  function createTimelineIndicator() {
    // Create a horizontal line that moves with the user and intercepts the waveform
    const indicatorGroup = new THREE.Group();

    // Calculate width based on number of tracks
    // Tracks are split between left and right sides
    const numTracks =
      waveformData?.filter((w) => w && w.data && w.data.length > 0).length || 1;
    const TRACK_SPACING = 5; // Same as in createWaveformWall
    const tracksPerSide = Math.ceil(numTracks / 2); // Split tracks between left and right
    const waveformAreaWidth = tracksPerSide * TRACK_SPACING; // Width needed for one side

    // Create a horizontal line that extends across the scene
    // This line will intersect the waveform bars as it moves forward
    // Extend to cover both left and right sides
    const lineLength = ROAD_WIDTH + 8 + waveformAreaWidth * 2; // Wide enough to cover road and waveform walls on both sides
    const lineHeight = 0.15; // Height of the line (increased for visibility)
    const lineThickness = 0.08; // Thickness of the line (increased for visibility)

    // Main horizontal line - create as a box geometry
    const lineGeometry = new THREE.BoxGeometry(
      lineLength,
      lineHeight,
      lineThickness
    );
    const lineMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.0, // Increased for better visibility
      roughness: 0.1,
      metalness: 0.9,
      depthTest: true,
      depthWrite: true,
    });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.rotation.x = -Math.PI / 2; // Rotate to be horizontal (parallel to road)
    line.position.y = 0.1; // Slightly above the road for better visibility
    line.position.x = 0; // Center on road
    line.position.z = 0; // Will be updated by updateTimelineIndicator
    line.renderOrder = 1000; // Render on top of other objects
    indicatorGroup.add(line);

    // Add a brighter outline for better visibility
    const outlineGeometry = new THREE.EdgesGeometry(lineGeometry);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
    });
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.1;
    outline.position.x = 0;
    outline.position.z = 0;
    outline.renderOrder = 1001; // Render on top of the line
    indicatorGroup.add(outline);

    // Add a subtle glow effect with a point light
    const glowLight = new THREE.PointLight(0xffffff, 0.8, 25);
    glowLight.position.set(0, 0.1, 0);
    indicatorGroup.add(glowLight);

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
      // Position slightly in front of waveform bars to ensure visibility
      timelineIndicator.position.z = indicatorZ + 0.15; // Slightly forward to be in front of bars
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
      // Position slightly in front of waveform bars to ensure visibility
      timelineIndicator.position.z = indicatorZ + 0.15; // Slightly forward to be in front of bars
      timelineIndicator.position.x = 0;
      timelineIndicator.position.y = 0;
    } else {
      timelineIndicator.position.z = 0.15; // Keep offset even when no audio
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
      const validTracks = waveformData.filter(
        (w) => w && w.data && w.data.length > 0
      );
      const totalTracks = validTracks.length;

      waveformData.forEach((waveformDataItem, index) => {
        if (
          waveformDataItem &&
          waveformDataItem.data &&
          waveformDataItem.data.length > 0
        ) {
          const newWall = createWaveformWall(
            waveformDataItem,
            index,
            totalTracks
          );
          if (newWall) {
            waveformWalls.push(newWall);
            scene.add(newWall);
            const side = index < Math.ceil(totalTracks / 2) ? 'left' : 'right';
            console.log(
              `Scene3D: Waveform wall created for track ${index} on ${side} side`
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
    window.addEventListener('mousemove', handleCardMouseMove);
    window.addEventListener('mouseup', handleCardMouseUp);

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
    window.removeEventListener('mousemove', handleCardMouseMove);
    window.removeEventListener('mouseup', handleCardMouseUp);
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

  <!-- 2D Track Control Cards -->
  {#if scene && tracks && tracks.length > 0}
    {@const validTracks =
      waveformData?.filter((w) => w && w.data && w.data.length > 0) || []}
    {@const totalTracks = validTracks.length}
    {@const tracksPerSide = Math.ceil(totalTracks / 2)}
    {#each tracks as track, trackIndex}
      {@const hasWaveform =
        waveformData[trackIndex] &&
        waveformData[trackIndex].data &&
        waveformData[trackIndex].data.length > 0}
      {#if hasWaveform}
        {@const side = getTrackSide(trackIndex, totalTracks)}
        {@const isLeftSide = trackIndex < tracksPerSide}
        {@const sideIndex = isLeftSide
          ? trackIndex
          : trackIndex - tracksPerSide}
        {@const color = getTrackColor(trackIndex)}
        <div
          class="track-card"
          class:dragging={draggedCard === trackIndex}
          style="left: {cardPositions[trackIndex]?.x !== null &&
          cardPositions[trackIndex].x !== undefined
            ? cardPositions[trackIndex].x + 'px'
            : 'auto'}; 
                 right: {cardPositions[trackIndex]?.x === null ||
          cardPositions[trackIndex]?.x === undefined
            ? side === 'right'
              ? 20 + sideIndex * 280
              : 'auto'
            : 'auto'}; 
                 top: {cardPositions[trackIndex]?.y || 20 + sideIndex * 280}px;"
          role="dialog"
          aria-label="Track {trackIndex + 1} controls"
          on:mousedown={(e) => handleCardMouseDown(e, trackIndex)}
        >
          <div
            class="card-header drag-handle"
            style="background-color: {color}20; border-left: 3px solid {color}"
          >
            {#if editingTrackName === trackIndex}
              <input
                type="text"
                class="track-name-input"
                value={trackNames[trackIndex] || `Track ${trackIndex + 1}`}
                on:blur={(e) => finishEditingName(trackIndex, e)}
                on:keydown={(e) => handleNameKeydown(trackIndex, e)}
                bind:this={nameInput}
                use:autoFocus
              />
            {:else}
              <h3
                class="track-name"
                on:dblclick={(e) => startEditingName(trackIndex, e)}
                title="Double-click to edit name"
              >
                {trackNames[trackIndex] || `Track ${trackIndex + 1}`}
              </h3>
            {/if}
            <div class="header-controls">
              <button
                class="mute-button"
                class:active={trackMuteSolo[trackIndex]?.muted || false}
                on:click={() => {
                  const newMuteState = !track.getMute();
                  track.setMute(newMuteState);
                  if (!trackMuteSolo[trackIndex]) {
                    trackMuteSolo[trackIndex] = { muted: false, soloed: false };
                  }
                  trackMuteSolo[trackIndex].muted = newMuteState;
                  trackMuteSolo = { ...trackMuteSolo }; // Trigger reactivity
                }}
                title="Mute"
              >
                M
              </button>
              <button
                class="solo-button"
                class:active={trackMuteSolo[trackIndex]?.soloed || false}
                on:click={() => {
                  const newSoloState = !track.getSolo();
                  track.setSolo(newSoloState);
                  if (!trackMuteSolo[trackIndex]) {
                    trackMuteSolo[trackIndex] = { muted: false, soloed: false };
                  }
                  trackMuteSolo[trackIndex].soloed = newSoloState;
                  trackMuteSolo = { ...trackMuteSolo }; // Trigger reactivity
                }}
                title="Solo"
              >
                S
              </button>
            </div>
          </div>
          <div class="card-content">
            <!-- Gain Knob -->
            <div class="gain-section">
              <Knob
                value={trackStates[trackIndex]?.gain || track.getGain()}
                min={0}
                max={2}
                step={0.01}
                label="Gain"
                unit=""
                size={45}
                on:change={(e) => {
                  track.setGain(e.detail);
                  if (!trackStates[trackIndex]) trackStates[trackIndex] = {};
                  trackStates[trackIndex].gain = e.detail;
                  trackStates = { ...trackStates };
                }}
              />
            </div>

            <!-- EQ Display -->
            <div class="eq-display-container">
              <canvas
                class="eq-canvas"
                data-track-index={trackIndex}
                on:mount={(e) => {
                  const canvas = e.target;
                  if (canvas && track && trackStates[trackIndex]) {
                    setupEQCanvas(canvas, track, trackIndex);
                  }
                }}
              ></canvas>
            </div>

            <!-- EQ Controls with Frequency Selectors -->
            <div class="eq-controls">
              <!-- Low EQ -->
              <div class="eq-band">
                <Knob
                  value={trackStates[trackIndex]?.lowEQ ?? track.getLowEQ()}
                  min={-12}
                  max={12}
                  step={0.1}
                  label="Low"
                  unit="dB"
                  size={40}
                  on:change={(e) => {
                    track.setLowEQ(e.detail);
                    if (!trackStates[trackIndex]) trackStates[trackIndex] = {};
                    trackStates[trackIndex].lowEQ = e.detail;
                    trackStates = { ...trackStates };
                    const canvas = document.querySelector(
                      `canvas[data-track-index="${trackIndex}"]`
                    );
                    if (canvas) drawEQ(canvas, track, trackIndex);
                  }}
                />
                <div class="freq-control">
                  <label for="low-freq-{trackIndex}">Freq</label>
                  <input
                    id="low-freq-{trackIndex}"
                    type="range"
                    min="20"
                    max="500"
                    step="1"
                    value={trackStates[trackIndex]?.lowFreq || 250}
                    on:input={(e) => {
                      const val = parseFloat(e.target.value);
                      track.setLowFrequency(val);
                      trackStates[trackIndex].lowFreq = val;
                      trackStates = { ...trackStates };
                      const canvas = document.querySelector(
                        `canvas[data-track-index="${trackIndex}"]`
                      );
                      if (canvas) drawEQ(canvas, track, trackIndex);
                    }}
                    class="freq-slider"
                  />
                  <span class="freq-value"
                    >{formatFrequency(
                      trackStates[trackIndex]?.lowFreq || 250
                    )}Hz</span
                  >
                </div>
              </div>

              <!-- Mid EQ -->
              <div class="eq-band">
                <Knob
                  value={trackStates[trackIndex]?.midEQ ?? track.getMidEQ()}
                  min={-12}
                  max={12}
                  step={0.1}
                  label="Mid"
                  unit="dB"
                  size={40}
                  on:change={(e) => {
                    track.setMidEQ(e.detail);
                    if (!trackStates[trackIndex]) trackStates[trackIndex] = {};
                    trackStates[trackIndex].midEQ = e.detail;
                    trackStates = { ...trackStates };
                    const canvas = document.querySelector(
                      `canvas[data-track-index="${trackIndex}"]`
                    );
                    if (canvas) drawEQ(canvas, track, trackIndex);
                  }}
                />
                <div class="freq-control">
                  <label for="mid-freq-{trackIndex}">Freq</label>
                  <input
                    id="mid-freq-{trackIndex}"
                    type="range"
                    min="200"
                    max="5000"
                    step="10"
                    value={trackStates[trackIndex]?.midFreq || 1000}
                    on:input={(e) => {
                      const val = parseFloat(e.target.value);
                      track.setMidFrequency(val);
                      trackStates[trackIndex].midFreq = val;
                      trackStates = { ...trackStates };
                      const canvas = document.querySelector(
                        `canvas[data-track-index="${trackIndex}"]`
                      );
                      if (canvas) drawEQ(canvas, track, trackIndex);
                    }}
                    class="freq-slider"
                  />
                  <span class="freq-value"
                    >{formatFrequency(
                      trackStates[trackIndex]?.midFreq || 1000
                    )}Hz</span
                  >
                </div>
              </div>

              <!-- High EQ -->
              <div class="eq-band">
                <Knob
                  value={trackStates[trackIndex]?.highEQ ?? track.getHighEQ()}
                  min={-12}
                  max={12}
                  step={0.1}
                  label="High"
                  unit="dB"
                  size={40}
                  on:change={(e) => {
                    track.setHighEQ(e.detail);
                    if (!trackStates[trackIndex]) trackStates[trackIndex] = {};
                    trackStates[trackIndex].highEQ = e.detail;
                    trackStates = { ...trackStates };
                    const canvas = document.querySelector(
                      `canvas[data-track-index="${trackIndex}"]`
                    );
                    if (canvas) drawEQ(canvas, track, trackIndex);
                  }}
                />
                <div class="freq-control">
                  <label for="high-freq-{trackIndex}">Freq</label>
                  <input
                    id="high-freq-{trackIndex}"
                    type="range"
                    min="1000"
                    max="20000"
                    step="100"
                    value={trackStates[trackIndex]?.highFreq || 4000}
                    on:input={(e) => {
                      const val = parseFloat(e.target.value);
                      track.setHighFrequency(val);
                      trackStates[trackIndex].highFreq = val;
                      trackStates = { ...trackStates };
                      const canvas = document.querySelector(
                        `canvas[data-track-index="${trackIndex}"]`
                      );
                      if (canvas) drawEQ(canvas, track, trackIndex);
                    }}
                    class="freq-slider"
                  />
                  <span class="freq-value"
                    >{formatFrequency(
                      trackStates[trackIndex]?.highFreq || 4000
                    )}Hz</span
                  >
                </div>
              </div>
            </div>

            <!-- Volume Control -->
            <div class="volume-control">
              <label for="volume-{trackIndex}">Volume</label>
              <div class="volume-slider-container">
                <input
                  id="volume-{trackIndex}"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={trackStates[trackIndex]?.volume || 1}
                  on:input={(e) => {
                    const val = parseFloat(e.target.value);
                    track.setVolume(val);
                    trackStates[trackIndex].volume = val;
                    trackStates = { ...trackStates };
                  }}
                  class="volume-slider"
                />
                <span class="volume-value"
                  >{Math.round(
                    (trackStates[trackIndex]?.volume || 1) * 100
                  )}%</span
                >
              </div>
            </div>
          </div>
        </div>
      {/if}
    {/each}
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

  /* 2D Track Control Cards */
  .track-card {
    position: absolute;
    width: 300px;
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid rgba(45, 45, 45, 0.8);
    border-radius: 4px;
    padding: 0;
    z-index: 100;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    user-select: none;
  }

  .track-card.dragging {
    cursor: grabbing;
    z-index: 200;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7);
  }

  .card-header {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(45, 45, 45, 0.8);
    background: rgba(31, 31, 31, 0.9);
    cursor: grab;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .card-header.drag-handle:hover {
    background: rgba(41, 41, 41, 0.9);
  }

  .card-header:active {
    cursor: grabbing;
  }

  .card-header h3.track-name {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    flex: 1;
    cursor: text;
    user-select: none;
  }

  .card-header h3.track-name:hover {
    color: #4a9eff;
  }

  .track-name-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    font-family: inherit;
    outline: none;
  }

  .track-name-input:focus {
    background: rgba(255, 255, 255, 0.15);
    border-color: #4a9eff;
  }

  .header-controls {
    display: flex;
    gap: 4px;
  }

  .mute-button,
  .solo-button {
    width: 24px;
    height: 24px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.1);
    color: #aaa;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    user-select: none;
  }

  .mute-button:hover,
  .solo-button:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .mute-button.active {
    background: #e74c3c;
    border-color: #e74c3c;
    color: #fff;
  }

  .solo-button.active {
    background: #f39c12;
    border-color: #f39c12;
    color: #fff;
  }

  .mute-button:active,
  .solo-button:active {
    transform: scale(0.95);
  }

  .card-content {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .gain-section {
    display: flex;
    justify-content: center;
  }

  .eq-display-container {
    width: 100%;
    height: 60px;
    background: #0f0f0f;
    border: 1px solid rgba(45, 45, 45, 0.8);
    border-radius: 4px;
    overflow: hidden;
  }

  .eq-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .eq-controls {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .eq-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .freq-control {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
  }

  .freq-control label {
    font-size: 9px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .freq-slider {
    width: 100%;
    height: 4px;
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .freq-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .freq-slider::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .freq-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .freq-slider::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  .freq-value {
    font-size: 9px;
    color: #aaa;
    font-family: 'Courier New', monospace;
    min-width: 50px;
    text-align: center;
  }

  .volume-control {
    padding: 8px 0 0 0;
    border-top: 1px solid rgba(45, 45, 45, 0.8);
  }

  .volume-control label {
    display: block;
    font-size: 9px;
    font-weight: 500;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .volume-slider-container {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .volume-slider {
    flex: 1;
    height: 4px;
    background: #333;
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }

  .volume-slider::-webkit-slider-thumb:hover {
    background: #5aaeff;
  }

  .volume-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #4a9eff;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .volume-slider::-moz-range-thumb:hover {
    background: #5aaeff;
  }

  .volume-value {
    min-width: 45px;
    text-align: right;
    font-size: 11px;
    color: #888;
    font-family: 'Courier New', monospace;
  }
</style>
