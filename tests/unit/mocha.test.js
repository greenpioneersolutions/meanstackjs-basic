process.env.NODE_ENV = 'nightwatch'
require('../../server.js')
var glob = require('glob')

require('../seed.js')(function () {
  glob.sync('server/modules/**/*.spec.js').forEach(function (file) {
    require('../../' + file)
  })
})
