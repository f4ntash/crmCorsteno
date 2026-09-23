/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Temporary visual reference preview copied from the supplied standalone sketch.

"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Roulette3DConfig } from "@corsteno/roulette-3d";
import styles from "./RouletteReferencePreview.module.css";
import { rouletteReferenceRotationToPlaceSegmentAtPointer } from "./rouletteReferenceAngles";
import { advanceRouletteReferenceSpin } from "./rouletteReferenceSpin";

type RouletteReferencePreviewProps = Pick<Roulette3DConfig, "segments" | "prizes"> & {
  prizeAvailability?: Roulette3DConfig["prizeAvailability"];
  onSpinRequest?: () => void;
  onSpinComplete?: () => void;
  spinDisabled?: boolean;
  spinButtonLabel?: string;
  screenState?: "idle" | "spinning" | "participated";
};

export type RouletteReferencePreviewHandle = {
  spinTo: (targetSegmentIndex: number) => boolean;
};

const screenTextForState = (state) => ({
  idle: "GIRÁ",
  spinning: "GIRANDO",
  participated: "YA\nPARTICIPASTE",
}[state] ?? "GIRÁ");

function normalizeButtonLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  return (label || "GIRAR").toUpperCase();
}

const PREVIEW_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function canvasFont(size, weight = 650) {
  return `${weight} ${size}px ${PREVIEW_FONT_FAMILY}`;
}

function setGColor(geometry, color) {
  const value = new THREE.Color(color);
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      Array.from({ length: geometry.attributes.position.count }, () => [...value]).flat(),
      3
    )
  );
}

function safeSegmentColor(color) {
  return typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
}

function wrapText(context, value, maxWidth, maxLines) {
  const paragraphs = String(value || "").trim().split(/\r?\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) return { lines: [""], truncated: false };

  const truncate = (text) => {
    let result = String(text);
    while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
    return `${result.trim()}…`;
  };
  const naturalLines = [];
  const appendParagraph = (words) => {
    let current = "";
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index];
      const candidate = current ? `${current} ${word}` : word;
      if (!current || context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      naturalLines.push(current);
      current = word;
    }
    if (current) naturalLines.push(current);
  };
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (maxLines === 2 && paragraphs.length === 1 && words.length > 1 && context.measureText(paragraph).width > maxWidth) {
      let balanced = null;
      for (let split = 1; split < words.length; split += 1) {
        const candidate = [words.slice(0, split).join(" "), words.slice(split).join(" ")];
        if (candidate.every((line) => context.measureText(line).width <= maxWidth)) {
          const width = Math.max(...candidate.map((line) => context.measureText(line).width));
          if (!balanced || width < balanced.width) balanced = { lines: candidate, width };
        }
      }
      if (balanced) {
        naturalLines.push(...balanced.lines);
        continue;
      }
    }
    appendParagraph(words);
  }
  if (naturalLines.length <= maxLines && naturalLines.every((line) => context.measureText(line).width <= maxWidth)) {
    return { lines: naturalLines, truncated: false };
  }

  const visibleLines = naturalLines.slice(0, Math.max(0, maxLines - 1)).map((line) => (
    context.measureText(line).width > maxWidth ? truncate(line) : line
  ));
  const remainingText = naturalLines.slice(Math.max(0, maxLines - 1)).join(" ");
  visibleLines.push(truncate(remainingText));
  return { lines: visibleLines.slice(0, maxLines), truncated: true };
}

function fitText(context, value, maxWidth, maxLines, preferredFontSize, minimumFontSize, weight = 650) {
  for (let fontSize = preferredFontSize; fontSize >= minimumFontSize; fontSize -= 2) {
    context.font = canvasFont(fontSize, weight);
    const layout = wrapText(context, value, maxWidth, maxLines);
    if (!layout.truncated) return { ...layout, fontSize };
  }

  context.font = canvasFont(minimumFontSize, weight);
  return { ...wrapText(context, value, maxWidth, maxLines), fontSize: minimumFontSize };
}

function fitForcedLines(context, values, maxWidth, preferredFontSize, minimumFontSize, weight = 650) {
  const labels = values.filter(Boolean);
  for (let fontSize = preferredFontSize; fontSize >= minimumFontSize; fontSize -= 2) {
    context.font = canvasFont(fontSize, weight);
    const layouts = labels.map((value) => wrapText(context, value, maxWidth, 1));
    if (layouts.every((layout) => !layout.truncated)) {
      return { lines: layouts.map((layout) => layout.lines[0]), fontSize };
    }
  }

  context.font = canvasFont(minimumFontSize, weight);
  return {
    lines: labels.map((value) => wrapText(context, value, maxWidth, 1).lines[0]),
    fontSize: minimumFontSize,
  };
}

const DESKTOP_CAMERA_DISTANCE = 30;
const MOBILE_CAMERA_DISTANCE = 48;
const MOBILE_MIN_CAMERA_DISTANCE = 45;
const MOBILE_MAX_CAMERA_DISTANCE = 56;

function placeCamera(camera, distance = DESKTOP_CAMERA_DISTANCE) {
  camera.position
    .set(-0.25, 0.1, 1)
    .normalize()
    .multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
}


class WheelTextureController {
  constructor(renderer, rWheel, segments, prizes, prizeAvailability) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = 1024;
    this.context = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = "srgb";
    this.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.texture.offset.setScalar(0.5);
    this.texture.repeat.setScalar(1 / (rWheel * 2));
    this.rWheel = rWheel;
    this.iconImages = new Map();
    this.generation = 0;
    this.setData(segments, prizes, prizeAvailability);
  }

  setData(segments, prizes, prizeAvailability) {
    this.segments = Array.isArray(segments) ? segments : [];
    this.prizes = Array.isArray(prizes) ? prizes : [];
    this.prizeAvailability = prizeAvailability ?? {};
    this.amountSectors = Math.max(1, this.segments.length);
    this.iconImages = new Map();
    const generation = ++this.generation;
    this.draw();

    for (const segment of this.segments) {
      const prize = this.prizes.find((item) => item.id === segment.prizeId);
      if (!prize?.iconUrl) continue;
      const image = new Image();
      image.onload = () => {
        if (generation !== this.generation) return;
        this.iconImages.set(prize.iconUrl, image);
        this.draw();
      };
      image.onerror = () => {
        if (generation === this.generation) this.iconImages.delete(prize.iconUrl);
      };
      image.crossOrigin = "anonymous";
      image.src = prize.iconUrl;
    }
  }

  draw() {
    const context = this.context;
    if (!context) return;
    const unit = (value) => value * 0.01 * this.canvas.height;
    const hubUnit = (value) => unit(value * (5 / this.rWheel));
    const hubRadius = 18;
    const amount = this.amountSectors;
    const angle = (Math.PI * 2) / amount;
    const halfAngle = angle * 0.5;
    const preferredFontSize = Math.max(54, Math.min(88, unit(8.8 - Math.max(0, amount - 6) * 0.45)));

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    context.translate(unit(50), unit(50));
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = canvasFont(preferredFontSize, 600);
    context.imageSmoothingEnabled = true;

    for (let index = 0; index < amount; index += 1) {
      const segment = this.segments[index];
      const prize = segment?.prizeId ? this.prizes.find((item) => item.id === segment.prizeId) : null;
      const soldOut = Boolean(segment?.prizeId && this.prizeAvailability[segment.prizeId] === "sold_out");
      const label = soldOut ? "SIN STOCK" : prize?.name || "SIN PREMIO";
      const image = prize?.iconUrl ? this.iconImages.get(prize.iconUrl) : null;
      const textRadius = image ? 34 : 38;
      const sectorAngularPadding = Math.min(Math.PI / 72, halfAngle * 0.18);
      const safeHalfAngle = Math.max(0.01, halfAngle - sectorAngularPadding);
      const maxTextWidth = Math.max(unit(15), 2 * unit(textRadius) * Math.sin(safeHalfAngle) * (image ? 0.9 : 0.96));
      const layout = soldOut
        ? fitForcedLines(context, [label, prize?.name], maxTextWidth, preferredFontSize, image ? 32 : 34, 600)
        : fitText(context, label, maxTextWidth, 2, preferredFontSize, image ? 38 : 40, 600);
      const lineHeight = layout.fontSize * 1.06;
      const textY = image ? -unit(soldOut ? 30 : 31) : -unit(soldOut ? 36 : 38);

      context.fillStyle = safeSegmentColor(segment?.color);
      context.beginPath();
      context.moveTo(Math.cos(-halfAngle + Math.PI * 0.5) * unit(50), Math.sin(-halfAngle + Math.PI * 0.5) * unit(50));
      context.arc(0, 0, unit(50), -halfAngle - Math.PI * 0.5, halfAngle - Math.PI * 0.5);
      context.arc(0, 0, hubUnit(5), halfAngle - Math.PI * 0.5, -halfAngle - Math.PI * 0.5, true);
      context.closePath();
      context.fill();
      if (soldOut) {
        context.fillStyle = "rgba(11, 13, 17, 0.3)";
        context.fill();
      }

      if (image) {
        const iconSize = Math.min(unit(6.5), maxTextWidth * 0.42);
        const textTop = textY - ((layout.lines.length - 1) * lineHeight) * 0.5 - layout.fontSize * 0.5;
        const iconBottom = textTop - unit(1.4);
        context.globalAlpha = soldOut ? 0.52 : 1;
        context.drawImage(image, -iconSize * 0.5, iconBottom - iconSize, iconSize, iconSize);
        context.globalAlpha = 1;
      }
      context.fillStyle = soldOut ? "#ffffff" : "navy";
      context.font = canvasFont(layout.fontSize, 600);
      layout.lines.forEach((line, lineIndex) => {
        const offset = (lineIndex - (layout.lines.length - 1) * 0.5) * lineHeight;
        context.fillText(line, 0, textY + offset);
      });
      context.rotate(angle);
    }

    context.lineWidth = hubUnit(2);
    context.strokeStyle = "#fff";
    context.beginPath();
    context.arc(0, 0, hubUnit(hubRadius), -Math.PI * 0.5 - halfAngle, Math.PI * 0.5 - halfAngle);
    context.stroke();
    context.strokeStyle = "navy";
    context.beginPath();
    context.arc(0, 0, hubUnit(hubRadius), Math.PI * 0.5 - halfAngle, Math.PI * 1.5 - halfAngle);
    context.stroke();
    context.fillStyle = "navy";
    context.beginPath();
    context.arc(0, 0, hubUnit(5), -halfAngle - Math.PI * 0.5, Math.PI * 0.5 - halfAngle);
    context.fill();
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

class WheelMachine extends THREE.Group {
  constructor(renderer, camera, controls, segments, prizes, prizeAvailability, onSpinRequest, isSpinDisabled, onSpinComplete, spinButtonLabel, screenState) {
    super();
    this.onSpinRequest = onSpinRequest;
    this.isSpinDisabled = isSpinDisabled;
    this.onSpinComplete = onSpinComplete;
    this.controls = controls;
    this.spinButtonLabel = normalizeButtonLabel(spinButtonLabel);
    this.screenState = screenState ?? "idle";

    const rWheel = 5;
    const rArc = rWheel + 0.5;
    const arcThickness = 0.5;
    const arcAngle = Math.PI * 0.875;
    const gArc = new THREE.ExtrudeGeometry(
      new THREE.Shape()
        .absarc(0, 0, rArc + arcThickness, 0, arcAngle)
        .absarc(
          Math.cos(arcAngle) * (rArc + arcThickness * 0.5),
          Math.sin(arcAngle) * (rArc + arcThickness * 0.5),
          arcThickness * 0.5,
          arcAngle,
          arcAngle + Math.PI
        )
        .absarc(0, 0, rArc, arcAngle, Math.PI * 2, true)
        .absarc(rArc + arcThickness * 0.5, 0, arcThickness * 0.5, Math.PI, Math.PI * 2),
      { curveSegments: 50, bevelEnabled: true, bevelSegments: 5 }
    ).rotateZ(arcAngle * -0.5);
    setGColor(gArc, "#fff");

    const gPointer = new THREE.ExtrudeGeometry(
      new THREE.Shape()
        .moveTo(0, -Math.hypot(0.25, 0.25))
        .lineTo(0.25, 0.25)
        .lineTo(-0.25, 0.25),
      { depth: 0.75, bevelEnabled: true }
    ).translate(0, rArc + 0.25, 0);
    setGColor(gPointer, "hsl(0, 100%, 75%)");

    const arcMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.9,
      roughness: 0.7,
    });
    const arc = new THREE.Mesh(
      mergeGeometries([gArc.clone(), gArc.clone().rotateZ(Math.PI), gPointer]),
      arcMaterial
    );
    this.add(arc);

    const gWheel = new THREE.ExtrudeGeometry(
      new THREE.Shape().absarc(0, 0, rWheel, 0, Math.PI * 2),
      { depth: 0.5, curveSegments: 200, bevelEnabled: true, bevelSegments: 5 }
    );

    this.wheelTextureController = new WheelTextureController(renderer, rWheel, segments, prizes, prizeAvailability);
    this.amountSectors = this.wheelTextureController.amountSectors;
    const wheelTexture = this.wheelTextureController.texture;

    const wheelMaterial = new THREE.MeshStandardMaterial({
      metalness: 0.6,
      roughness: 0.9,
      map: wheelTexture,
      onBeforeCompile: (shader) => {
        shader.vertexShader = `
              varying float showTexture;
              ${shader.vertexShader}
            `.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
                showTexture = step(0., normal.z);
              `
        );
        shader.fragmentShader = `
              varying float showTexture;
              ${shader.fragmentShader}
            `.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
                
                diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, showTexture);
              `
        );
      },
    });
    const wheel = new THREE.Mesh(gWheel, [wheelMaterial, new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.6 })]);
    wheel.rotation.z = Math.random() * Math.PI * 2;
    this.add(wheel);
    this.wheel = wheel;

    const shapeSpinButtonSize = new THREE.Vector2(2, 3);
    const shapeSpinButtonRoundness = 0.5;
    const hW = shapeSpinButtonSize.x * 0.5;
    const hH = shapeSpinButtonSize.y * 0.5;
    const cx = hW - shapeSpinButtonRoundness;
    const cy = hH - shapeSpinButtonRoundness;
    const aStep = Math.PI * 0.5;
    const shapeSpinButton = new THREE.Shape()
      .absarc(cx, cy, shapeSpinButtonRoundness, aStep * 0, aStep * 1)
      .absarc(-cx, cy, shapeSpinButtonRoundness, aStep * 1, aStep * 2)
      .absarc(-cx, -cy, shapeSpinButtonRoundness, aStep * 2, aStep * 3)
      .absarc(cx, -cy, shapeSpinButtonRoundness, aStep * 3, aStep * 4);
    const gButton = new THREE.ExtrudeGeometry(shapeSpinButton, {
      depth: 0.01,
      curveSegments: 20,
      bevelEnabled: true,
      bevelSegments: 5,
    });
    this.spinButtonUniforms = { transition: { value: 0 } };
    const buttonTexture = (() => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = 1024;
      canvas.height = 1536;
      const unit = (value) => value * 0.01 * canvas.height;
      const layout = fitText(context, this.spinButtonLabel, canvas.width * 0.88, 2, unit(15), unit(7), 700);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#fff";
      context.translate(canvas.width * 0.5, canvas.height * 0.5);
      context.font = canvasFont(layout.fontSize, 700);
      const lineHeight = layout.fontSize * 1.05;
      layout.lines.forEach((line, index) => {
        const offset = (index - (layout.lines.length - 1) * 0.5) * lineHeight;
        context.fillText(line, 0, offset);
      });
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = "srgb";
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.offset.setScalar(0.5);
      texture.repeat.set(1 / 2, 1 / 3);
      return texture;
    })();
    const buttonMaterial = new THREE.MeshBasicMaterial({
      map: buttonTexture,
      onBeforeCompile: (shader) => {
        shader.uniforms.transition = this.spinButtonUniforms.transition;
        shader.vertexShader = `
              varying float showTexture;
              ${shader.vertexShader}
            `.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
                showTexture = step(0., normal.z);
              `
        );
        shader.fragmentShader = `
              uniform float transition;
              varying float showTexture;
              ${shader.fragmentShader}
            `.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
              
                vec3 colOff = mix(vec3(1), vec3(0), diffuseColor.r);
                vec3 colOn = mix(vec3(0.25, 0.25, 1), vec3(1, 1, 1), diffuseColor.r);
                
                float tVal = 1. - transition;
                float fw = fwidth(vMapUv.y);
                float fTransition = smoothstep(tVal - fw, tVal + fw, vMapUv.y);
                
                diffuseColor.rgb = mix(colOff, colOn, fTransition);
                
                diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, showTexture);
              `
        );
      },
    });
    const spinButton = new THREE.Mesh(gButton, [buttonMaterial, new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.7 })]);
    spinButton.position.set(0, 0, 1.25);
    this.add(spinButton);

    this.screenCanvas = document.createElement("canvas");
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 1536;
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = "srgb";
    this.screenTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.screenTexture.offset.setScalar(0.5);
    this.screenTexture.repeat.set(1 / 2, 1 / 3);
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      onBeforeCompile: (shader) => {
        shader.vertexShader = `
              varying float showTexture;
              ${shader.vertexShader}
            `.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
                showTexture = step(0., normal.z);
              `
        );
        shader.fragmentShader = `
              varying float showTexture;
              ${shader.fragmentShader}
            `.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
                diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, showTexture);
              `
        );
      },
    });
    const screen = new THREE.Mesh(gButton.clone(), [screenMaterial, new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.7 })]);
    screen.position.set(rArc + 0.2, 0, 1.25);
    this.add(screen);

    this.mode = "idle";
    this.authoritativeSpin = null;
    this.interaction = { raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2() };
    let buttonPointerId = null;
    const toNdc = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return null;
      return { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 };
    };
    const hitTest = (event) => {
      const ndc = toNdc(event);
      if (!ndc || !Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return null;
      this.interaction.pointer.set(ndc.x, ndc.y);
      this.interaction.raycaster.setFromCamera(this.interaction.pointer, camera);
      return this.interaction.raycaster.intersectObject(spinButton, false)[0]?.object ?? null;
    };
    const suppressCanvasInteraction = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const releasePointerCapture = (pointerId) => {
      if (pointerId === null || !renderer.domElement.hasPointerCapture?.(pointerId)) return;
      renderer.domElement.releasePointerCapture(pointerId);
    };
    this._cancelLocalInteraction = () => {
      releasePointerCapture(buttonPointerId);
      buttonPointerId = null;
      this.mode = "idle";
      this.spinButtonUniforms.transition.value = 0;
      renderer.domElement.style.cursor = "auto";
    };
    const onPointerMove = (event) => {
      if (this.mode === "button-press" && event.pointerId === buttonPointerId) {
        suppressCanvasInteraction(event);
        return;
      }
      const hit = hitTest(event);
      renderer.domElement.style.cursor = hit === spinButton
        ? (this.isSpinDisabled?.() ? "not-allowed" : "pointer")
        : "auto";
    };
    const onPointerDown = (event) => {
      const hit = hitTest(event);
      if (hit === spinButton) {
        suppressCanvasInteraction(event);
        this.controls.enabled = false;
        if (this.isSpinDisabled?.()) {
          renderer.domElement.style.cursor = "not-allowed";
          this.controls.enabled = true;
          return;
        }
        buttonPointerId = event.pointerId;
        renderer.domElement.setPointerCapture(event.pointerId);
        this.mode = "button-press";
        this.spinButtonUniforms.transition.value = 1;
        this.display();
        return;
      }
    };
    const onPointerUp = (event) => {
      if (this.mode === "button-press" && event.pointerId === buttonPointerId) {
        suppressCanvasInteraction(event);
        releasePointerCapture(buttonPointerId);
        buttonPointerId = null;
        this.mode = "idle";
        this.spinButtonUniforms.transition.value = 0;
        if (event.type !== "pointercancel" && !this.isSpinDisabled?.()) void this.onSpinRequest?.();
        this.controls.enabled = true;
        return;
      }
    };
    const eventOptions = { capture: true };
    renderer.domElement.addEventListener("pointermove", onPointerMove, eventOptions);
    renderer.domElement.addEventListener("pointerdown", onPointerDown, eventOptions);
    renderer.domElement.addEventListener("pointerup", onPointerUp, eventOptions);
    renderer.domElement.addEventListener("pointercancel", onPointerUp, eventOptions);
    this._disposeInteraction = () => {
      renderer.domElement.removeEventListener("pointermove", onPointerMove, eventOptions);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, eventOptions);
      renderer.domElement.removeEventListener("pointerup", onPointerUp, eventOptions);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp, eventOptions);
    };
    this.display(screenTextForState(this.screenState));
  }

  spinTo(targetSegmentIndex) {
    if (this.authoritativeSpin || !Number.isInteger(targetSegmentIndex) || targetSegmentIndex < 0 || targetSegmentIndex >= this.amountSectors) return false;
    const startRotation = this.wheel.rotation.z;
    const targetRotation = rouletteReferenceRotationToPlaceSegmentAtPointer(targetSegmentIndex, this.amountSectors, startRotation);
    if (targetRotation === null) return false;
    this._cancelLocalInteraction?.();
    this.controls.enabled = true;
    this.screenState = "spinning";
    this.display(screenTextForState(this.screenState));
    this.authoritativeSpin = { startRotation, targetRotation, elapsed: 0, duration: 5000 };
    return true;
  }

  updateVisualData(segments, prizes, prizeAvailability) {
    this.wheelTextureController.setData(segments, prizes, prizeAvailability);
    this.amountSectors = this.wheelTextureController.amountSectors;
  }

  update(dt) {
    if (!Number.isFinite(dt)) return;
    const frameDt = THREE.MathUtils.clamp(dt, 0, 0.05);
    if (this.authoritativeSpin) {
      const spin = this.authoritativeSpin;
      const frame = advanceRouletteReferenceSpin(spin, frameDt);
      spin.elapsed = frame.elapsed;
      this.wheel.rotation.z = frame.rotation;
      if (frame.done) {
        this.wheel.rotation.z = spin.targetRotation;
        this.authoritativeSpin = null;
        this.mode = "idle";
        this.controls.enabled = true;
        this.screenState = "idle";
        this.display(screenTextForState(this.screenState));
        this.onSpinComplete?.();
      }
      return;
    }
  }

  display(content) {
    const context = this.screenCanvas.getContext("2d");
    const unit = (value) => value * 0.01 * this.screenCanvas.height;
    const text = typeof content === "string" && content.trim() ? content.trim().toUpperCase() : screenTextForState(this.screenState);
    const layout = fitText(context, text, this.screenCanvas.width * 0.9, 2, unit(15), unit(5), 700);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, this.screenCanvas.width, this.screenCanvas.height);
    context.save();
    context.translate(this.screenCanvas.width * 0.5, this.screenCanvas.height * 0.5);
    context.fillStyle = "#000";
    context.font = canvasFont(layout.fontSize, 700);
    const lineHeight = layout.fontSize * 1.05;
    layout.lines.forEach((line, index) => {
      const offset = (index - (layout.lines.length - 1) * 0.5) * lineHeight;
      context.fillText(line, 0, offset);
    });
    context.restore();
    this.screenTexture.needsUpdate = true;
  }

  setScreenState(screenState) {
    this.screenState = screenState ?? "idle";
    if (!this.authoritativeSpin) this.display(screenTextForState(this.screenState));
  }

  disposeInteraction() {
    this._disposeInteraction?.();
    this.wheelTextureController?.dispose();
  }
}

const RouletteReferencePreview = forwardRef<RouletteReferencePreviewHandle, RouletteReferencePreviewProps>(function RouletteReferencePreview({ segments, prizes, prizeAvailability, onSpinRequest, onSpinComplete, spinDisabled = false, spinButtonLabel, screenState = "idle" }, ref) {
  const containerRef = useRef(null);
  const wheelMachineRef = useRef(null);
  const pendingSpinRef = useRef(null);
  const visualDataRef = useRef({ segments, prizes, prizeAvailability });
  const interactionRef = useRef({ onSpinRequest, onSpinComplete, spinDisabled, spinButtonLabel, screenState });
  visualDataRef.current = { segments, prizes, prizeAvailability };
  interactionRef.current = { onSpinRequest, onSpinComplete, spinDisabled, spinButtonLabel, screenState };

  useImperativeHandle(ref, () => ({
    spinTo(targetSegmentIndex) {
      if (!Number.isInteger(targetSegmentIndex) || targetSegmentIndex < 0 || targetSegmentIndex >= visualDataRef.current.segments.length) return false;
      if (!wheelMachineRef.current) {
        pendingSpinRef.current = targetSegmentIndex;
        return true;
      }
      return wheelMachineRef.current.spinTo(targetSegmentIndex);
    },
  }), []);

  useEffect(() => {
    wheelMachineRef.current?.updateVisualData(segments, prizes, prizeAvailability);
  }, [segments, prizes, prizeAvailability]);

  useEffect(() => {
    wheelMachineRef.current?.setScreenState(screenState);
  }, [screenState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isActive = true;
    let renderer = null;
    let wheelMachine = null;
    let controls = null;
    const cleanupFns = [];

    (async () => {
      if (!isActive || !container) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, container.clientWidth / Math.max(container.clientHeight, 1), 1, 100);
      const isMobile = container.clientWidth <= 767;
      placeCamera(camera, isMobile ? MOBILE_CAMERA_DISTANCE : DESKTOP_CAMERA_DISTANCE);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.touchAction = "none";
      container.appendChild(renderer.domElement);

      const handleResize = () => {
        if (!renderer || !container) return;
        const width = container.clientWidth;
        const height = Math.max(container.clientHeight, 1);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      cleanupFns.push(() => resizeObserver.disconnect());

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.target.set(0, 0, 0);
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: null,
      };
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      controls.minAzimuthAngle = -Math.PI / 4;
      controls.maxAzimuthAngle = Math.PI / 4;
      controls.minPolarAngle = Math.PI / 3;
      controls.maxPolarAngle = Math.PI / 1.8;
      controls.minDistance = isMobile ? MOBILE_MIN_CAMERA_DISTANCE : 18;
      controls.maxDistance = isMobile ? MOBILE_MAX_CAMERA_DISTANCE : 45;
      controls.update();
      cleanupFns.push(() => controls.dispose());

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      room.children[0].color.set("#a8a");
      const backgroundTexture = pmremGenerator.fromScene(room, 0.04).texture;
      scene.environment = backgroundTexture;
      wheelMachine = new WheelMachine(
        renderer,
        camera,
        controls,
        visualDataRef.current.segments,
        visualDataRef.current.prizes,
        visualDataRef.current.prizeAvailability,
        () => {
          if (!interactionRef.current.spinDisabled) void interactionRef.current.onSpinRequest?.();
        },
        () => interactionRef.current.spinDisabled,
        () => interactionRef.current.onSpinComplete?.(),
        interactionRef.current.spinButtonLabel,
        interactionRef.current.screenState,
      );
      wheelMachineRef.current = wheelMachine;
      scene.add(wheelMachine);
      if (pendingSpinRef.current !== null) {
        const pendingTarget = pendingSpinRef.current;
        pendingSpinRef.current = null;
        wheelMachine.spinTo(pendingTarget);
      }

      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const rawDt = clock.getDelta();
        const dt = Number.isFinite(rawDt) ? THREE.MathUtils.clamp(rawDt, 0, 0.05) : 0;
        wheelMachine?.update(dt);
        controls.update();
        renderer.render(scene, camera);
      });

      cleanupFns.push(() => {
        renderer?.setAnimationLoop(null);
        wheelMachine?.disposeInteraction();
        wheelMachineRef.current = null;
        pmremGenerator.dispose();
        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (material.map) material.map.dispose();
              material.dispose();
            });
          }
        });
        if (renderer) {
          if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
          renderer.dispose();
        }
      });
    })();

    return () => {
      isActive = false;
      cleanupFns.forEach((cleanup) => cleanup());
    };
  }, []);

  return <div ref={containerRef} className={styles.threeExperience} data-project-viewer="roulette-reference" />;
});

export default RouletteReferencePreview;
