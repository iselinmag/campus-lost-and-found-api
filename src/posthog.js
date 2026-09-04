require('dotenv').config();

const { PostHog } = require('posthog-node');

const posthog = new PostHog(
  process.env.POSTHOG_API_KEY,
  {
    host: process.env.POSTHOG_HOST
  }
);

module.exports = posthog;