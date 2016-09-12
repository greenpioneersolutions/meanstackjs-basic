module.exports = MeanLite

var _ = require('lodash')
var auto = require('run-auto')
var auth = require('./server/passport.js')
var bodyParser = require('body-parser')
var compress = require('compression')
var concat = require('serial-concat-files')
var cookieParser = require('cookie-parser')
var cors = require('cors')
var ejs = require('ejs')
var express = require('express')
var expressValidator = require('express-validator')
var fs = require('fs')
var helmet = require('helmet')
var https = require('https')
var logger = require('morgan')
var less = require('less')
var mongoose = require('mongoose')
var methodOverride = require('method-override')
var uglify = require('uglify-js')
var uglifycss = require('uglifycss')
var passport = require('passport')
var path = require('path')
var sass = require('node-sass')
var session = require('express-session')
var MongoStore = require('connect-mongo')(session)

function MeanLite (opts, done) {
  var self = this
  self.opts = opts
  self.app = express()
  self.environment = require('./configs/environment.js').get()
  self.settings = require('./configs/settings.js').get()
  self.port = self.settings.http.port
  self.middleware = require('./server/middleware.js')
  self.mail = require('./server/mail.js')
  self.dir = __dirname
  // Start of the build process
  // setupExpressConfigs > Used to set up expressjs initially, middleware & passport.
  self.setupExpressConfigs()
  // setupExpressErrorHandler > Used to set up our customer error handler in the server folder.
  self.setupExpressErrorHandler()
  // setupExpressSecurity > Used to set up helmet, hpp, cors & content length.
  self.setupExpressSecurity()
  // setupExpressHeaders > Used to set up the headers that go out on every route.
  self.setupExpressHeaders()
  // setupExpressLogger > Used to set up our morgan logger & debug statements on all routes.
  self.setupExpressLogger()
  // setupServerModels > Used to set up all mongoose models.
  self.setupServerModels()
  // setupServerRoutes > Used to set up all module routes.
  self.setupServerRoutes()
  // setupStaticRoutes > Used to set up all system static routes including the main '/*' route with ejs templating.
  self.setupStaticRoutes()
  // setupFrontendConfigs > Used to set up the proper directories and variable to compile later.
  self.setupFrontendConfigs()
  // compileFrontendStyles > Used to compile all frontend style (scss , less & css) & will render all styles.
  self.compileFrontendStyles()
  // compileFrontendScripts > Used to compile all of the frontend files declared.
  self.compileFrontendScripts()
  // renderFrontendFiles > Used to render all frontend files that we previously compiled together.
  self.renderFrontendFiles()
  // updateFrontendCdn > Used to update the files based of if your using a cdn. We Support MAXCDN.
  self.updateFrontendCdn()
  // auto  - connectMongoDb :  server > Used to finsh the final set up of the server. at the same time we start connecting to mongo and turning on the server.
  auto({
    connectMongoDb: function (callback) {
      mongoose.Promise = Promise
      mongoose.set('debug', self.settings.mongodb.debug)
      mongoose.connect(self.settings.mongodb.uri, self.settings.mongodb.options)
      mongoose.connection.on('error', function (err) {
        console.log('MongoDB Connection Error. Please make sure that MongoDB is running.')
        callback(err, null)
      })
      mongoose.connection.on('open', function () {
        callback(null, {
          db: self.settings.mongodb.uri,
          dbOptions: self.settings.mongodb.options
        })
      })
    },
    server: function (callback) {
      if (self.settings.https.active) {
        https.createServer({
          key: fs.readFileSync(self.settings.https.key),
          cert: fs.readFileSync(self.settings.https.cert)
        }, self.app).listen(self.settings.https.port, function () {
          console.log('HTTPS Express server listening on port %d in %s mode', self.settings.https.port, self.app.get('env'))
          if (!self.settings.http.active)callback(null, true)
        })
      }
      // OR - check if you set both to false we default to turn on http
      if (self.settings.http.active || (self.settings.https.active === false) === (self.settings.http.active === false)) {
        self.app.listen(self.app.get('port'), function () {
          console.log('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
          callback(null, true)
        })
      }
    }
  },
    function (err, results) {
      if (!done)done = function () {}
      done(err)
    })
}

MeanLite.prototype.setupExpressConfigs = function () {
  var self = this
  self.app.set('port', self.port)
  self.app.use(compress())
  self.app.use(bodyParser.json(self.settings.bodyparser.json))
  self.app.use(bodyParser.urlencoded(self.settings.bodyparser.urlencoded))
  self.app.use(expressValidator(self.settings.expresValidator))
  self.app.use(methodOverride())
  self.app.use(cookieParser())
  self.app.use(session({
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
}
MeanLite.prototype.setupExpressErrorHandler = function () {
  var self = this
  require('./server/error.js')(self)
}
MeanLite.prototype.setupExpressSecurity = function () {
  var self = this
  self.app.use(helmet(self.settings.bodyparser.helmet))
}
MeanLite.prototype.setupExpressHeaders = function () {
  var self = this
  self.app.use(cors())
}
MeanLite.prototype.setupExpressLogger = function () {
  var self = this
  if (self.settings.logger)self.app.use(logger(self.settings.logger))
}
MeanLite.prototype.setupServerModels = function () {
  var self = this
  self.models = {}
  self.models.blog = mongoose.model('blog', require('./server/modules/blog/blog.model.js'))
  self.models.users = mongoose.model('users', require('./server/modules/users/users.model.js'))
}
MeanLite.prototype.setupServerRoutes = function () {
  var self = this
  require('./server/modules/users/users.routes.js')(self.app, self.middleware, self.mail, self.settings)
  require('./server/modules/blog/blog.routes.js')(self.app, self.middleware, self.mail, self.settings)
}
MeanLite.prototype.setupStaticRoutes = function () {
  var self = this
  self.app.use(express.static(path.join(__dirname, './client/'), {
    maxAge: 31557600000
  }))
  self.app.get('/api/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in api'
    })
  })
  self.app.get('/bower_components/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in bower_components'
    })
  })
  self.app.get('/images/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in images'
    })
  })
  self.app.get('/scripts/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in scripts'
    })
  })
  self.app.get('/styles/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in styles'
    })
  })
  self.app.get('/uploads/*', function (req, res) {
    res.status(400).send({
      error: 'nothing found in uploads'
    })
  })
  // Primary app routes
  self.app.get('/*', function (req, res, next) {
    if (_.isUndefined(req.user)) {
      req.user = {}
      req.user.authenticated = false
    } else {
      req.user.authenticated = true
    }
    var html = self.settings.html
    if (self.settings.seo[req.path]) {
      if (self.settings.seo[req.path].title) html.title = self.settings.seo[req.path].title
      if (self.settings.seo[req.path].description) html.description = self.settings.seo[req.path].description
      if (self.settings.seo[req.path].keywords) html.keywords = self.settings.seo[req.path].keywords
    }

    ejs.renderFile(path.join(__dirname, './server/layout/index.html'), {
      html: html,
      assets: self.app.locals.frontendFilesFinal,
      environment: self.environment
    }, {
      cache: true
    }, function (err, str) {
      if (err) next(err)
      res.send(str)
    })
  })
}
MeanLite.prototype.setupFrontendConfigs = function () {
  var self = this
  if (!fs.existsSync(self.dir + '/client/scripts/')) {
    fs.mkdirSync(self.dir + '/client/scripts/')
  }
  if (!fs.existsSync(self.dir + '/client/styles/compiled/')) {
    fs.mkdirSync(self.dir + '/client/styles/compiled/')
  }
  if (!fs.existsSync(self.dir + '/client/scripts/compiled/')) {
    fs.mkdirSync(self.dir + '/client/scripts/compiled/')
  }
  if (!fs.existsSync(self.dir + '/client/uploads/')) {
    fs.mkdirSync(self.dir + '/client/uploads/')
  }
  self.settings.assets.compiled = []
  self.settings.assets.aggregate = {
    css: [],
    js: []
  }
  fs.writeFileSync(path.join(self.dir, '/client/styles/global-configs.styles.scss'), '$ENV: "' + self.environment + '" !default;\n' + '$CDN: "' + self.settings.cdn + '" !default;\n')
}
MeanLite.prototype.compileFrontendStyles = function () {
  var self = this
  // Global styles
  var globalContents = fs.readFileSync(self.dir + '/client/styles/global.style.scss', 'utf8')
  var result = sass.renderSync({
    includePaths: [path.join(self.dir, '/client/modules'), path.join(self.dir, '/client/styles'), path.join(self.dir, '/client/bower_components/bootstrap-sass/assets/stylesheets'), path.join(self.dir, '/client/bower_components/Materialize/sass'), path.join(self.dir, '/client/bower_components/foundation/scss'), path.join(self.dir, '/client/bower_components/font-awesome/scss')],
    data: globalContents
  })
  fs.writeFileSync(self.dir + '/client/styles/compiled/global.style.css', result.css)
  self.settings.assets.compiled.push('/styles/compiled/global.style.css')
  self.settings.assets.aggregate.css.push(path.join(self.dir, '/client/styles/compiled/global.style.css'))
  // Module Styles
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
          self.settings.assets.compiled.push('/styles/compiled/' + info.base + '.css')
          self.settings.assets.aggregate.css.push(path.join(self.dir, '/client' + '/styles/compiled/' + info.base + '.css'))
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
        self.settings.assets.compiled.push('/styles/compiled/' + info.base + '.css')
        self.settings.assets.aggregate.css.push(path.join(self.dir, '/client' + '/styles/compiled/' + info.base + '.css'))
        break
      default:
        self.settings.assets.compiled.push(n)
        self.settings.assets.aggregate.css.push(path.join(self.dir, '/client' + n))
        break
    }
  })
}
MeanLite.prototype.compileFrontendScripts = function () {
  var self = this
  _.forEach(self.settings.assets.js, function (n) {
    self.settings.assets.aggregate.js.push(path.join(self.dir, '/client' + n))
  })
}
MeanLite.prototype.renderFrontendFiles = function () {
  var self = this
  if (self.environment === 'test') {
    concat(self.settings.assets.aggregate.css, path.join(self.dir, '/client/styles/compiled/concat.css'), function (error) {
      if (error)console.log(error, 'concat')
    })
    concat(self.settings.assets.aggregate.js, path.join(self.dir, '/client/scripts/compiled/concat.js'), function (error) {
      if (error)console.log(error, 'concat')
    })
    self.app.locals.frontendFilesFinal = {
      js: ['scripts/compiled/concat.js'],
      css: ['styles/compiled/concat.css']
    }
  } else if (self.environment === 'production') {
    var uglifiedcss = uglifycss.processFiles(
      self.settings.assets.aggregate.css, {
        maxLineLen: 500
      }
    )
    fs.writeFile(path.join(self.dir, '/client/styles/compiled/concat.min.css'), uglifiedcss, function (err) {
      if (err) {
        console.log(err)
      } else {
        console.log('Script generated and saved:', 'concat.min.css')
      }
    })

    var uglifiedjs = uglify.minify(self.settings.assets.aggregate.js, {
      mangle: false
    })
    fs.writeFile(path.join(self.dir, '/client/scripts/compiled/concat.min.js'), uglifiedjs.code, function (err) {
      if (err) {
        console.log(err)
      } else {
        console.log('Script generated and saved:', 'concat.min.js')
      }
    })
    self.app.locals.frontendFilesFinal = {
      js: ['scripts/compiled/concat.min.js'],
      css: ['styles/compiled/concat.min.css']
    }
  } else {
    self.app.locals.frontendFilesFinal = {
      css: self.settings.assets.compiled,
      js: self.settings.assets.js
    }
  }
}
MeanLite.prototype.updateFrontendCdn = function () {
  var self = this
  if (self.settings.cdn) {
    var FilesFinal = {
      js: [],
      css: []
    }
    _.forEach(self.app.locals.frontendFilesFinal, function (type, typeKey) {
      _.forEach(type, function (n) {
        FilesFinal[typeKey].push(self.settings.cdn + n)
      })
    })
    self.app.locals.frontendFilesFinal = FilesFinal
  }
}

if (!module.parent) {
  var server = new MeanLite({}, function (err) {
    if (err) {
      console.error('Error during ' + server.settings.title + ' startup. Abort.')
      console.error(err)
      process.exit(1)
    }
  })
}
