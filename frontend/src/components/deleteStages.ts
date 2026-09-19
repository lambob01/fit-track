export type DeleteStage = 'confirm' | 'type' | 'password' | 'done'

export interface DeleteFriction {
  typeToConfirm: boolean
  requirePassword: boolean
}

export function nextDeleteStage(stage: DeleteStage, friction: DeleteFriction): DeleteStage {
  switch (stage) {
    case 'confirm':
      if (friction.typeToConfirm) {
        return 'type'
      }
      return friction.requirePassword ? 'password' : 'done'
    case 'type':
      return friction.requirePassword ? 'password' : 'done'
    case 'password':
    case 'done':
      return 'done'
  }
}

export function shouldSubmit(stage: DeleteStage, friction: DeleteFriction): boolean {
  return nextDeleteStage(stage, friction) === 'done'
}
