;(function meanBasic (opts) {
  var fs = require('fs')
  var path = require('path')
  var mongoose = require('mongoose')
  var _ = require('lodash')
  var express = require('express')
  var logger = require('morgan')
  var auto = require('run-auto')
  var concat = require('serial-concat-files')
  var less = require('less')
  var uglify = require('uglify-js')
  var uglifycss = require('uglifycss')
  var sass = require('node-sass')
  var compress = require('compression')
  var bodyParser = require('body-parser')
  var expressValidator = require('express-validator')
  var passport = require('passport')
  var auth = require('./server/passport.js')
  var cookieParser = require('cookie-parser')
  var methodOverride = require('method-override')
  var session = require('express-session')
  var MongoStore = require('connect-mongo')(session)
  var https = require('https')
  var ejs = require('ejs')

  var self = this

  self.app = express()
  self.environment = require('./configs/environment.js').get()
  self.settings = require('./configs/settings.js').get()
  self.port = self.settings.http.port
  self.middleware = require('./server/middleware.js')
  self.mail = require('./server/mail.js')
  self.dir = __dirname
  auto({
    configs: function (callback) {
      self.app.set('port', self.port)
      self.app.use(compress())
      self.app.use(bodyParser.json(self.settings.bodyparser.json))
      self.app.use(bodyParser.urlencoded(self.settings.bodyparser.urlencoded))
      self.app.use(expressValidator())
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
      if (self.settings.logger)self.app.use(logger(self.settings.logger))
      callback(null, true)
    },
    errorHandling: function (callback) {
      require('./server/error.js')(self)
      callback(null, true)
    },

    envStyle: function (callback) {
      self.settings.assets.compiled = []
      self.settings.assets.aggregate = {
        css: [],
        js: []
      }
      fs.writeFileSync(path.join(self.dir, '/client/styles/global-configs.styles.scss'), '$ENV: "' + self.environment + '" !default;\n' + '$CDN: "' + self.settings.cdn + '" !default;\n')
      callback(null, true)
    },
    moduleScripts: ['envStyle', function (results, callback) {
      _.forEach(self.settings.assets.js, function (n) {
        self.settings.assets.aggregate.js.push(path.join(self.dir, '/client' + n))
      })
      callback(null, true)
    }],
    globalStyle: ['envStyle', function (results, callback) {
      console.log(path.join(self.dir + '/client/styles/global.style.scss'), ' DIR')
      console.log(fs.readdirSync(path.join(self.dir + '/client/styles/')), 't\n  tt')

      console.log(fs.readFileSync(path.join(self.dir + '/client/styles/global.style.scss'), 'utf8'), 'test\ntest')
      var globalContents = fs.readFileSync(self.dir + '/client/styles/global.style.scss', 'utf8')
      console.log('readFile')
      var result = sass.renderSync({
        includePaths: [path.join(self.dir, '/client/modules'), path.join(self.dir, '/client/styles'), path.join(self.dir, '/client/bower_components/bootstrap-sass/assets/stylesheets'), path.join(self.dir, '/client/bower_components/Materialize/sass'), path.join(self.dir, '/client/bower_components/foundation/scss'), path.join(self.dir, '/client/bower_components/font-awesome/scss')],
        data: globalContents
      })
      console.log('writeFile')
      fs.writeFileSync(self.dir + '/client/styles/compiled/global.style.css', result.css)
      self.settings.assets.compiled.push('/styles/compiled/global.style.css')
      self.settings.assets.aggregate.css.push(path.join(self.dir, '/client/styles/compiled/global.style.css'))
      callback(null, true)
    }],

    moduleStyles: ['globalStyle', function (results, callback) {
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
      callback(null, true)
    }],
    frontendFiles: ['moduleStyles', function (results, callback) {
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
      callback(null, true)
    }],

    routes: function (callback) {
      mongoose.model('blog', require('./server/modules/blog/blog.model.js'))
      mongoose.model('users', require('./server/modules/users/users.model.js'))
      require('./server/modules/users/users.routes.js')(self.app, self.middleware, self.mail, self.settings)
      require('./server/modules/blog/blog.routes.js')(self.app, self.middleware, self.mail, self.settings)

      callback(null, true)
    },
    staticRoutes: function (callback) {
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
      self.app.get('/*', function (req, res) {
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
          if (err)console.log(err)
          res.send(str)
        })
      })
      callback(null, true)
    }

  }, function (err, results) {
    if (err)console.log(err)
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
          })
        }
        // OR - check if you set both to false we default to turn on http
        if (self.settings.http.active || (self.settings.https.active === false) === (self.settings.http.active === false)) {
          self.app.listen(self.app.get('port'), function () {
            console.log('HTTP Express server listening on port %d in %s mode', self.app.get('port'), self.app.get('env'))
          })
        }
        callback(null, true)
      }
    },
      function (err, done) {
        if (err) {
          console.log('Exiting because of error %d', err)
          process.exit(1)
        }
      })
  })
})()
