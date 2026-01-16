const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const sequelize = require('./config/database');
const User = require('./models/User');
const SupportUser = require('./models/SupportUser');
const Wallet = require('./models/Wallet');
const Transaction = require('./models/Transaction');
const Subscription = require('./models/Subscription');
const Tfn = require('./models/Tfn');
const StripeCheckoutSession = require('./models/StripeCheckoutSession');
const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const billingWebhookHandler = require('./routes/billingWebhook');
const walletRoutes = require('./routes/wallet');
const walletTopUpRoutes = require('./routes/walletTopUps');
const addonsRoutes = require('./routes/addons');
const tfnRoutes = require('./routes/tfns');
const subscriptionRoutes = require('./routes/subscriptions');
const supportUserRoutes = require('./routes/supportUsers');
const usageRoutes = require('./routes/usage');
const { runAutoRenewCycle } = require('./jobs/autoRenew');
const { runUsagePipeline } = require('./jobs/usageRating');

dotenv.config();

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.post('/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookHandler);

app.use(express.json());

app.use('/auth', authRoutes);
app.use('/billing', billingRoutes);
app.use('/wallet', walletRoutes);
app.use('/wallet/top-ups', walletTopUpRoutes);
app.use('/addons', addonsRoutes);
app.use('/tfns', tfnRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/support-users', supportUserRoutes);
app.use('/usage', usageRoutes);

app.get('/', (_req, res) => {
  res.json({ message: 'Balatrix Portal backend is running' });
});

async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');

    const shouldSync =
      process.env.NODE_ENV === 'test' || process.env.SEQUELIZE_SYNC === 'true';

    if (shouldSync) {
      await sequelize.sync();
      console.log('Models synchronized successfully.');
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
}

let serverInstance;

async function startServer({ port } = {}) {
  if (serverInstance) {
    return { app, server: serverInstance };
  }

  await initializeDatabase();
  const PORT = port || process.env.PORT || 3000;

  await new Promise((resolve, reject) => {
    serverInstance = app
      .listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        resolve();
      })
      .on('error', (err) => {
        reject(err);
      });
  });

  return { app, server: serverInstance };
}

async function stopServer() {
  if (!serverInstance) {
    return;
  }

  await new Promise((resolve, reject) => {
    serverInstance.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

  serverInstance = undefined;
}

if (process.env.NODE_ENV !== 'test') {
  startServer()
    .then(() => {
      if (process.env.DISABLE_SCHEDULER !== 'true') {
        const autoRenewIntervalMinutes = Number(process.env.AUTO_RENEW_INTERVAL_MINUTES || 15);
        setInterval(() => {
          runAutoRenewCycle().catch((error) => {
            console.error('Auto-renew interval failure', error);
          });
        }, autoRenewIntervalMinutes * 60 * 1000);

        const usageIntervalMinutes = Number(process.env.USAGE_PIPELINE_INTERVAL_MINUTES || 5);
        const runUsage = () =>
          runUsagePipeline()
            .then((summary) => {
              if (summary?.error) {
                console.error('Usage pipeline completed with error', summary);
              }
            })
            .catch((error) => {
              console.error('Usage pipeline failure', error);
            });

        setInterval(runUsage, usageIntervalMinutes * 60 * 1000);

        if (process.env.RUN_USAGE_PIPELINE_ON_BOOT !== 'false') {
          runUsage().catch((error) => {
            console.error('Usage pipeline initial run failed', error);
          });
        }
      }
    })
    .catch((err) => {
      console.error('Failed to start server', err);
      process.exit(1);
    });
}

module.exports = {
  app,
  initializeDatabase,
  startServer,
  stopServer,
};
