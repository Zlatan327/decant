export type MotionTrigger = 'none' | 'panel' | 'card' | 'interaction' | 'list-item' | 'status';

export interface ComponentTargetAttributes {
  'data-render-target': string;
  'data-motion-trigger': MotionTrigger;
}

export function targetAttributes(
  renderTarget: string,
  motionTrigger: MotionTrigger = 'none',
): ComponentTargetAttributes {
  return {
    'data-render-target': renderTarget,
    'data-motion-trigger': motionTrigger,
  };
}
