import { getUncachableStripeClient } from './stripeClient.js';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'Starter'" });
  if (existing.data.length > 0) {
    console.log('Products already exist, skipping seed.');
    return;
  }

  console.log('Creating Starter plan...');
  const starter = await stripe.products.create({
    name: 'Starter',
    description: 'For solo practitioners getting started. 5 hours of transcription per month.',
    metadata: {
      tier: 'starter',
      transcription_hours: '5',
    },
  });
  await stripe.prices.create({
    product: starter.id,
    unit_amount: 2900,
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log(`Created Starter: ${starter.id}`);

  console.log('Creating Professional plan...');
  const professional = await stripe.products.create({
    name: 'Professional',
    description: 'For busy attorneys and law firms. 25 hours of transcription per month.',
    metadata: {
      tier: 'professional',
      transcription_hours: '25',
    },
  });
  await stripe.prices.create({
    product: professional.id,
    unit_amount: 7900,
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log(`Created Professional: ${professional.id}`);

  console.log('Creating Enterprise plan...');
  const enterprise = await stripe.products.create({
    name: 'Enterprise',
    description: 'For large firms with high volume needs. Unlimited transcription hours.',
    metadata: {
      tier: 'enterprise',
      transcription_hours: 'unlimited',
    },
  });
  await stripe.prices.create({
    product: enterprise.id,
    unit_amount: 19900,
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log(`Created Enterprise: ${enterprise.id}`);

  console.log('All products created successfully!');
}

createProducts().catch(console.error);
