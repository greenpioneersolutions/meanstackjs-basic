module.exports = MeanLite
// SERVER
var debug = require('debug')('meanstackjs:server')
var mongoose = require('mongoose')
var error = require('./server/error.js')
var forceSSL = require('express-force-ssl')
var fs = require('fs')
var https = require('https')
var _ = require('lodash')
// CONFIG
var auth = require('./server/passport.js')
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var compress = require('compression')
var express = require('express')
var expressValidator = require('express-validator')
var methodOverride = require('method-override')
var path = require('path')
var passport = require('passport')
var session = require('express-session')
var MongoStore = require('connect-mongo')(session)
var statusMonitor = require('express-status-monitor')
var queryParameters = require('express-query-parameters')()
// SECURITY
var cors = require('cors')
var contentLength = require('express-content-length-validator')
var helmet = require('helmet')
var hpp = require('hpp')
// var throttler = require('mongo-throttle')
// LOGGER
var morgan = require('morgan')
//  REGISTER
var concat = require('serial-concat-files')
var less = require('less')
var uglify = require('uglify-js')
var uglifycss = require('uglifycss')
var sass = require('node-sass')
var pathExists = require('is-there')
// ERROR
var httpStatus = require('http-status-codes')
var errorLog = require('./server/error.js')
// ROUTES
var ejs = require('ejs')
var seo = require('./server/seo')
// CDN
var MaxCDN = require('maxcdn')
function MeanLite (opts, done) {
  var self = this
  self.dir = __dirname
  self.opts = opts
  self.environment = require('./configs/environment.js').get()
  self.settings = require('./configs/settings.js').get()
  self.port = self.opts.port || self.settings.https.active ? self.settings.https.port : self.settings.http.port
  self.middleware = require('./server/middleware.js')
  self.mail = require('./server/mail.js')
  // Start of the build process
  // setupDb > Used to connect to the db
  self.setupDb()
  // setupConfig > Used to set up expressjs initially, middleware & passport.
  self.setupConfig()
  // setupSecurity > Used to set up helmet, hpp, cors & content length.
  self.setupSecurity()
  // setupHeaders > Used to set up the headers that go out on every route.
  self.setupHeaders()
  // setupLogger > Used to set up our morgan logger & debug statements on all routes.
  self.setupLogger()
  // setupFrontendDirectories > Used to set up all directories need & to remove the previously compiled files.
  self.setupFrontendDirectories()
  // compileFrontendStylesScripts > Used to compile all of the info needed for styles & scripts to render later.
  self.compileFrontendStylesScripts()
  // renderFrontendFiles > Used to render all of the frontend files based on all the information from above.
  self.renderFrontendFiles()
  // updateFrontendCdn > Used to update the files based of if your using a cdn. We Support MAXCDN.
  self.updateFrontendCdn()
  // setupModels > Used to set up all mongoose models
  self.setupModels()
  // setupRoutes > Used to set up all system static routes including the main '/*' route with ejs templating.
  self.setupRoutes()
  // setupError > Used to set up our customer error handler in the server folder. NOTE: This goes after routes because we do not want it potentally default to express error handler
  self.setupError()
  // setupCdn - *** OPTIONAL ***  > Used to purge the max cdn cache of the file. We Support MAXCDN
  self.setupCdn()
  if (self.settings.https.active) {
    https.createServer({
      key: fs.readFileSync(self.settings.https.key),
      cert: fs.readFileSync(self.settings.https.cert)
    }, self.app).listen(self.settings.https.port, function () {
      console.log('HTTPS Express server listening on port %d in %s mode', self.settings.https.port, self.app.get('env'))
      debug('HTTPS Express server listening on port %d in %s mode', self.settings.https.port, self.app.get('env'))
      // Force SSL if the http is not active
      if (!self.settings.http.active) {
        var app = require('express')()
        app.set('forceSSLOptions', {
          httpsPort: self.settings.https.port
        })
        app.use('/*', forceSSL)
        app.listen(self.settings.http.port, function () {
          console.log('HTTP FORCE SSL Express server listening on port %d in %s mode', self.settings.http.port, self.app.get('env'))
          debug('HTTP FORCE SSL Express server listening on port %d in %s mode', self.settings.http.port, self.app.get('env'))
          done()
        })
      }
    })
  }
  // check if you set both to false we default to turn on http
  if (self.settings.http.active || (self.settings.https.active === false) === (self.settings.http.active === false)) {
    self.app.listen(self.app.get('port'), function () {
      console.log('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
      debug('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
      done()
    })
  }
}

MeanLite.prototype.setupDb = function () {
  debug('started setupDb')
  var self = this
  mongoose.Promise = global.Promise
  mongoose.set('debug', self.settings.mongodb.debug)
  mongoose.connect(self.settings.mongodb.uri, self.settings.mongodb.options)
  mongoose.connection.on('error', function (err) {
    console.log('MongoDB Connection Error. Please make sure that MongoDB is running.')
    debug('MongoDB Connection Error ', err)
  })
  mongoose.connection.on('open', function () {
    debug('MongoDB Connection Open ')
  })
  debug('end setupDb')
}
MeanLite.prototype.setupConfig = function () {
  debug('started setupConfig')
  var self = this
  self.app = express()
  self.app.enable('trust proxy')
  self.app.disable('x-powered-by')
  self.app.set('view engine', 'html')
  self.app.set('views', path.join(self.dir, '/client'))
  self.app.set('port', self.port)
  self.app.use(statusMonitor({
    path: '/api/status'
  }))
  self.app.use(compress())
  self.app.use(bodyParser.json(self.settings.bodyparser.json))
  self.app.use(bodyParser.urlencoded(self.settings.bodyparser.urlencoded))
  self.app.use(expressValidator(self.settings.expresValidator))
  self.app.use(methodOverride())
  self.app.use(cookieParser())
  self.app.use(session({
    name: self.settings.sessionName,
    resave: true,
    saveUninitialized: true,
    secret: self.settings.sessionSecret,
    store: new MongoStore({
      url: self.settings.mongodb.uri,
      autoReconnect: true
    })
  }))
  self.app.use(passport.initialize())
  self.app.use(passport.session())
  passport.serializeUser(auth.serializeUser)
  passport.deserializeUser(auth.deserializeUser)
  passport.use(auth.passportStrategy)
  queryParameters.config({
    settings: {
      schema: ['_id', 'id', '__v', 'created', 'title', 'content', 'user', 'email', 'roles'], // the names people can search
      adapter: 'mongoose' // <object|string:supported adapter(MONGOOSE)>
    }
  })
  self.app.use(queryParameters.middleware())
  self.app.use(require('./server/prerenderer'))
  debug('end setupConfig')
}
MeanLite.prototype.setupSecurity = function () {
  debug('started setupSecurity')
  var self = this
  // self.app.use(throttler(self.settings.throttle))
  self.app.use(helmet(self.settings.bodyparser.helmet))
  self.app.use(hpp())
  self.app.use(cors())
  self.app.use(contentLength.validateMax({
    max: 9999,
    status: 400,
    message: 'Please make a small payload'
  }))
  debug('end setupSecurity')
}
MeanLite.prototype.setupHeaders = function () {
  debug('started setupHeaders')
  var self = this
  self.app.use(function (req, res, next) {
    // Add all custom system headers here
    // Force IE to use latest rendering engine or Chrome Frame
    res.header('X-UA-Compatible', 'IE=Edge,chrome=1')
    next()
  })
  debug('end setupHeaders')
}
MeanLite.prototype.setupLogger = function () {
  debug('started setupLogger')
  var self = this

  if (self.settings.logger) {
    self.app.use(morgan(self.settings.logger))
    self.app.use(function (req, res, next) {
      // Log requests using the "debug" module so that the output is hidden by default.
      // Enable with DEBUG=* environment variable.
      debug(req.method + ' ' + req.originalUrl + ' ' + req.ip)
      next()
    })
  }
  debug('end setupLogger')
}
MeanLite.prototype.setupFrontendDirectories = function () {
  debug('started setupFrontendDirectories')
  var self = this
  if (!pathExists(self.dir + '/client/scripts/')) {
    fs.mkdirSync(self.dir + '/client/scripts/')
  }
  if (!pathExists(self.dir + '/client/styles/compiled/')) {
    fs.mkdirSync(self.dir + '/client/styles/compiled/')
  }
  if (!pathExists(self.dir + '/client/scripts/compiled/')) {
    fs.mkdirSync(self.dir + '/client/scripts/compiled/')
  }
  if (!pathExists(self.dir + '/client/uploads/')) {
    fs.mkdirSync(self.dir + '/client/uploads/')
  }
  debug('end setupFrontendDirectories')
}
MeanLite.prototype.compileFrontendStylesScripts = function () {
  debug('started compileFrontendStylesScripts')
  var self = this
  self.frontendFilesFinal = {
    css: [],
    js: []
  }

  self.frontendFilesAggregate = {
    css: [],
    js: []
  }

  var globalContents = fs.readFileSync(self.dir + '/client/styles/global.style.scss', 'utf8')
  var result = sass.renderSync({
    includePaths: [
      path.join(self.dir, './client/modules'),
      path.join(self.dir, './client/styles'),
      path.join(self.dir, './client/bower_components/bootstrap-sass/assets/stylesheets'),
      path.join(self.dir, './client/bower_components/Materialize/sass'),
      path.join(self.dir, './client/bower_components/foundation/scss'),
      path.join(self.dir, './client/bower_components/font-awesome/scss')
    ],
    data: globalContents
  })

  fs.writeFileSync(self.dir + '/client/styles/compiled/global.style.css', result.css)

  fs.writeFileSync(
    path.join(self.dir, './client/styles/global-configs.styles.scss'),
    '$ENV: "' + self.environment + '" !default;\n' + '$CDN: "' + self.settings.cdn + '" !default;\n'
  )
  _.forEach(self.settings.assets.css, function (n) {
    var info = path.parse(n)
    switch (info.ext) {
      case '.less':
        var lessContents = fs.readFileSync(path.join(self.dir, '/client' + n), 'utf8')
        less.render(lessContents, function (err, result) {
          if (err) {
            console.log(err)
          }
          fs.writeFileSync(path.join(self.dir, '/client/styles/compiled/' + info.base + '.css'), result.css)
          self.frontendFilesFinal.css.push('/styles/compiled/' + info.base + '.css')
          self.frontendFilesAggregate.css.push(path.join(self.dir, '/client' + '/styles/compiled/' + info.base + '.css'))
        })
        break
      case '.scss':
      case '.sass':
        var scssContents = fs.readFileSync(path.join(self.dir, '/client' + n), 'utf8')
        // PLACED includePaths: so that @import 'global-variables.styles.scss'; work properly
        var result = sass.renderSync({
          includePaths: [path.join(self.dir, '/client/modules'), path.join(self.dir, '/client/styles'), path.join(self.dir, '/client/bower_components/bootstrap-sass/assets/stylesheets'), path.join(self.dir, '/client/bower_components/Materialize/sass'), path.join(self.dir, '/client/bower_components/foundation/scss'), path.join(self.dir, '/client/bower_components/font-awesome/scss')],
          data: scssContents
        })
        fs.writeFileSync(path.join(self.dir, '/client/styles/compiled/' + info.base + '.css'), result.css)
        self.frontendFilesFinal.css.push('/styles/compiled/' + info.base + '.css')
        self.frontendFilesAggregate.css.push(path.join(self.dir, '/client' + '/styles/compiled/' + info.base + '.css'))
        break
      default:

        self.frontendFilesFinal.css.push(n)
        self.frontendFilesAggregate.css.push(path.join(self.dir, '/client' + n))
        break
    }
  })
  _.forEach(self.settings.assets.js, function (n) {
    self.frontendFilesFinal.js.push(n)
    self.frontendFilesAggregate.js.push(path.join(self.dir, '/client' + n))
  })
  debug('end compileFrontendStylesScripts')
}

MeanLite.prototype.renderFrontendFiles = function () {
  debug('started renderFrontendFiles')
  var self = this
  if (self.settings.minify === 'concat') {
    concat(self.frontendFilesAggregate.css, path.join(self.dir, './client/styles/compiled/concat.css'), function (error) {
      if (error)debug(error, 'concat')
    })
    concat(self.frontendFilesAggregate.js, path.join(self.dir, './client/scripts/compiled/concat.js'), function (error) {
      if (error)debug(error, 'concat')
    })
    self.app.locals.frontendFilesFinal = {
      js: ['scripts/compiled/concat.js'],
      css: ['styles/compiled/concat.css']
    }
  } else if (self.settings.minify === 'minify') {
    var uglifiedcss = uglifycss.processFiles(
      self.frontendFilesAggregate.css, {
        maxLineLen: 500
      }
    )
    fs.writeFile(path.join(self.dir, './client/styles/compiled/concat.min.css'), uglifiedcss, function (err) {
      if (err) {
        debug(err)
      } else {
        debug('Script generated and saved:', 'concat.min.css')
      }
    })

    var uglifiedjs = uglify.minify(self.frontendFilesAggregate.js, {
      mangle: false
    })
    fs.writeFile(path.join(self.dir, './client/scripts/compiled/concat.min.js'), uglifiedjs.code, function (err) {
      if (err) {
        debug(err)
      } else {
        debug('Script generated and saved:', 'concat.min.js')
      }
    })
    self.app.locals.frontendFilesFinal = {
      js: ['scripts/compiled/concat.min.js'],
      css: ['styles/compiled/concat.min.css']
    }
  } else {
    self.app.locals.frontendFilesFinal = self.frontendFilesFinal
  }
  debug('end renderFrontendFiles')
}
MeanLite.prototype.updateFrontendCdn = function () {
  debug('started updateFrontendCdn')
  var self = this
  if (self.settings.cdn) {
    var FilesFinal = {
      js: [],
      css: []
    }
    self.app.locals.frontendFilesFinal.forEach(function (type, typeKey) {
      type.forEach(function (n) {
        FilesFinal[typeKey].push(self.settings.cdn + n)
      })
    })

    self.app.locals.frontendFilesFinal = FilesFinal
  }
  debug('end updateFrontendCdn')
}
MeanLite.prototype.setupModels = function () {
  debug('started setupModels')
  var self = this
  self.models = {}
  self.models.blog = mongoose.model('blog', require('./server/modules/blog/blog.model.js'))
  self.models.users = mongoose.model('users', require('./server/modules/users/users.model.js'))
  self.models.users = mongoose.model('error', require('./server/modules/admin/error.model.js'))
  debug('end setupModels')
}
MeanLite.prototype.setupRoutes = function () {
  debug('started setupRoutes')
  var self = this
  function nothingFoundHandler (msg) {
    return function (req, res) {
      res.status(400).send({
        error: msg
      })
    }
  }
  require('./server/modules/users/users.routes.js')(self.app, self.middleware, self.mail, self.settings, self.models)
  require('./server/modules/blog/blog.routes.js')(self.app, self.middleware, self.mail, self.settings, self.models)
  require('./server/modules/system/system.routes.js')(self.app, self.middleware, self.mail, self.settings, self.models)
  require('./server/modules/admin/admin.routes.js')(self.app, self.middleware, self.mail, self.settings, self.models)
  self.app.use(express.static(path.join(self.dir, 'client/'), {
    maxAge: 31557600000
  }))
  self.app.get('/api/seo/*', function (req, res) {
    seo(self, req, req.path.replace('/api/seo', ''), function (seoSettings) {
      res.send(seoSettings)
    })
  })
  self.app.get('/api/*', nothingFoundHandler('nothing found in api'))
  self.app.get('/bower_components/*', nothingFoundHandler('nothing found in bower_components'))
  self.app.get('/images/*', nothingFoundHandler('nothing found in images'))
  self.app.get('/scripts/*', nothingFoundHandler('nothing found in scripts'))
  self.app.get('/styles/*', nothingFoundHandler('nothing found in styles'))
  self.app.get('/uploads/*', nothingFoundHandler('nothing found in uploads'))
  self.app.get('/*', function (req, res) {
    seo(self, req, function (seoSettings) {
      ejs.renderFile(path.join(__dirname, './server/layout/index.html'), {
        html: seoSettings,
        googleAnalytics: self.settings.googleAnalytics,
        name: self.settings.app.name,
        assets: self.app.locals.frontendFilesFinal,
        environment: self.environment,
        user: req.user ? req.user : {}
      }, {
        cache: true
      }, function (err, str) {
        if (err)console.log(err)
        res.send(str)
      })
    })
  })
  debug('end setupRoutes')
}
MeanLite.prototype.setupError = function () {
  debug('started setupError')
  var self = this
  function jsonStringify (obj) {
    return JSON.stringify(obj, null, 2)
  }
  self.app.use(function (err, req, res, next) {
    var code = typeof err.status === 'number' ? err.status : 500
    var message = err.message || err.msg
    var type = 'express'
    var ip = req.ip || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress

    if (err.name === 'ValidationError') {
      code = 400
      message = 'Validation Error'
      type = 'mongo'
    }
    if (err.name === 'CastError') {
      code = 400
      message = 'Invalid Cast'
      type = 'mongo'
    }
    if (err.message === 'MongoError') {
      code = 400
      if (err.code === 11000) message = 'Duplicate key error '
      else message = 'Database Error'
      type = 'mongo'
    }

    var text = '\n=== EXCEPTION ===\n  \n' +
      'Message:\n' +
      message + '\n\n' +
      'Code:\n' + code + '\n \n' +
      'User:\n' + (req.user ? req.user.email : 'no user info') + '\n \n' +
      'IP Address:\n' + (ip || 'no IP') + '\n \n' +
      'User-Agent:\n' + jsonStringify(req.headers['user-agent']) + '\n \n' +
      'Route:\n' + req.method + '-' + req.url + '\n \n' +
      'Headers:\n' + '\n' + jsonStringify(req.headers) + '\n \n' +
      'Params:\n' + '\n' + jsonStringify(req.params) + '\n \n' +
      'Body:\n' + '\n' + jsonStringify(req.body) + '\n \n' +
      'Session:\n' + '\n' + jsonStringify(req.session) + '\n \n' +
      'Stack:\n' + err.stack + '\n'

    res.status(code)

    if (code >= 500) {
      err.type = type
      err.stack = text
      errorLog.log(err)
    }

    var renderData = {
      text: '',
      message: message,
      code: code,
      title: code + ' ' + httpStatus.getStatusText(code)
    }
    if (self.environment !== 'production') {
      renderData.text = text
    }
    debug('error message & code:' + message + ' - ' + code)
    return res.send(renderData)
  })
  debug('end setupError')
}
MeanLite.prototype.setupCdn = function () {
  debug('started setupCdn')
  var self = this

  if (self.settings.maxcdn.zoneId) {
    var maxcdn = new MaxCDN(
      self.settings.maxcdn.companyAlias,
      self.settings.maxcdn.consumerKey,
      self.settings.maxcdn.consumerSecret
    )
    maxcdn.del('zones/pull.json/' + self.settings.maxcdn.zoneId + '/cache', function (err, res) {
      console.log('MAXCDN: STATUS')
      if (err) {
        console.error('PURGE ERROR: ', err.stack || err.message || err)
        return
      } else if (res.code !== 200) {
        console.error('PURGE ERROR: ', res.code)
        return
      }
      console.log('PURGE SUCCESS')
    })
  }
  debug('end setupCdn')
}

// ERROR HANDLING
process.on('unhandledRejection', function (reason) {
  debug('System Error unhandledRejection:' + reason)
  console.error('[UNHANDLED REJECTION]')
  console.error(error.log(reason))
})

process.on('uncaughtException', function (err) {
  debug('System Error uncaughtException:' + err)
  console.error('[UNCAUGHT EXCEPTION] - ', err.message)
  error.log(err, function (logErr) {
    if (logErr)console.log('Error in log function in errors.js')
      // How do you want to handle your errors ? email admin , exit process or nothing at all ?
    process.exit(1)
  })
})
if (!module.parent) {
  var server = new MeanLite({}, function (err) {
    if (err) {
      console.error('Error during ' + server.settings.title + ' startup. Abort.')
      console.error(err.stack)
      process.exit(1)
    }
  })
}
