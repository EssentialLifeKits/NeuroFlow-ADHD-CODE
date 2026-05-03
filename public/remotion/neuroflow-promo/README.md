# NeuroFlow Promo Assets

Drop 9:16 screenshots, short vertical clips, logo files, and music here.

Recommended filenames:

- `logo.png`
- `hero-video.mp4`
- `dashboard-screen.png`
- `calendar-screen.png`
- `focus-screen.png`
- `resources-screen.png`
- `music.mp3`

After adding files, open `src/remotion/promoConfig.ts` and set the matching filename values:

```ts
assets: {
  logo: 'logo.png',
  heroVideo: 'hero-video.mp4',
  dashboardScreen: 'dashboard-screen.png',
  calendarScreen: 'calendar-screen.png',
  focusScreen: 'focus-screen.png',
  resourcesScreen: 'resources-screen.png',
},
musicFile: 'music.mp3',
```

The ElevenLabs script writes generated voiceover to:

```txt
public/remotion/neuroflow-promo/voiceover/neuroflow-promo.mp3
```
