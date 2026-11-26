import * as THREE from 'three';

export type CameraPerspective = 'FIRST_PERSON' | 'SECOND_PERSON';

export interface SecondPersonCameraInput {
  torsoWorldPos: THREE.Vector3;
  facingYaw: number; // Character rig world rotation.y (local +Z forward)
  pitch: number; // Vertical look tilt (radians)
  heroScale: number; // HERO_PROFILES[id].scale (1.0..1.24)
  fovDeg: number; // Active camera vertical FOV
  nearPad: number; // Camera near-plane clearance
}

export interface SecondPersonCameraOutput {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const _frontDir = new THREE.Vector3();
const _rightDir = new THREE.Vector3();
const _rayStep = new THREE.Vector3();

/**
 * Computes a clean medium shot ("second-person" front-facing perspective)
 * framing the active hero from the waist/belt line up to just above the crown.
 */
export function computeSecondPersonWaistPose(
  input: SecondPersonCameraInput,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  clampPosition?: (pos: THREE.Vector3, nearPad: number) => void
): void {
  const s = Math.max(0.85, input.heroScale);
  const clampedPitch = THREE.MathUtils.clamp(input.pitch, -0.38, 0.32);

  // Rig local +Z rotated around Y by facingYaw points directly out from the character's chest/face
  const heroicAngle = input.facingYaw + 0.14;
  _frontDir.set(Math.sin(heroicAngle), 0, Math.cos(heroicAngle)).normalize();
  _rightDir.set(_frontDir.z, 0, -_frontDir.x);

  // Target chest/collar height so bottom of 62-deg frustum lands cleanly at the waist belt (torso.y)
  const targetHeightOffset = 0.69 * s;
  outTarget.set(
    input.torsoWorldPos.x,
    input.torsoWorldPos.y + targetHeightOffset,
    input.torsoWorldPos.z
  );

  // Derive horizontal distance from vertical FOV so framing remains waist-to-crown across aspect ratios
  const halfFovRad = THREE.MathUtils.degToRad(Math.max(35, Math.min(85, input.fovDeg)) * 0.5);
  const tanHalf = Math.tan(halfFovRad);
  const baseHalfSpan = 0.691 * s; // waist (~0.00*s) to crown headroom (~1.38*s)
  const baseDist = baseHalfSpan / Math.max(0.35, tanHalf);

  const cosPitch = Math.cos(clampedPitch);
  const sinPitch = Math.sin(clampedPitch);
  const vertOffset = -sinPitch * baseDist * 0.65 + 0.05 * s;

  outPos
    .copy(outTarget)
    .addScaledVector(_frontDir, baseDist * cosPitch)
    .addScaledVector(_rightDir, 0.06 * s);
  outPos.y = outTarget.y + vertOffset;

  if (clampPosition) {
    // Sub-step along target -> desired camera ray so walls/pillars don't trap camera behind geometry
    for (let step = 1; step <= 4; step++) {
      const t = step * 0.25;
      _rayStep.lerpVectors(outTarget, outPos, t);
      const beforeX = _rayStep.x;
      const beforeY = _rayStep.y;
      const beforeZ = _rayStep.z;
      clampPosition(_rayStep, input.nearPad);
      const pushed =
        Math.abs(_rayStep.x - beforeX) > 0.015 ||
        Math.abs(_rayStep.y - beforeY) > 0.015 ||
        Math.abs(_rayStep.z - beforeZ) > 0.015;
      if (pushed) {
        outPos.copy(_rayStep);
        break;
      }
    }
    clampPosition(outPos, input.nearPad);
  }
}

/**
 * Standalone perspective manager for toggling between First-Person and
 * Second-Person (waist-up front framing) camera views.
 */
export class CameraPerspectiveController {
  private perspective: CameraPerspective = 'FIRST_PERSON';

  public getPerspective(): CameraPerspective {
    return this.perspective;
  }

  public isFirstPerson(): boolean {
    return this.perspective === 'FIRST_PERSON';
  }

  public isSecondPerson(): boolean {
    return this.perspective === 'SECOND_PERSON';
  }

  public setPerspective(next: CameraPerspective): CameraPerspective {
    this.perspective = next;
    return this.perspective;
  }

  public togglePerspective(): CameraPerspective {
    this.perspective =
      this.perspective === 'FIRST_PERSON' ? 'SECOND_PERSON' : 'FIRST_PERSON';
    return this.perspective;
  }
}
