import billing from './_billing-utils.js';

const {
  getStripe,
  normalizeEmail,
  subscriptionRecordFromStripe,
  upsertSubscription,
} = billing;

// Tell Vercel NOT to parse the request body, so we can read Stripe's exact
// raw bytes for signature verification. (ESM `export const config` is honored
// by Vercel's build, unlike the CommonJS variant which it ignored.)
export const config = {
  api: { bodyParser: false },
};

// Read the untouched raw request body straight off the stream.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: 'Stripe webhook is not configured.' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('[stripe-webhook] invalid signature:', error.message);
    return res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await upsertSubscription(subscriptionRecordFromStripe(subscription, {
          user_email: normalizeEmail(session.customer_email || session.metadata?.email),
          user_id: session.metadata?.userId || null,
        }));
      }
    }

    if (event.type === 'customer.subscription.created'
      || event.type === 'customer.subscription.updated'
      || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      await upsertSubscription(subscriptionRecordFromStripe(subscription, {
        user_email: normalizeEmail(subscription.metadata?.email),
        user_id: subscription.metadata?.userId || null,
      }));
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[stripe-webhook] processing failed:', error);
    return res.status(500).json({ error: error.message || 'Webhook processing failed.' });
  }
}
