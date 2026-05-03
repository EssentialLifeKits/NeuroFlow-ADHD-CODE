import {Composition} from 'remotion';
import {
  NeuroFlowPromo,
  type NeuroFlowPromoProps,
} from './NeuroFlowPromo';
import {promoConfig} from './promoConfig';

export const RemotionRoot = () => {
  return (
    <Composition
      id="NeuroFlowPromo"
      component={NeuroFlowPromo}
      durationInFrames={1050}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={promoConfig satisfies NeuroFlowPromoProps}
    />
  );
};
