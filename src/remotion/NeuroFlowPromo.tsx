import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
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
  ink: '#17211b',
  moss: '#436c50',
  sage: '#a7c8af',
  mint: '#dff1e6',
  lavender: '#d8d3f1',
  peach: '#f5cdbb',
  cream: '#fbf8ef',
};

const assetPath = (filename?: string) =>
  filename ? staticFile(`remotion/neuroflow-promo/${filename}`) : null;

const useSceneProgress = (start: number, duration: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

const FitCaption = ({children}: {children: string}) => {
  return (
    <div
      style={{
        fontSize: 70,
        lineHeight: 1.04,
        fontWeight: 800,
        letterSpacing: 0,
        color: palette.ink,
        textWrap: 'balance',
      }}
    >
      {children}
    </div>
  );
};

const PhoneFrame = ({
  image,
  label,
  accent,
}: {
  image?: string;
  label: string;
  accent: string;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const float = Math.sin(frame / fps) * 10;
  const src = assetPath(image);

  return (
    <div
      style={{
        width: 630,
        height: 940,
        borderRadius: 54,
        background: '#fffdf7',
        border: `8px solid ${palette.ink}`,
        boxShadow: '0 28px 70px rgba(23, 33, 27, 0.18)',
        overflow: 'hidden',
        transform: `translateY(${float}px)`,
        position: 'relative',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.ink,
        }}
      >
        <div
          style={{
            width: 130,
            height: 16,
            borderRadius: 999,
            background: '#fffdf7',
            opacity: 0.88,
          }}
        />
      </div>
      {src ? (
        <Img
          src={src}
          style={{
            width: '100%',
            height: 'calc(100% - 64px)',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: 'calc(100% - 64px)',
            padding: 42,
            background: `linear-gradient(160deg, ${palette.cream}, ${accent})`,
            display: 'flex',
            flexDirection: 'column',
            gap: 26,
          }}
        >
          <div
            style={{
              fontSize: 42,
              fontWeight: 800,
              color: palette.ink,
              lineHeight: 1.06,
            }}
          >
            {label}
          </div>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              style={{
                height: 116,
                borderRadius: 28,
                background: 'rgba(255, 255, 255, 0.72)',
                border: '3px solid rgba(23, 33, 27, 0.09)',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: item === 0 ? 260 : item === 1 ? 360 : 310,
                  height: 18,
                  borderRadius: 999,
                  background: palette.ink,
                  opacity: 0.72,
                }}
              />
              <div
                style={{
                  width: item === 0 ? 390 : item === 1 ? 280 : 420,
                  height: 14,
                  borderRadius: 999,
                  background: palette.moss,
                  opacity: 0.45,
                }}
              />
            </div>
          ))}
          <div
            style={{
              marginTop: 'auto',
              height: 132,
              borderRadius: 34,
              background: palette.ink,
              color: palette.cream,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            Calm next step
          </div>
        </div>
      )}
    </div>
  );
};

const Scene = ({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) => {
  const timing = sceneTimings[index];
  const frame = useCurrentFrame();
  const localFrame = frame - timing.start;
  const opacity = interpolate(
    localFrame,
    [0, 18, timing.duration - 18, timing.duration],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const scale = spring({frame: Math.max(0, localFrame), fps: 30, config: {damping: 22}});

  return (
    <Sequence from={timing.start} durationInFrames={timing.duration}>
      <AbsoluteFill
        style={{
          opacity,
          transform: `scale(${interpolate(scale, [0, 1], [0.98, 1])})`,
        }}
      >
        {children}
      </AbsoluteFill>
    </Sequence>
  );
};

const Background = ({heroVideo}: {heroVideo?: string}) => {
  const frame = useCurrentFrame();
  const videoSrc = assetPath(heroVideo);
  const drift = interpolate(frame, [0, 1050], [0, -90]);

  return (
    <AbsoluteFill style={{background: palette.cream, overflow: 'hidden'}}>
      {videoSrc ? (
        <Video
          src={videoSrc}
          muted
          loop
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.22,
            filter: 'saturate(0.8) contrast(0.9)',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${palette.mint}, ${palette.cream} 48%, ${palette.lavender})`,
          opacity: videoSrc ? 0.82 : 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 760,
          height: 760,
          left: -190,
          top: 160 + drift,
          borderRadius: '50%',
          background: palette.peach,
          opacity: 0.52,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 980,
          height: 980,
          right: -420,
          bottom: -190 - drift,
          borderRadius: '50%',
          background: palette.sage,
          opacity: 0.54,
        }}
      />
    </AbsoluteFill>
  );
};

const BrandLockup = ({
  brandName,
  logo,
}: {
  brandName: string;
  logo?: string;
}) => {
  const logoSrc = assetPath(logo);

  return (
    <div
      style={{
        position: 'absolute',
        top: 92,
        left: 74,
        right: 74,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
        {logoSrc ? (
          <Img
            src={logoSrc}
            style={{width: 82, height: 82, objectFit: 'contain', borderRadius: 20}}
          />
        ) : (
          <div
            style={{
              width: 82,
              height: 82,
              borderRadius: 22,
              background: palette.ink,
              color: palette.cream,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 31,
              fontWeight: 900,
            }}
          >
            NF
          </div>
        )}
        <div style={{fontSize: 34, fontWeight: 800, color: palette.ink}}>
          {brandName}
        </div>
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
  const currentScene = sceneTimings.findIndex(
    (scene) => frame >= scene.start && frame < scene.start + scene.duration,
  );
  const sceneIndex = currentScene === -1 ? sceneTimings.length - 1 : currentScene;
  const progress = useSceneProgress(
    sceneTimings[sceneIndex].start,
    sceneTimings[sceneIndex].duration,
  );

  return (
    <AbsoluteFill style={{fontFamily: 'Inter, Arial, sans-serif'}}>
      <Background heroVideo={assets.heroVideo} />
      {audioSrc ? <Audio src={audioSrc} /> : null}
      {musicSrc ? <Audio src={musicSrc} volume={0.13} /> : null}
      <BrandLockup brandName={brandName} logo={assets.logo} />

      <Scene index={0}>
        <div style={{padding: '310px 76px 0'}}>
          <div style={{fontSize: 40, color: palette.moss, fontWeight: 800}}>
            {tagline}
          </div>
          <div style={{height: 34}} />
          <FitCaption>{script[0]?.caption ?? tagline}</FitCaption>
          <div
            style={{
              marginTop: 64,
              fontSize: 34,
              lineHeight: 1.22,
              color: palette.moss,
              width: 760,
              fontWeight: 700,
            }}
          >
            A softer way to see what matters next.
          </div>
        </div>
      </Scene>

      <Scene index={1}>
        <div
          style={{
            height: '100%',
            padding: '300px 76px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 36,
          }}
        >
          <FitCaption>{script[1]?.caption ?? 'Tasks, reminders, focus time.'}</FitCaption>
          {['Tasks', 'Reminders', 'Focus sessions', 'Helpful resources'].map((item, idx) => (
            <div
              key={item}
              style={{
                width: interpolate(progress, [0, 1], [620, 890 - idx * 42]),
                padding: '30px 34px',
                borderRadius: 32,
                background: 'rgba(255, 253, 247, 0.78)',
                color: palette.ink,
                fontSize: 36,
                fontWeight: 800,
                boxShadow: '0 16px 42px rgba(23, 33, 27, 0.11)',
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </Scene>

      <Scene index={2}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 120,
          }}
        >
          <PhoneFrame
            image={assets.dashboardScreen}
            label="Dashboard"
            accent={palette.mint}
          />
          <div
            style={{
              position: 'absolute',
              left: 76,
              right: 76,
              bottom: 174,
            }}
          >
            <FitCaption>{script[2]?.caption ?? brandName}</FitCaption>
          </div>
        </div>
      </Scene>

      <Scene index={3}>
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 26,
            paddingTop: 110,
          }}
        >
          <div style={{transform: 'scale(0.72) rotate(-5deg) translateX(70px)'}}>
            <PhoneFrame image={assets.calendarScreen} label="Calendar" accent={palette.peach} />
          </div>
          <div style={{transform: 'scale(0.72) rotate(5deg) translateX(-70px)'}}>
            <PhoneFrame image={assets.focusScreen} label="Focus" accent={palette.lavender} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: 76,
              right: 76,
              bottom: 158,
            }}
          >
            <FitCaption>{script[3]?.caption ?? 'Plan. Focus. Remember.'}</FitCaption>
          </div>
        </div>
      </Scene>

      <Scene index={4}>
        <div
          style={{
            height: '100%',
            padding: '330px 76px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 50,
          }}
        >
          <FitCaption>{script[4]?.caption ?? offerLine}</FitCaption>
          <div
            style={{
              width: 830,
              padding: '42px 46px',
              borderRadius: 38,
              background: palette.ink,
              color: palette.cream,
              fontSize: 46,
              lineHeight: 1.08,
              fontWeight: 900,
            }}
          >
            {offerLine}
          </div>
        </div>
      </Scene>

      <Scene index={5}>
        <div
          style={{
            height: '100%',
            padding: '330px 76px 0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{fontSize: 46, color: palette.moss, fontWeight: 800}}>
              {brandName}
            </div>
            <div style={{height: 34}} />
            <FitCaption>{script[5]?.caption ?? callToAction}</FitCaption>
          </div>
          <div
            style={{
              marginBottom: 150,
              width: '100%',
              minHeight: 126,
              borderRadius: 44,
              background: palette.ink,
              color: palette.cream,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 900,
              boxShadow: '0 24px 60px rgba(23, 33, 27, 0.24)',
            }}
          >
            {callToAction}
          </div>
        </div>
      </Scene>

      <div
        style={{
          position: 'absolute',
          left: 76,
          right: 76,
          bottom: 62,
          height: 8,
          borderRadius: 999,
          background: 'rgba(23, 33, 27, 0.13)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${(frame / (35 * fps)) * 100}%`,
            height: '100%',
            background: palette.ink,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
