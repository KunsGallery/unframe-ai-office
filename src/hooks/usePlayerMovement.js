import { useEffect, useRef, useState } from "react";

const DEFAULT_INITIAL_POSITION = { x: 50, y: 86 };
const MIN_X = 6;
const MAX_X = 94;
const MIN_Y = 8;
const MAX_Y = 92;
const NORMAL_SPEED = 24;
const SHIFT_SPEED = 38;
const DIRECTION_KEYS = new Set(["up", "down", "left", "right"]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeKey(key) {
  return typeof key === "string" ? key.toLowerCase() : "";
}

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target?.isContentEditable
  );
}

function hasMovementKey(keys) {
  for (const key of keys) {
    if (DIRECTION_KEYS.has(key)) {
      return true;
    }
  }

  return false;
}

function getMovementDirectionFromKeyboardEvent(event) {
  const key = normalizeKey(event.key);
  const code = event.code;

  if (code === "ArrowUp" || code === "KeyW" || key === "arrowup" || key === "w" || key === "ㅈ") {
    return "up";
  }

  if (code === "ArrowLeft" || code === "KeyA" || key === "arrowleft" || key === "a" || key === "ㅁ") {
    return "left";
  }

  if (code === "ArrowDown" || code === "KeyS" || key === "arrowdown" || key === "s" || key === "ㄴ") {
    return "down";
  }

  if (code === "ArrowRight" || code === "KeyD" || key === "arrowright" || key === "d" || key === "ㅇ") {
    return "right";
  }

  return null;
}

function isShiftEvent(event) {
  return event.code === "ShiftLeft" || event.code === "ShiftRight" || normalizeKey(event.key) === "shift";
}

export function usePlayerMovement(initialPosition = DEFAULT_INITIAL_POSITION) {
  const [position, setPosition] = useState(() => initialPosition);
  const [isMoving, setIsMoving] = useState(false);
  const keysRef = useRef(new Set());
  const frameRef = useRef(null);
  const lastTimeRef = useRef(null);
  const positionRef = useRef(initialPosition);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    function stopMovement() {
      keysRef.current.clear();
      lastTimeRef.current = null;
      setIsMoving(false);

      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }

    function step(timestamp) {
      if (isEditableTarget(document.activeElement)) {
        stopMovement();
        return;
      }

      const activeKeys = keysRef.current;

      if (!hasMovementKey(activeKeys)) {
        lastTimeRef.current = null;
        frameRef.current = null;
        setIsMoving(false);
        return;
      }

      if (lastTimeRef.current == null) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      let horizontal = 0;
      let vertical = 0;

      if (activeKeys.has("left")) {
        horizontal -= 1;
      }

      if (activeKeys.has("right")) {
        horizontal += 1;
      }

      if (activeKeys.has("up")) {
        vertical -= 1;
      }

      if (activeKeys.has("down")) {
        vertical += 1;
      }

      const magnitude = Math.hypot(horizontal, vertical);

      if (magnitude === 0) {
        frameRef.current = requestAnimationFrame(step);
        setIsMoving(false);
        return;
      }

      const speed = activeKeys.has("shift") ? SHIFT_SPEED : NORMAL_SPEED;
      const velocityX = horizontal / magnitude;
      const velocityY = vertical / magnitude;
      const nextPosition = {
        x: clamp(positionRef.current.x + velocityX * speed * deltaTime, MIN_X, MAX_X),
        y: clamp(positionRef.current.y + velocityY * speed * deltaTime, MIN_Y, MAX_Y),
      };

      positionRef.current = nextPosition;
      setPosition(nextPosition);
      setIsMoving(true);
      frameRef.current = requestAnimationFrame(step);
    }

    function ensureFrame() {
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(step);
      }
    }

    function handleKeyDown(event) {
      if (event.isComposing || isEditableTarget(event.target)) {
        return;
      }

      if (isShiftEvent(event)) {
        keysRef.current.add("shift");

        if (hasMovementKey(keysRef.current)) {
          ensureFrame();
        }

        return;
      }

      const direction = getMovementDirectionFromKeyboardEvent(event);

      if (!direction) {
        return;
      }

      event.preventDefault();
      keysRef.current.add(direction);
      ensureFrame();
    }

    function handleKeyUp(event) {
      if (isShiftEvent(event)) {
        keysRef.current.delete("shift");
      }

      const direction = getMovementDirectionFromKeyboardEvent(event);

      if (direction) {
        keysRef.current.delete(direction);
      }

      if (!hasMovementKey(keysRef.current)) {
        lastTimeRef.current = null;
        setIsMoving(false);

        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopMovement);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopMovement);
      stopMovement();
    };
  }, []);

  return {
    position,
    setPosition,
    isMoving,
  };
}
