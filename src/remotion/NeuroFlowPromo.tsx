import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {ReactNode} from 'react';

type PromoAssetMap = {
  logo?: string;
  heroVideo?: string;
  dashboardScreen?: string;
  calendarScreen?: string;
  focusScreen?: string;
  resourcesScreen?: string;
};

type PromoScriptScene = {
  id: string;
  caption: string;
  vo: string;
};

export type NeuroFlowPromoProps = {
  brandName: string;
  tagline: string;
  callToAction: string;
  offerLine: string;
  voiceoverFile?: string;
  musicFile?: string;
  assets: PromoAssetMap;
  script: PromoScriptScene[];
};

const sceneTimings = [
  {start: 0, duration: 135},
  {start: 135, duration: 180},
  {start: 315, duration: 210},
  {start: 525, duration: 210},
  {start: 735, duration: 165},
  {start: 900, duration: 150},
];

const palette = {
  appBlack: '#05070d',
  panel: '#171922',
  panelSoft: '#20232f',
  blue: '#4c98f0',
  deepBlue: '#0b5eb3',
  electric: '#6bb1ff',
  text: '#f5f7ff',
  muted: '#9699aa',
  line: '#263a60',
  green: '#2fd4a4',
  red: '#ff7377',
  orange: '#ff9b3d',
};

const assetPath = (filename?: string) =>
  filename ? staticFile(`remotion/neuroflow-promo/${filename}`) : null;

const sceneProgress = (frame: number, index: number) => {
  const scene = sceneTimings[index];
  return interpolate(frame, [scene.start, scene.start + scene.duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

const Scene = ({index, children}: {index: number; children: ReactNode}) => {
  const timing = sceneTimings[index];
  const frame = useCurrentFrame();
  const localFrame = frame - timing.start;
  const opacity = interpolate(
    localFrame,
    [0, 16, timing.duration - 18, timing.duration],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <Sequence from={timing.start} durationInFrames={timing.duration}>
      <AbsoluteFill style={{opacity}}>{children}</AbsoluteFill>
    </Sequence>
  );
};

const BrandMark = ({logo, size = 84}: {logo?: string; size?: number}) => {
  const logoSrc = assetPath(logo);

  if (!logoSrc) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.22),
          background: '#000',
          color: palette.electric,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.38),
          fontWeight: 900,
        }}
      >
        NF
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.18),
        overflow: 'hidden',
        background: '#000',
        position: 'relative',
        boxShadow: '0 0 34px rgba(76, 152, 240, 0.38)',
      }}
    >
      <Img
        src={logoSrc}
        style={{
          position: 'absolute',
          width: size * 1.5,
          height: size * 1.5,
          left: size * -0.25,
          top: size * -0.08,
          objectFit: 'cover',
        }}
      />
    </div>
  );
};

const BrandHeader = ({brandName, logo}: {brandName: string; logo?: string}) => (
  <div
    style={{
      position: 'absolute',
      top: 70,
      left: 64,
      right: 64,
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      zIndex: 10,
    }}
  >
    <BrandMark logo={logo} size={78} />
    <div
      style={{
        fontSize: 38,
        color: palette.blue,
        fontWeight: 900,
        letterSpacing: 0,
      }}
    >
      {brandName}
    </div>
  </div>
);

const DashboardBackdrop = ({
  image,
  pan = 0,
  zoom = 1.1,
  opacity = 0.74,
}: {
  image?: string;
  pan?: number;
  zoom?: number;
  opacity?: number;
}) => {
  const src = assetPath(image);

  return (
    <AbsoluteFill style={{background: palette.appBlack, overflow: 'hidden'}}>
      {src ? (
        <Img
          src={src}
          style={{
            position: 'absolute',
            height: '100%',
            width: 'auto',
            minWidth: '100%',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translateX(${pan}px) scale(${zoom})`,
            opacity,
            filter: 'saturate(1.08) contrast(1.05)',
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(5,7,13,0.55) 0%, rgba(5,7,13,0.15) 36%, rgba(5,7,13,0.78) 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(90deg, rgba(5,7,13,0.92) 0%, rgba(5,7,13,0.22) 42%, rgba(5,7,13,0.72) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

const CaptionCard = ({
  eyebrow,
  title,
  body,
  bottom = 150,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  bottom?: number;
}) => {
  const frame = useCurrentFrame();
  const entrance = spring({frame, fps: 30, config: {damping: 24, stiffness: 85}});

  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        right: 56,
        bottom,
        padding: '44px 42px',
        borderRadius: 34,
        background: 'rgba(23, 25, 34, 0.88)',
        border: `2px solid ${palette.line}`,
        boxShadow: '0 28px 80px rgba(0, 0, 0, 0.46)',
        transform: `translateY(${interpolate(entrance, [0, 1], [34, 0])}px)`,
      }}
    >
      {eyebrow ? (
        <div
          style={{
            color: palette.electric,
            fontSize: 28,
            fontWeight: 900,
            marginBottom: 18,
            letterSpacing: 0,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          color: palette.text,
          fontSize: 68,
          lineHeight: 1.02,
          fontWeight: 950,
          letterSpacing: 0,
          textWrap: 'balance',
        }}
      >
        {title}
      </div>
      {body ? (
        <div
          style={{
            color: palette.muted,
            fontSize: 33,
            lineHeight: 1.22,
            fontWeight: 700,
            marginTop: 24,
          }}
        >
          {body}
        </div>
      ) : null}
    </div>
  );
};

const FeatureStack = ({items}: {items: Array<{label: string; color: string}>}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: 'absolute',
        left: 58,
        right: 58,
        top: 312,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      {items.map((item, index) => {
        const local = frame - 135 - index * 9;
        const entry = spring({frame: Math.max(0, local), fps: 30, config: {damping: 20}});

        return (
          <div
            key={item.label}
            style={{
              height: 104,
              borderRadius: 26,
              background: 'rgba(23, 25, 34, 0.9)',
              border: `2px solid ${palette.line}`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 30px',
              gap: 24,
              transform: `translateX(${interpolate(entry, [0, 1], [-60, 0])}px)`,
              opacity: interpolate(entry, [0, 1], [0, 1]),
            }}
          >
            <div
              style={{
                width: 14,
                height: 62,
                borderRadius: 999,
                background: item.color,
                boxShadow: `0 0 28px ${item.color}`,
              }}
            />
            <div style={{color: palette.text, fontSize: 39, fontWeight: 900}}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ScreenshotPanel = ({
  image,
  label,
  pan = 0,
}: {
  image?: string;
  label: string;
  pan?: number;
}) => {
  const src = assetPath(image);

  return (
    <div
      style={{
        width: 860,
        height: 940,
        borderRadius: 34,
        overflow: 'hidden',
        background: palette.panel,
        border: `3px solid ${palette.line}`,
        boxShadow: '0 28px 90px rgba(0,0,0,0.56)',
        position: 'relative',
      }}
    >
      {src ? (
        <Img
          src={src}
          style={{
            height: '100%',
            width: 'auto',
            minWidth: '100%',
            transform: `translateX(${pan}px)`,
            objectFit: 'cover',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '36px 38px',
          background: 'linear-gradient(0deg, rgba(5,7,13,0.96), rgba(5,7,13,0))',
          color: palette.text,
          fontSize: 42,
          fontWeight: 950,
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const NeuroFlowPromo = ({
  brandName,
  tagline,
  callToAction,
  offerLine,
  voiceoverFile,
  musicFile,
  assets,
  script,
}: NeuroFlowPromoProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const audioSrc = voiceoverFile ? staticFile(voiceoverFile) : null;
  const musicSrc = musicFile ? staticFile(`remotion/neuroflow-promo/${musicFile}`) : null;
  const p0 = sceneProgress(frame, 0);
  const p2 = sceneProgress(frame, 2);
  const p3 = sceneProgress(frame, 3);

  return (
    <AbsoluteFill style={{fontFamily: 'Inter, Arial, sans-serif', background: palette.appBlack}}>
      {audioSrc ? <Audio src={audioSrc} /> : null}
      {musicSrc ? <Audio src={musicSrc} volume={0.13} /> : null}

      <Scene index={0}>
        <DashboardBackdrop image={assets.dashboardScreen} pan={-210 + p0 * 70} zoom={1.18} />
        <BrandHeader brandName={brandName} logo={assets.logo} />
        <CaptionCard
          eyebrow={tagline}
          title={script[0]?.caption ?? 'Your day does not need to feel scattered.'}
          body="A dashboard that feels like the product: dark, focused, calm, and built for real routines."
        />
      </Scene>

      <Scene index={1}>
        <DashboardBackdrop image={assets.calendarScreen} pan={-250} zoom={1.12} opacity={0.62} />
        <BrandHeader brandName={brandName} logo={assets.logo} />
        <FeatureStack
          items={[
            {label: 'Tasks in one view', color: palette.blue},
            {label: 'Calendar reminders', color: palette.green},
            {label: 'Focus sessions', color: palette.red},
            {label: 'Resources nearby', color: palette.orange},
          ]}
        />
        <CaptionCard
          title={script[1]?.caption ?? 'Tasks, reminders, focus time, resources.'}
          bottom={138}
        />
      </Scene>

      <Scene index={2}>
        <DashboardBackdrop image={assets.dashboardScreen} pan={-160 + p2 * 95} zoom={1.08} />
        <BrandHeader brandName={brandName} logo={assets.logo} />
        <div style={{position: 'absolute', left: 110, top: 310}}>
          <ScreenshotPanel image={assets.dashboardScreen} label="Dashboard" pan={-430} />
        </div>
        <CaptionCard
          eyebrow="Meet the system"
          title={script[2]?.caption ?? 'Meet NeuroFlow ADHD.'}
          body="The actual dashboard leads the visual language, not a generic background."
          bottom={116}
        />
      </Scene>

      <Scene index={3}>
        <DashboardBackdrop image={assets.focusScreen} pan={-170 + p3 * 80} zoom={1.1} />
        <BrandHeader brandName={brandName} logo={assets.logo} />
        <div
          style={{
            position: 'absolute',
            top: 278,
            left: 54,
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
          }}
        >
          <ScreenshotPanel image={assets.calendarScreen} label="Plan" pan={-540} />
          <div style={{transform: 'translateY(-510px) translateX(92px) scale(0.82)'}}>
            <ScreenshotPanel image={assets.focusScreen} label="Focus" pan={-360} />
          </div>
        </div>
        <CaptionCard title={script[3]?.caption ?? 'Plan. Focus. Remember. Return.'} bottom={120} />
      </Scene>

      <Scene index={4}>
        <DashboardBackdrop image={assets.resourcesScreen} pan={-190} zoom={1.13} />
        <BrandHeader brandName={brandName} logo={assets.logo} />
        <CaptionCard
          eyebrow="Simple ownership"
          title={script[4]?.caption ?? offerLine}
          body="Built as a one-time dashboard purchase, so customers can get organized without rebuilding a system from scratch."
          bottom={180}
        />
      </Scene>

      <Scene index={5}>
        <DashboardBackdrop image={assets.resourcesScreen} pan={-260} zoom={1.16} opacity={0.58} />
        <BrandHeader brandName={brandName} logo={assets.logo} />
        <div
          style={{
            position: 'absolute',
            left: 56,
            right: 56,
            bottom: 144,
            padding: '54px 44px',
            borderRadius: 36,
            background: `linear-gradient(135deg, ${palette.deepBlue}, ${palette.blue})`,
            boxShadow: '0 30px 90px rgba(76, 152, 240, 0.38)',
          }}
        >
          <div
            style={{
              color: palette.text,
              fontSize: 72,
              lineHeight: 1.02,
              fontWeight: 950,
              letterSpacing: 0,
              textWrap: 'balance',
            }}
          >
            {script[5]?.caption ?? callToAction}
          </div>
          <div
            style={{
              marginTop: 32,
              width: '100%',
              minHeight: 112,
              borderRadius: 28,
              background: '#05070d',
              color: palette.text,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              fontWeight: 950,
            }}
          >
            {callToAction}
          </div>
        </div>
      </Scene>

      <div
        style={{
          position: 'absolute',
          left: 58,
          right: 58,
          bottom: 54,
          height: 9,
          borderRadius: 999,
          background: 'rgba(76, 152, 240, 0.18)',
          overflow: 'hidden',
          zIndex: 20,
        }}
      >
        <div
          style={{
            width: `${Math.min(100, (frame / (35 * fps)) * 100)}%`,
            height: '100%',
            background: palette.blue,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
