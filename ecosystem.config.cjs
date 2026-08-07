module.exports = {
  apps: [{
    name: 'webapp',
    script: 'node',
    args: 'dist/index.js',
    watch: false,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    }
  }]
}
