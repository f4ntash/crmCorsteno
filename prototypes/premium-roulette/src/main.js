/* global document, performance, requestAnimationFrame, window */

import './styles.css';

const stage = document.querySelector('.game-stage');
const scene = document.querySelector('.roulette-scene');
const rouletteObject = document.querySelector('.roulette-object');
const wheelFace = document.querySelector('.wheel-face');
const pointer = document.querySelector('.roulette-pointer');
const hubHit = document.querySelector('#hub-hit');
const hubLabel = hubHit.querySelector('span');
const toast = document.querySelector('#toast');

const SEGMENT_STEP = 60;
const SPIN_DURATION = 4800;
const FULL_ROTATIONS = 5;

let toastTimer;
let resultTimer;
let spinFrame = 0;
let spinRotation = 0;
let boundaryIndex = 0;
let isSpinning = false;

function setWheelRotation(rotation) {
  spinRotation = rotation;
  wheelFace.style.transform = `rotate(${rotation}deg)`;
}

function triggerPointerTick() {
  pointer.classList.remove('is-ticking');
  void pointer.offsetWidth;
  pointer.classList.add('is-ticking');
}

function showVisualOnlyNotice() {
  toast.textContent = 'Giro visual · resultado local de prueba';
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2100);
}

function endResultMoment() {
  rouletteObject.classList.remove('is-result');
  wheelFace.classList.remove('is-result');
}

function finishSpin(endRotation) {
  setWheelRotation(endRotation);
  isSpinning = false;
  scene.classList.remove('is-spinning');
  rouletteObject.classList.remove('is-spinning');
  rouletteObject.classList.add('is-result');
  wheelFace.classList.add('is-result');
  hubHit.disabled = false;
  hubHit.removeAttribute('aria-busy');
  hubHit.setAttribute('aria-label', 'Girar ruleta, vista visual solamente');
  hubLabel.textContent = 'GIRAR';
  showVisualOnlyNotice();
  window.clearTimeout(resultTimer);
  resultTimer = window.setTimeout(endResultMoment, 820);
}

function animateSpin(startedAt, startRotation, endRotation) {
  return (now) => {
    const progress = Math.min(1, (now - startedAt) / SPIN_DURATION);
    const eased = 1 - Math.pow(1 - progress, 4.8);
    const nextRotation = startRotation + (endRotation - startRotation) * eased;
    const nextBoundary = Math.floor(nextRotation / SEGMENT_STEP);

    setWheelRotation(nextRotation);
    while (boundaryIndex < nextBoundary) {
      boundaryIndex += 1;
      triggerPointerTick();
    }

    if (progress < 1) {
      spinFrame = requestAnimationFrame(animateSpin(startedAt, startRotation, endRotation));
      return;
    }

    finishSpin(endRotation);
  };
}

function beginSpin() {
  if (isSpinning) return;

  isSpinning = true;
  window.clearTimeout(resultTimer);
  rouletteObject.classList.remove('is-result');
  wheelFace.classList.remove('is-result');
  scene.classList.add('is-spinning');
  rouletteObject.classList.add('is-spinning');
  hubHit.disabled = true;
  hubHit.setAttribute('aria-busy', 'true');
  hubHit.setAttribute('aria-label', 'Ruleta girando');
  hubLabel.textContent = 'GIRO…';
  hubHit.classList.remove('is-pressed');
  void hubHit.offsetWidth;
  hubHit.classList.add('is-pressed');
  window.setTimeout(() => hubHit.classList.remove('is-pressed'), 190);

  const targetIndex = Math.floor(Math.random() * 6);
  const currentPhase = ((spinRotation % 360) + 360) % 360;
  const targetPhase = (360 - targetIndex * SEGMENT_STEP) % 360;
  const alignment = (targetPhase - currentPhase + 360) % 360;
  const endRotation = spinRotation + FULL_ROTATIONS * 360 + alignment;
  const startedAt = performance.now();

  boundaryIndex = Math.floor(spinRotation / SEGMENT_STEP);
  window.cancelAnimationFrame(spinFrame);
  spinFrame = requestAnimationFrame(animateSpin(startedAt, spinRotation, endRotation));
}

stage.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;

  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  scene.style.setProperty('--tilt-x', `${y * -1.2}deg`);
  scene.style.setProperty('--tilt-y', `${x * 1.2}deg`);
});

stage.addEventListener('pointerleave', () => {
  scene.style.setProperty('--tilt-x', '0deg');
  scene.style.setProperty('--tilt-y', '0deg');
});

hubHit.addEventListener('click', beginSpin);
