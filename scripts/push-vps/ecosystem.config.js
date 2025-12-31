module.exports = {
  apps: [
    {
      name: 'push-server',
      script: 'server.js',
      cwd: '/root/push-server',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@cannect.space',
        ADMIN_KEY: process.env.ADMIN_KEY,
      },
    },
  ],
};
