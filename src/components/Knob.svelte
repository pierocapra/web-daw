<script>
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';

  export let value = 0;
  export let min = 0;
  export let max = 1;
  export let step = 0.01;
  export let label = '';
  export let unit = '';
  export let size = 60;
  export let color = '#4a9eff';

  const dispatch = createEventDispatcher();

  let isDragging = false;
  let startY = 0;
  let startValue = 0;
  let knobElement;

  function handleMouseDown(event) {
    console.log('Knob mousedown triggered', { label, value, isDragging });
    isDragging = true;
    startY = event.clientY;
    startValue = value;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleMouseMove(event) {
    if (!isDragging) {
      return;
    }

    const deltaY = startY - event.clientY; // Inverted: up = increase
    const range = max - min;
    const sensitivity = range / 200; // Adjust sensitivity
    const delta = deltaY * sensitivity;
    const newValue = Math.max(min, Math.min(max, startValue + delta));

    // Snap to step
    const steppedValue = Math.round(newValue / step) * step;

    // Update value - this will trigger bind:value to update parent
    if (steppedValue !== value) {
      const oldValue = value;
      value = steppedValue;
      // Dispatch change event to ensure parent is notified
      dispatch('change', steppedValue);
      console.log('Knob value updated:', {
        label,
        oldValue,
        newValue: steppedValue,
      });
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  // Handle touch events for mobile
  function handleTouchStart(event) {
    isDragging = true;
    startY = event.touches[0].clientY;
    startValue = value;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTouchMove(event) {
    if (!isDragging) return;
    const deltaY = startY - event.touches[0].clientY;
    const range = max - min;
    const sensitivity = range / 200;
    const delta = deltaY * sensitivity;
    const newValue = Math.max(min, Math.min(max, startValue + delta));
    const steppedValue = Math.round(newValue / step) * step;
    if (steppedValue !== value) {
      value = steppedValue;
      dispatch('change', steppedValue);
    }
    event.preventDefault();
  }

  function handleTouchEnd() {
    isDragging = false;
  }

  function formatValue(val) {
    if (unit === 'dB') {
      return val >= 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
    }
    return val.toFixed(2);
  }

  // Calculate rotation angle (0-270 degrees, leaving some margin)
  let rotation = -135;
  $: {
    const range = max - min;
    if (range > 0) {
      const normalized = Math.max(0, Math.min(1, (value - min) / range));
      rotation = normalized * 270 - 135; // -135 to +135 degrees
    } else {
      rotation = -135;
    }
  }

  // Store bound handlers for cleanup
  let mouseMoveHandler;
  let mouseUpHandler;
  let touchMoveHandler;
  let touchEndHandler;

  onMount(() => {
    // Create bound handlers
    mouseMoveHandler = (e) => handleMouseMove(e);
    mouseUpHandler = () => handleMouseUp();
    touchMoveHandler = (e) => handleTouchMove(e);
    touchEndHandler = () => handleTouchEnd();

    // Add global mouse listeners for dragging
    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup', mouseUpHandler);
    window.addEventListener('touchmove', touchMoveHandler, { passive: false });
    window.addEventListener('touchend', touchEndHandler);
  });

  onDestroy(() => {
    if (mouseMoveHandler)
      window.removeEventListener('mousemove', mouseMoveHandler);
    if (mouseUpHandler) window.removeEventListener('mouseup', mouseUpHandler);
    if (touchMoveHandler)
      window.removeEventListener('touchmove', touchMoveHandler);
    if (touchEndHandler)
      window.removeEventListener('touchend', touchEndHandler);
  });
</script>

<div
  class="knob-container"
  bind:this={knobElement}
  on:mousedown={handleMouseDown}
  on:touchstart={handleTouchStart}
>
  <div class="knob-label">{label}</div>
  <div class="knob-wrapper" style="width: {size}px; height: {size}px;">
    <div
      class="knob"
      style="transform: rotate({rotation}deg); --knob-color: {color};"
      role="slider"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
    >
      <div class="knob-indicator"></div>
    </div>
  </div>
  <div class="knob-value">{formatValue(value)}{unit}</div>
</div>

<style>
  .knob-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: ns-resize;
    user-select: none;
    pointer-events: auto;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
  }

  .knob-label {
    font-size: 10px;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
  }

  .knob-wrapper {
    position: relative;
    flex-shrink: 0;
    pointer-events: auto;
  }

  .knob {
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
    border: 2px solid #3a3a3a;
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.5),
      0 2px 4px rgba(0, 0, 0, 0.3);
    position: relative;
    transition: none;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    touch-action: none;
    will-change: transform;
  }

  .knob-indicator {
    width: 3px;
    height: 30%;
    background: var(--knob-color, #4a9eff);
    border-radius: 2px;
    position: absolute;
    top: 8%;
    left: 50%;
    transform: translateX(-50%);
    filter: drop-shadow(0 0 3px var(--knob-color, #4a9eff));
  }

  .knob-value {
    font-size: 10px;
    color: #ccc;
    font-family: 'Courier New', monospace;
    text-align: center;
    min-height: 14px;
  }

  .knob-container:active .knob {
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.7),
      0 1px 2px rgba(0, 0, 0, 0.4);
  }
</style>
