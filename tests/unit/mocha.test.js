process.env.NODE_ENV = 'nightwatch'
describe('MEANSTACKJS API Testing', function () {
  before(function (done) {
    this.timeout(20000)
    var MeanLite = require('../../server.mean.js')
    var server = new MeanLite({}, function (err) {
      if (err) {
        console.error('Error during ' + server.settings.title + ' startup. Abort.')
        console.error(err)
        process.exit(1)
      }
      require('../seed.js')(function () {
        done()
      })
    })
  })
  require('glob').sync('server/modules/**/*.spec.js').forEach(function (file) {
    require('../../' + file)
  })
})
