'use strict'
const YAML = require('yamljs')

const gasmon = require('./src/gasmon')


YAML.load('config.yml', yaml => {
  process.env.TZ = yaml.gasmon.timezone
  gasmon.fetch()
    .then(gasmon.composeMessage)
    .then(x => `# ${x.msg.title}\n\n${x.msg.message}`)
    .then(console.log, console.error)
})
