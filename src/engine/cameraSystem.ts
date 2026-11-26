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

const _backDir = new THREE.Vector3();
const _rayStep = new THREE.Vector3();

/**
 * Computes a pulled-back rear third-person ("second-person" toggle) perspective
 * positioned behind and slightly above the character, locked to always show
 * the character's back from a distance so they appear small within the landscape.
 */
export function computeSecondPersonWaistPose(
  input: SecondPersonCameraInput,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  clampPosition?: (pos: THREE.Vector3, nearPad: number) => void
): void {
  const s = Math.max(0.85, input.heroScale);

  // Character rig local +Z rotated around Y by facingYaw points directly forward;
  // therefore behind the character's back is the exact inverse (-sin, 0, -cos).
  _backDir.set(-Math.sin(input.facingYaw), 0, -Math.cos(input.facingYaw)).normalize();

  // Look target slightly above mid-back so the entire hero stands clearly centered-low
  outTarget.set(
    input.torsoWorldPos.x,
    input.torsoWorldPos.y + 0.52 * s,
    input.torsoWorldPos.z
  );

  // Pulled-back distance (~21m) & elevated above (~7.6m) with locked orientation
  // so the character consistently appears small from behind.
  const fovScale = Math.max(
    0.85,
    Math.min(1.25, 0.6008 / Math.max(0.32, Math.tan(THREE.MathUtils.degToRad(input.fovDeg * 0.5))))
  );
  const backDist = 21.0 * s * fovScale;
  const heightAbove = 7.6 * s;

  outPos
    .copy(outTarget)
    .addScaledVector(_backDir, backDist);
  outPos.y = outTarget.y + heightAbove;

  if (clampPosition) {
    // Sub-step along target -> desired camera ray only breaking on horizontal wall/pillar obstruction
    // (pure upward terrain slope clearance behind the hero should elevate the camera, not shorten distance).
    for (let step = 1; step <= 8; step++) {
      const t = step / 8;
      _rayStep.lerpVectors(outTarget, outPos, t);
      const beforeX = _rayStep.x;
      const beforeZ = _rayStep.z;
      clampPosition(_rayStep, input.nearPad);
      const horizPushed = Math.hypot(_rayStep.x - beforeX, _rayStep.z - beforeZ);
      if (horizPushed > 0.08) {
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
