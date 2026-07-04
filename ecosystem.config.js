// PM2 process config — used on local server deployment
module.exports = {
  apps: [
    {
      name:         'ca-firm-api',
      cwd:          './apps/api',
      script:       'dist/main.js',
      instances:    2,
      exec_mode:    'cluster',
      watch:        false,
      env: {
        NODE_ENV: 'production',
        PORT:     4000,
      },
    },
    {
      name:   'ca-firm-web',
      cwd:    './apps/web',
      script: 'node_modules/.bin/next',
      args:   'start -p 3000',
      watch:  false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
