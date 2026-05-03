import type {NeuroFlowPromoProps} from './NeuroFlowPromo';

export const promoConfig: NeuroFlowPromoProps = {
  brandName: 'NeuroFlow ADHD',
  tagline: 'Calm organization for busy brains.',
  callToAction: 'Click the link to learn more',
  offerLine: 'One dashboard. One-time purchase.',
  voiceoverFile: '',
  musicFile: '',
  assets: {
    logo: '',
    heroVideo: '',
    dashboardScreen: '',
    calendarScreen: '',
    focusScreen: '',
    resourcesScreen: '',
  },
  script: [
    {
      id: 'open',
      caption: 'Your day does not need to feel scattered.',
      vo: 'Your day does not need to feel scattered.',
    },
    {
      id: 'problem',
      caption: 'Tasks, reminders, focus time, resources.',
      vo: 'When tasks, reminders, focus time, and resources live in different places, staying organized can feel harder than the work itself.',
    },
    {
      id: 'solution',
      caption: 'Meet NeuroFlow ADHD.',
      vo: 'NeuroFlow ADHD brings everything into one calm dashboard built for real life, ADHD brains, students, parents, creators, coaches, and anyone who wants a softer way to stay on track.',
    },
    {
      id: 'features',
      caption: 'Plan. Focus. Remember. Return.',
      vo: 'Plan your tasks, see what is coming up, schedule reminders, keep helpful resources nearby, and return to your day with less noise.',
    },
    {
      id: 'ownership',
      caption: 'Buy the dashboard once. Keep using it.',
      vo: 'No complicated system to rebuild every week. Purchase the dashboard once, make it yours, and use it whenever you need a clearer path forward.',
    },
    {
      id: 'cta',
      caption: 'Click the link to learn more.',
      vo: 'Click the link to learn more and see if NeuroFlow ADHD is the calm organization dashboard you have been looking for.',
    },
  ],
};
